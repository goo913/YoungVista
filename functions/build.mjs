// Bundles the functions into lib/index.js for deploying. Shared code (packages/core) is bundled in,
// so Cloud Build only installs the npm packages listed in this folder's package.json.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: [new URL('./src/index.ts', import.meta.url).pathname],
  outfile: new URL('./lib/index.js', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Installed by Cloud Build from package.json; everything else is bundled.
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: 'info',
});
