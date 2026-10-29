/** 独立设置面板：按分组编辑，明确保存，关闭时释放 DOM。 @author liangyujia-ai */
import { DEFAULT_SETTINGS, SETTING_GROUPS, type MarkmapSettings, type SettingField } from './settings';
import { SettingsStore } from './settings-store';

const STYLE = `
.markmap-settings { box-sizing:border-box; width:min(640px,calc(100vw - 32px)); max-height:calc(100vh - 48px); padding:0; border:1px solid #888; border-radius:10px; background:var(--bg-color,#fff); color:var(--text-color,#333); font:14px/1.5 system-ui,sans-serif; z-index:10000; }
.markmap-settings::backdrop { background:rgba(0,0,0,.35); }
.markmap-settings * { box-sizing:border-box; }
.markmap-settings header,.markmap-settings footer { padding:16px 20px; display:flex; align-items:center; gap:12px; background:var(--bg-color,#fff); }
.markmap-settings header { border-bottom:1px solid #888; justify-content:space-between; }
.markmap-settings h2 { font-size:20px; margin:0; }
.markmap-settings h3,.markmap-settings summary { font-size:16px; font-weight:600; margin:16px 0 8px; }
.markmap-settings summary { cursor:pointer; }
.markmap-settings form { display:flex; flex-direction:column; max-height:calc(100vh - 48px); }
.markmap-settings main { overflow-y:auto; min-height:0; padding:0 20px 16px; }
.markmap-settings .setting-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(120px,220px); align-items:center; gap:8px 16px; padding:10px 0; }
.markmap-settings .setting-row small { display:block; font-size:12px; margin-top:4px; }
.markmap-settings input,.markmap-settings select,.markmap-settings textarea,.markmap-settings button { font:inherit; color:inherit; background:var(--bg-color,#fff); border:1px solid #888; border-radius:6px; padding:6px 8px; min-height:32px; }
.markmap-settings input,.markmap-settings select,.markmap-settings textarea { width:100%; }
.markmap-settings textarea { min-height:80px; resize:vertical; }
.markmap-settings input[type=checkbox] { width:20px; height:20px; min-height:20px; justify-self:end; }
.markmap-settings button { cursor:pointer; }
.markmap-settings button:disabled { opacity:.6; cursor:default; }
.markmap-settings :focus-visible { outline:2px solid #2874dc; outline-offset:2px; }
.markmap-settings footer { border-top:1px solid #888; flex-wrap:wrap; }
.markmap-settings [role=status] { flex:1; min-width:180px; margin:0; overflow-wrap:anywhere; }
.markmap-settings button[type=submit] { background:#1764c0; border-color:#1764c0; color:#fff; }
@media(max-width:480px) { .markmap-settings .setting-row { grid-template-columns:1fr; } .markmap-settings input[type=checkbox] { justify-self:start; } }
`;

/** 设置面板使用浏览器模态对话框管理焦点与背景交互。 */
export class SettingsPanel {
  private dialog: HTMLDialogElement | null = null;
  private style: HTMLStyleElement | null = null;
  private generation = 0;

  constructor(private store: SettingsStore) {}

