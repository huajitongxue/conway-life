(() => {
  'use strict';

  // Tauri 开启 withGlobalTauri 后会提供这个对象；浏览器和 Electron 中为空。
  const tauriWindow = window.__TAURI__?.window?.getCurrentWindow?.() || null;

  async function toggleFullscreen() {
    if (tauriWindow) {
      const fullscreen = await tauriWindow.isFullscreen();
      await tauriWindow.setFullscreen(!fullscreen);
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen?.();
    } else {
      await document.documentElement.requestFullscreen?.();
    }
  }

  window.CONWAY_PLATFORM = {
    isTauri: Boolean(tauriWindow),
    toggleFullscreen
  };
})();
