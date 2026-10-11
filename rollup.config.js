import fs from 'node:fs/promises'
import { defineConfig } from 'rollup'
import { babel } from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import scss from 'rollup-plugin-scss'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import virtual from '@rollup/plugin-virtual'
import { virtualModules } from 'rollup-plugin-typora'
import { build } from 'esbuild'


import strip from '@rollup/plugin-strip'


const { compilerOptions } = JSON.parse(await fs.readFile('./tsconfig.json', 'utf8'))

const overrided = {
  "target": "ES5",
  "downlevelIteration": true,

  "module": undefined,
  "emitDeclarationOnly": undefined,
  "declaration": undefined,
  "declarationDir": undefined,
}

await fs.rm('./dist', { recursive: true, force: true })
await fs.mkdir('./dist')

// 复制 manifest.json 文件 - 这是插件加载的关键文件
await fs.cp('./src/manifest.json', './dist/manifest.json')

await fs.cp('./node_modules/katex/dist/katex.min.js', './dist/katex.min.js')
await fs.cp('./node_modules/katex/dist/katex.min.css', './dist/katex.min.css')

const woff2 = await fs.readdir('./node_modules/katex/dist/fonts')
  .then(files => files.filter(file => file.endsWith('.woff2')))
await Promise.all(woff2.map(file =>
  fs.cp(`./node_modules/katex/dist/fonts/${file}`, `./dist/fonts/${file}`, { recursive: true })
))

const isProduction = process.env.NODE_ENV === 'production'

// HTML 导出携带独立渲染器，不依赖 Typora 或 CDN。
const { outputFiles: [exportRuntime] } = await build({
  stdin: {
    contents: 'export { Markmap, deriveOptions } from "markmap-view"',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'markmap',
  minify: true,
  target: 'es2018',
  legalComments: 'inline',
})

export default defineConfig({
  input: 'src/main.ts',
  output: {
    dir: 'dist',
    format: 'es',
    entryFileNames: 'main.js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  },
  plugins: [
    replace({
      preventAssignment: true,
      'process.env.IS_DEV': JSON.stringify(isProduction),
    }),
    virtual({
      ...virtualModules,
      'markmap-export-runtime': `export default ${JSON.stringify(exportRuntime.text)}`,
    }),
    nodeResolve(),
    commonjs(),
    typescript({
      compilerOptions: {
        ...compilerOptions,
        ...overrided,
      },
    }),
    babel({
      babelHelpers: 'bundled',
      presets: [["@babel/preset-env", { "useBuiltIns": "entry", "corejs": 3 }]],
      exclude: [
        /\bcore-js\b/,
      ],
    }),
    json(),
    scss({
      fileName: 'style.css',
      processor: (css, map) => ({ css: css.replace(/\n+\s*/g, '') }),
    }),
    isProduction && strip({
      include: 'src/**/*.ts',
      functions: ['logger'],
    }),
    terser(),
  ].filter(Boolean),
})
