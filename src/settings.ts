/**
 * Typora Markmap Plus 插件设置模块
 *
 * 功能说明：
 * - 定义插件的所有配置项（复用组件的配置类型）
 * - 提供设置界面的构建逻辑
 * - 管理默认值和约束条件
 *
 * @author util6
 * @version 1.0.3
 */

import { SettingTab } from '@typora-community-plugin/core'
import type { PluginSettings } from '@typora-community-plugin/core'
import { TocMindmapOptions, DEFAULT_TOC_OPTIONS } from './components/TocMindmap'
import { FloatingButtonOptions, DEFAULT_FLOATING_BUTTON_OPTIONS } from './components/FloatingButton'

/**
 * 插件设置项的类型定义
 * 复用组件的配置类型
 */
export type MarkmapSettings = TocMindmapOptions & FloatingButtonOptions

/**
 * 设置项的约束条件
 * 定义每个设置项的最小值、最大值和默认值
 */
export const SETTING_CONSTRAINTS = {
  tocWindowWidth: { min: 200, max: 1200, default: DEFAULT_TOC_OPTIONS.tocWindowWidth },
  tocWindowHeight: { min: 200, max: 800, default: DEFAULT_TOC_OPTIONS.tocWindowHeight },
  initialExpandLevel: { min: 1, max: 6, default: DEFAULT_TOC_OPTIONS.initialExpandLevel },
  zoomStep: { min: 0.1, max: 1.0, default: DEFAULT_TOC_OPTIONS.zoomStep },
  floatingButtonSize: { min: 30, max: 100, default: DEFAULT_FLOATING_BUTTON_OPTIONS.floatingButtonSize },
  scrollOffsetTop: { min: 0, max: 500, default: DEFAULT_TOC_OPTIONS.scrollOffsetTop },
  headingHighlightColor: { default: DEFAULT_TOC_OPTIONS.headingHighlightColor },
  nodeHighlightColor: { default: DEFAULT_TOC_OPTIONS.nodeHighlightColor },
  highlightDuration: { min: 500, max: 5000, default: DEFAULT_TOC_OPTIONS.highlightDuration },
  widthPercentWhenPin: { min: 10, max: 80, default: DEFAULT_TOC_OPTIONS.widthPercentWhenPin },
}

/**
 * 插件设置的默认值
 * 复用组件的默认配置
 */
export const DEFAULT_SETTINGS: MarkmapSettings = {
  ...DEFAULT_TOC_OPTIONS,
  ...DEFAULT_FLOATING_BUTTON_OPTIONS
}

/**
 * 插件设置页面类
 * 负责在 Typora 的设置界面中显示插件的配置选项
 */
export class MarkmapSettingTab extends SettingTab {
  /** 插件设置实例 */
  private settings: PluginSettings<MarkmapSettings>

  /**
   * 构造函数
   * @param settings 插件设置实例
   */
  constructor(settings: PluginSettings<MarkmapSettings>) {
    super()
    this.settings = settings
  }

  /**
   * 获取设置页面的显示名称
   * 在 Typora 设置界面的侧边栏中显示
   */
  get name(): string {
    return 'Markmap-Plus'
  }

