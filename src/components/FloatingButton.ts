/**
 * Typora Markmap Plus 插件 - 悬浮按钮组件
 *
 * 功能说明：
 * - 创建一个可拖动的悬浮按钮，默认位置在右下角
 * - 按钮大小和图标可通过设置自定义
 * - 点击按钮时触发回调函数（显示/隐藏思维导图）
 * - 支持拖拽移动，但不保存位置（重启后回到默认位置）
 *
 * @author util6
 * @version 1.0.6
 */

import interact from 'interactjs';
import { logger } from '../utils';

// =======================================================
// 类型定义
// =======================================================

/**
 * 悬浮按钮组件配置选项
 */
export interface FloatingButtonOptions {
  /** 悬浮按钮的大小（直径） */
  floatingButtonSize: number;
  /** 悬浮按钮的自定义SVG图标 */
  floatingButtonIconSvg: string;
}

const DEFAULT_FLOATING_BUTTON_ICON_SVG = `<svg t="1793432762533" class="icon" viewBox="0 0 1056 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1723" xmlns:xlink="http://www.w3.org/1999/xlink" width="206.25" height="200"><path d="M678.4 544c19.2 44.8 64 83.2 121.6 83.2h128c70.4 0 128-57.6 128-128s-57.6-128-128-128h-128c-64 0-121.6 51.2-128 115.2H480v-64C480 300.8 569.6 211.2 678.4 192c12.8 51.2 64 96 121.6 96h128c70.4 0 128-57.6 128-128s-57.6-128-128-128h-128c-57.6 0-108.8 44.8-121.6 96C531.2 147.2 416 268.8 416 416v64h-32c-6.4-64-64-115.2-128-115.2h-128c-70.4 0-128 57.6-128 128s57.6 128 128 128h128c51.2 0 102.4-32 121.6-83.2H416v64c0 153.6 121.6 281.6 275.2 288 19.2 38.4 64 64 108.8 64h128c70.4 0 128-57.6 128-128s-57.6-128-128-128h-128c-70.4 0-128 57.6-128 121.6-108.8-12.8-192-108.8-192-217.6v-64h198.4zM800 435.2h128c38.4 0 64 25.6 64 64s-25.6 64-64 64h-128c-38.4 0-64-25.6-64-64s25.6-64 64-64z m0-339.2h128c38.4 0 64 25.6 64 64s-25.6 64-64 64h-128c-38.4 0-64-25.6-64-64s25.6-64 64-64zM800 768h128c38.4 0 64 25.6 64 64s-25.6 64-64 64h-128c-38.4 0-64-25.6-64-64s25.6-64 64-64z" p-id="1724"></path></svg>`;

/**
 * 悬浮按钮组件默认配置
 */
export const DEFAULT_FLOATING_BUTTON_OPTIONS: FloatingButtonOptions = {
  floatingButtonSize: 48,
  floatingButtonIconSvg: DEFAULT_FLOATING_BUTTON_ICON_SVG
}

// =======================================================
// 样式定义 - 悬浮按钮的CSS样式
// =======================================================
const COMPONENT_STYLE = `
  .markmap-floating-button {
    /* 固定定位，默认在右下角 */
    position: fixed;
    right: 20px;
    bottom: 20px;
    
    /* 按钮尺寸（会被JS动态覆盖） */
    width: 48px;
    height: 48px;
    
    /* 按钮外观 */
    background-color: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 50%;
    
    /* 内容居中 */
    display: flex;
    align-items: center;
    justify-content: center;
    
    /* 交互样式 */
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 9998;
    transition: background-color 0.2s;
    user-select: none;
  }

  /* SVG图标样式 */
  .markmap-floating-button svg {
    width: 60%;
    height: 60%;
    max-width: 100%;
    max-height: 100%;
  }

  /* 悬停效果 */
  .markmap-floating-button:hover {
    background-color: #f5f5f5;
  }
`;

