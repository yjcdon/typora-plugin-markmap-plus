/**
 * Typora Markmap Plus 插件工具函数模块
 * 
 * 功能说明：
 * - 提供跨平台兼容性检测
 * - 实现调试日志系统
 * - 提供通用工具函数
 * 
 * @author util6
 * @version 1.0.3
 */

// ==================== 平台检测工具 ====================

/**
 * 检测当前是否为 macOS 系统
 * @returns 如果是 macOS 返回 true，否则返回 false
 */
export const isMacOS = () => navigator.platform.includes('Mac')

/**
 * 检测当前是否为 Windows 系统
 * @returns 如果是 Windows 返回 true，否则返回 false
 */
export const isWindows = () => navigator.platform.includes('Win')

// ==================== 调试配置 ====================

/**
 * 调试系统的配置选项
 * 控制日志的显示方式、颜色、自动清理等行为
 */
const DEBUG_CONFIG = {
  /** 是否启用调试功能 */
  enabled: true,
  
  /** 是否在页面中显示日志（macOS 默认开启） */
  showInPage: false,
  
  /** 是否显示时间戳 */
  showTimestamp: true,
  
  /** 不同日志级别的自动移除延迟时间（毫秒） */
  autoRemoveDelay: {
    info: 10000,    // 信息日志 10 秒后移除
    warn: 4000,     // 警告日志 4 秒后移除
    error: 6000,    // 错误日志 6 秒后移除
    debug: 2000     // 调试日志 2 秒后移除
  },
  
  /** 不同日志级别的颜色配置 */
  colors: {
    info: '#2196F3',    // 蓝色
    warn: '#FF9800',    // 橙色
    error: '#f44336',   // 红色
    debug: '#9C27B0'    // 紫色
  },
  
  /** 复制成功提示的颜色 */
  copySuccessColor: '#4CAF50',  // 绿色
  
  /** 日志级别过滤 */
  logLevel: 'info' as 'debug' | 'info' | 'warn' | 'error'
}

// ==================== 日志系统 ====================

/**
 * 跨平台日志输出函数
 * 在 macOS 下使用页面显示，Windows 下使用 console
 * 
 * @param message 日志消息内容
 * @param level 日志级别：debug | info | warn | error
 * @param data 可选的附加数据对象
 */
export function logger(message: string | any, level: 'debug' | 'info' | 'warn' | 'error' = 'info', data?: any) {
  // 如果调试功能被禁用，直接返回
  if (!DEBUG_CONFIG.enabled) return

  // 如果第一个参数是对象，直接打印对象
  if (typeof message === 'object' && message !== null) {
    const consoleFn = console[level] || console.log
    try {
      const objStr = JSON.stringify(message, null, 2)
      consoleFn(`[MARKMAP-${level.toUpperCase()}] 对象详情:\n${objStr}`)
    } catch (e) {
      consoleFn(`[MARKMAP-${level.toUpperCase()}] 对象详情:`, message)
    }
    return
  }

  // 构建时间戳（如果启用）
  const timestamp = DEBUG_CONFIG.showTimestamp ? new Date().toLocaleTimeString() : ''
  const fullMessage = timestamp ? `[${timestamp}] [MARKMAP-${level.toUpperCase()}] ${message}` : `[MARKMAP-${level.toUpperCase()}] ${message}`

  // 始终输出到 console（即使在 macOS 下可能看不到）
  const consoleFn = console[level] || console.log
  if (data !== undefined) {
    try {
      // 使用 JSON.stringify 深度打印对象，类似 console.log
      const dataStr = JSON.stringify(data, null, 2)
      consoleFn(fullMessage + '\n' + dataStr)
    } catch (e) {
      // 如果序列化失败（如循环引用），回退到直接输出
      consoleFn(fullMessage, data)
    }
  } else {
    consoleFn(fullMessage)
  }

  // 在 macOS 下额外显示页面消息（仅对重要级别）
  if (DEBUG_CONFIG.showInPage && (level === 'info' || level === 'warn' || level === 'error')) {
    ensureCopyButton()
    ensureClearButton()
    showPageMessage(message, level)
  }
}

/**
 * 页面消息显示函数（主要用于 macOS 调试）
 * 在页面右上角显示浮动消息，支持点击复制
 * 
 * @param message 要显示的消息内容
 * @param type 消息类型，影响颜色显示
 */
