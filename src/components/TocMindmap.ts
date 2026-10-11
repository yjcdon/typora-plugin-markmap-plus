/**
 * Typora Markmap Plus 插件 - TOC 思维导图组件
 *
 * 功能说明：
 * - 为当前文档的标题生成交互式思维导图
 * - 支持窗口拖动和调整大小（基于 InteractJS）
 * - 支持嵌入侧边栏模式
 * - 提供实时更新和节点点击跳转功能
 *
 * @author util6
 * @version 1.0.3
 */

// ==================== 依赖导入 ====================
// 导入 YAML 解析库，用于处理配置文件
import * as yaml from 'js-yaml'
// 导入 markmap-lib 库的核心组件，用于将 Markdown 转换为思维导图数据结构
import { Transformer, type ITransformPlugin, builtInPlugins } from 'markmap-lib';
// 导入 markmap-view 库的核心组件，用于渲染和操作思维导图
import { Markmap, deriveOptions } from 'markmap-view';
// 导入 markmap-common 库的节点类型定义
import { INode, IPureNode } from 'markmap-common';
// 导入 d3-zoom 库的缩放相关函数，用于处理思维导图的缩放功能
import { zoomIdentity, zoomTransform } from 'd3-zoom';
// 导入 d3-selection 库的选择器函数，用于操作 DOM 元素
import { select } from 'd3-selection';
// 导入项目内部的工具函数，包括日志记录和防抖函数
import { logger, debounce } from '../utils';
// 导入 interactjs 库，用于实现拖拽和调整大小功能
import interact from 'interactjs';
import { createInteractiveHtml, createPng, saveExport, type ExportFormat } from '../export';

// ==================== 类型定义 ====================

/**
 * 编辑器适配器接口
 * 用于解耦具体编辑器实现
 */
export interface IEditorAdapter {
  /** 获取 Markdown 内容 */
  getMarkdown(): string;
  /** 获取文档中的标题引用 */
  getHeadingRefs?(): HeadingRef[];
  /** 通过稳定标题 ID 解析当前 DOM 元素 */
  resolveHeadingElement?(id: string): HTMLElement | null;
  /** 滚动到指定标题 */
  scrollToHeading?(id: string, options: { offsetTop: number; highlightClassName: string; highlightDuration: number }): HTMLElement | null;
  /** 获取当前视口中最合适的标题 ID */
  getCurrentVisibleHeadingId?(viewportOffset: number): string | null;
  /** 将相对路径转换为绝对路径 */
  resolveImagePath(src: string): string;
}

export interface HeadingRef {
  id: string;
  text: string;
  level: number;
  element?: HTMLElement;
}

/**
 * TOC 思维导图组件配置选项
 */
export interface TocMindmapOptions {
  /** 目录思维导图窗口的默认宽度（像素） */
  tocWindowWidth: number
  /** 目录思维导图窗口的默认高度（像素） */
  tocWindowHeight: number
  /** 思维导图初始展开到第几级标题（6 则包含正文） */
  initialExpandLevel: number
  /** 缩放操作的步长（每次放大/缩小的比例） */
  zoomStep: number
  /** 是否启用实时更新功能 */
  enableRealTimeUpdate: boolean
  /** 更新时是否保持节点的折叠状态 */
  keepFoldStateWhenUpdate: boolean
  /** 更新时是否自动适应视图 */
  autoFitWhenUpdate: boolean
  /** 动画持续时间（毫秒），0 表示禁用动画 */
  animationDuration: number
  /** 点击跳转时距离视窗顶部的像素距离 */
  scrollOffsetTop: number
  /** 点击跳转后文档标题的背景高亮颜色 */
  headingHighlightColor: string
  /** 思维导图节点的背景高亮颜色 */
  nodeHighlightColor: string
  /** 高亮效果的持续时间（毫秒） */
  highlightDuration: number
  /** 导出文件的保存目录 */
  exportDirectory: string
  /** 固定时，导图窗口占视口宽度的百分比 */
  widthPercentWhenPin: number
  /** 工具栏位置：'top' 顶部 | 'side' 侧边 */
  toolbarPosition: 'top' | 'side'

  // 高级配置
  /** Markmap 水平间距 */
  spacingHorizontal: number
  /** Markmap 垂直间距 */
  spacingVertical: number
  /** 适应视图比例 */
  fitRatio: number
  /** 内边距 */
  paddingX: number
  /** 节点颜色方案 */
  nodeColors: string[]
  /** 颜色冻结层级 */
  colorFreezeLevel: number
  /** 视口偏移量（用于判断标题是否在视口内） */
  viewportOffset: number
  /** DOM 属性设置延迟 */
  delayAttributeSet: number
  /** 初始适应视图延迟 */
  delayInitialFit: number
  /** 缩放过渡动画时长 */
  delayZoomTransition: number
  /** 适应视图过渡动画时长 */
  delayFitTransition: number
  /** 滚动边距重置延迟 */
  delayScrollMarginReset: number
  /** 属性检查延迟 */
  delayAttributeCheck: number
}

/**
 * TOC 思维导图组件默认配置
 */
export const DEFAULT_TOC_OPTIONS: TocMindmapOptions = {
  tocWindowWidth: 450,          // 默认窗口宽度 450 像素
  tocWindowHeight: 600,         // 默认窗口高度 600 像素
  initialExpandLevel: 3,        // 默认展开到第 3 级标题
  zoomStep: 0.2,                // 默认缩放步长为 20%
  enableRealTimeUpdate: true,   // 默认启用实时更新
  keepFoldStateWhenUpdate: true,// 默认在更新时保持节点折叠状态
  autoFitWhenUpdate: false,     // 默认在更新时不自动适应视图
  animationDuration: 500,       // 默认动画持续时间为 500 毫秒
  scrollOffsetTop: 80,          // 默认滚动偏移为 80 像素
  headingHighlightColor: 'rgba(255, 215, 0, 0.5)', // 默认标题高亮颜色为金色半透明
  nodeHighlightColor: 'rgba(142, 110, 255, 0.7)',  // 默认节点高亮颜色为紫色半透明
  highlightDuration: 1500,      // 默认高亮持续时间为 1500 毫秒
  exportDirectory: '',          // 默认导出目录为空
  widthPercentWhenPin: 30,      // 默认固定时占 30% 视口宽度
  toolbarPosition: 'top',       // 默认工具栏位置为顶部

  // 高级配置默认值
  spacingHorizontal: 80,        // 默认水平间距为 80 像素
  spacingVertical: 20,          // 默认垂直间距为 20 像素
  fitRatio: 0.95,               // 默认适应视图比例为 95%
  paddingX: 20,                 // 默认内边距为 20 像素
  nodeColors: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'], // 默认节点颜色方案
  colorFreezeLevel: 2,          // 默认颜色冻结层级为 2
  viewportOffset: 100,          // 默认视口偏移量为 100 像素
  delayAttributeSet: 100,       // 默认 DOM 属性设置延迟为 100 毫秒
  delayInitialFit: 150,         // 默认初始适应视图延迟为 150 毫秒
  delayZoomTransition: 250,     // 默认缩放过渡动画时长为 250 毫秒
  delayFitTransition: 500,      // 默认适应视图过渡动画时长为 500 毫秒
  delayScrollMarginReset: 1000, // 默认滚动边距重置延迟为 1000 毫秒
  delayAttributeCheck: 50       // 默认属性检查延迟为 50 毫秒
}

// ==================== MARKMAP 渲染器集成 ====================

