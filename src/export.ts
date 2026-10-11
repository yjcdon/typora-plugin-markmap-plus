/**
 * 思维导图文件导出：独立 HTML、完整 SVG 和 PNG。
 * @author liangyujia-ai
 */
import { path } from '@typora-community-plugin/core';
import { File, _options, bridge, reqnode } from 'typora';
import type { IPureNode } from 'markmap-common';
import type { IMarkmapJSONOptions } from 'markmap-view';
import exportRuntime from 'markmap-export-runtime';

export type ExportFormat = 'html' | 'svg' | 'png';

/** 生成携带数据和 Markmap 渲染器的 HTML；右上角可切换黑白背景。 */
export function createInteractiveHtml(root: IPureNode, options: Partial<IMarkmapJSONOptions>, dark: boolean): string {
  const data = JSON.stringify({ root, options }).replace(/</g, '\\u003c');
  const runtime = exportRuntime.replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Markmap</title>
<style>
html { --bg: #fff; --text: #333; --hover: #e6f0fe; }
html[data-theme="dark"] { --bg: #363b40; --text: #b8bfc6; --hover: #70717d; color-scheme: dark; }
html, body { margin: 0; width: 100%; height: 100%; background: var(--bg); color: var(--text); }
#mindmap { display: block; width: 100%; height: 100%; }
#mindmap.markmap { --markmap-text-color: var(--text); --markmap-circle-open-bg: var(--bg); }
#controls { position: fixed; right: 16px; top: 16px; z-index: 1; display: flex; gap: 8px; }
button { background: var(--bg); color: var(--text); border: 1px solid currentColor; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
button:hover { background: var(--hover); }
</style>
</head>
<body>
<svg id="mindmap"></svg>
<div id="controls"><button id="fit" type="button">适应视图</button><button id="theme" type="button" aria-label="切换黑白背景"></button></div>
<script id="markmap-data" type="application/json">${data}</script>
<script>${runtime}</script>
<script>
const data = JSON.parse(document.getElementById('markmap-data').textContent);
const mm = markmap.Markmap.create('#mindmap', markmap.deriveOptions(data.options), data.root);
const themeButton = document.getElementById('theme');
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.textContent = dark ? '切换白色' : '切换黑色';
  themeButton.setAttribute('aria-pressed', String(dark));
}
themeButton.onclick = () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  updateThemeButton();
};
document.getElementById('fit').onclick = () => mm.fit();
window.addEventListener('resize', () => mm.fit());
updateThemeButton();
</script>
</body>
</html>`;
}

/** 将完整 SVG 转为 PNG，保持 SVG 的尺寸、文字和背景。 */
export async function createPng(svg: SVGSVGElement): Promise<Blob> {
  const image = new Image();
  const source = new XMLSerializer().serializeToString(svg);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('无法渲染 SVG，PNG 导出失败'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Number(svg.getAttribute('width'));
  canvas.height = Number(svg.getAttribute('height'));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建 PNG 画布');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('PNG 编码失败'));
  }, 'image/png'));
}

/** 保存到配置目录；未配置时使用文档目录，未保存的文档使用下载目录。 */
export async function saveExport(blob: Blob, format: ExportFormat, exportDirectory: string): Promise<string> {
  const currentPath = File.bundle.filePath || File.filePath;
  const directory = exportDirectory || (currentPath ? path.dirname(currentPath) : path.join(_options.userPath, 'Downloads'));
  if (!path.isAbsolute(directory) || /[\0\r\n]/.test(directory)) {
    throw new Error('导出目录必须是有效的绝对路径');
  }
  const title = document.querySelector('#write h1')?.textContent?.trim() || 'markmap';
  const basename = currentPath ? path.basename(currentPath, path.extname(currentPath)) : title;
  const filename = `${basename.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '-')}.${format}`;
  const destination = path.join(directory, filename);
  if (File.isNode) {
    const fs = reqnode('fs');
    await fs.promises.writeFile(destination, new Uint8Array(await blob.arrayBuffer()));
  } else {
    const isDirectory = await new Promise<boolean>(resolve => bridge.callHandler('path.isDirectory', directory, resolve));
    if (!isDirectory) throw new Error(`导出目录不存在：${directory}`);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    // 分块避免 HTML 或 PNG 超过 macOS 单条命令的参数长度；成功后再替换目标文件。
    const temporary = `${destination}.${Date.now()}.tmp`;
    try {
      for (let offset = 0; offset < base64.length; offset += 48000) {
        const chunk = base64.slice(offset, offset + 48000);
        await runCommand(`printf '%s' '${chunk}' | base64 -D ${offset ? '>>' : '>'} ${shellQuote(temporary)}`, directory);
      }
      await runCommand(`mv -f ${shellQuote(temporary)} ${shellQuote(destination)}`, directory);
    } catch (error) {
      bridge.callHandler('library.trashItem', temporary);
      throw error;
    }
  }
  return destination;
}

/** 对 shell 参数逐字引用，支持目录和文件名中的空格、单引号。 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** 等待原生写入完成，保留系统提供的失败原因。 */
function runCommand(args: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => bridge.callHandler('controller.runCommand', { args, cwd }, ([success, , error]) => {
    if (success) resolve();
    else reject(new Error(error || '文件写入失败'));
  }));
}
