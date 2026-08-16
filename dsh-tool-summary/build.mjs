/**
 * Build script: bundle the client half into one closure-factory artifact
 * (`lib/client.js`) and the host half into `lib/index.js`.
 *
 * Client artifact shape (client-modules contract): a CJS closure registered
 * through `window.__ModuleLoader__.load({ id, factory })`; externals resolve
 * through the injected `require` (the loader module table), never globals.
 *
 * esbuild is resolved through the DeepSeek Harness checkout (this plugin has
 * no own node_modules).
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

const ID = 'dsh-tool-summary'
const ESBUILD_JS = 'D:/AI/deepseek-harness/node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/bin/esbuild'

const banner = `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`
const footer = '\nreturn module.exports; } });'

function esbuild(args) {
  execFileSync(process.execPath, [ESBUILD_JS, ...args], { stdio: 'inherit' })
}

esbuild([
  'src/client/index.ts',
  '--bundle',
  '--format=cjs',
  '--outfile=lib/client.js',
  '--external:@deepseek-ai/*',
  '--external:react',
  '--external:react-dom',
  '--target=es2022',
  '--jsx=automatic',
  '--log-level=warning',
  `--banner:js=${banner}`,
  `--footer:js=${footer}`,
])

esbuild([
  'src/index.ts',
  '--bundle',
  '--format=esm',
  '--outfile=lib/index.js',
  '--target=es2022',
  '--log-level=warning',
])

writeFileSync(
  'lib/index.d.ts',
  '/** Host half of the browser-only tool-summary plugin. */\n'
    + `export declare const name = ${JSON.stringify(ID)};\n`
    + 'export declare function apply(): void;\n',
)

console.log('built lib/index.js and lib/client.js')