// =======================================================
// STYLE BLOCK (等效于 <style> 标签)
// =======================================================
// 定义组件的 CSS 样式
const COMPONENT_STYLE = `
  .markmap-toc-modal {
    position: fixed;                    /* 固定定位 */
    top: 50px;                          /* 距离顶部 50px */
    right: 20px;                        /* 距离右侧 20px */
    width: 450px;                       /* 宽度 450px */
    height: 500px;                      /* 高度 500px */
    background-color: #ffffff;          /* 背景色为白色 */
    border: 1px solid #e0e0e0;          /* 边框为浅灰色 */
    border-radius: 8px;                 /* 圆角 8px */
    box-shadow: 0 4px 20px rgba(0,0,0,0.15); /* 阴影效果 */
    z-index: 100;                       /* z-index 层级为 100 */
    display: flex;                      /* 使用弹性布局 */
    flex-direction: column;             /* 垂直排列子元素 */
    font-family: system-ui, -apple-system, sans-serif; /* 字体族 */
    overflow: hidden;                   /* 隐藏溢出内容 */
    user-select: none;                  /* 禁止用户选择文本 */
  }

  .markmap-content, .markmap-svg {
    pointer-events: auto;               /* 启用指针事件 */
    user-select: none;                  /* 禁止用户选择文本 */
  }

  /* TOC 弹窗头部样式 */
  .markmap-toc-header {
    padding: 10px;                      /* 内边距 10px */
    border-bottom: 1px solid #eee;      /* 底部边框 */
    display: flex;                      /* 弹性布局 */
    justify-content: space-between;     /* 子元素两端对齐 */
    align-items: center;                /* 垂直居中对齐 */
    background: #f8f9fa;                /* 背景色 */
    cursor: move;                       /* 鼠标样式为移动 */
  }

  .markmap-toc-title {
    font-weight: bold;                  /* 粗体 */
    color: #333;                        /* 文字颜色 */
  }
  .markmap-toc-buttons {
    display: flex;                      /* 弹性布局 */
    align-items: center;                /* 垂直居中 */
    gap: 8px;                           /* 子元素间距 8px */
  }
  .markmap-toc-btn {
    background: none;                   /* 无背景 */
    border: none;                       /* 无边框 */
    cursor: pointer;                    /* 鼠标样式为指针 */
    padding: 4px;                       /* 内边距 4px */
    border-radius: 3px;                 /* 圆角 3px */
  }
  .markmap-toc-btn:hover {
    background-color: #e9ecef;          /* 悬停时的背景色 */
  }

  /* TOC 弹窗内容区域样式 */
  .markmap-toc-content {
    flex-grow: 1;                       /* 弹性增长 */
    overflow: hidden;                   /* 隐藏溢出内容 */
  }
  .markmap-svg {
    width: 100%;                        /* 宽度 100% */
    height: 100%;                       /* 高度 100% */
  }

  /* 导出菜单样式 */
  .markmap-export-menu {
    position: absolute;                 /* 绝对定位 */
    top: 54px;
    right: 12px;
    background: white;                  /* 背景色为白色 */
    border: 1px solid #e0e0e0;          /* 边框 */
    border-radius: 4px;                 /* 圆角 */
    box-shadow: 0 2px 8px rgba(0,0,0,0.15); /* 阴影 */
    z-index: 101;                       /* z-index 层级 */
    padding: 4px 0;                     /* 垂直内边距 4px */
    width: 250px;
    max-width: calc(100% - 24px);
  }

  .markmap-export-menu[hidden] { display: none; }
  .markmap-export-title { padding: 8px 16px; font-weight: bold; }

  .markmap-export-item {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    padding: 8px 16px;                  /* 内边距 */
    cursor: pointer;                    /* 鼠标样式为指针 */
    font-size: 14px;                    /* 字体大小 */
    color: #333;                        /* 文字颜色 */
  }

  .markmap-export-item:hover {
    background-color: #f5f5f5;          /* 悬停时的背景色 */
  }

  /* 固定到右侧状态样式 */
  .markmap-toc-modal.pinned-right {
    box-shadow: none;                   /* 无阴影 */
    border-radius: 0;                   /* 无圆角 */
    border-right: none;                 /* 无右边框 */
  }

  /* 固定到左侧状态样式 */
  .markmap-toc-modal.pinned-left {
    box-shadow: none;                   /* 无阴影 */
    border-radius: 0;                   /* 无圆角 */
    border-left: none;                  /* 无左边框 */
  }

  /* 侧边工具栏布局 */
  .markmap-toc-modal.toolbar-side {
    flex-direction: row;                /* 水平排列 */
  }

  .markmap-toc-modal.toolbar-side .markmap-toc-header {
    position: absolute;                 /* 绝对定位 */
    right: 8px;                         /* 距离右边 8px */
    top: 50%;                           /* 距离顶部 50% */
    transform: translateY(-50%);        /* 垂直居中 */
    z-index: 10;                        /* 层级 */
    background: transparent;            /* 透明背景 */
    border: none;                       /* 无边框 */
    padding: 0;                         /* 无内边距 */
    width: auto;                        /* 自动宽度 */
    cursor: default;                    /* 默认鼠标样式 */
  }

  /* 固定到左侧时，按钮在右侧 */
  .markmap-toc-modal.toolbar-side.pinned-left .markmap-toc-header {
    right: 8px;
    left: auto;
  }

  /* 固定到右侧时，按钮在左侧 */
  .markmap-toc-modal.toolbar-side.pinned-right .markmap-toc-header {
    left: 8px;
    right: auto;
  }

  .markmap-toc-modal.toolbar-side .markmap-toc-title {
    display: none;                      /* 隐藏标题 */
  }

  .markmap-toc-modal.toolbar-side .markmap-toc-buttons {
    flex-direction: column;             /* 垂直排列 */
    gap: 8px;                           /* 按钮间距 */
  }

  .markmap-toc-modal.toolbar-side .markmap-toc-btn {
    padding: 4px 6px;                   /* 内边距 */
    font-size: 16px;                    /* 字体大小 */
    background: transparent;            /* 透明背景 */
    border: none;                       /* 无边框 */
    color: #666;                        /* 文字颜色 */
  }

  .markmap-toc-modal.toolbar-side .markmap-toc-btn:hover {
    background: rgba(0,0,0,0.05);       /* 悬停时淡灰色背景 */
    color: #333;                        /* 悬停时文字变深 */
  }

  .markmap-toc-modal.toolbar-side .markmap-toc-content {
    flex: 1;                            /* 占满剩余空间 */
  }
`;

// =======================================================
// TEMPLATE BLOCK (等效于 <template> 标签)
// =======================================================
// 定义组件的 HTML 模板
const COMPONENT_TEMPLATE = `
  <div class="markmap-toc-header">
    <span class="markmap-toc-title"></span>
    <div class="markmap-toc-buttons">
      <button class="markmap-toc-btn" data-action="pin-left" title="固定到左侧">◀</button>
      <button class="markmap-toc-btn" data-action="pin-right" title="固定到右侧">▶</button>
      <button class="markmap-toc-btn" data-action="zoom-in" title="放大">+</button>
      <button class="markmap-toc-btn" data-action="zoom-out" title="缩小">−</button>
      <button class="markmap-toc-btn" data-action="fit" title="适应视图">⌖</button>
      <button class="markmap-toc-btn" data-action="export" title="导出">↓</button>
      <button class="markmap-toc-btn" data-action="close" title="关闭">×</button>
    </div>
  </div>
  <div class="markmap-toc-content">
    <svg class="markmap-svg"></svg>
  </div>
  <div class="markmap-export-menu" role="dialog" aria-label="导出思维导图" hidden>
    <div class="markmap-export-title">导出思维导图</div>
    <button class="markmap-export-item" data-action="export-html">HTML · 可交互，支持黑白切换</button>
    <button class="markmap-export-item" data-action="export-svg">SVG · 矢量图片</button>
    <button class="markmap-export-item" data-action="export-png">PNG · 普通图片</button>
    <button class="markmap-export-item" data-action="export-cancel">取消</button>
  </div>
`;


// =======================================================
// SCRIPT BLOCK (等效于 <script> 标签)
// =======================================================
export class TocMindmapComponent {

  // ==================== 依赖注入与初始化 ====================

  /** 组件配置选项 */
  private options: TocMindmapOptions;

  /**
   * 创建图片路径解析插件
   * 该插件用于处理 Markdown 中的图片路径，将其转换为绝对路径
   */
  private _createImagePlugin(): ITransformPlugin {
    // 获取编辑器适配器实例
    const adapter = this.editorAdapter;
    // 返回一个 ITransformPlugin 对象
    return {
      name: 'resolveImagePath',       // 插件名称
      transform(ctx) {                // 转换函数
        // 挂接到 Markdown 解析器
        ctx.parser.tap((md: any) => {
          // 定义默认渲染函数
          const defaultRender = (tokens: any, idx: number, options: any, env: any, self: any) =>
            self.renderToken(tokens, idx, options);

          // 处理图片渲染规则
          const defaultImageRender = md.renderer.rules.image || defaultRender;
          md.renderer.rules.image = (tokens: any[], idx: number, options: any, env: any, self: any) => {
            const token = tokens[idx];            // 获取当前 token
            const src = token.attrGet('src');     // 获取图片的 src 属性
            if (src) token.attrSet('src', adapter.resolveImagePath(src)); // 如果存在 src，则解析为绝对路径
            return defaultImageRender(tokens, idx, options, env, self);   // 调用默认渲染函数
          };

          // 处理内联 HTML 中的图片
          const defaultHtmlInlineRender = md.renderer.rules.html_inline || defaultRender;
          md.renderer.rules.html_inline = (tokens: any[], idx: number, options: any, env: any, self: any) => {
            const token = tokens[idx] as { content: string };  // 获取当前 token
            // 如果是 img 标签
            if (token.content.startsWith('<img')) {
              // 使用正则表达式替换 src 属性为绝对路径
              token.content = token.content.replace(/ src=(["'])([^'"]+)\1/, (_, __, $relativePath) =>
                ` src="${adapter.resolveImagePath($relativePath)}"`);
            }
            return defaultHtmlInlineRender(tokens, idx, options, env, self); // 调用默认渲染函数
          };
        });
        return {}; // 返回空对象
      }
    };
  }

  /**
   * 构造函数
   *
   * 初始化组件所需的核心依赖：
   * 1. 合并用户配置和默认配置
   * 2. 创建 Markmap 转换器（包含内置插件和图片路径解析插件）
   * 3. 注入组件样式到页面
   * 4. 初始化高亮样式
   *
   * @param options 组件配置选项（可选，未提供的选项使用默认值）
   * @param editorAdapter 编辑器适配器，提供编辑器相关功能
   */
  constructor(
    options: Partial<TocMindmapOptions> = {},   // 部分配置选项，默认为空对象
    private editorAdapter: IEditorAdapter       // 编辑器适配器
  ) {
    // 合并默认配置和用户配置，优先使用用户配置
    this.options = { ...DEFAULT_TOC_OPTIONS, ...options };
    // 记录日志，显示 TocMindmap 初始化信息和实时更新状态
    logger(`TocMindmap 初始化，enableRealTimeUpdate: ${this.options.enableRealTimeUpdate}`);
    // 创建图片路径解析插件
    const imagePlugin = this._createImagePlugin();
    // 创建 Markmap 转换器，包含内置插件和自定义图片插件
    this.transformer = new Transformer([...builtInPlugins, imagePlugin]);
    // 将组件样式注入到页面 <head> 中
    this._injectStyle();
    // 根据用户设置初始化高亮样式
    this._updateHighlightStyle();
  }

  /**
   * 更新组件配置
   *
   * 当配置发生变化时调用此方法来同步更新组件的配置。
   * 这确保了配置变化能够立即生效。
   *
   * @param newOptions 新的配置选项（部分或全部）
   */
  public updateOptions(newOptions: Partial<TocMindmapOptions>) {
    // 合并新配置到当前配置，优先使用新配置
    this.options = { ...this.options, ...newOptions };
    this._updateHighlightStyle(); // 更新高亮样式

    // 如果 widthPercentWhenPin 改变且当前处于 pin 状态，重新计算布局
    if (newOptions.widthPercentWhenPin !== undefined && (this.state.isPinLeft || this.state.isPinRight)) {
      this._handleResize();
    }

    // 为简单起见，如果组件可见，则执行一次完整的更新
    // 这足以安全地覆盖所有设置更改，确保新设置立即生效
    if (this.isVisible) {
      this._update(); // 执行更新操作
    }
  }

