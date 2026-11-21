#!/usr/bin/env bash
# Run the AWS CLI against the hackathon (Workshop Studio) account ONLY.
# Credentials come from ./CLI-creds (git-ignored). ~/.aws (work account) is never read.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
unset AWS_PROFILE AWS_DEFAULT_PROFILE
export AWS_CONFIG_FILE="$ROOT/.aws-local/config"              # empty, repo-local
export AWS_SHARED_CREDENTIALS_FILE="$ROOT/.aws-local/credentials"
mkdir -p "$ROOT/.aws-local"; touch "$AWS_CONFIG_FILE" "$AWS_SHARED_CREDENTIALS_FILE"
# shellcheck disable=SC1091
source "$ROOT/CLI-creds"
exec aws "$@"
