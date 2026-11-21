#!/usr/bin/env bash
# Deploy Artha to AWS (us-west-2). Idempotent: the first run creates everything, later runs update code and site.
#
#   CloudFront ──/*──────▶ S3 (the built app, private, Origin Access Control)
#              └─/api/*──▶ Lambda Function URL (Node 24, the same handler as the local server)
#   Lambda ──▶ S3 state bucket (one SQLite context space per person) ──▶ OpenAI
#
# Local:  OPENAI_API_KEY in .env, AWS from ./CLI-creds via scripts/aws.sh   →  bash infra/deploy.sh
# CI:     AWS from GitHub OIDC (no stored keys), OPENAI_API_KEY from a repo secret  →  AWS_CMD=aws bash infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
AWS="${AWS_CMD:-scripts/aws.sh}"
export AWS_REGION=us-west-2 AWS_DEFAULT_REGION=us-west-2 AWS_PAGER=""
aws_() { $AWS "$@"; }
[ -z "${OPENAI_API_KEY:-}" ] && [ -f .env ] && OPENAI_API_KEY="$(grep -E '^OPENAI_API_KEY=' .env | head -1 | cut -d= -f2-)"
[ -z "${OPENAI_API_KEY:-}" ] && { echo "OPENAI_API_KEY is missing"; exit 1; }

ACCT=$(aws_ sts get-caller-identity --query Account --output text)
# STAGE=staging deploys only a separate Lambda (artha-api-staging) to try changes on AWS before they go live
STATE="artha-state-$ACCT${STAGE:+-$STAGE}"; WEB="artha-web-$ACCT"; FN="artha-api${STAGE:+-$STAGE}"; ROLE="artha-lambda"
say() { printf '\n▸ %s\n' "$*"; }

say "build"
npm run build >/dev/null
rm -f lambda.zip && (cd dist-lambda && zip -qr ../lambda.zip .)

say "buckets"
for B in "$STATE" ${STAGE:+} $([ -z "${STAGE:-}" ] && echo "$WEB"); do
  aws_ s3api head-bucket --bucket "$B" 2>/dev/null || aws_ s3api create-bucket --bucket "$B" --create-bucket-configuration LocationConstraint=us-west-2 >/dev/null
done

say "lambda role"
if ! ROLE_ARN=$(aws_ iam get-role --role-name "$ROLE" --query Role.Arn --output text 2>/dev/null); then
  ROLE_ARN=$(aws_ iam create-role --role-name "$ROLE" --query Role.Arn --output text \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}')
  aws_ iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10   # IAM is eventually consistent
fi
aws_ iam put-role-policy --role-name "$ROLE" --policy-name artha-state \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\"],\"Resource\":\"arn:aws:s3:::artha-state-$ACCT*/*\"},{\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",\"Resource\":\"arn:aws:s3:::artha-state-$ACCT*\"}]}"

say "lambda function"
ENV="Variables={OPENAI_API_KEY=$OPENAI_API_KEY,ARTHA_BUCKET=$STATE,ARTHA_ROOT=/var/task,NODE_OPTIONS=--disable-warning=ExperimentalWarning}"
if aws_ lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  aws_ lambda update-function-code --function-name "$FN" --zip-file fileb://lambda.zip >/dev/null
  aws_ lambda wait function-updated --function-name "$FN"
  aws_ lambda update-function-configuration --function-name "$FN" --environment "$ENV" --timeout 120 --memory-size 1536 >/dev/null
else
  for i in 1 2 3; do
    aws_ lambda create-function --function-name "$FN" --runtime nodejs24.x --architectures arm64 --handler index.handler \
      --role "$ROLE_ARN" --zip-file fileb://lambda.zip --timeout 120 --memory-size 1536 --environment "$ENV" >/dev/null && break
    sleep 8   # the new role may not be assumable yet
  done
fi
aws_ lambda wait function-updated --function-name "$FN"
LURL=$(aws_ lambda get-function-url-config --function-name "$FN" --query FunctionUrl --output text 2>/dev/null || \
       aws_ lambda create-function-url-config --function-name "$FN" --auth-type NONE --invoke-mode RESPONSE_STREAM --query FunctionUrl --output text)
