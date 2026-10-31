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

export interface SettingField {
  key: keyof MarkmapSettings;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
}

/** 设置按阅读任务分组，字段共用保存校验与表单约束。 */
export const SETTING_GROUPS: Array<{ name: string; fields: SettingField[] }> = [
  { name: '窗口与布局', fields: [
    { key: 'tocWindowWidth', label: '窗口宽度（像素）', min: 200, max: 1200 },
    { key: 'tocWindowHeight', label: '窗口高度（像素）', min: 200, max: 800 },
    { key: 'toolbarPosition', label: '工具栏位置' },
    { key: 'widthPercentWhenPin', label: '固定窗口宽度（%）', min: 10, max: 80 },
    { key: 'floatingButtonSize', label: '悬浮按钮直径（像素）', min: 30, max: 100 },
    { key: 'floatingButtonIconSvg', label: '悬浮按钮图标', description: '填写 SVG 图形代码。' },
  ] },
  { name: '阅读与更新', fields: [
    { key: 'initialExpandLevel', label: '默认展开层级', description: '6：全部标题和正文；1–5：仅标题及指定展开层级。', min: 1, max: 6 },
    { key: 'zoomStep', label: '缩放步长', min: 0.1, max: 1, step: 0.1 },
    { key: 'enableRealTimeUpdate', label: '编辑时实时更新' },
    { key: 'keepFoldStateWhenUpdate', label: '更新时保持折叠状态' },
    { key: 'autoFitWhenUpdate', label: '更新时自动适应视图' },
    { key: 'scrollOffsetTop', label: '跳转滚动偏移（像素）', min: 0, max: 500 },
    { key: 'headingHighlightColor', label: '正文块高亮颜色', description: '支持 CSS 颜色和渐变。' },
    { key: 'nodeHighlightColor', label: '导图节点高亮颜色', description: '填写 CSS 纯色。' },
    { key: 'highlightDuration', label: '高亮持续时间（毫秒）', min: 500, max: 5000 },
  ] },
  { name: '导出', fields: [
    { key: 'exportDirectory', label: '导出目录' },
  ] },
  { name: '高级布局', fields: [
    { key: 'spacingHorizontal', label: '节点水平间距（像素）', min: 0 },
    { key: 'spacingVertical', label: '节点垂直间距（像素）', min: 0 },
    { key: 'fitRatio', label: '适应视图比例', min: 0.01, max: 1, step: 0.01 },
    { key: 'paddingX', label: '导图内边距（像素）', min: 0 },
    { key: 'nodeColors', label: '节点颜色', description: '每行一个 CSS 颜色。' },
    { key: 'colorFreezeLevel', label: '颜色冻结层级', min: 0 },
    { key: 'viewportOffset', label: '视口偏移（像素）', min: 0 },
    { key: 'delayAttributeSet', label: '属性设置延迟（毫秒）', min: 0 },
    { key: 'delayInitialFit', label: '初次适应视图延迟（毫秒）', min: 0 },
    { key: 'delayZoomTransition', label: '缩放过渡时长（毫秒）', min: 0 },
    { key: 'delayFitTransition', label: '适应视图过渡时长（毫秒）', min: 0 },
    { key: 'delayScrollMarginReset', label: '滚动边距恢复延迟（毫秒）', min: 0 },
    { key: 'delayAttributeCheck', label: '属性检查延迟（毫秒）', min: 0 },
  ] },
];
