/** Typora 正文与导图之间的定位适配。@author liangyujia-ai */
import { editor, File } from "./typora";
import type { IEditorAdapter, HeadingRef, BlockRef } from "./components/TocMindmap";

export class TyporaAdapter implements IEditorAdapter {
  private documentIds = new WeakMap<object, string>();
  private nextDocumentId = 0;
  private highlights = new Map<HTMLElement, () => void>();

  /** 退出时恢复临时高亮并取消清理任务。 */
  destroy(): void {
    for (const cleanup of this.highlights.values()) cleanup();
    this.highlights.clear();
  }
  /** 标识当前文档，切换后重建节点引用。 */
  getDocumentId(): string {
    const filename = File.bundle?.filePath || File.filePath;
    if (filename) return filename;
    const document = File.bundle || editor;
    let id = this.documentIds.get(document);
    if (!id) { id = `untitled-${++this.nextDocumentId}`; this.documentIds.set(document, id); }
    return id;
  }

  getMarkdown(): string {
    return editor.getMarkdown();
  }

  /** 使用 Typora 大纲的纯文本标题，保留格式解析结果、文档顺序和块 ID。 */
  getHeadingRefs(): HeadingRef[] {
    const write = document.querySelector('#write');
    if (!write) return [];
    const outline = (editor.library as typeof editor.library & {
      outline: { getHeaderMatrix(plainText: boolean): Array<[level: number, text: string, id: string]> };
    }).outline;
    return outline.getHeaderMatrix(true).map(([level, text, id]) => ({
      id,
      text: text.trim(),
      level,
      element: write.querySelector<HTMLElement>(`[cid="${id}"]`) || undefined,
    }));
  }

  /** 采集每个标题和段落自身的块 ID，列表项使用其内部段落，不包含子列表文字。 */
  getBlockRefs(): BlockRef[] {
    const headings = new Map(this.getHeadingRefs().map(heading => [heading.id, heading]));
    return Array.from(document.querySelectorAll<HTMLElement>('#write [mdtype="heading"][cid], #write [mdtype="paragraph"][cid]'))
      .map(element => {
        const id = element.getAttribute('cid')!;
        const heading = headings.get(id);
        if (heading) return heading;
        const parsed = document.createElement('div');
        parsed.innerHTML = editor.brush.inline.output(editor.getNode(id).get('text'));
        // Typora 的编辑渲染器包含 Markdown 分隔符，正文匹配只使用显示内容。
        parsed.querySelectorAll('.md-meta').forEach(marker => marker.remove());
        return { id, text: (parsed.textContent || '').trim(), element };
      });
  }

  resolveBlockElement(id: string): HTMLElement | null {
    const write = document.querySelector('#write');
    if (!write) return null;
    return write.querySelector(`[cid="${id}"]`) as HTMLElement | null;
  }

  /** 点击节点文字时立即定位正文，保留短暂的静态位置提示。 */
  scrollToBlock(id: string, options: { offsetTop: number; highlightClassName: string; highlightDuration: number }): HTMLElement | null {
    const element = this.resolveBlockElement(id);
    if (!element) return null;

    this.highlights.get(element)?.();
    const originalMargin = element.style.scrollMarginTop;
    element.style.scrollMarginTop = `${options.offsetTop}px`;
    element.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    element.classList.add(options.highlightClassName);

    const cleanup = () => {
      clearTimeout(timer);
      element.style.scrollMarginTop = originalMargin;
      element.classList.remove(options.highlightClassName);
      this.highlights.delete(element);
    };
    const timer = window.setTimeout(cleanup, options.highlightDuration);
    this.highlights.set(element, cleanup);

    return element;
  }

  getCurrentVisibleHeadingId(viewportOffset: number): string | null {
    const headingRefs = this.getHeadingRefs();
    if (headingRefs.length === 0) return null;

    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    let deepestHeading: HeadingRef | null = null;
    let maxLevel = 0;

    for (const heading of headingRefs) {
      const element = heading.element || this.resolveBlockElement(heading.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;

      if (elementTop >= viewportTop - viewportOffset && elementTop <= viewportBottom) {
        if (heading.level > maxLevel) {
          maxLevel = heading.level;
          deepestHeading = heading;
        }
      }
    }

    if (deepestHeading) return deepestHeading.id;

    let closestHeading: HeadingRef | null = null;
    let minDistance = Infinity;
    for (const heading of headingRefs) {
      const element = heading.element || this.resolveBlockElement(heading.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;
      const distance = Math.abs(elementTop - viewportTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestHeading = heading;
      }
    }

    return closestHeading?.id || null;
  }

  resolveImagePath(src: string): string {
    return editor.imgEdit.getRealSrc(src);
  }
}
