// Bundles the API for AWS Lambda: dist-lambda/index.mjs + the data it reads (people, eval results).
// The AWS SDK is provided by the Lambda runtime, so it stays external.
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist-lambda', { recursive: true, force: true });
await build({
  entryPoints: ['server/lambda.ts'], outfile: 'dist-lambda/index.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['@aws-sdk/*'], banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" }, logLevel: 'warning',
});
fs.cpSync('data/personas', 'dist-lambda/data/personas', { recursive: true });
fs.mkdirSync('dist-lambda/eval', { recursive: true });
for (const f of ['results.json']) if (fs.existsSync(`eval/${f}`)) fs.copyFileSync(`eval/${f}`, `dist-lambda/eval/${f}`);
console.log('lambda bundle ready: dist-lambda/');