// =======================================================
// 悬浮按钮组件类
// =======================================================
export class FloatingButtonComponent {

  /** 组件配置选项 */
  private options: FloatingButtonOptions;
  private dragResetTimer: number | undefined;

  /**
   * 构造函数
   * @param options 组件配置选项（可选，未提供的选项使用默认值）
   * @param onClick 点击按钮时的回调函数
   */
  constructor(
    options: Partial<FloatingButtonOptions> = {},
    private onClick: () => void,
  ) {
    // 合并默认配置和用户配置
    this.options = { ...DEFAULT_FLOATING_BUTTON_OPTIONS, ...options };
    // 注入CSS样式到页面
    this._injectStyle();
  }

  /** 组件状态 */
  private state = {
    element: null as HTMLElement | null, // 按钮DOM元素
  };

  private readonly shadowStyle = `
    :host {
      display: inline-flex;
      width: 100%;
      height: 100%;
      align-items: center;
      justify-content: center;
    }

    .icon-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    svg {
      width: 60%;
      height: 60%;
      max-width: 100%;
      max-height: 100%;
      display: block;
      overflow: visible;
    }
  `;

  private _sanitizeIconSvg(svg: string | undefined | null): string {
    const rawSvg = (svg || DEFAULT_FLOATING_BUTTON_ICON_SVG).trim();
    return rawSvg.replace(/\sclass="icon"/g, '');
  }

  private _summarizeIconSvg(svg: string | undefined | null) {
    const normalizedSvg = this._sanitizeIconSvg(svg);
    let hash = 5381;
    for (let i = 0; i < normalizedSvg.length; i += 1) {
      hash = ((hash << 5) + hash) ^ normalizedSvg.charCodeAt(i);
    }

    return {
      length: normalizedSvg.length,
      hash: (hash >>> 0).toString(16),
      isDefault: normalizedSvg === this._sanitizeIconSvg(DEFAULT_FLOATING_BUTTON_ICON_SVG),
      startsWith: normalizedSvg.slice(0, 80),
    };
  }

  /**
   * 更新组件配置
   * @param newOptions 新的配置选项（部分或全部）
   */
  public updateOptions(newOptions: Partial<FloatingButtonOptions>) {
    // 合并新配置到当前配置
    this.options = { ...this.options, ...newOptions };
    logger('悬浮按钮配置更新', 'info', {
      size: this.options.floatingButtonSize,
      icon: this._summarizeIconSvg(this.options.floatingButtonIconSvg),
    });
    this.render();
  }

  /**
   * 显示悬浮按钮
   * 创建按钮元素并设置所有必要的功能
   */
  public show = () => {
    // 如果按钮已存在，直接返回
    if (this.state.element) return;

    logger('初始化悬浮按钮', 'info', {
      size: this.options.floatingButtonSize,
      icon: this._summarizeIconSvg(this.options.floatingButtonIconSvg),
    });
    
    // 创建按钮DOM元素
    this._createElement();
    
    // 绑定事件监听器（点击事件）
    this._attachEventListeners();
    
    // 设置拖拽功能
    this._setupInteractJS();
  }

  /**
   * 隐藏悬浮按钮
   * 清理所有资源和事件监听器
   */
  public hide = () => {
    if (!this.state.element) return;

    clearTimeout(this.dragResetTimer);
    this.dragResetTimer = undefined;
    // 清理拖拽功能
    interact(this.state.element).unset();
    
    // 移除DOM元素
    this.state.element?.remove();
    this.state.element = null;
  }

  /**
   * 销毁组件
   * 隐藏按钮并移除注入的CSS样式
   */
  public destroy = () => {
    this.hide();
    // 移除注入的CSS样式
    document.getElementById('markmap-floating-button-style')?.remove();
  }