function showPageMessage(message: string, type: 'info' | 'warn' | 'error' = 'info') {
  // 创建消息元素
  const messageDiv = document.createElement('div')
  
  // 计算垂直位置（避免重叠）
  const existingMessages = document.querySelectorAll('[data-debug-message]')
  const topOffset = 50 + (existingMessages.length * 40)

  // 设置消息样式
  messageDiv.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    right: 10px;
    background: ${DEBUG_CONFIG.colors[type]};
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    max-width: 300px;
    word-wrap: break-word;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.4;
    cursor: pointer;
  `
  
  // 标记为调试消息
  messageDiv.setAttribute('data-debug-message', 'true')
  messageDiv.textContent = message

  // 添加点击复制功能
  messageDiv.addEventListener('click', () => {
    navigator.clipboard.writeText(message).then(() => {
      // 显示复制成功反馈
      messageDiv.style.background = DEBUG_CONFIG.copySuccessColor
      messageDiv.textContent = '已复制到剪贴板'
      
      // 1秒后恢复原状
      setTimeout(() => {
        messageDiv.textContent = message
        messageDiv.style.background = DEBUG_CONFIG.colors[type]
      }, 1000)
    })
  })

  // 将消息添加到页面
  document.body.appendChild(messageDiv)

  // 根据消息类型自动移除
  const timeout = DEBUG_CONFIG.autoRemoveDelay[type]
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.remove()
      repositionMessages()
    }
  }, timeout)
}

/**
 * 重新计算所有消息的位置
 */
function repositionMessages() {
  const messages = document.querySelectorAll('[data-debug-message]')
  messages.forEach((msg, index) => {
    (msg as HTMLElement).style.top = `${50 + index * 40}px`
  })
}

function renderDebugActionButton(
  host: HTMLElement,
  type: 'copy' | 'clear',
  label: string,
) {
  const iconSvg = type === 'copy'
    ? `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 9h9v11H9z"></path>
        <path d="M6 4h9v3H8a2 2 0 0 0-2 2v8H6z"></path>
      </svg>
    `
    : `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3h6l1 2h4v2H4V5h4z"></path>
        <path d="M7 9h10l-1 10H8z"></path>
      </svg>
    `;

  const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
      }
      .debug-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: white;
        font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
      }
      svg {
        width: 14px;
        height: 14px;
        display: block;
        fill: currentColor;
        flex: 0 0 auto;
      }
      .label {
        color: inherit;
      }
    </style>
    <span class="debug-action">
      ${iconSvg}
      <span class="label">${label}</span>
    </span>
  `;
}

/**
 * 确保复制按钮存在
 * 创建一个置顶的不会消失的消息作为复制按钮
 */
