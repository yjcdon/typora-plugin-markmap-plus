/** Typora 页面原生能力；由独立加载器在编辑器就绪后加载。 */
import type * as Typora from 'typora';

const host = window as unknown as typeof Typora;

export const editor = host.editor;
export const File = host.File;
export const _options = host._options;
export const bridge = host.bridge;
export const reqnode = host.reqnode;
export const JSBridge = host.JSBridge;