  // ==================== 组件状态管理 ====================

  /**
   * 组件内部状态
   * 集中管理所有可变状态，类似 Vue 的 data 选项
   */
  private state = {
    /** 组件的根 DOM 元素 */
    element: null as HTMLElement | null,
    /** Markmap 实例，用于渲染和控制思维导图 */
    markmap: null as any | null,
    /** 监听文档内容变化的观察器 */
    contentObserver: null as MutationObserver | null,
    /** 上次标题内容的哈希值，用于检测变化 */
    lastHeadingsHash: '',
    /** 双向索引：从 state.path 到 HTMLElement */
    headingElements: new Map<string, HTMLElement>(),
    /** 从 state.path 到稳定标题 ID */
    headingIds: new Map<string, string>(),
    /** 双向索引：从 HTMLElement 到 state.path */
    elementToPath: new Map<HTMLElement, string>(),
    /** 是否固定到右侧 */
    isPinRight: false,
    /** 是否固定到左侧 */
    isPinLeft: false,
    /** 导图窗口原始位置尺寸 */
    originModalRect: null as DOMRect | null,
    /** 内容区域原始位置尺寸 */
    originContentRect: null as DOMRect | null,
  };

  /** Markmap 转换器实例，用于将 Markdown 转换为思维导图数据 */
  private transformer: Transformer;

  /** 防抖处理的更新函数，避免频繁更新导致性能问题 */
  private debouncedUpdate = debounce(this._handleContentChange.bind(this), 200);

  // ==================== 计算属性 ====================

  /**
   * 组件是否可见
   * 类似 Vue 的 computed 属性，根据 DOM 状态动态计算
   */
  get isVisible(): boolean {
    // 如果组件元素存在且显示样式不为 none，则认为可见
    return !!(this.state.element && this.state.element.style.display !== 'none');
  }

  // ==================== 公共 API ====================

  /**
   * 显示思维导图窗口
   *
   * 执行流程：
   * 1. 检查是否已显示，避免重复创建
   * 2. 创建 DOM 元素并添加到页面
   * 3. 绑定事件监听器
   * 4. 初始化实时更新功能
   * 5. 渲染思维导图内容
   *
   * @throws 如果显示失败会抛出错误并自动清理
   */
  public show = async () => {
    // 如果组件已经可见，则直接返回
    if (this.isVisible) return;

    // 记录日志，显示正在显示 TOC Markmap
    logger('显示 TOC Markmap');
    try {
      this._createElement();              // 创建组件的 DOM 元素
      this._attachEventListeners();       // 绑定事件监听器
      this._initRealTimeUpdate();         // 初始化实时更新功能
      window.addEventListener('resize', this._handleResize); // 监听窗口大小变化
      await this._update();               // 更新思维导图内容
      logger('TOC 窗口显示成功');         // 记录成功日志
    } catch (error) {
      // 记录错误日志，包含错误信息和错误对象
      logger(`TOC 窗口显示失败: ${error.message}`, 'error', error);
      this.destroy(); // 显示失败时自我销毁
      throw error;    // 重新抛出错误
    }
  }

  /**
   * 隐藏思维导图窗口
   *
   * 执行清理工作：
   * 1. 清理 InteractJS 实例（拖动和调整大小功能）
   * 2. 从 DOM 中移除元素
   * 3. 销毁 Markmap 实例
   * 4. 清理所有事件监听器和观察器
   * 5. 重置内部状态
   */
  public hide = () => {
    // 如果组件不可见，则直接返回
    if (!this.isVisible) return;

    // 无条件恢复 #write 的样式（防止状态丢失导致无法恢复）
    const content = document.querySelector('#write') as HTMLElement;
    if (content) {
      content.style.marginRight = '';
      content.style.marginLeft = '';
    }

    // 清理 InteractJS 实例
    if (this.state.element) {
      interact(this.state.element).unset(); // 取消 InteractJS 设置
    }

    this.state.element?.remove();         // 从 DOM 中移除元素
    this.state.markmap?.destroy();        // 销毁 Markmap 实例

    // 清理所有事件监听和观察器
    this._cleanupEventListeners();        // 清理事件监听器
    this._cleanupRealTimeUpdate();        // 清理实时更新功能
    window.removeEventListener('resize', this._handleResize); // 移除窗口大小变化监听

    // 重置状态
    this.state.element = null;            // 重置元素引用
    this.state.markmap = null;            // 重置 Markmap 实例
    this.state.contentObserver = null;    // 重置 MutationObserver
    this.state.lastHeadingsHash = '';     // 重置标题哈希值
    this.state.headingElements.clear();   // 清空路径到元素的映射
    this.state.headingIds.clear();        // 清空路径到标题 ID 的映射
    this.state.elementToPath.clear();     // 清空元素到路径的映射
    this.state.isPinRight = false;        // 重置固定状态
    this.state.isPinLeft = false;         // 重置固定状态
    this.state.originModalRect = null;    // 重置原始尺寸
    this.state.originContentRect = null;  // 重置原始尺寸

    logger('TOC 窗口已关闭');             // 记录日志
  }

  /**
   * 切换思维导图窗口的显示/隐藏状态
   */
  public toggle = async () => {
    // 根据当前可见状态决定是隐藏还是显示
    if (this.isVisible) {
      this.hide();  // 如果可见则隐藏
    } else {
      await this.show(); // 如果不可见则显示
    }
  }

  /**
   * 销毁组件
   *
   * 完全清理组件，包括：
   * 1. 隐藏窗口并清理所有资源
   * 2. 从页面中移除注入的样式表
   */
  public destroy = () => {
    this.hide();  // 隐藏窗口并清理所有资源
    // 移除样式表
    document.getElementById('markmap-toc-component-style')?.remove();
  }

  // ==================== 私有方法：DOM 操作 ====================

  /**
   * 创建组件的 DOM 元素
   *
   * 1. 创建容器元素并设置样式类
   * 2. 根据用户设置设置初始宽高
   * 3. 填充 HTML 模板内容
   * 4. 添加到页面 body
   * 5. 初始化 InteractJS（拖动和调整大小功能）
   */
  private _createElement() {
    const container = document.createElement('div');          // 创建 div 元素作为容器
    container.className = 'markmap-toc-modal';                // 设置 CSS 类名
    // 根据配置添加工具栏位置类
    if (this.options.toolbarPosition === 'side') {
      container.classList.add('toolbar-side');
    }
    container.style.width = `${this.options.tocWindowWidth}px`;   // 设置宽度
    container.style.height = `${this.options.tocWindowHeight}px`; // 设置高度
    container.innerHTML = COMPONENT_TEMPLATE;                 // 填充 HTML 模板
    document.body.appendChild(container);                     // 添加到页面 body
    this.state.element = container;                           // 保存元素引用
    this._setupInteractJS();                                  // 初始化 InteractJS
  }

  /**
   * 设置 InteractJS 交互功能
   *
   * 配置两个核心功能：
   * 1. 调整大小（resizable）：允许从四个边缘调整窗口大小
   * 2. 拖动（draggable）：根据嵌入状态和设置动态启用/禁用
   */
  private _setupInteractJS() {
    // 如果组件元素不存在，则直接返回
    if (!this.state.element) return;

    // 初始化 InteractJS 实例
    const interactInstance = interact(this.state.element);

    // 设置调整大小功能（始终启用）
    interactInstance.resizable({
      // 允许从四个边缘调整大小
      edges: { left: true, right: true, bottom: true, top: true },
      listeners: {
        move: (event) => {
          const target = event.target;                                  // 获取目标元素
          // 更新元素的尺寸和位置
          target.style.width = `${event.rect.width}px`;                 // 设置宽度
          target.style.height = `${event.rect.height}px`;               // 设置高度
          target.style.left = `${event.rect.left}px`;                   // 设置左边距
          target.style.top = `${event.rect.top}px`;                     // 设置顶边距
          // 清除 transform，使用绝对定位
          target.style.transform = 'none';                              // 清除变换
          target.removeAttribute('data-x');                             // 移除 data-x 属性
          target.removeAttribute('data-y');                             // 移除 data-y 属性
        }
      }
    });

    // 根据当前状态设置拖动功能
    this._updateInteractSettings();
  }

  /**
   * 更新 InteractJS 拖动设置
   *
   * 根据工具栏位置动态调整拖动功能：
   * - 侧边栏模式：禁用标题栏拖动
   * - 顶部模式：启用标题栏拖动
   */
  private _updateInteractSettings() {
    // 如果组件元素不存在，则直接返回
    if (!this.state.element) return;

    // 获取 InteractJS 实例
    const interactInstance = interact(this.state.element);
    // 获取标题栏元素
    const header = this.state.element.querySelector('.markmap-toc-header') as HTMLElement;

    // 侧边栏模式下禁用拖动
    if (this.options.toolbarPosition === 'side') {
      interactInstance.draggable(false);
      if (header) header.style.cursor = 'default';
      return;
    }

    // 启用拖动
    interactInstance.draggable({
      // 只允许从标题栏拖动
      allowFrom: '.markmap-toc-header',
      // 忽略 SVG 和内容区域的拖动
      ignoreFrom: '.markmap-svg, .markmap-content',
      listeners: {
        move: (event) => {
          const target = event.target;                                  // 获取目标元素
          // 累加拖动距离
          const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;  // 计算 x 坐标偏移
          const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;  // 计算 y 坐标偏移

          // 使用 transform 实现拖动，性能更好
          target.style.transform = `translate(${x}px, ${y}px)`;        // 应用变换
          target.setAttribute('data-x', x.toString());                 // 设置 data-x 属性
          target.setAttribute('data-y', y.toString());                 // 设置 data-y 属性
        }
      }
    });
    if (header) header.style.cursor = 'move';                         // 设置光标为移动样式
  }