function ensureCopyButton() {
  if (document.querySelector('[data-copy-logs-button]')) return

  const copyMsg = document.createElement('div')
  copyMsg.setAttribute('data-copy-logs-button', 'true')
  copyMsg.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #607D8B;
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    z-index: 10001;
    font-size: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    cursor: pointer;
  `
  renderDebugActionButton(copyMsg, 'copy', '复制所有日志')

  copyMsg.addEventListener('click', () => {
    const messages = Array.from(document.querySelectorAll('[data-debug-message]'))
      .map(el => el.textContent)
      .join('\n')
    navigator.clipboard.writeText(messages).then(() => {
      copyMsg.style.background = DEBUG_CONFIG.copySuccessColor
      renderDebugActionButton(copyMsg, 'copy', '已复制')
      setTimeout(() => {
        copyMsg.style.background = '#607D8B'
        renderDebugActionButton(copyMsg, 'copy', '复制所有日志')
      }, 1000)
    })
  })

  document.body.appendChild(copyMsg)
}

/**
 * 确保清除按钮存在
 * 创建一个置顶的不会消失的消息作为清除按钮
 */
function ensureClearButton() {
  if (document.querySelector('[data-clear-logs-button]')) return

  const clearMsg = document.createElement('div')
  clearMsg.setAttribute('data-clear-logs-button', 'true')
  clearMsg.style.cssText = `
    position: fixed;
    top: 10px;
    right: 150px;
    background: #607D8B;
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    z-index: 10001;
    font-size: 12px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    cursor: pointer;
  `
  renderDebugActionButton(clearMsg, 'clear', '清除所有日志')

  clearMsg.addEventListener('click', () => {
    document.querySelectorAll('[data-debug-message]').forEach(el => el.remove())
  })

  document.body.appendChild(clearMsg)
}

// ==================== 性能监控工具 ====================

/**
 * 性能监控类
 * 用于测量代码执行时间，帮助优化性能
 */
export class PerformanceMonitor {
  /** 存储计时器的 Map，键为标签，值为开始时间 */
  private timers: Map<string, number> = new Map()

  /**
   * 开始计时
   * @param label 计时器标签
   */
  start(label: string) {
    this.timers.set(label, performance.now())
    logger(`⏱️ 开始计时: ${label}`, 'debug')
  }

  /**
   * 结束计时并返回耗时
   * @param label 计时器标签
   * @returns 耗时（毫秒）
   */
  end(label: string) {
    const startTime = this.timers.get(label)
    if (startTime) {
      const duration = performance.now() - startTime
      this.timers.delete(label)
      logger(`⏱️ 结束计时: ${label} - ${duration.toFixed(2)}ms`, 'debug')
      return duration
    }
    logger(`⚠️ 未找到计时器: ${label}`, 'warn')
    return 0
  }
}

// ==================== 错误处理工具 ====================

/**
 * 统一错误处理函数
 * 提供一致的错误日志格式和跨平台显示
 * 
 * @param error 错误对象或错误信息
 * @param context 错误发生的上下文描述
 */
export function handleError(error: unknown, context: string) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  logger(`❌ ${context}: ${errorMessage}`, 'error', error)

  // 在 macOS 下可能需要更明显的错误提示
  if (isMacOS()) {
    showPageMessage(`${context}: ${errorMessage}`, 'error')
  }
}

// ==================== 调试工具 ====================

/**
 * 调试断点工具（针对 macOS 调试困难的解决方案）
 * 在 macOS 下使用页面显示，在 Windows 下使用 debugger
 * 
 * @param label 断点标签
 * @param data 可选的调试数据
 */
export function debugBreakpoint(label: string, data?: any) {
  logger(`🔍 调试断点: ${label}`, 'debug', data)

  // 在 macOS 下，由于 debugger 可能无效，使用页面显示
  if (isMacOS()) {
    showPageMessage(`调试断点: ${label}`, 'info')
  }

  // 仍然尝试使用 debugger，在 Windows 下有效
  if (DEBUG_CONFIG.enabled && !isMacOS()) {
    debugger
  }
}

/**
 * 状态检查工具
 * 检查条件是否满足，并记录结果
 * 
 * @param condition 要检查的条件
 * @param message 检查描述
 * @returns 检查结果
 */
export function checkState(condition: boolean, message: string) {
  if (!condition) {
    logger(`⚠️ 状态检查失败: ${message}`, 'warn')
    return false
  }
  logger(`✅ 状态检查通过: ${message}`, 'debug')
  return true
}

/**
 * DOM 元素检查工具
 * 查找并验证 DOM 元素是否存在
 * 
 * @param selector CSS 选择器
 * @param context 上下文描述
 * @returns 找到的元素或 null
 */
export function checkElement(selector: string, context: string = '未知'): HTMLElement | null {
  const element = document.querySelector(selector) as HTMLElement
  if (!element) {
    logger(`❌ 元素未找到: ${selector} (上下文: ${context})`, 'error')
    return null
  }
  logger(`✅ 元素已找到: ${selector}`, 'debug')
  return element
}

// ==================== 配置管理 ====================

/**
 * 配置调试开关
 * 动态启用或禁用调试功能
 * 
 * @param enabled 是否启用调试
 */
export function setDebugMode(enabled: boolean) {
  DEBUG_CONFIG.enabled = enabled
  logger(`🔧 调试模式${enabled ? '开启' : '关闭'}`, 'info')
}

/**
 * 获取调试信息
 * 返回当前环境和调试状态的详细信息
 * 
 * @returns 调试信息对象
 */
export function getDebugInfo() {
  return {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    isMacOS: isMacOS(),
    isWindows: isWindows(),
    debugEnabled: DEBUG_CONFIG.enabled,
    timestamp: new Date().toISOString()
  }
}

// ==================== 通用工具函数 ====================

/**
 * 函数防抖
 * 在事件触发后等待指定时间再执行，如果在此期间再次触发，则重新计时。
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel(): void } {
  let timeout: number | undefined;
  const debounced = function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      timeout = undefined;
      func.apply(this, args);
    }, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = undefined;
  };
  return debounced;
}
