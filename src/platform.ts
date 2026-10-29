/** 独立插件的平台文件能力与配置存储。 @author liangyujia-ai */
import { File, _options, bridge, reqnode, JSBridge } from './typora';

interface PathAdapter {
  join(...parts: string[]): string;
  dirname(value: string): string;
  basename(value: string, suffix?: string): string;
  extname(value: string): string;
  isAbsolute(value: string): boolean;
}

/** macOS 路径使用 POSIX 分隔符，Windows 复用宿主 Node 路径规则。 */
const macPath: PathAdapter = {
  join(...parts) {
    const joined = parts.filter(part => part.length > 0).join('/');
    const absolute = joined.startsWith('/');
    const segments: string[] = [];
    for (const part of joined.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..' && segments.length && segments[segments.length - 1] !== '..') segments.pop();
      else if (part !== '..' || !absolute) segments.push(part);
    }
    return (absolute ? '/' : '') + segments.join('/') || '.';
  },
  dirname(value) {
    const normalized = value.replace(/\/+$/, '');
    const slash = normalized.lastIndexOf('/');
    return slash < 0 ? '.' : slash === 0 ? '/' : normalized.slice(0, slash);
  },
  basename(value, suffix = '') {
    const name = value.replace(/\/+$/, '').split('/').pop()!;
    return suffix && name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
  },
  extname(value) {
    const name = this.basename(value);
    const dot = name.lastIndexOf('.');
    return dot > 0 && name !== '..' ? name.slice(dot) : '';
  },
  isAbsolute: value => value.startsWith('/'),
};

export const path: PathAdapter = File.isNode ? reqnode('path') : macPath;

/** 路径边界统一校验，配置和导出共享相同的绝对路径约定。 */
function validatePath(value: string): void {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) {
    throw new Error(`需要有效的绝对路径：${value}`);
  }
}

/** 对原生命令参数逐字引用，覆盖空格、中文和单引号。 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** 等待已核实的原生桥接命令完成，并保留系统错误及工作目录。 */
function runCommand(args: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`文件操作等待超时：${cwd}`)), 30000);
    try {
      bridge.callHandler('controller.runCommand', { args, cwd }, ([success, output, error]) => {
        window.clearTimeout(timeout);
        if (success) resolve(output);
        else reject(new Error(`${error || '文件操作失败'}（${cwd}）`));
      });
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}

/** 从宿主给出的用户数据根目录定位独立插件设置。 */
export function getSettingsPath(): string {
  validatePath(_options.userDataPath);
  return path.join(_options.userDataPath, 'markmap-plus', 'data', 'settings.json');
}

/** 将文档中的本地图片内嵌到导出文件，避免 SVG 图片解码时丢失外部文件资源。 */
export async function readLocalImageDataUrl(source: string): Promise<string> {
  let filename = source;
  if (/^file:/i.test(source)) {
    if (File.isNode) {
      filename = reqnode('url').fileURLToPath(source);
    } else {
      const url = new URL(source);
      if (url.hostname && url.hostname !== 'localhost') throw new Error(`图片需要本地文件地址：${source}`);
      filename = decodeURIComponent(url.pathname);
    }
  }
  validatePath(filename);
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
  };
  const mime = mimeTypes[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  let base64: string;
  if (File.isNode) {
    const fs: typeof import('fs') = reqnode('fs');
    base64 = (await fs.promises.readFile(filename)).toString('base64');
  } else {
    base64 = (await runCommand(`/usr/bin/base64 -i ${shellQuote(filename)}`, path.dirname(filename))).replace(/\s/g, '');
  }
  return `data:${mime};base64,${base64}`;
}

