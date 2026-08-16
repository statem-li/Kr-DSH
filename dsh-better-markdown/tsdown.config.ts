import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

const PACKAGE_NAME = 'dsh-better-markdown'
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@terrastruct/d2',
  '@antv/infographic',
]
const CSS_PREFIX = '\0dsh-better-markdown-css:'
const CSS_SUFFIX = '.mjs'
const STREAM_MONACO_STUB = '\0dsh-better-markdown-stream-monaco-stub'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    dts: true,
    clean: true,
    fixedExtension: false,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    sourcemap: true,
    minify: true,
    clean: false,
    fixedExtension: false,
    deps: {
      neverBundle: CLIENT_EXTERNALS,
      alwaysBundle: id => CLIENT_EXTERNALS.includes(id) ? undefined : true,
      onlyBundle: false,
    },
    plugins: [{
      name: 'dsh-better-markdown-code-block-dependencies',
      resolveId(source) {
        if (source === 'shiki') return resolve('src/client/shiki.ts')
        if (source === 'stream-monaco') return STREAM_MONACO_STUB
        return null
      },
      load(id) {
        return id === STREAM_MONACO_STUB ? 'export {}' : null
      },
    }, {
      name: 'dsh-better-markdown-css',
      async resolveId(source, importer) {
        if (!source.endsWith('.css')) return null
        if (source.startsWith('.')) {
          if (importer === undefined) return null
          return CSS_PREFIX + resolve(dirname(importer), source) + CSS_SUFFIX
        }
        return CSS_PREFIX + fileURLToPath(import.meta.resolve(source)) + CSS_SUFFIX
      },
      async load(id) {
        if (!id.startsWith(CSS_PREFIX)) return null
        const path = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
        const css = await readFile(path, 'utf8')
        const tagId = `${PACKAGE_NAME}/${basename(path)}`
        return [
          `const tagId = ${JSON.stringify(tagId)};`,
          'if (document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {',
          '  const tag = document.createElement("style");',
          `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_NAME)};`,
          '  tag.dataset.pluginCss = tagId;',
          `  tag.textContent = ${JSON.stringify(css)};`,
          '  document.head.appendChild(tag);',
          '}',
        ].join('\n')
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      codeSplitting: false,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