  /**
   * 注入组件样式到页面
   *
   * 检查样式是否已存在，避免重复注入
   */
  private _injectStyle() {
    const styleId = 'markmap-toc-component-style';            // 定义样式 ID
    // 检查是否已存在该样式，如果存在则直接返回
    if (document.getElementById(styleId)) return;

    const styleTag = document.createElement('style');         // 创建 style 标签
    styleTag.id = styleId;                                    // 设置 ID
    styleTag.textContent = COMPONENT_STYLE;                   // 设置样式内容
    document.head.appendChild(styleTag);                      // 添加到页面 head
  }

  /**
   * 动态更新高亮样式
   *
   * 根据用户在设置中选择的颜色，动态创建或更新一个 <style> 标签，
   * 其中包含高亮动画的 @keyframes 规则。
   * 这使得高亮颜色可以由用户自定义。
   */
  private _updateHighlightStyle() {
    const styleId = 'markmap-highlight-style';                // 定义样式 ID
    // 尝试获取已存在的样式标签
    let styleTag = document.getElementById(styleId) as HTMLStyleElement;

    // 如果样式标签不存在，则创建一个
    if (!styleTag) {
      styleTag = document.createElement('style');             // 创建 style 标签
      styleTag.id = styleId;                                  // 设置 ID
      document.head.appendChild(styleTag);                    // 添加到页面 head
    }

    const color = this.options.headingHighlightColor;         // 获取标题高亮颜色
    const duration = this.options.highlightDuration / 1000;    // 获取持续时间并转换为秒
    // 动态生成 keyframes，将用户自定义颜色和持续时间注入
    styleTag.textContent = `
      @keyframes markmap-highlight-animation {
        from { background: ${color}; }                        /* 起始背景色 */
        to { background: transparent; }                       /* 结束背景色为透明 */
      }

      .markmap-highlight {
        animation: markmap-highlight-animation ${duration}s ease-out; /* 应用动画 */
      }
    `;
  }

  // ==================== 事件处理 ====================

  /** 事件清理函数数组，用于统一管理和清理所有事件监听器 */
  private _eventCleanupFunctions: (() => void)[] = [];

  /**
   * 绑定事件监听器
   *
   * 使用事件委托模式，在组件根元素上监听所有点击事件
   * 这样只需要一个监听器就能处理所有按钮和节点的点击
   */
  private _attachEventListeners() {
    // 如果组件元素不存在，则直接返回
    if (!this.state.element) return;

    // 绑定点击事件处理器
    const boundHandler = this._handleModalClick.bind(this);   // 绑定 this 上下文
    this.state.element.addEventListener('click', boundHandler); // 添加点击事件监听器

    // 保存清理函数，用于后续移除监听器
    this._eventCleanupFunctions.push(() => this.state.element!.removeEventListener('click', boundHandler));
  }

  /**
   * 清理所有事件监听器
   *
   * 遍历执行所有保存的清理函数，确保没有内存泄漏
   */
  private _cleanupEventListeners() {
    // 遍历并执行所有清理函数
    this._eventCleanupFunctions.forEach(cleanup => cleanup());
    this._eventCleanupFunctions = [];                         // 清空清理函数数组
  }

  private _getNonCodeMarkdownLines(markdownContent: string): string[] {
    const lines = markdownContent.split('\n');
    const result: string[] = [];
    let inFenceBlock = false;
    let fenceMarker = '';

    for (const line of lines) {
      const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
      const isIndentedCodeLine = !inFenceBlock && /^( {4,}|\t)/.test(line);

      if (fenceMatch) {
        const marker = fenceMatch[2][0];
        if (!inFenceBlock) {
          inFenceBlock = true;
          fenceMarker = marker;
        } else if (marker === fenceMarker) {
          inFenceBlock = false;
          fenceMarker = '';
        }
        continue;
      }

      if (inFenceBlock || isIndentedCodeLine) {
        continue;
      }

      result.push(line);
    }

    return result;
  }