/** 缺失设置代表首次使用，读取或权限错误保留原始失败原因。 */
export async function readSettings(): Promise<string | null> {
  const filename = getSettingsPath();
  if (File.isNode) {
    const fs: typeof import('fs') = reqnode('fs');
    try {
      return await fs.promises.readFile(filename, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  const quoted = shellQuote(filename);
  const parents = [_options.userDataPath, path.dirname(path.dirname(filename)), path.dirname(filename)];
  const checkParents = parents.map(parent => {
    const quotedParent = shellQuote(parent);
    return `if [ -e ${quotedParent} ] && { [ ! -d ${quotedParent} ] || [ ! -x ${quotedParent} ]; }; then printf '%s' ${shellQuote(`配置目录无法访问：${parent}`)} >&2; exit 1; fi`;
  }).join('; ');
  const result = await runCommand(
    `${checkParents}; if [ -e ${quoted} ] || [ -L ${quoted} ]; then printf 'P\\n' && cat ${quoted}; else printf 'M\\n'; fi`,
    _options.userDataPath,
  );
  if (result === 'M\n') return null;
  if (result.startsWith('P\n')) return result.slice(2);
  throw new Error(`读取设置返回了异常结果：${filename}`);
}

/** 清理写入失败产生的临时文件，统一通过系统废纸篓回收。 */
async function trashTemporary(filename: string): Promise<void> {
  if (File.isNode) {
    const fs: typeof import('fs') = reqnode('fs');
    try {
      await fs.promises.access(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await JSBridge.invoke('shell.trashItem', filename);
  } else {
    const exists = await runCommand(`if [ -e ${shellQuote(filename)} ]; then printf yes; fi`, path.dirname(filename));
    if (exists !== 'yes') return;
    bridge.callHandler('library.trashItem', filename);
  }
}

/** 先在目标目录完整写入临时文件，再原子替换目标，保留同名导出的覆盖行为。 */
export async function writeFileAtomic(destination: string, blob: Blob): Promise<void> {
  validatePath(destination);
  const directory = path.dirname(destination);
  const random = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('');
  const temporary = `${destination}.${random}.tmp`;
  try {
    if (File.isNode) {
      const fs: typeof import('fs') = reqnode('fs');
      await fs.promises.writeFile(temporary, new Uint8Array(await blob.arrayBuffer()), { flag: 'wx' });
      await fs.promises.rename(temporary, destination);
    } else {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // 原生命令具有参数长度限制，分块写入后才提交目标文件。
      for (let offset = 0; offset < Math.max(1, base64.length); offset += 48000) {
        const chunk = base64.slice(offset, offset + 48000);
        await runCommand(`printf '%s' '${chunk}' | base64 -D ${offset ? '>>' : '>'} ${shellQuote(temporary)}`, directory);
      }
      await runCommand(`if [ -d ${shellQuote(destination)} ]; then printf '%s' ${shellQuote(`目标路径是目录：${destination}`)} >&2; exit 1; fi; mv -f ${shellQuote(temporary)} ${shellQuote(destination)}`, directory);
    }
  } catch (error) {
    try {
      await trashTemporary(temporary);
    } catch (cleanupError) {
      console.error('[Markmap Plus] 临时文件清理失败', temporary, cleanupError);
    }
    throw error;
  }
}

let settingsWrite: Promise<void> = Promise.resolve();

/** 串行保存当前窗口设置；多个窗口通过原子替换保持最后成功保存的完整配置。 */
export function writeSettings(text: string): Promise<void> {
  const operation = settingsWrite.then(async () => {
    const destination = getSettingsPath();
    const directory = path.dirname(destination);
    if (File.isNode) {
      const fs: typeof import('fs') = reqnode('fs');
      await fs.promises.mkdir(directory, { recursive: true });
    } else {
      await runCommand(`mkdir -p ${shellQuote(directory)}`, _options.userDataPath);
    }
    await writeFileAtomic(destination, new Blob([text], { type: 'application/json;charset=utf-8' }));
  });
  settingsWrite = operation.catch(() => { /* 当前调用者接收错误，后续保存仍可继续。 */ });
  return operation;
}
