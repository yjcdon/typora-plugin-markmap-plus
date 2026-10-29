/** 独立插件初始化与当前窗口资源所有权。@author liangyujia-ai */
import { TyporaAdapter } from './editor-adapter';
import { readSettings, writeSettings } from './platform';
import { SettingsStore } from './settings-store';
import { SettingsPanel } from './SettingsPanel';
import { TocMindmapComponent } from './components/TocMindmap';
import { FloatingButtonComponent } from './components/FloatingButton';
import interact from 'interactjs';

/** 设置加载成功后创建组件；每个窗口的退出操作释放全部资源。 */
export async function start(): Promise<() => void> {
  interact.addDocument(document);
  const settings = new SettingsStore({ read: readSettings, write: writeSettings });
  const cleanups: Array<() => void> = [() => interact.removeDocument(document), () => settings.destroy()];
  const destroy = () => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); };
  try {
    await settings.load();
    const adapter = new TyporaAdapter();
    cleanups.push(() => adapter.destroy());
    const panel = new SettingsPanel(settings);
    cleanups.push(() => panel.destroy());
    const map = new TocMindmapComponent(settings.getAll(), adapter, () => { void panel.open(); });
    cleanups.push(() => map.destroy());
    const button = new FloatingButtonComponent(settings.getAll(), () => {
      void map.toggle().catch(error => map.showError(error, '打开导图失败'));
    });
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