  /**
   * 预处理 Markdown，避免代码块内容被错误识别为思维导图节点
   */
  private _preprocessMarkdownForMarkmap(markdownContent: string): string {
    const lines = this._getNonCodeMarkdownLines(markdownContent);

    if (this.options.initialExpandLevel <= 5) {
      return lines
        .filter(line => /^#{1,6}\s/.test(line))
        .join('\n');
    }

    const result: string[] = [];
    let currentLevel = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const headingMatch = line.match(/^(#{1,6})\s/);

      if (headingMatch) {
        currentLevel = headingMatch[1].length;
        result.push(line);
        continue;
      }

      if (trimmed && !line.startsWith(' ') && !line.startsWith('-') && !line.startsWith('*')) {
        const indent = '  '.repeat(currentLevel);
        result.push(`${indent}- ${line}`);
        continue;
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * 统一的点击事件处理器
   *
   * 使用事件委托模式在组件根元素上监听所有点击事件，
   * 然后根据点击目标的不同执行相应的操作：
   * - 功能按钮点击：关闭、固定、刷新、缩放等操作
   * - 思维导图节点点击：跳转到对应的文档标题
   *
   * @param e 点击事件对象
   */
  private _handleModalClick = async (e: Event) => {
    const target = e.target as HTMLElement;                   // 获取事件目标元素

    // 检查是否点击了功能按钮（通过 data-action 属性识别）
    const actionBtn = target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');   // 获取按钮的动作类型
      try {
        // 根据按钮的 action 属性执行相应的功能
        switch (action) {
          case 'close': this.hide(); break;                   // 关闭思维导图窗口
          case 'pin-left': this._pin('left'); break;          // 固定到左侧
          case 'pin-right': this._pin('right'); break;        // 固定到右侧
          case 'zoom-in': this._zoomIn(); break;              // 放大思维导图
          case 'zoom-out': this._zoomOut(); break;            // 缩小思维导图
          case 'fit': await this._fitToView(e as MouseEvent); break; // 适应视图大小
          case 'export': this._setExportMenuVisible(true); break;
          case 'export-cancel': this._setExportMenuVisible(false); break;
          case 'export-html': await this._exportMarkmap('html'); break;
          case 'export-svg': await this._exportMarkmap('svg'); break;
          case 'export-png': await this._exportMarkmap('png'); break;
        }
      } catch (error) {
        // 记录按钮操作失败的日志
        logger(`按钮操作失败: ${error.message}`, 'error', error);
      }
      return; // 处理完按钮点击后结束，避免继续处理其他点击逻辑
    }

    // 检查是否点击了思维导图节点（向上查找 .markmap-node）
    let nodeEl: Element | null = target;
    while (nodeEl && nodeEl !== this.state.element) {
      // 如果元素包含 markmap-node 类，则认为是节点
      if (nodeEl.classList?.contains('markmap-node')) {
        this._scrollToHeadingByNode(nodeEl);                  // 滚动到对应标题
        return;
      }
      nodeEl = nodeEl.parentElement;                          // 向上查找父元素
    }

    // 如果既不是按钮也不是节点，不执行任何操作
  }

  /**
   * 更新思维导图内容
   */
  private _update = async () => {
    // 如果组件元素不存在，则直接返回
    if (!this.state.element) return;

    const headingRefs = this._getHeadingRefs();               // 获取文档中的标题引用
    // 生成标题内容的哈希值，用于检测变化
    const contentHash = headingRefs
      .map(item => `${item.id}:${item.text}`)
      .join('|');

    // 如果内容哈希值未变化，则直接返回
    if (contentHash === this.state.lastHeadingsHash) return;

    logger('更新 TOC Markmap');                               // 记录更新日志
    this.state.lastHeadingsHash = contentHash;                // 更新哈希值

    let markdownContent = this.editorAdapter.getMarkdown();   // 获取 Markdown 内容
    // 获取 SVG 元素
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;                                         // 如果 SVG 元素不存在，则返回

    // 如果 Markdown 内容为空，则渲染空状态
    if (!markdownContent.trim()) {
      this._renderEmpty(svg);
      return;
    }

    markdownContent = this._preprocessMarkdownForMarkmap(markdownContent);

    const { root } = this.transformer.transform(markdownContent); // 转换 Markdown 为思维导图数据

    // 检测是否有虚拟根节点（多个一级标题时 Markmap 会创建虚拟根）
    const hasVirtualRoot = !root.content && root.children && root.children.length > 1;
    // 如果有虚拟根节点，展开层级需要 +1 来补偿
    const adjustedExpandLevel = hasVirtualRoot
      ? this.options.initialExpandLevel + 1
      : this.options.initialExpandLevel;

    // 根据配置选项生成 Markmap 选项
    const options = deriveOptions({
      spacingHorizontal: this.options.spacingHorizontal,      // 水平间距
      spacingVertical: this.options.spacingVertical,          // 垂直间距
      fitRatio: this.options.fitRatio,                        // 适应视图比例
      paddingX: this.options.paddingX,                        // 水平内边距
      color: this.options.nodeColors,                         // 节点颜色方案
      colorFreezeLevel: this.options.colorFreezeLevel,        // 颜色冻结层级
      initialExpandLevel: adjustedExpandLevel > 5 ? 6 : adjustedExpandLevel, // 初始展开层级
      duration: this.options.animationDuration,               // 动画持续时间
    });

    // 如果 Markmap 实例已存在，则更新数据
    if (this.state.markmap) {
      this.state.markmap.setData(root, options);
    } else {
      // 如果 Markmap 实例不存在，则创建新实例
      svg.innerHTML = '';                                     // 清空 SVG 内容
      this.state.markmap = Markmap.create(svg, options, root); // 创建 Markmap 实例
      // 延迟执行适应视图操作
      setTimeout(() => this.state.markmap?.fit(), this.options.delayInitialFit);
    }

    // 延迟执行同步映射操作
    setTimeout(() => {
      this._syncMapsAfterRender(root, headingRefs);
    }, this.options.delayAttributeSet);
  }

  // --- 工具方法：标题处理 ---

  /**
   * 获取 Markmap 节点的纯文本内容
   */
  private _getNodeText(node: INode | IPureNode | null | undefined): string {
    if (!node?.content) return '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = node.content;
    return (tempDiv.textContent || '').trim();
  }

  private _getHeadingTextFromElement(element: HTMLElement | null | undefined): string {
    if (!element) return '';
    return (element.textContent || '').replace(/^\s{0,3}#{1,6}\s+/, '').trim();
  }

  private _getFallbackHeadingRefs(): HeadingRef[] {
    const write = document.querySelector('#write');
    if (!write) return [];

    const elements = Array.from(write.querySelectorAll('[mdtype="heading"], h1, h2, h3, h4, h5, h6')) as HTMLElement[];
    const refs: Array<HeadingRef | null> = elements
      .map((element, index) => {
        const text = this._getHeadingTextFromElement(element);
        if (!text) return null;
        const id = element.getAttribute('cid') || `fallback-heading-${index}-${text}`;
        const tagLevel = Number(element.tagName.replace(/[^\d]/g, '')) || 0;
        const level = tagLevel || Number(element.getAttribute('data-level') || 0) || 0;
        return { id, text, level, element };
      });
    return refs.filter((item): item is HeadingRef => !!item);
  }

  private _getHeadingRefs(): HeadingRef[] {
    const refs = this.editorAdapter.getHeadingRefs?.();
    if (refs && refs.length > 0) return refs;
    return this._getFallbackHeadingRefs();
  }

  private _resolveHeadingElement(id: string): HTMLElement | null {
    const resolved = this.editorAdapter.resolveHeadingElement?.(id);
    if (resolved) return resolved;
    const ref = this._getHeadingRefs().find(item => item.id === id);
    return ref?.element || null;
  }

  private _scrollToHeading(id: string): HTMLElement | null {
    const resolved = this.editorAdapter.scrollToHeading?.(id, {
      offsetTop: this.options.scrollOffsetTop,
      highlightClassName: 'markmap-highlight',
      highlightDuration: this.options.highlightDuration,
    });
    if (resolved) return resolved;

    const element = this._resolveHeadingElement(id);
    if (!element) return null;

    const originalMargin = element.style.scrollMarginTop;
    element.style.scrollMarginTop = `${this.options.scrollOffsetTop}px`;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.classList.add('markmap-highlight');
    setTimeout(() => {
      element.style.scrollMarginTop = originalMargin;
      element.classList.remove('markmap-highlight');
    }, this.options.highlightDuration);

    return element;
  }

  private _getCurrentVisibleHeadingId(): string | null {
    const adapterHeadingId = this.editorAdapter.getCurrentVisibleHeadingId?.(this.options.viewportOffset);
    if (adapterHeadingId) return adapterHeadingId;

    const headingRefs = this._getHeadingRefs();
    if (headingRefs.length === 0) return null;

    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    let deepestHeading: HeadingRef | null = null;
    let maxLevel = 0;

    for (const heading of headingRefs) {
      const element = heading.element || this._resolveHeadingElement(heading.id);
      if (!element) continue;
      const elementTop = element.getBoundingClientRect().top + window.scrollY;
      if (elementTop >= viewportTop - this.options.viewportOffset && elementTop <= viewportBottom) {
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
      const element = heading.element || this._resolveHeadingElement(heading.id);
      if (!element) continue;
      const elementTop = element.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(elementTop - viewportTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestHeading = heading;
      }
    }

    return closestHeading?.id || null;
  }

  /**
   * 处理思维导图节点点击跳转到对应标题
   * @param nodeEl 节点元素
   */
  private _scrollToHeadingByNode(nodeEl: Element) {
    // 从点击的 DOM 元素中获取 Markmap 节点数据
    let currentNode = (nodeEl as any).__data__;
    // 如果无法获取节点数据，则记录警告日志并返回
    if (!currentNode) {
      logger('无法从 DOM 元素获取节点数据', 'warn');
      return;
    }

    // 向上遍历节点树，直到找到一个在 headingElements 中有记录的标题节点
    // 这是为了处理点击"正文内容"节点时，能够定位到其所属的标题
    while (currentNode && !this.state.headingIds.has(currentNode.state?.path)) {
      // 如果当前节点没有在映射中，则移动到其父节点
      currentNode = currentNode.parent;
    }
    // 记录当前节点内容

    // 如果找到了对应的标题节点
    if (currentNode && currentNode.state?.path) {
      const path = currentNode.state.path;                    // 获取节点路径
      const headingId = this.state.headingIds.get(path);
      let element: HTMLElement | undefined = (headingId ? this._resolveHeadingElement(headingId) || undefined : undefined)
        || this.state.headingElements.get(path);              // 根据路径获取标题元素

      // 降级方案：通过节点内容匹配文档标题
      if (!element && headingId) {
        element = this._resolveHeadingElement(headingId) || undefined;
      }
      if (!element) {
        const node = this._findNodeByStatePath(path);
        if (node?.content) {
          const nodeText = this._getNodeText(node);
          const headingRef = this._getHeadingRefs().find(h => h.text === nodeText);
          if (headingRef) {
            element = this._resolveHeadingElement(headingRef.id) || headingRef.element || undefined;
          }
        }
      }

      if (headingId) {
        logger(`跳转到标题: ${path}`);
        element = this._scrollToHeading(headingId) || element;
      } else if (element) {
        logger(`跳转到标题: ${path}`);
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        logger(`未找到路径对应的元素: ${path}`, 'warn');
      }
    } else {
      logger(`未找到任何可跳转的父级标题节点`, 'warn');
    }
  }

  //----------------思维导图节点处理相关方法---------------------
  /**
   * 从 state.path 计算祖先路径数组
   * @param path 节点的 state.path (如 "0.1.2.3")
   * @returns 祖先路径数组 (如 ["0", "0.1", "0.1.2"])
   */
  private _getAncestorPaths(path: string): string[] {
    const parts = path.split('.');                            // 按点分割路径
    const ancestors: string[] = [];                           // 存储祖先路径
    // 遍历路径部分，生成祖先路径
    for (let i = 1; i < parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('.'));            // 截取并连接路径部分
    }
    return ancestors;                                         // 返回祖先路径数组
  }

  private _findPathByHeadingId(headingId: string | null | undefined): string | undefined {
    if (!headingId) return undefined;
    for (const [path, id] of this.state.headingIds.entries()) {
      if (id === headingId) return path;
    }
    return undefined;
  }

  /**
   * 同步双向索引Map
   *
   * 此函数在每次更新思维导图数据(setData)之后被调用，负责建立和维护两个关键的双向映射关系：
   * 1. 从 Markmap 节点路径(state.path)到文档中实际标题元素的映射 (headingElements)
   * 2. 从文档中实际标题元素到 Markmap 节点路径的映射 (elementToPath)
   *
   * 这两个映射对于实现点击思维导图节点跳转到对应标题的功能至关重要。
   *
   * 工作原理:
   * 1. 清空旧的映射关系，确保数据一致性
   * 2. 收集所有非根节点，构建待处理节点列表
   * 3. 遍历节点列表，将节点内容与标题元素进行匹配
   * 4. 匹配成功时建立双向映射关系
   *
   * 匹配策略:
   * - 通过比较节点文本内容(node.content)和标题元素文本内容来确定对应关系
   * - 使用临时DOM元素(tempDiv)解析节点HTML内容，提取纯文本进行比较
   * - 严格按照顺序匹配，确保标题元素与节点的一一对应关系
   *
   * @param root INode树根节点 - 来自 Markmap 转换后的节点树根节点
   * @param headingRefs HeadingRef数组 - 文档中所有的标题引用数组
   */
  private _syncMapsAfterRender(root: INode | IPureNode, headingRefs: HeadingRef[]): void {
    // 清空旧的映射关系，确保每次更新都是全新的映射
    this.state.headingElements.clear();
    this.state.headingIds.clear();
    this.state.elementToPath.clear();

    // 收集所有非根节点，用于后续遍历处理
    // 根节点通常不对应具体的文档标题，所以排除在外
    const nodeList: (INode | IPureNode)[] = [];
    const collectNodes = (node: INode | IPureNode, isRoot = false) => {
      // 只有非根节点才加入列表
      if (!isRoot) nodeList.push(node);
      // 递归收集所有子节点
      node.children?.forEach(child => collectNodes(child, false));
    };
    collectNodes(root, true);

    // 标题元素索引，用于顺序匹配
    let headingDomIndex = 0;
    const sources = headingRefs;

    // 遍历收集到的所有节点，并与标题元素进行匹配
    logger(`开始匹配: nodeList=${nodeList.length}, headings=${sources.length}`);
    for (let i = 0; i < nodeList.length; ) {
      const node = nodeList[i];
      // 如果标题元素已经全部匹配完毕，则停止处理
      if (headingDomIndex >= sources.length) break;

      // 确保节点有state和path，如果没有则生成临时path
      if (!('state' in node)) continue;

      const originalPath = node.state.path;

      // 获取当前待匹配的标题元素
      const currentHeading = sources[headingDomIndex];
      const cleanNodeText = this._getNodeText(node);
      const currentHeadingText = currentHeading.text;

      // 当前节点内容与当前标题元素文本一致时，建立双向映射
      // trim()用于去除首尾空白字符，提高匹配准确性
      if (cleanNodeText === currentHeadingText) {
        // 获取节点路径，作为映射的键
        const path = node.state.path;
        this.state.headingIds.set(path, currentHeading.id);
        if (currentHeading.element) {
          this.state.headingElements.set(path, currentHeading.element);
          this.state.elementToPath.set(currentHeading.element, path);
        }

        // 移动到下一个标题元素
        headingDomIndex++;
        i++;
      } else {
        headingDomIndex++;
      }
    }
    logger(`匹配完成: 成功映射 ${this.state.headingElements.size} 个节点`);
  }

  /**
   * 根据state.path在INode树中查找节点
   * @param path 目标state.path
   * @returns 匹配的INode或null
   */
  private _findNodeByStatePath(path: string): INode | null {
    const search = (node: INode | IPureNode): INode | null => {
      // 检查节点的路径是否匹配目标路径
      if ('state' in node && node.state?.path === path) return node as INode;
      // 递归搜索子节点
      if (node.children) {
        for (const child of node.children) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    // 从 Markmap 数据根节点开始搜索
    return search(this.state.markmap.state.data);
  }

  /**
   * 确保节点可见（展开所有祖先）
   * @param path 目标节点的state.path
   */
  private async _ensureNodeVisible(path: string): Promise<void> {
    const ancestorPaths = this._getAncestorPaths(path);       // 获取祖先路径
    // 遍历所有祖先路径
    for (const ancestorPath of ancestorPaths) {
      const ancestorNode = this._findNodeByStatePath(ancestorPath); // 查找祖先节点
      // 如果祖先节点存在且处于折叠状态，则展开它
      if (ancestorNode && ancestorNode.payload?.fold) {
        await this.state.markmap.toggleNode(ancestorNode);
      }
    }
  }

  /**
   * 根据标题内容查找 Markmap 数据节点（用于调试 toggleNode API）
   * @param content 标题文本内容（支持部分匹配）
   * @param recursive 是否递归搜索子节点，默认为 true
   * @returns 匹配的数据节点，如果未找到则返回 null
   */
  public _findNodeByContent(content: string, recursive: boolean = true): any | null {
    // 检查 Markmap 数据是否已初始化
    if (!this.state.markmap?.state?.data) {
      logger('Markmap 数据未初始化', 'warn');
      return null;
    }

    const searchNode = (node: any): any | null => {
      // 解码节点内容并检查是否匹配
      const textarea = document.createElement('textarea');
      textarea.innerHTML = node.content || '';                // 将节点内容设置到 textarea 中
      const nodeContent = textarea.value;                     // 获取解码后的内容
      // 如果节点内容包含目标内容，则返回该节点
      if (nodeContent.includes(content)) {
        logger(`找到匹配节点: "${nodeContent}"`);
        return node;
      }

      // 递归搜索子节点
      if (recursive && node.children) {
        for (const child of node.children) {
          const found = searchNode(child);
          if (found) return found;
        }
      }

      return null;
    };

    // 从根节点开始搜索
    return searchNode(this.state.markmap.state.data);
  }

  //---------------------------思维导图相关方法结束------------------

  /**
   * 放大思维导图
   *
   * 使用D3的缩放功能，按照设置中的zoomStep比例放大视图
   * 带有平滑的过渡动画效果
   */
  private _zoomIn() {
    // 如果 Markmap 实例不存在，则直接返回
    if (!this.state.markmap) return;
    // 获取缩放步长，默认0.2表示每次放大20%
    const zoomStep = this.options.zoomStep ?? 0.2;
    this.state.markmap.svg
      .transition()                                             // 开始过渡动画
      .duration(this.options.delayZoomTransition)             // 设置过渡持续时间
      .call(this.state.markmap.zoom.scaleBy, 1 + zoomStep);   // 执行放大操作
  }

  /**
   * 缩小思维导图
   *
   * 使用D3的缩放功能，按照设置中的zoomStep比例缩小视图
   * 带有平滑的过渡动画效果
   */
  private _zoomOut() {
    // 如果 Markmap 实例不存在，则直接返回
    if (!this.state.markmap) return;
    // 获取缩放步长，使用倒数实现缩小效果
    const zoomStep = this.options.zoomStep ?? 0.2;
    this.state.markmap.svg
      .transition()                                             // 开始过渡动画
      .duration(this.options.delayZoomTransition)             // 设置过渡持续时间
      .call(this.state.markmap.zoom.scaleBy, 1 / (1 + zoomStep)); // 执行缩小操作
  }

  /**
   * 导出思维导图为SVG文件
   *
   * 工作流程：
   * 1. 克隆当前SVG元素避免影响显示
   * 2. 计算并设置SVG的实际尺寸（添加边距）
   * 3. 内联必要的CSS样式到SVG中
   * 4. 调用下载方法保存文件
   *
   * @param format 导出格式 (目前只支持svg)
   */

  /**
   * 显示简易提示
   */
  private _showToast(message: string, type: 'success' | 'error' = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${type === 'success' ? '#4caf50' : '#f44336'};
      color: white;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 999999;
      font-size: 14px;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /** 显示格式选择弹窗，选择格式后关闭。 */
  private _setExportMenuVisible(visible: boolean) {
    const menu = this.state.element!.querySelector('.markmap-export-menu') as HTMLElement;
    menu.hidden = !visible;
    if (visible) (menu.querySelector('button') as HTMLButtonElement).focus();
  }

  /** 导出当前展开内容；HTML 保留折叠状态和全部节点，供独立交互。 */
  private async _exportMarkmap(format: ExportFormat): Promise<void> {
    this._setExportMenuVisible(false);
    try {
      const markmap = this.state.markmap as Markmap;
      const svg = this.state.element!.querySelector('.markmap-svg') as SVGSVGElement;
      if (!markmap.state.data) throw new Error('导图没有可导出的内容');
      let blob: Blob;
      if (format === 'html') {
        const root = this._getExportData(markmap.state.data);
        const background = getComputedStyle(this.state.element!).backgroundColor;
        const channels = background.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const dark = channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 < 128;
        const html = createInteractiveHtml(root, {
          color: this.options.nodeColors,
          colorFreezeLevel: this.options.colorFreezeLevel,
          spacingHorizontal: this.options.spacingHorizontal,
          spacingVertical: this.options.spacingVertical,
          paddingX: this.options.paddingX,
          fitRatio: this.options.fitRatio,
          initialExpandLevel: -1,
          duration: 0,
        }, dark);
        blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      } else {
        const exportedSvg = this._createExportSvg(svg, markmap);
        blob = format === 'png'
          ? await createPng(exportedSvg)
          : new Blob([new XMLSerializer().serializeToString(exportedSvg)], { type: 'image/svg+xml;charset=utf-8' });
      }
      const destination = await saveExport(blob, format, this.options.exportDirectory);
      this._showToast(`${format.toUpperCase()} 已保存至：${destination}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`导出失败：${message}`, 'error', error);
      this._showToast(`导出失败：${message}`, 'error');
      throw error;
    }
  }

  /** 去掉运行时布局信息，仅保留 HTML 渲染所需的内容和折叠状态。 */
  private _getExportData(node: IPureNode): IPureNode {
    return {
      content: node.content,
      payload: { fold: node.payload?.fold || 0 },
      children: node.children?.map(child => this._getExportData(child)),
    };
  }

  /** 按完整内容范围导出，解除窗口缩放、平移，并固化当前主题颜色。 */
  private _createExportSvg(svg: SVGSVGElement, markmap: Markmap): SVGSVGElement {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const group = clone.querySelector('g')!;
    const bbox = markmap.g.node()!.getBBox();
    if (!bbox.width || !bbox.height) throw new Error('导图尚未渲染，请稍后再导出');
    group.removeAttribute('transform');
    const width = Math.ceil(bbox.width + 40);
    const height = Math.ceil(bbox.height + 40);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `${bbox.x - 20} ${bbox.y - 20} ${width} ${height}`);
    const computed = getComputedStyle(svg);
    for (const property of ['--markmap-text-color', '--markmap-circle-open-bg', '--markmap-font', '--markmap-a-color', '--markmap-code-bg', '--markmap-code-color']) {
      clone.style.setProperty(property, computed.getPropertyValue(property));
    }
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', String(bbox.x - 20));
    background.setAttribute('y', String(bbox.y - 20));
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', getComputedStyle(this.state.element!).backgroundColor);
    clone.insertBefore(background, group);
    return clone;
  }

  /**
   * 切换侧边栏嵌入模式
   *
   * 功能说明：
   * - 嵌入模式：窗口固定在侧边栏位置，尺寸跟随侧边栏变化
   * - 悬浮模式：窗口可自由拖动和调整大小
   *
   * 实现细节：
   * 1. 切换 CSS 类名
   * 2. 更新内部状态标志
   * 3. 更新拖动设置（根据用户配置决定是否允许拖动）
   * 4. 调整窗口位置和尺寸
   * 5. 设置或移除 ResizeObserver（监听侧边栏尺寸变化）
   */
  /**
   * 固定到左侧 / 取消固定
   */
  /**
   * 固定到左侧或右侧 / 取消固定
   * @param side 'left' 或 'right'
   */
  private _pin(side: 'left' | 'right') {
    const content = document.querySelector('#write') as HTMLElement;
    if (!content || !this.state.element) return;

    const isLeft = side === 'left';
    const stateKey = isLeft ? 'isPinLeft' : 'isPinRight';
    const otherStateKey = isLeft ? 'isPinRight' : 'isPinLeft';
    const marginKey = isLeft ? 'marginLeft' : 'marginRight';
    const otherMarginKey = isLeft ? 'marginRight' : 'marginLeft';
    const cssClass = isLeft ? 'pinned-left' : 'pinned-right';
    const otherCssClass = isLeft ? 'pinned-right' : 'pinned-left';
    const resizeEdge = isLeft ? 'right' : 'left';

    // 如果另一侧已固定，先清理
    if (this.state[otherStateKey]) {
      this.state[otherStateKey] = false;
      content.style[otherMarginKey] = '';
      this.state.element.classList.remove(otherCssClass);

      // 更新另一侧按钮状态
      const otherBtn = this.state.element.querySelector(`[data-action="pin-${isLeft ? 'right' : 'left'}"]`) as HTMLElement;
      if (otherBtn) {
        otherBtn.innerHTML = isLeft ? '▶' : '◀';
        otherBtn.title = isLeft ? '固定到右侧' : '固定到左侧';
      }
    }

    this.state[stateKey] = !this.state[stateKey];

    // 获取按钮元素
    const btn = this.state.element.querySelector(`[data-action="pin-${side}"]`) as HTMLElement;

    if (this.state[stateKey]) {
      // 更新按钮状态
      if (btn) {
        btn.innerHTML = '⏸';
        btn.title = isLeft ? '取消固定左侧' : '取消固定右侧';
      }

      // 只在首次固定时记录原始尺寸
      if (!this.state.originModalRect) {
        this.state.originModalRect = this.state.element.getBoundingClientRect();
        this.state.originContentRect = content.getBoundingClientRect();
      }

      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const contentTop = content.offsetTop;
      const modalHeight = viewportHeight - contentTop;
      
      // 使用配置的百分比计算导图窗口宽度
      const newWidth = Math.floor(viewportWidth * this.options.widthPercentWhenPin / 100);
      
      // 固定到左侧时，减去左侧工具栏宽度
      let ribbonWidth = 0;
      if (isLeft) {
        const ribbon = document.querySelector('.typ-ribbon') as HTMLElement;
        if (ribbon) ribbonWidth = ribbon.offsetWidth;
      }
      
      const newLeft = isLeft ? ribbonWidth : viewportWidth - newWidth;

      logger(`========== 固定到${side === 'left' ? '左' : '右'}侧 ==========`);
      logger(`视口尺寸: width=${viewportWidth}, height=${viewportHeight}`);
      logger(`#write top=${contentTop}`);
      logger(`导图窗口计算: left=${newLeft}, width=${newWidth}, height=${modalHeight}`);

      // 设置导图位置
      Object.assign(this.state.element.style, {
        top: `${contentTop}px`,
        left: `${newLeft}px`,
        width: `${newWidth}px`,
        height: `${modalHeight}px`,
        transform: 'none'
      });

      // 验证实际位置
      const actualRect = this.state.element.getBoundingClientRect();
      logger(`导图实际位置: left=${actualRect.left}, right=${actualRect.right}, top=${actualRect.top}, width=${actualRect.width}, height=${actualRect.height}`);
      logger(`margin设置: ${marginKey}=${newWidth}px`);

      // 调整内容区域
      content.style[marginKey] = `${newWidth}px`;
      this.state.element.classList.add(cssClass);

      // 重新配置 InteractJS
      interact(this.state.element)
        .draggable(false)
        .resizable({
          edges: { left: !isLeft, right: isLeft, top: false, bottom: false },
          listeners: {
            move: (event) => {
              const target = event.target;
              const newWidth = event.rect.width;

              // 同步调整 #write 的 margin
              content.style[marginKey] = `${newWidth}px`;

              // 更新导图位置
              target.style.width = `${newWidth}px`;
              if (!isLeft) target.style.left = `${event.rect.left}px`;
              target.style.transform = 'none';
            }
          }
        });
    } else {
      // 更新按钮状态
      if (btn) {
        btn.innerHTML = isLeft ? '◀' : '▶';
        btn.title = isLeft ? '固定到左侧' : '固定到右侧';
      }

      // 恢复原始状态
      if (this.state.originModalRect) {
        const { left, top, width, height } = this.state.originModalRect;
        Object.assign(this.state.element.style, {
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`
        });
      }

      content.style[marginKey] = '';
      this.state.element.classList.remove(cssClass);

      // 如果两侧都未固定，清空原始位置记录
      if (!this.state.isPinLeft && !this.state.isPinRight) {
        this.state.originModalRect = null;
        this.state.originContentRect = null;
      }

      this._setupInteractJS();
    }
  }

  /**
   * 响应式处理：窗口大小变化时重新计算固定布局
   */
  private _handleResize = debounce(() => {
    if (!this.state.element) return;

    const content = document.querySelector('#write') as HTMLElement;
    if (!content) return;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const contentTop = content.offsetTop;
    const modalHeight = viewportHeight - contentTop;
    const newWidth = Math.floor(viewportWidth * this.options.widthPercentWhenPin / 100);

    if (this.state.isPinRight) {
      this.state.element.style.top = `${contentTop}px`;
      this.state.element.style.height = `${modalHeight}px`;
      this.state.element.style.width = `${newWidth}px`;
      this.state.element.style.left = `${viewportWidth - newWidth}px`;
      content.style.marginRight = `${newWidth}px`;
      content.style.marginLeft = '';
    } else if (this.state.isPinLeft) {
      let ribbonWidth = 0;
      const ribbon = document.querySelector('.typ-ribbon') as HTMLElement;
      if (ribbon) ribbonWidth = ribbon.offsetWidth;
      
      this.state.element.style.top = `${contentTop}px`;
      this.state.element.style.height = `${modalHeight}px`;
      this.state.element.style.width = `${newWidth}px`;
      this.state.element.style.left = `${ribbonWidth}px`;
      content.style.marginLeft = `${newWidth}px`;
      content.style.marginRight = '';
    }
  }, 100);

  private async _fitToView(event?: MouseEvent) {
    // 如果 Markmap 实例或组件元素不存在，则直接返回
    if (!this.state.markmap || !this.state.element) return;

    // 获取 SVG 元素
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    // 判断是否为用户点击事件
    const isUserClick = event && event.type === 'click';

    // 如果是用户点击
    if (isUserClick) {
      const currentHeadingId = this._getCurrentVisibleHeadingId();
      const currentElement = currentHeadingId
        ? this._resolveHeadingElement(currentHeadingId)
        : null;

      logger('进入 _fitToView，开始适应视图。')
      logger(`当前标题内容:${currentElement?.textContent}`)

      // 获取当前元素对应的路径
      let path = currentElement ? this.state.elementToPath.get(currentElement) : undefined;
      if (!path) {
        path = this._findPathByHeadingId(currentHeadingId);
      }

      // 降级方案：通过内容查找节点
      if (!path && currentElement?.textContent) {
        const node = this._findNodeByContent(currentElement.textContent.trim());
        path = node?.state?.path;
      }

      logger(`当前path:${path}`)
      // 如果路径不存在，则执行默认适应视图
      if (!path) {
        this.state.markmap.fit();
        return;
      }

      // 确保节点可见（展开所有祖先节点）
      await this._ensureNodeVisible(path);
      // 延迟执行
      await new Promise(resolve => setTimeout(resolve, 150));

      // 查找目标元素
      const targetElement = svg.querySelector(`[data-path="${path}"].markmap-node`);
      // 如果目标元素存在，则平移并缩放到节点
      if (targetElement) {
        this._panAndZoomToNode(targetElement, currentElement);
      } else {
        // 否则执行默认适应视图
        this.state.markmap.fit();
      }
    } else {
      // 如果不是用户点击且配置了自动适应视图
      if (this.options.autoFitWhenUpdate) {
        this.state.markmap.fit();                               // 执行适应视图
      }
    }
  }

  /**
   * 平移并缩放视图以聚焦于指定节点
   * @param targetElement 目标 SVG 元素，用于定位和计算变换
   * @param headingObj 对应的标题对象，用于辅助计算最优缩放比例
   */
  private _panAndZoomToNode(targetElement: Element, headingObj: any) {
    // 如果 Markmap 实例或组件元素不存在，则直接返回
    if (!this.state.markmap || !this.state.element) return;

    logger('进入 _panAndZoomToNode，开始高亮和动画。');
    logger(`targetElement 结构:${ targetElement.outerHTML}`);
    // 使用 D3 选择目标元素
    const nodeSelection = select(targetElement);
    // 选择 foreignObject > div > div 元素
    const foDivSelection = nodeSelection.select('foreignObject > div > div');
    // 高亮目标节点的文本背景
    if (!foDivSelection.empty()) {
      const originalBg = foDivSelection.style('background-color');  // 获取原始背景色
      const highlightColor = this.options.nodeHighlightColor;       // 获取高亮颜色
      const duration = this.options.highlightDuration;              // 获取持续时间
      logger(`高亮节点文本背景：原始颜色=${originalBg}, 高亮色=${highlightColor}, 持续时间=${duration}ms`);

      // 执行高亮动画
      foDivSelection.interrupt('highlight')
        .transition('highlight')
        .duration(duration / 2)
        .style('background-color', highlightColor)
        .transition()
        .duration(duration / 2)
        .style('background-color', originalBg);
    } else {
      logger('在节点内未找到 foreignObject>div>div 元素进行高亮。');
    }

    // 获取 SVG 元素
    const svg = this.state.element.querySelector('.markmap-svg') as SVGElement;
    if (!svg) return;

    logger(`[_panAndZoomToNode] SVG 尺寸: width=${svg.clientWidth}, height=${svg.clientHeight}`);
    logger(`[_panAndZoomToNode] 导图窗口尺寸: width=${this.state.element.clientWidth}, height=${this.state.element.clientHeight}`);

    const transform = zoomTransform(svg);                         // 获取当前缩放变换
    // 计算聚焦节点时的最优缩放比例
    const scale = this._calculateOptimalScale(targetElement, headingObj, transform.k);

    const svgRect = svg.getBoundingClientRect();                  // 获取 SVG 边界矩形
    logger(`[_panAndZoomToNode] SVG 实际位置: left=${svgRect.left}, right=${svgRect.right}, width=${svgRect.width}`);
    const nodeRect = targetElement.getBoundingClientRect();       // 获取节点边界矩形

    // 计算节点在 SVG 坐标系中的中心位置
    const originalNodeX =
      (nodeRect.left - svgRect.left - transform.x) / transform.k +
      nodeRect.width / (2 * transform.k);
    const originalNodeY =
      (nodeRect.top - svgRect.top - transform.y) / transform.k +
      nodeRect.height / (2 * transform.k);

    // 构造新的变换矩阵，使节点居中并应用缩放
    const newTransform = zoomIdentity
      .translate(svg.clientWidth / 2, svg.clientHeight / 2)       // 平移到中心
      .scale(scale)                                               // 应用缩放
      .translate(-originalNodeX, -originalNodeY);                 // 平移到节点位置

    // 应用变换动画到 SVG 视图
    this.state.markmap.svg
      .transition()
      .duration(this.options.delayFitTransition)                // 设置过渡持续时间
      .call(this.state.markmap.zoom.transform, newTransform);   // 执行变换

    logger(`适应视图完成，缩放比例: ${scale.toFixed(2)}`);
  }

  /**
   * 计算最优缩放比例，使节点元素的高度与文档字体大小匹配
   * @param nodeElement - 需要计算缩放比例的节点元素
   * @param headingObj - 标题对象（未使用）
   * @param currentScale - 当前缩放比例
   * @returns 计算得到的最优缩放比例，失败时返回默认值2.0
   */
  private _calculateOptimalScale(nodeElement: Element, headingObj: any, currentScale: number): number {
    try {
      // 获取文档写入区域元素
      const writeElement = document.querySelector('#write');
      if (!writeElement) return 2.0;                            // 如果未找到，返回默认值

      // 获取文档段落元素或写入区域元素的字体大小
      const paragraph = writeElement.querySelector('p') || writeElement;
      const documentFontSize = window.getComputedStyle(paragraph).fontSize;
      const documentSize = parseFloat(documentFontSize);

      // 计算节点元素在当前缩放比例下的实际高度
      const nodeRect = nodeElement.getBoundingClientRect();
      const nodeHeight = nodeRect.height;

      // 基于文档字体大小计算最优缩放比例
      const nodeHeightAtScale1 = nodeHeight / currentScale;
      const scale = documentSize / nodeHeightAtScale1;

      return scale;
    } catch (error) {
      // 记录计算失败的日志并返回默认值
      logger(`计算缩放比例失败: ${error.message}`, 'error');
      return 2.0;
    }
  }

  /**
   * 渲染空状态提示
   *
   * 当文档中没有标题时显示提示信息
   *
   * @param svg SVG 元素
   */
  private _renderEmpty(svg: SVGElement) {
    // 在 SVG 中显示提示文本
    svg.innerHTML = '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle">当前文档没有标题</text>';
  }

  // ==================== 实时更新功能 ====================

  /**
   * 初始化实时更新功能
   *
   * 策略：
   * 1. 首先尝试使用 Typora 的原生事件系统（性能最优）
   * 2. 如果失败，回退到 MutationObserver（兼容性方案）
   */
  private _initRealTimeUpdate() {
    // 如果未启用实时更新功能，则记录日志并返回
    if (!this.options.enableRealTimeUpdate) {
      logger('实时更新功能已禁用');
      return;
    }

    logger('开始初始化实时更新功能');
    // 尝试使用 Typora 的事件系统，失败则回退到 MutationObserver
    if (!this._tryInitTyporaEventSystem()) {
      logger('Typora 事件系统初始化失败，回退到 MutationObserver');
      this._initMutationObserver();                             // 初始化 MutationObserver
    } else {
      logger('Typora 事件系统初始化成功');
    }
  }

  /**
   * 尝试初始化 Typora 事件系统
   *
   * 遍历可能的事件中心位置，寻找可用的事件监听接口
   * 优先监听 outlineUpdated 事件，其次尝试其他文档变化事件
   *
   * @returns 是否成功初始化
   */
  private _tryInitTyporaEventSystem(): boolean {
    try {
      // 可能的事件中心位置
      const possibleEventHubs = [
        (window as any).eventHub,
        (window as any).File?.eventHub,
        (window as any).typora?.eventHub,
        (window as any).editor?.eventHub
      ];

      // 遍历所有可能的事件中心
      for (const eventHub of possibleEventHubs) {
        // 检查事件中心是否可用
        if (eventHub && eventHub.addEventListener && eventHub.eventType) {
          // 优先使用 outlineUpdated 事件（最精确）
          if (eventHub.eventType.outlineUpdated) {
            eventHub.addEventListener(eventHub.eventType.outlineUpdated, () => {
              // 如果组件可见，则处理内容变化
              if (!this.isVisible) return;
              this._handleContentChange();
            });
            return true;
          }

          // 尝试其他可能的文档变化事件
          const possibleEvents = ['contentChanged', 'documentChanged', 'tocUpdated', 'fileContentChanged'];
          for (const eventName of possibleEvents) {
            if (eventHub.eventType[eventName]) {
              eventHub.addEventListener(eventHub.eventType[eventName], () => {
                // 如果组件可见，则触发防抖更新
                if (!this.isVisible) return;
                this.debouncedUpdate();
              });
              return true;
            }
          }
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 初始化 MutationObserver（高性能优化版本）
   *
   * 该函数用于监听页面中标题元素的变更，并在检测到相关变化时触发更新操作。
   * 通过限制监听范围和使用防抖机制，提升性能并减少不必要的更新。
   *
   * 性能优化策略：
   * 1. 只监听标题元素的变化，忽略其他内容
   * 2. 使用防抖处理，避免频繁更新
   * 3. 不监听属性变化，只关注结构和文本变化
   */
  private _initMutationObserver() {
    const writeElement = document.querySelector('#write');      // 获取写入区域元素
    // 如果未找到写入区域元素，则记录错误日志并返回
    if (!writeElement) {
      logger('MutationObserver 初始化失败：找不到 #write 元素');
      return;
    }

    logger('开始初始化 MutationObserver');
    // 创建 MutationObserver 实例
    this.state.contentObserver = new MutationObserver((mutations) => {
      logger(`MutationObserver 检测到 ${mutations.length} 个变化`);
      // 只检查与标题相关的变化
      const hasHeadingChanges = mutations.some(mutation => {
        const target = mutation.target as HTMLElement;
        logger(`变化类型: ${mutation.type}, 目标: ${target.tagName || target.nodeName}`);

        /**
         * 检查节点是否与标题相关
         * @param node 要检查的节点
         * @returns 是否与标题相关
         */
        const isHeadingRelated = (node: Node): boolean => {
          // nodeType: 1=ELEMENT_NODE, 3=TEXT_NODE
          // 如果是文本节点，则检查其父元素是否为标题
          if (node.nodeType !== 1) {
            const tagName = node.parentElement?.tagName;
            return !!(tagName && /^H[1-6]$/.test(tagName));
          }

          // 如果是元素节点
          const element = node as HTMLElement;
          // 检查元素本身是否为标题
          if (element.tagName && /^H[1-6]$/.test(element.tagName)) return true;
          // 检查元素内是否包含标题
          return !!element.querySelector('h1, h2, h3, h4, h5, h6');
        };

        // 只关注标题相关的变化
        if (mutation.type === 'childList') {
          logger(`childList 变化: 新增 ${mutation.addedNodes.length} 个节点, 删除 ${mutation.removedNodes.length} 个节点`);

          // 详细日志：检查每个节点
          mutation.addedNodes.forEach((node, i) => {
            const el = node as HTMLElement;
            logger(`新增节点 ${i}: ${el.tagName || node.nodeName}, 类名: ${el.className || 'N/A'}, nodeType: ${node.nodeType}`);
          });
          mutation.removedNodes.forEach((node, i) => {
            const el = node as HTMLElement;
            logger(`删除节点 ${i}: ${el.tagName || node.nodeName}, 类名: ${el.className || 'N/A'}, nodeType: ${node.nodeType}`);
          });

          // 检查新增和删除的节点是否包含标题
          const addedHasHeading = Array.from(mutation.addedNodes).some(isHeadingRelated);
          const removedHasHeading = Array.from(mutation.removedNodes).some(isHeadingRelated);
          logger(`新增节点包含标题: ${addedHasHeading}, 删除节点包含标题: ${removedHasHeading}`);
          return addedHasHeading || removedHasHeading;
        }

        // 检查字符数据变化
        if (mutation.type === 'characterData') {
          logger(`characterData 变化`);
          // 只关注标题内的文本变化
          return isHeadingRelated(target);
        }

        return false;
      });

      // 如果有标题相关的变化，触发防抖更新
      if (hasHeadingChanges) {
        logger('检测到标题相关变化，触发更新');
        this.debouncedUpdate();
      } else {
        logger('未检测到标题相关变化，忽略');
      }
    });

    // 配置观察器：只监听必要的变化类型
    this.state.contentObserver.observe(writeElement, {
      childList: true,      // 监听子节点的添加和删除
      subtree: true,        // 监听所有后代节点
      characterData: true,  // 监听文本内容变化
    });

    logger('MutationObserver 已启动');
  }

  /**
   * 清理实时更新监听器
   *
   * 断开 MutationObserver 连接，释放资源
   */
  private _cleanupRealTimeUpdate() {
    // 如果内容观察器存在，则断开连接并重置
    if (this.state.contentObserver) {
      this.state.contentObserver.disconnect();
      this.state.contentObserver = null;
      logger('实时更新监听器已清理');
    }
  }

  /**
   * 处理内容变化
   *
   * 当检测到文档内容变化时调用此方法
   * 执行思维导图的更新操作
   */
  private async _handleContentChange() {
    // 如果组件不可见，则直接返回
    if (!this.isVisible) return;

    try {
      await this._update();                                     // 执行更新操作
    } catch (error) {
      // 记录处理内容变化时的错误日志
      logger(`处理内容变化时出错: ${error.message}`, 'error', error);
    }
  }

}