  /**
   * 根据设置重新渲染按钮
   * 更新按钮的大小和SVG图标
   */
  private render = () => {
    if (!this.state.element) return;

    // 从设置中获取按钮大小并应用
    const size = this.options.floatingButtonSize;
    this.state.element.style.width = `${size}px`;
    this.state.element.style.height = `${size}px`;

    const shadowRoot = this.state.element.shadowRoot;
    if (!shadowRoot) return;

    // 使用 Shadow DOM 隔离图标，避免被不同文档内的用户样式污染
    const iconSvg = this._sanitizeIconSvg(this.options.floatingButtonIconSvg);
    logger('渲染悬浮按钮图标', 'info', {
      size,
      icon: this._summarizeIconSvg(iconSvg),
    });

    shadowRoot.innerHTML = `
      <style>${this.shadowStyle}</style>
      <div class="icon-container">${iconSvg}</div>
    `;
  }

  /**
   * 创建按钮DOM元素
   * 设置基本属性并添加到页面中
   */
  private _createElement() {
    // 创建按钮容器
    const container = document.createElement('div');
    container.className = 'markmap-floating-button';
    container.title = '显示/隐藏目录思维导图';
    container.setAttribute('role', 'button');
    container.setAttribute('aria-label', '显示/隐藏目录思维导图');
    container.tabIndex = 0;
    container.attachShadow({ mode: 'open' });

    // 添加到页面body中
    document.body.appendChild(container);
    this.state.element = container;

    // 执行初始渲染（设置大小和图标）
    this.render();
  }

  /**
   * 设置拖拽功能
   * 使用InteractJS库实现按钮的拖拽移动
   */
  private _setupInteractJS() {
    if (!this.state.element) return;

    interact(this.state.element)
      .draggable({
        listeners: {
          // 拖拽开始事件 - 修复瞬移问题
          start: (event) => {
            const target = event.target;
            
            // 如果还没有设置left/top，先获取当前实际位置
            if (!target.style.left || !target.style.top) {
              const rect = target.getBoundingClientRect();
              target.style.left = `${rect.left}px`;
              target.style.top = `${rect.top}px`;
              target.style.right = 'auto';
              target.style.bottom = 'auto';
            }
          },
          
          // 拖拽移动事件
          move: (event) => {
            const target = event.target;
            
            // 计算新位置
            const left = (parseFloat(target.style.left) || 0) + event.dx;
            const top = (parseFloat(target.style.top) || 0) + event.dy;

            // 应用新位置
            target.style.left = `${left}px`;
            target.style.top = `${top}px`;
          }
        }
      });
  }

  /**
   * 注入CSS样式到页面
   * 确保样式只注入一次
   */
  private _injectStyle() {
    const styleId = 'markmap-floating-button-style';
    
    // 如果样式已存在，直接返回
    if (document.getElementById(styleId)) return;

    // 创建style标签并注入样式
    const styleTag = document.createElement('style');
    styleTag.id = styleId;
    styleTag.textContent = COMPONENT_STYLE;
    document.head.appendChild(styleTag);
  }

  /**
   * 绑定事件监听器
   * 处理点击事件，区分拖拽和点击操作
   */
  private _attachEventListeners() {
    if (!this.state.element) return;
    
    // 用于区分拖拽和点击的标志
    let isDragging = false;
    
    // 监听拖拽开始事件
    interact(this.state.element).on('dragmove', () => {
      isDragging = true;
    });
    
    // 监听拖拽结束事件
    interact(this.state.element).on('dragend', () => {
      // 延迟重置标志，避免拖拽结束后立即触发点击
      clearTimeout(this.dragResetTimer);
      this.dragResetTimer = window.setTimeout(() => {
        this.dragResetTimer = undefined;
        isDragging = false;
      }, 0);
    });
    
    // 监听点击事件
    this.state.element.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onClick();
      }
    });
    this.state.element.addEventListener('click', (e) => {
      // 只有在非拖拽状态下才触发点击回调
      if (!isDragging) {
        this.onClick();
      }
    });
  }
}