  /**
   * 显示设置页面内容
   * 当用户点击设置页面时调用此方法
   */
  onshow(): void {
    // 窗口宽度设置
    this.addSetting(item => {
      item.addName('窗口宽度')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.tocWindowWidth
        input.value = this.settings.get('tocWindowWidth').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 当用户修改值时，保存到设置中
        input.onchange = () => this.settings.set('tocWindowWidth', parseInt(input.value) || config.default)
      })
    })

    // 窗口高度设置
    this.addSetting(item => {
      item.addName('窗口高度')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.tocWindowHeight
        input.value = this.settings.get('tocWindowHeight').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 当用户修改值时，保存到设置中
        input.onchange = () => this.settings.set('tocWindowHeight', parseInt(input.value) || config.default)
      })
    })

    // 默认展开层级设置
    this.addSetting(item => {
      item.addName('默认展开层级')
      item.addDescription('默认 6：展开全部标题和正文节点；1-5：仅显示标题并限制展开层级')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.initialExpandLevel
        input.value = this.settings.get('initialExpandLevel').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 验证输入值的有效性
        input.onchange = () => {
          const value = parseInt(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('initialExpandLevel', value)
          }
        }
      })
    })

    // 缩放步长设置
    this.addSetting(item => {
      item.addName('缩放步长')
      item.addDescription('放大和缩小的单次比例')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.zoomStep
        input.value = this.settings.get('zoomStep').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.step = '0.1' // 设置步长为 0.1
        // 验证输入值的有效性
        input.onchange = () => {
          const value = parseFloat(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('zoomStep', value)
          }
        }
      })
    })

    // 实时更新开关设置
    this.addSetting(item => {
      item.addName('实时更新')
      item.addDescription('编辑文档时自动更新思维导图')
      item.addCheckbox((checkbox) => {
        checkbox.checked = this.settings.get('enableRealTimeUpdate')
        // 当用户切换开关时，保存到设置中
        checkbox.onchange = () => this.settings.set('enableRealTimeUpdate', checkbox.checked)
      })
    })

    // 保持折叠状态设置
    this.addSetting(item => {
      item.addName('保持折叠状态')
      item.addDescription('更新思维导图时保持节点的展开/折叠状态')
      item.addCheckbox((checkbox) => {
        checkbox.checked = this.settings.get('keepFoldStateWhenUpdate')
        checkbox.onchange = () => this.settings.set('keepFoldStateWhenUpdate', checkbox.checked)
      })
    })

    // 自动适应视图设置
    this.addSetting(item => {
      item.addName('更新时自动适应视图')
      item.addDescription('更新思维导图后自动调整视图以显示完整内容')
      item.addCheckbox((checkbox) => {
        checkbox.checked = this.settings.get('autoFitWhenUpdate')
        checkbox.onchange = () => this.settings.set('autoFitWhenUpdate', checkbox.checked)
      })
    })

    // 工具栏位置设置
    this.addSetting(item => {
      item.addName('工具栏位置')
      item.addDescription('选择工具栏显示在顶部还是侧边')
      item.addSelect((select) => {
        select.innerHTML = `
          <option value="top">顶部</option>
          <option value="side">侧边</option>
        `
        select.value = this.settings.get('toolbarPosition')
        select.onchange = () => this.settings.set('toolbarPosition', select.value as 'top' | 'side')
      })
    })

    // 固定时宽度百分比设置
    this.addSetting(item => {
      item.addName('固定时宽度百分比')
      item.addDescription('固定到左侧或右侧时，导图窗口占视口宽度的百分比')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.widthPercentWhenPin
        input.value = this.settings.get('widthPercentWhenPin').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.onchange = () => {
          const value = parseInt(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('widthPercentWhenPin', value)
          }
        }
      })
    })

    // 悬浮按钮大小设置
    this.addSetting(item => {
      item.addName('悬浮按钮大小')
      item.addDescription('设置悬浮按钮的直径大小（像素）')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.floatingButtonSize
        input.value = this.settings.get('floatingButtonSize').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        // 当用户修改值时，保存到设置中
        input.onchange = () => {
          const newSize = parseInt(input.value) || config.default
          this.settings.set('floatingButtonSize', newSize)
        }
      })
    })

    // 自定义悬浮按钮SVG图标
    this.addSetting(item => {
      item.addName('悬浮按钮图标')
      item.addDescription('为悬浮按钮提供自定义的SVG代码。')
      item.addTextArea((textarea: HTMLTextAreaElement) => {
        textarea.value = this.settings.get('floatingButtonIconSvg')
        textarea.onchange = () => {
          this.settings.set('floatingButtonIconSvg', textarea.value)
        }
      })
    })

    // 滚动偏移量设置
    this.addSetting(item => {
      item.addName('跳转滚动偏移')
      item.addDescription('点击思维导图节点跳转时，对应正文块距离编辑区顶部的像素距离')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.scrollOffsetTop
        input.value = this.settings.get('scrollOffsetTop').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.onchange = () => {
          const value = parseInt(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('scrollOffsetTop', value)
          }
        }
      })
    })

    // 文档标题高亮颜色设置
    this.addSetting(item => {
      item.addName('正文块高亮颜色')
      item.addDescription("点击思维导图节点后，正文中对应标题或列表项的背景高亮颜色。支持所有CSS颜色格式，包括渐变 (例如 'gold', '#FFD700', 'linear-gradient(90deg, red, blue)')。")
      item.addInput('text', (input) => {
        const config = SETTING_CONSTRAINTS.headingHighlightColor
        input.value = this.settings.get('headingHighlightColor')
        input.onchange = () => this.settings.set('headingHighlightColor', input.value || config.default)
      })
    })

    // 思维导图节点高亮颜色设置
    this.addSetting(item => {
      item.addName('思维导图节点高亮颜色')
      item.addDescription("适应视图时，思维导图节点的背景高亮颜色。仅支持纯色格式 (例如 'gold', '#FFD700', 'rgba(255, 215, 0, 0.5)')。")
      item.addInput('text', (input) => {
        const config = SETTING_CONSTRAINTS.nodeHighlightColor
        input.value = this.settings.get('nodeHighlightColor')
        input.onchange = () => this.settings.set('nodeHighlightColor', input.value || config.default)
      })
    })

    // 高亮持续时间设置
    this.addSetting(item => {
      item.addName('高亮持续时间')
      item.addDescription('高亮效果的持续时间（毫秒）。')
      item.addInput('number', (input) => {
        const config = SETTING_CONSTRAINTS.highlightDuration
        input.value = this.settings.get('highlightDuration').toString()
        input.min = config.min.toString()
        input.max = config.max.toString()
        input.step = '100'
        input.onchange = () => {
          const value = parseInt(input.value)
          if (value >= config.min && value <= config.max) {
            this.settings.set('highlightDuration', value)
          }
        }
      })
    })

    // 导出目录设置
    this.addSetting(item => {
      item.addName('导出目录')
      item.addDescription('导出思维导图的保存目录（绝对路径）。留空则保存到当前文档所在目录。')
      item.addInput('text', (input) => {
        input.value = this.settings.get('exportDirectory')
        input.placeholder = '例如: /Users/username/Documents/markmap'
        input.onchange = () => this.settings.set('exportDirectory', input.value.trim())
      })
    })
  }
}
