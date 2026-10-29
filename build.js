/** 独立插件构建；旧产物进入系统废纸篓。 */
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
  bundle: true, write: false, metafile: true, format: 'iife', globalName: 'markmap', minify: true, target: 'es2018', legalComments: 'inline',
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
const main = await build({
  entryPoints: ['src/main.ts'], outfile: path.join(out, 'app/main.js'), bundle: true,
  format: 'iife', globalName: 'MarkmapPlusRuntime', target: 'es2018', minify: production,
  sourcemap: production ? false : 'linked', legalComments: 'linked', metafile: true,
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
await fs.copyFile('src/NOTICE.md', path.join(out, 'NOTICE.md'));
await fs.copyFile('node_modules/katex/dist/katex.min.css', path.join(out, 'app/katex.css'));
await fs.cp('node_modules/katex/dist/fonts', path.join(out, 'app/fonts'), { recursive: true });
await fs.copyFile('node_modules/highlight.js/styles/default.min.css', path.join(out, 'app/highlight.css'));
// 根据实际打入程序的依赖收集许可，包含转换器和导出渲染器的传递依赖。
const packages = new Map();
const bundledInputs = [main, runtime].flatMap(result => Object.values(result.metafile.outputs)
  .flatMap(output => Object.entries(output.inputs).filter(([, info]) => info.bytesInOutput > 0).map(([name]) => name)));
for (const input of new Set(bundledInputs)) {
  if (!input.includes('node_modules/')) continue;
  let directory = path.dirname(path.resolve(input));
  while (directory !== path.dirname(directory)) {
    let pkg;
    try { pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (pkg?.name) { packages.set(`${pkg.name}@${pkg.version}`, { directory, pkg }); break; }
    directory = path.dirname(directory);
  }
}
const licenses = [];
for (const [name, { directory, pkg }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const candidates = (await fs.readdir(directory, { withFileTypes: true }))
    .filter(file => file.isFile() && /^(licen[cs]e|copying|notice)/i.test(file.name));
  const texts = await Promise.all(candidates.map(file => fs.readFile(path.join(directory, file.name), 'utf8')));
  licenses.push(`## ${name}\n\nLicense: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n\n${texts.join('\n\n')}`);
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
