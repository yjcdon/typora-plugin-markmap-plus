/** 独立设置存储：校验持久化边界，保存成功后发布变更。 */
import { DEFAULT_SETTINGS, SETTING_GROUPS, type MarkmapSettings } from './settings';

export interface SettingsStorage {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

const fields = SETTING_GROUPS.flatMap(group => group.fields);

/** 补齐新增字段的默认值，并检查已提供的配置值。 */
export function validateSettings(input: unknown): MarkmapSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置内容应为对象');
  const source = input as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const value = Object.prototype.hasOwnProperty.call(source, field.key) ? source[field.key] : DEFAULT_SETTINGS[field.key];
    const expected = DEFAULT_SETTINGS[field.key];
    const error = (message: string) => new Error(`${field.label}：${message}`);
    if (Array.isArray(expected)) {
      if (!Array.isArray(value) || value.length === 0 || value.some(color => typeof color !== 'string' || !CSS.supports('color', color))) {
        throw error('请填写至少一个有效颜色');
      }
      values[field.key] = [...value];
      continue;
    }
    if (typeof value !== typeof expected) throw error(`请填写${typeof expected === 'number' ? '数字' : typeof expected === 'boolean' ? '开关值' : '文本'}`);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw error('请填写有限数字');
      if (field.min !== undefined && value < field.min) throw error(`最小值为 ${field.min}`);
      if (field.max !== undefined && value > field.max) throw error(`最大值为 ${field.max}`);
      if (!field.step && !Number.isInteger(value)) throw error('请填写整数');
    }
    values[field.key] = value;
  }
  if (values.toolbarPosition !== 'top' && values.toolbarPosition !== 'side') throw new Error('工具栏位置应为顶部或侧边');
  if (!CSS.supports('background', values.headingHighlightColor as string)) throw new Error('请填写有效的正文块高亮颜色');
  if (!CSS.supports('color', values.nodeHighlightColor as string)) throw new Error('请填写有效的节点高亮颜色');
  const directory = values.exportDirectory as string;
  if (directory && (!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(directory) || /[\0\r\n]/.test(directory))) throw new Error('导出目录应为有效绝对路径');
  const svg = new DOMParser().parseFromString(values.floatingButtonIconSvg as string, 'image/svg+xml');
  if (svg.documentElement.localName !== 'svg' || svg.querySelector('parsererror, script, foreignObject')) throw new Error('悬浮按钮图标应为有效 SVG 图形');
  for (const element of Array.from(svg.querySelectorAll('*'))) {
    for (const attr of Array.from(element.attributes)) {
      if (/^on/i.test(attr.name) || (/href$/i.test(attr.name) && !attr.value.startsWith('#'))) throw new Error('SVG 图标应使用内嵌图形和本地片段引用');
    }
  }
  return values as unknown as MarkmapSettings;
}

/** 维护当前窗口的设置快照；存储负责跨平台原子写入。 */
export class SettingsStore {
  private values: MarkmapSettings = { ...DEFAULT_SETTINGS, nodeColors: [...DEFAULT_SETTINGS.nodeColors] };
  private listeners = new Set<() => void>();
  private pending: Promise<void> = Promise.resolve();

  constructor(private storage: SettingsStorage) {}

  /** 读取最新文件；首次使用生成完整默认配置。 */
  async load(): Promise<void> {
    await this.pending;
    const text = await this.storage.read();
    if (text === null) {
      await this.save(this.values);
      return;
    }
    const document = JSON.parse(text) as { schemaVersion?: unknown; values?: unknown };
    if (!document || document.schemaVersion !== 1) throw new Error('settings.json 的配置结构版本应为 1');
    this.values = validateSettings(document.values);
    this.notify();
  }

  get<K extends keyof MarkmapSettings>(key: K): MarkmapSettings[K] {
    return this.getAll()[key];
  }

  getAll(): MarkmapSettings {
    return { ...this.values, nodeColors: [...this.values.nodeColors] };
  }

  /** 同窗口保存按提交顺序写入，失败时保留已生效的快照。 */
  save(input: MarkmapSettings): Promise<void> {
    const values = validateSettings(input);
    const operation = this.pending.then(async () => {
      await this.storage.write(JSON.stringify({ schemaVersion: 1, values }, null, 2) + '\n');
      this.values = values;
      this.notify();
    });
    // 调用方持有 operation 并处理错误；队列继续接收用户的修正重试。
    this.pending = operation.catch(() => {});
    return operation;
  }

  onChange(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy(): void {
    this.listeners.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