# streamed responses (the spoken reply starts playing while it is generated)
if [ "$(aws_ lambda get-function-url-config --function-name "$FN" --query InvokeMode --output text)" != "RESPONSE_STREAM" ]; then
  aws_ lambda update-function-url-config --function-name "$FN" --invoke-mode RESPONSE_STREAM >/dev/null
fi
aws_ lambda add-permission --function-name "$FN" --statement-id url-public --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null 2>&1 || true
aws_ lambda add-permission --function-name "$FN" --statement-id url-invoke --action lambda:InvokeFunction --principal '*' --invoked-via-function-url >/dev/null 2>&1 || true
LHOST=$(echo "$LURL" | sed -E 's#https://([^/]+)/?#\1#')
# keep one instance warm: a ping every 5 minutes (EventBridge), so a note after a quiet spell is not slowed by a cold start
if [ -z "${STAGE:-}" ] && ! aws_ events describe-rule --name artha-warm >/dev/null 2>&1; then
  FARN=$(aws_ lambda get-function --function-name "$FN" --query Configuration.FunctionArn --output text)
  RARN=$(aws_ events put-rule --name artha-warm --schedule-expression "rate(5 minutes)" --query RuleArn --output text)
  aws_ lambda add-permission --function-name "$FN" --statement-id warm --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "$RARN" >/dev/null 2>&1 || true
  aws_ events put-targets --rule artha-warm --targets "Id=artha,Arn=$FARN,Input={\"warm\":true}" >/dev/null || echo "  (warm-up ping not set up; the app works without it)"
fi
if [ -n "${STAGE:-}" ]; then echo; echo "✓ $FN is up: $LURL"; exit 0; fi

say "cloudfront"
DIST=$(aws_ cloudfront list-distributions --query "DistributionList.Items[?Comment=='artha'].Id | [0]" --output text)
if [ "$DIST" = "None" ] || [ -z "$DIST" ]; then
  OAC=$(aws_ cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='artha-web'].Id | [0]" --output text)
  if [ "$OAC" = "None" ] || [ -z "$OAC" ]; then
    OAC=$(aws_ cloudfront create-origin-access-control --query OriginAccessControl.Id --output text \
      --origin-access-control-config "Name=artha-web,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3")
  fi
  CFG=$(mktemp)
  cat > "$CFG" <<JSON
{
  "CallerReference": "artha-$(date +%s)", "Comment": "artha", "Enabled": true, "DefaultRootObject": "index.html", "HttpVersion": "http2and3", "PriceClass": "PriceClass_200",
  "Origins": { "Quantity": 2, "Items": [
    { "Id": "web", "DomainName": "$WEB.s3.us-west-2.amazonaws.com", "OriginAccessControlId": "$OAC", "S3OriginConfig": { "OriginAccessIdentity": "" } },
    { "Id": "api", "DomainName": "$LHOST", "CustomOriginConfig": { "HTTPPort": 80, "HTTPSPort": 443, "OriginProtocolPolicy": "https-only", "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] }, "OriginReadTimeout": 60 } }
  ] },
  "DefaultCacheBehavior": { "TargetOriginId": "web", "ViewerProtocolPolicy": "redirect-to-https", "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } } },
  "CacheBehaviors": { "Quantity": 1, "Items": [
    { "PathPattern": "/api/*", "TargetOriginId": "api", "ViewerProtocolPolicy": "redirect-to-https", "Compress": true,
      "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",
      "AllowedMethods": { "Quantity": 7, "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } } }
  ] }
}
JSON
  DIST=$(aws_ cloudfront create-distribution --distribution-config "file://$CFG" --query Distribution.Id --output text)
  rm -f "$CFG"
fi
DOMAIN=$(aws_ cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text)
aws_ s3api put-bucket-policy --bucket "$WEB" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$WEB/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"arn:aws:cloudfront::$ACCT:distribution/$DIST\"}}}]}"

say "site"
aws_ s3 sync dist "s3://$WEB" --delete --exclude index.html --cache-control "public, max-age=31536000, immutable" --only-show-errors
aws_ s3 cp dist/index.html "s3://$WEB/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8" --only-show-errors
aws_ cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/clips/*" >/dev/null

echo
echo "✓ Artha is live: https://$DOMAIN"
echo "  (a brand-new CloudFront distribution takes ~5 minutes to reach every edge)"
