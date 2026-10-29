/** 当前窗口唯一启动入口；编辑器就绪后加载独立程序。@author liangyujia-ai */
(() => {
  const key = '__markmapPlus';
  if (window[key]) return;
  const base = new URL('.', document.currentScript.src);
  const state = { status: 'waiting', dispose: null, error: null };
  window[key] = state;
  let timer;
  let cleanup;
  const resources = [];
  const pendingLoads = new Set();
  const startedAt = Date.now();
  const dispose = () => {
    clearTimeout(timer);
    pendingLoads.forEach(cancel => cancel());
    window.removeEventListener('pagehide', dispose);
    cleanup?.();
    delete window.MarkmapPlusRuntime;
    resources.forEach(element => element.remove());
    state.status = 'disposed';
    delete window[key];
  };
  state.dispose = dispose;
  window.addEventListener('pagehide', dispose, { once: true });

  const fail = error => {
    if (state.status === 'disposed') return;
    clearTimeout(timer);
    resources.splice(0).forEach(element => element.remove());
    delete window.MarkmapPlusRuntime;
    state.status = 'failed';
    state.error = String(error?.message || error);
    console.error('[Markmap Plus]', error);
    const notice = document.createElement('div');
    notice.setAttribute('role', 'alert');
    notice.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:100000;max-width:460px;padding:16px;background:#fff;color:#222;border:1px solid #b44;border-radius:8px;';
    notice.textContent = `Markmap Plus 启动失败：${state.error}`;
    const close = document.createElement('button');
    close.textContent = '关闭';
    close.onclick = () => notice.remove();
    notice.append(close);
    resources.push(notice);
    document.body.append(notice);
  };

  // 每次文件加载均有明确完成边界，退出时解除事件并取消等待。
  const load = element => new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timeout);
      element.onload = null;
      element.onerror = null;
      pendingLoads.delete(cancel);
      error ? reject(error) : resolve();
    };
    const cancel = () => finish(new Error('窗口已退出'));
    const timeout = setTimeout(() => finish(new Error(`资源读取超时：${element.src || element.href}`)), 15000);
    pendingLoads.add(cancel);
    element.onload = () => finish();
    element.onerror = () => finish(new Error(`资源读取失败：${element.src || element.href}`));
    resources.push(element);
    document.head.append(element);
  });

  const launch = async () => {
    if (state.status === 'disposed') return;
    const editor = window.editor;
    if (!document.querySelector('#write') || typeof editor?.getMarkdown !== 'function' || !editor?.library?.outline || !window.File || !window._options) {
      if (Date.now() - startedAt >= 15000) return fail(new Error('编辑器接口等待超时，请核对 Typora 版本后重启。'));
      timer = setTimeout(launch, 100);
      return;
    }
    state.status = 'starting';
    try {
      for (const name of ['katex.css', 'highlight.css']) {
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = new URL(`app/${name}`, base).href;
        await load(style);
        if (state.status === 'disposed') return;
      }
      const script = document.createElement('script');
      script.src = new URL('app/main.js', base).href;
      await load(script);
      if (state.status === 'disposed') return;
      cleanup = await window.MarkmapPlusRuntime.start();
      delete window.MarkmapPlusRuntime;
      if (state.status === 'disposed') { cleanup(); return; }
      state.status = 'ready';
    } catch (error) { fail(error); }
  };
  void launch();
})();
