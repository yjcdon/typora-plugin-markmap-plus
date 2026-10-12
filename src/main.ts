/**
 * Typora Markmap Plus 插件主入口文件
 *
 * 功能说明：
 * - 为 Typora 添加交互式思维导图功能
 * - 提供目录思维导图（TOC Mindmap）
 * - 支持窗口拖动和调整大小
 * - 提供悬浮按钮快速访问
 *
 * @author util6
 * @version 1.0.3
 */

// 导入 Typora 插件核心库
import { Plugin, PluginSettings } from '@typora-community-plugin/core'
import { editor } from 'typora'
// 导入 markmap 核心库
import { Transformer, builtInPlugins } from 'markmap-lib'
import { loadCSS, loadJS } from 'markmap-view'
// 导入日志和设置
import { logger } from './utils'
import { MarkmapSettings, DEFAULT_SETTINGS, MarkmapSettingTab } from './settings'
// 导入我们新建的组件
import { TocMindmapComponent, IEditorAdapter, TocMindmapOptions, DEFAULT_TOC_OPTIONS, HeadingRef, BlockRef } from './components/TocMindmap'
import { FloatingButtonComponent, FloatingButtonOptions, DEFAULT_FLOATING_BUTTON_OPTIONS } from './components/FloatingButton'

const LEGACY_PLUGIN_IDS = [
  'typora-community-plugin.markmapplus',
  'typora-plugin-markmap-plus',
];

/**
 * Typora 编辑器适配器
 */
class TyporaAdapter implements IEditorAdapter {
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

    const originalMargin = element.style.scrollMarginTop;
    element.style.scrollMarginTop = `${options.offsetTop}px`;
    element.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
    element.classList.add(options.highlightClassName);

    setTimeout(() => {
      element.style.scrollMarginTop = originalMargin;
      element.classList.remove(options.highlightClassName);
    }, options.highlightDuration);

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

function summarizeSvg(svg: unknown) {
  const normalizedSvg = String(svg || '').trim().replace(/\sclass="icon"/g, '');
  let hash = 5381;
  for (let i = 0; i < normalizedSvg.length; i += 1) {
    hash = ((hash << 5) + hash) ^ normalizedSvg.charCodeAt(i);
  }

  return {
    length: normalizedSvg.length,
    hash: (hash >>> 0).toString(16),
    startsWith: normalizedSvg.slice(0, 80),
  };
}

/**
 * Markmap 插件主类
 * 作为父组件，负责初始化和协调子组件
 */
export default class MarkmapPlugin extends Plugin<MarkmapSettings> {

  // ==================== 核心组件 ====================
  /** TOC 思维导图组件实例 */
  private tocMindmapComponent: TocMindmapComponent;

  /** 悬浮按钮组件实例 */
  private floatingButtonComponent: FloatingButtonComponent;

  // ==================== 状态管理 ====================
  /** 标记 Markmap 资源是否已加载 */
  private resourcesLoaded = false;