  /** 每次进入读取最新设置；加载或保存错误显示在面板内。 */
  async open(): Promise<void> {
    if (this.dialog) {
      this.dialog.focus();
      return;
    }
    const generation = ++this.generation;
    const dialog = document.createElement('dialog');
    dialog.className = 'markmap-settings';
    dialog.setAttribute('aria-labelledby', 'markmap-settings-title');
    this.dialog = dialog;
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    document.head.appendChild(this.style);
    const form = document.createElement('form');
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.id = 'markmap-settings-title';
    title.textContent = 'Markmap 设置';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '取消';
    close.title = '关闭设置，放弃尚未保存的修改';
    close.onclick = () => this.destroy();
    header.append(title, close);
    const main = document.createElement('main');
    const footer = document.createElement('footer');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = '正在读取设置…';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新读取';
    retry.hidden = true;
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = '保存修改';
    save.disabled = true;
    footer.append(status, retry, save);
    form.append(header, main, footer);
    dialog.appendChild(form);
    dialog.oncancel = event => { event.preventDefault(); this.destroy(); };
    dialog.onclose = () => this.destroy();
    document.body.appendChild(dialog);
    dialog.showModal();

    const controls = new Map<keyof MarkmapSettings, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
    const load = async () => {
      retry.disabled = true;
      try {
        await this.store.load();
        if (this.generation !== generation) return;
        const values = this.store.getAll();
        main.replaceChildren();
        controls.clear();
        for (const group of SETTING_GROUPS) {
          const section = document.createElement(group.name === '高级布局' ? 'details' : 'section');
          const heading = document.createElement(group.name === '高级布局' ? 'summary' : 'h3');
          heading.textContent = group.name;
          section.appendChild(heading);
          for (const field of group.fields) {
            const { row, control } = this.createField(field, values[field.key]);
            section.appendChild(row);
            controls.set(field.key, control);
          }
          main.appendChild(section);
        }
        save.disabled = false;
        retry.hidden = true;
        status.textContent = '修改后点击“保存修改”生效。';
      } catch (error) {
        if (this.generation !== generation) return;
        status.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`;
        retry.hidden = false;
      } finally {
        retry.disabled = false;
      }
    };
    retry.onclick = () => { void load(); };
    form.onsubmit = async event => {
      event.preventDefault();
      if (save.disabled) return;
      const values = this.store.getAll();
      const record = values as unknown as Record<string, unknown>;
      for (const [key, control] of controls) {
        const sample = DEFAULT_SETTINGS[key];
        record[key] = typeof sample === 'boolean' ? (control as HTMLInputElement).checked
          : typeof sample === 'number' ? (control as HTMLInputElement).valueAsNumber
          : Array.isArray(sample) ? control.value.split('\n').map(color => color.trim()).filter(Boolean)
          : control.value;
      }
      save.disabled = true;
      status.textContent = '正在保存…';
      try {
        await this.store.save(values);
        if (this.generation === generation) status.textContent = '设置已保存。';
      } catch (error) {
        if (this.generation === generation) status.textContent = `保存失败：${error instanceof Error ? error.message : String(error)}`;
      } finally {
        if (this.generation === generation) save.disabled = false;
      }
    };
    await load();
  }

  /** 创建带标签与说明的字段，所有值通过 DOM 属性设置。 */
  private createField(field: SettingField, value: MarkmapSettings[keyof MarkmapSettings]) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('label');
    const id = `markmap-setting-${field.key}`;
    label.htmlFor = id;
    label.textContent = field.label;
    if (field.description) {
      const description = document.createElement('small');
      description.id = `${id}-description`;
      description.textContent = field.description;
      label.appendChild(description);
    }
    let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.key === 'toolbarPosition') {
      control = document.createElement('select');
      for (const [key, label] of [['top', '顶部'], ['side', '侧边']]) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = label;
        control.appendChild(option);
      }
      control.value = value as string;
    } else if (Array.isArray(value) || field.key === 'floatingButtonIconSvg') {
      control = document.createElement('textarea');
      control.value = Array.isArray(value) ? value.join('\n') : String(value);
    } else {
      control = document.createElement('input');
      control.type = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text';
      if (typeof value === 'boolean') control.checked = value;
      else control.value = String(value);
      if (typeof value === 'number') {
        control.required = true;
        control.step = String(field.step ?? 1);
        if (field.min !== undefined) control.min = String(field.min);
        if (field.max !== undefined) control.max = String(field.max);
      }
    }
    control.id = id;
    if (field.description) control.setAttribute('aria-describedby', `${id}-description`);
    row.append(label, control);
    return { row, control };
  }

  /** 结束当前面板会话，使尚在等待的异步读取失效并释放界面。 */
  destroy(): void {
    ++this.generation;
    if (this.dialog) {
      this.dialog.onclose = null;
      this.dialog.oncancel = null;
      this.dialog.close();
      this.dialog.remove();
      this.dialog = null;
    }
    this.style?.remove();
    this.style = null;
  }
}
