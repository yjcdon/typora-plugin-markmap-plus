/** 独立插件初始化与当前窗口资源所有权。@author liangyujia-ai */
import { TyporaAdapter } from './editor-adapter';
import { readSettings, writeSettings } from './platform';
import { SettingsStore } from './settings-store';
import { SettingsPanel } from './SettingsPanel';
import { TocMindmapComponent } from './components/TocMindmap';
import { FloatingButtonComponent } from './components/FloatingButton';

/** 设置加载成功后创建组件；每个窗口的退出操作释放全部资源。 */
export async function start(): Promise<() => void> {
  const settings = new SettingsStore({ read: readSettings, write: writeSettings });
  await settings.load();
  const adapter = new TyporaAdapter();
  const panel = new SettingsPanel(settings);
  const cleanups: Array<() => void> = [() => settings.destroy(), () => adapter.destroy(), () => panel.destroy()];
  const destroy = () => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); };
  try {
    const map = new TocMindmapComponent(settings.getAll(), adapter, () => { void panel.open(); });
    cleanups.push(() => map.destroy());
    const button = new FloatingButtonComponent(settings.getAll(), () => map.toggle());
    cleanups.push(() => button.destroy());
    cleanups.push(settings.onChange(() => {
      map.updateOptions(settings.getAll());
      button.updateOptions(settings.getAll());
    }));
    button.show();
    return destroy;
  } catch (error) {
    destroy();
    throw error;
  }
}