  /**
   * 插件加载时的初始化方法
   * 在 Typora 启动时自动调用
   */
  async onload() {
    try {
      logger('开始加载 Markmap 插件');

      await this.migrateLegacySettingsIfNeeded();

      // 1. 初始化插件设置系统
      this.registerSettings(new PluginSettings(this.app, this.manifest, { version: 1 }));
      this.settings.setDefault(DEFAULT_SETTINGS);
      await this.settings.load();
      this.registerSettingTab(new MarkmapSettingTab(this.settings));

      // 2. 异步加载 Markmap 核心资源（CSS 和 JS）
      await this.initResources();

      // 3. 初始化 TOC 思维导图组件（子组件）
      const tocOptions: Partial<TocMindmapOptions> = {};
      for (const key of Object.keys(DEFAULT_TOC_OPTIONS) as Array<keyof TocMindmapOptions>) {
        (tocOptions as any)[key] = this.settings.get(key);
      }
      const editorAdapter = new TyporaAdapter();
      this.tocMindmapComponent = new TocMindmapComponent(tocOptions, editorAdapter);
      this.register(() => this.tocMindmapComponent.destroy()); // 注册卸载时的清理

      // 4. 初始化悬浮按钮组件
      const buttonOptions: Partial<FloatingButtonOptions> = {};
      for (const key of Object.keys(DEFAULT_FLOATING_BUTTON_OPTIONS) as Array<keyof FloatingButtonOptions>) {
        (buttonOptions as any)[key] = this.settings.get(key);
      }
      logger('悬浮按钮设置已加载', 'info', {
        size: buttonOptions.floatingButtonSize,
        icon: summarizeSvg(buttonOptions.floatingButtonIconSvg),
      });
      this.floatingButtonComponent = new FloatingButtonComponent(buttonOptions, () => {
        this.tocMindmapComponent.toggle();
      });
      this.floatingButtonComponent.show();
      this.register(() => this.floatingButtonComponent.destroy());

      // 5. 监听设置变化并通知子组件
      const settingsUpdateHandler = () => {
        logger('检测到设置变化，正在更新组件...');
        const newTocOptions: Partial<TocMindmapOptions> = {};
        for (const key of Object.keys(DEFAULT_TOC_OPTIONS) as Array<keyof TocMindmapOptions>) {
          (newTocOptions as any)[key] = this.settings.get(key);
        }
        this.tocMindmapComponent.updateOptions(newTocOptions);

        const newButtonOptions: Partial<FloatingButtonOptions> = {};
        for (const key of Object.keys(DEFAULT_FLOATING_BUTTON_OPTIONS) as Array<keyof FloatingButtonOptions>) {
          (newButtonOptions as any)[key] = this.settings.get(key);
        }
        logger('悬浮按钮设置变更后重新应用', 'info', {
          size: newButtonOptions.floatingButtonSize,
          icon: summarizeSvg(newButtonOptions.floatingButtonIconSvg),
        });
        this.floatingButtonComponent.updateOptions(newButtonOptions);
      };

      for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof MarkmapSettings>) {
        this.register(this.settings.onChange(key, settingsUpdateHandler));
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger(`插件初始化失败: ${errorMsg}`, 'error', error);
    }
  }

  private async migrateLegacySettingsIfNeeded() {
    const currentId = this.manifest.id;
    const currentFilename = currentId;
    const config = this.app.config;
    const currentSettings = config.readConfigJson(currentFilename);

    if (currentSettings && Object.keys(currentSettings).length > 0) {
      logger('检测到当前插件设置文件已存在，跳过旧设置迁移', 'info', {
        pluginId: currentId,
      });
      return;
    }

    for (const legacyId of LEGACY_PLUGIN_IDS) {
      if (legacyId === currentId) continue;

      const legacySettings = config.readConfigJson(legacyId);
      if (!legacySettings || Object.keys(legacySettings).length === 0) continue;

      await config.writeConfigJson(currentFilename, legacySettings);
      logger('已迁移旧插件设置到新插件 ID', 'info', {
        from: legacyId,
        to: currentId,
      });
      return;
    }

    logger('未检测到可迁移的旧插件设置文件', 'info', {
      pluginId: currentId,
      checkedLegacyIds: LEGACY_PLUGIN_IDS,
    });
  }

  /**
   * 初始化 markmap 所需的 CSS 和 JS 资源
   * 这些资源是渲染思维导图必需的
   */
  async initResources() {
    // 避免重复加载资源
    if (this.resourcesLoaded) return;

    logger('开始初始化 Markmap 资源');
    try {
      // 创建 Markmap 转换器，获取所需的样式和脚本
      const transformer = new Transformer(builtInPlugins);
      const { styles, scripts } = transformer.getAssets();

      // 异步加载 CSS 样式
      if (styles) await loadCSS(styles);

      // 异步加载 JavaScript 脚本
      if (scripts) await loadJS(scripts);

      this.resourcesLoaded = true;
      logger('Markmap 资源加载成功');
    } catch (error) {
      logger(`加载 Markmap 资源失败: ${error.message}`, 'error', error);
      throw error; // 抛出错误，由 onload 的 catch 统一处理
    }
  }

  /**
   * 插件卸载时的清理方法
   * 在 Typora 关闭或插件被禁用时调用
   */
  onunload() {
    logger('Markmap 插件已卸载');
    // this.register 中注册的清理函数会自动执行
    // 包括 this.tocMindmapComponent.destroy()
  }
}
