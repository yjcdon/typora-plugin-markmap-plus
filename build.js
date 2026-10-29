/** 独立插件构建；旧产物进入系统废纸篓。@author liangyujia-ai */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { createWriteStream } from 'node:fs';
import archiver from 'archiver';

const production = process.argv.includes('--prod');
const out = path.resolve('dist/markmap-plus');

/** 仅回收本项目已有构建目录，保留最近一次构建。 */
async function trash(filename) {
  try { await fs.access(filename); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const absolute = path.resolve(filename);
  if (process.platform === 'darwin') execFileSync('/usr/bin/trash', [absolute]);
  else if (process.platform === 'win32') {
    const escaped = absolute.replaceAll("'", "''");
    const method = (await fs.stat(absolute)).isDirectory() ? 'DeleteDirectory' : 'DeleteFile';
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin')`]);
  } else execFileSync('gio', ['trash', absolute]);
}

await trash('dist');
await trash('plugin.zip');
await fs.mkdir(path.join(out, 'app'), { recursive: true });
const runtime = await build({
  stdin: { contents: 'export { Markmap, deriveOptions } from "markmap-view"', resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'markmap', minify: true, target: 'es2018', legalComments: 'inline',
});
let exportStyle = await fs.readFile('node_modules/katex/dist/katex.min.css', 'utf8');
// 导出 HTML/SVG 携带字体，文件移动后仍可离线展示公式。
const fontUrls = [...new Set(Array.from(exportStyle.matchAll(/url\((fonts\/[^)]+)\)/g), match => match[1]))];
for (const fontUrl of fontUrls) {
  const bytes = await fs.readFile(path.join('node_modules/katex/dist', fontUrl));
  const mime = fontUrl.endsWith('.woff2') ? 'font/woff2' : fontUrl.endsWith('.woff') ? 'font/woff' : 'font/ttf';
  exportStyle = exportStyle.replaceAll(`url(${fontUrl})`, `url(data:${mime};base64,${bytes.toString('base64')})`);
}
exportStyle += await fs.readFile('node_modules/highlight.js/styles/default.min.css', 'utf8');
await build({
  entryPoints: ['src/main.ts'], outfile: path.join(out, 'app/main.js'), bundle: true,
  format: 'iife', globalName: 'MarkmapPlusRuntime', target: 'es2018', minify: production,
  sourcemap: production ? false : 'linked', legalComments: 'linked',
  plugins: [{ name: 'standalone-resources', setup(builder) {
    // Node 版转换器将公式与语法高亮实现直接打入产物，运行时使用本地 CSS。
    builder.onResolve({ filter: /^markmap-lib$/ }, () => ({ path: path.resolve('node_modules/markmap-lib/dist/index.mjs') }));
    builder.onResolve({ filter: /^markmap-export-runtime$/ }, () => ({ path: 'export-runtime', namespace: 'inline' }));
    builder.onResolve({ filter: /^markmap-export-style$/ }, () => ({ path: 'export-style', namespace: 'inline' }));
    builder.onLoad({ filter: /.*/, namespace: 'inline' }, args => ({ contents: `export default ${JSON.stringify(args.path === 'export-style' ? exportStyle : runtime.outputFiles[0].text)}`, loader: 'js' }));
  }}],
});
await fs.copyFile('src/loader.js', path.join(out, 'loader.js'));
await fs.copyFile('src/manifest.json', path.join(out, 'manifest.json'));
await fs.copyFile('INSTALL.md', path.join(out, 'INSTALL.md'));
await fs.copyFile('node_modules/katex/dist/katex.min.css', path.join(out, 'app/katex.css'));
await fs.cp('node_modules/katex/dist/fonts', path.join(out, 'app/fonts'), { recursive: true });
await fs.copyFile('node_modules/highlight.js/styles/default.min.css', path.join(out, 'app/highlight.css'));
const licenses = [];
for (const name of ['markmap-lib', 'markmap-view', 'markmap-common', 'interactjs', 'katex', 'highlight.js']) {
  const directory = path.resolve('node_modules', name);
  const candidates = (await fs.readdir(directory)).filter(name => /^license/i.test(name));
  for (const file of candidates) licenses.push(`## ${name}\n\n${await fs.readFile(path.join(directory, file), 'utf8')}`);
}
await fs.writeFile(path.join(out, 'THIRD-PARTY-LICENSES.md'), licenses.join('\n\n'));
if (production) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream('plugin.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve); output.on('error', reject); archive.on('error', reject);
    archive.pipe(output); archive.directory(out, 'markmap-plus'); archive.finalize();
  });
}
console.log(`Built ${out}${production ? ' and plugin.zip' : ''}`);
