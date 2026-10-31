/**
 * 思维导图文件导出：独立 HTML、完整 SVG 和 PNG。
 */
import { path, writeFileAtomic, readLocalImageDataUrl, getDefaultExportDirectory } from './platform';
import { File } from './typora';
import type { IPureNode } from 'markmap-common';
import type { IMarkmapJSONOptions } from 'markmap-view';
import exportRuntime from 'markmap-export-runtime';
import exportStyle from 'markmap-export-style';
import { NATIVE_MATH_STYLE } from './math-style';

export type ExportFormat = 'html' | 'svg' | 'png';

/** 生成携带数据和 Markmap 渲染器的 HTML；右上角可缩放导图、切换黑白背景。 */
export function createInteractiveHtml(root: IPureNode, options: Partial<IMarkmapJSONOptions>, dark: boolean): string {
  const data = JSON.stringify({ root, options }).replace(/</g, '\\u003c');
  const runtime = exportRuntime.replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Markmap</title>
<style>${exportStyle}${NATIVE_MATH_STYLE}</style>
<style>
html { --bg: #fff; --text: #333; --hover: #e6f0fe; }
html[data-theme="dark"] { --bg: #363b40; --text: #b8bfc6; --hover: #70717d; color-scheme: dark; }
html, body { margin: 0; width: 100%; height: 100%; background: var(--bg); color: var(--text); }
#mindmap { display: block; width: 100%; height: 100%; }
#mindmap.markmap { --markmap-text-color: var(--text); --markmap-circle-open-bg: var(--bg); }
/* 测量容器不接收点击，避免遮挡右侧节点；实际内容仍可交互。 */
.markmap-foreign > div { pointer-events: none; }
.markmap-foreign > div > div { pointer-events: auto; }
#controls { position: fixed; right: 16px; top: 16px; z-index: 1; display: flex; gap: 8px; }
button { background: var(--bg); color: var(--text); border: 1px solid currentColor; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
button:hover { background: var(--hover); }
</style>
</head>
<body>
<svg id="mindmap"></svg>
<div id="controls"><button id="zoom-in" type="button" title="放大" aria-label="放大">＋</button><button id="zoom-out" type="button" title="缩小" aria-label="缩小">−</button><button id="fit" type="button">适应视图</button><button id="theme" type="button" aria-label="切换黑白背景"></button></div>
<script id="markmap-data" type="application/json">${data}</script>
<script>${runtime}</script>
<script>
void (async () => {
const data = JSON.parse(document.getElementById('markmap-data').textContent);
const nativeMath = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
document.documentElement.classList.toggle('markmap-native-math', nativeMath);
await document.fonts.ready;
const mm = markmap.Markmap.create('#mindmap', markmap.deriveOptions(data.options), data.root);
mm.svg.on('dblclick.zoom', null);
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
document.getElementById('zoom-in').onclick = () => mm.rescale(1.2);
document.getElementById('zoom-out').onclick = () => mm.rescale(1 / 1.2);
document.getElementById('fit').onclick = () => mm.fit();
window.addEventListener('resize', () => mm.fit());
updateThemeButton();
// 节点生成后等待实际使用的公式字体，再按最终尺寸布局。
await document.fonts.ready;
await mm.renderData();
await mm.fit();
})();
</script>
</body>
</html>`;
}

/** 图片转为内嵌的原生 SVG image，保持布局并兼容 WebKit 的 SVG 转 PNG 解码。 */
export async function embedSvgImages(clone: SVGSVGElement, source: SVGSVGElement): Promise<void> {
  const sourceImages = Array.from(source.querySelectorAll<HTMLImageElement>('img'));
  const images = Array.from(clone.querySelectorAll<HTMLImageElement>('img'));
  const embedded = new Map<string, Promise<string>>();
  for (let index = 0; index < images.length; index += 1) {
    const original = sourceImages[index];
    const src = original.currentSrc || original.src;
    if (!src) continue;
    let content = embedded.get(src);
    if (!content) {
      content = (async () => {
        if (/^data:/i.test(src)) return src;
        if (/^file:/i.test(src) || path.isAbsolute(src)) return readLocalImageDataUrl(src);
        if (!original.complete || !original.naturalWidth) throw new Error(`图片尚未加载，稍后再导出：${src}`);
        const canvas = document.createElement('canvas');
        canvas.width = original.naturalWidth;
        canvas.height = original.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法创建图片导出画布');
        try {
          context.drawImage(original, 0, 0);
          return canvas.toDataURL('image/png');
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`图片导出受限：${src}（${reason}）。可将图片保存到本地后导出。`);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      })();
      embedded.set(src, content);
    }
    const dataUrl = await content;
    const computed = getComputedStyle(original);
    images[index].style.width = computed.width;
    images[index].style.height = computed.height;
    images[index].removeAttribute('src');
    images[index].removeAttribute('srcset');
    images[index].removeAttribute('sizes');
    const originalGroup = original.closest('g') as SVGGElement;
    const cloneGroup = images[index].closest('g') as SVGGElement;
    const matrix = originalGroup.getScreenCTM();
    if (!matrix) throw new Error('图片位置尚未就绪，请稍后导出');
    const inverse = matrix.inverse();
    const rect = original.getBoundingClientRect();
    const topLeft = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
    const bottomRight = new DOMPoint(rect.right, rect.bottom).matrixTransform(inverse);
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', String(topLeft.x));
    image.setAttribute('y', String(topLeft.y));
    image.setAttribute('width', String(bottomRight.x - topLeft.x));
    image.setAttribute('height', String(bottomRight.y - topLeft.y));
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('href', dataUrl);
    // 保留 HTML 图片占位，使段落文字沿用当前导图的换行和高度。
    images[index].style.visibility = 'hidden';
    cloneGroup.append(image);
  }
  clone.querySelectorAll('picture source').forEach(element => element.removeAttribute('srcset'));
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

/** 保存到配置目录；未配置时使用当前用户的下载目录。 */
export async function saveExport(blob: Blob, format: ExportFormat, exportDirectory: string): Promise<string> {
  const currentPath = File.bundle.filePath || File.filePath;
  const directory = exportDirectory || getDefaultExportDirectory();
  if (!path.isAbsolute(directory) || /[\0\r\n]/.test(directory)) {
    throw new Error('导出目录必须是有效的绝对路径');
  }
  const title = document.querySelector('#write h1')?.textContent?.trim() || 'markmap';
  const basename = currentPath ? path.basename(currentPath, path.extname(currentPath)) : title;
  const filename = `${basename.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '-')}.${format}`;
  const destination = path.join(directory, filename);
  await writeFileAtomic(destination, blob);
  return destination;
}
