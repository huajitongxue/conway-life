(() => {
  'use strict';

  const STORAGE_KEY = 'conway-life-view-settings-v1';
  const defaults = {
    showKeys: true,
    showStageHint: true,
    coordinates: true,
    magnifierShortcut: true,
    magnification: 200,
    ...globalThis.CONWAY_THEME.normalize(null)
  };
  const zoomValue = (value) => Number.isFinite(Number(value))
    ? Math.max(150, Math.min(300, Math.round(Number(value) / 25) * 25)) : 200;

  function normalizePreferences(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      showKeys: typeof source.showKeys === 'boolean' ? source.showKeys : defaults.showKeys,
      showStageHint: typeof source.showStageHint === 'boolean' ? source.showStageHint : defaults.showStageHint,
      coordinates: typeof source.coordinates === 'boolean' ? source.coordinates : defaults.coordinates,
      magnifierShortcut: typeof source.magnifierShortcut === 'boolean'
        ? source.magnifierShortcut : defaults.magnifierShortcut,
      magnification: zoomValue(source.magnification ?? 200),
      ...globalThis.CONWAY_THEME.normalize(source)
    };
  }

  function crop(width, height, lensWidth, lensHeight, x, y, percent) {
    const zoom = percent / 100;
    const sourceWidth = Math.min(width, lensWidth / zoom);
    const sourceHeight = Math.min(height, lensHeight / zoom);
    return {
      x: Math.max(0, Math.min(width - sourceWidth, x - sourceWidth / 2)),
      y: Math.max(0, Math.min(height - sourceHeight, y - sourceHeight / 2)),
      width: sourceWidth, height: sourceHeight,
      targetWidth: sourceWidth * zoom, targetHeight: sourceHeight * zoom
    };
  }

  function create({ canvas, cols, rows, els, blocked, showToast }) {
    let preferences = { ...defaults };
    let colors = globalThis.CONWAY_THEME.palette(preferences);
    let point = null;
    let leftControl = false;
    let magnifier = false;
    let scheduled = false;
    let bound = false;
    const lens = els.magnifierCanvas;
    const ctx = lens.getContext('2d');

    function savePreferences(next) {
      preferences = normalizePreferences(next);
      if (!preferences.magnifierShortcut) {
        magnifier = false;
        els.magnifierPanel.hidden = true;
      }
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
      catch { showToast('显示设置无法保存，当前页面仍会应用'); }
      applyPreferences();
    }

    function loadPreferences() {
      try { preferences = normalizePreferences(JSON.parse(window.localStorage.getItem(STORAGE_KEY))); }
      catch { preferences = { ...defaults }; }
      applyPreferences();
    }

    function applyPreferences() {
      colors = globalThis.CONWAY_THEME.apply(preferences);
      els.keyHelp.hidden = !preferences.showKeys;
      els.stageHint.hidden = !preferences.showStageHint;
      els.magnifierPanel.hidden = !magnifier;
      els.magnifierShortcutSetting.checked = preferences.magnifierShortcut;
      els.magnifierShortcutHint.textContent = preferences.magnifierShortcut
        ? '左 Shift：开关放大镜（可在设置中禁用）'
        : '左 Shift 快捷键已禁用，可使用右上角 × 关闭放大镜';
      els.magnificationRange.value = String(preferences.magnification);
      els.magnificationValue.textContent = preferences.magnification + '%';
      els.zoomInButton.disabled = preferences.magnification >= 300;
      els.zoomOutButton.disabled = preferences.magnification <= 150;
      scheduleDraw();
    }

    function setMagnification(value) {
      savePreferences({ ...preferences, magnification: zoomValue(value) });
    }

    function clearPointer() {
      point = null;
      scheduleDraw();
    }

    function clearKeys() {
      leftControl = false;
      clearPointer();
    }

    function handleKeydown(event) {
      if (event.code !== 'ControlLeft' && event.code !== 'ShiftLeft') return false;
      if (blocked() || event.target?.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return false;
      if (event.code === 'ControlLeft') leftControl = true;
      else if (!preferences.magnifierShortcut || event.repeat) return true;
      else {
        magnifier = !magnifier;
        els.magnifierPanel.hidden = !magnifier;
      }
      scheduleDraw();
      return true;
    }

    function handleKeyup(event) {
      if (event.code === 'ControlLeft') { leftControl = false; scheduleDraw(); }
    }

    function scheduleDraw() {
      if (scheduled) return;
      scheduled = true;
      const callback = () => { scheduled = false; draw(); };
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
      else callback();
    }

    function draw() {
      const sourceRect = canvas.getBoundingClientRect();
      const visible = Boolean(point && !blocked()
        && point.clientX >= sourceRect.left && point.clientX < sourceRect.right
        && point.clientY >= sourceRect.top && point.clientY < sourceRect.bottom);
      let ratioX = 0, ratioY = 0;
      if (visible) {
        ratioX = (point.clientX - sourceRect.left) / sourceRect.width;
        ratioY = (point.clientY - sourceRect.top) / sourceRect.height;
      }
      els.coordinateValue.hidden = !(visible && leftControl && preferences.coordinates);
      if (visible) els.coordinateValue.textContent = '(' + Math.floor(ratioX * cols) + ', ' + (rows - 1 - Math.floor(ratioY * rows)) + ')';
      if (!magnifier) return;
      const rect = lens.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!rect.width || !rect.height) return;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (lens.width !== width) lens.width = width;
      if (lens.height !== height) lens.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#07151c';
      ctx.fillRect(0, 0, rect.width, rect.height);
      els.magnifierEmpty.hidden = visible;
      if (!visible) return;
      if (!sourceRect.width || !sourceRect.height || !canvas.width || !canvas.height) return;
      const area = crop(sourceRect.width, sourceRect.height, rect.width, rect.height,
        ratioX * sourceRect.width, ratioY * sourceRect.height, preferences.magnification);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas,
        area.x * canvas.width / sourceRect.width, area.y * canvas.height / sourceRect.height,
        area.width * canvas.width / sourceRect.width, area.height * canvas.height / sourceRect.height,
        (rect.width - area.targetWidth) / 2, (rect.height - area.targetHeight) / 2, area.targetWidth, area.targetHeight);
    }

    function bind() {
      if (bound) return;
      bound = true;
      canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
          clearPointer(); return;
        }
        point = { clientX: event.clientX, clientY: event.clientY };
        scheduleDraw();
      });
      canvas.addEventListener('pointerleave', clearPointer);
      document.addEventListener('keyup', handleKeyup);
      window.addEventListener('blur', clearKeys);
      document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
      els.closeMagnifierButton.addEventListener('click', () => {
        magnifier = false;
        els.magnifierPanel.hidden = true;
      });
      els.magnificationRange.addEventListener('input', () => setMagnification(els.magnificationRange.value));
      els.zoomInButton.addEventListener('click', () => setMagnification(preferences.magnification + 25));
      els.zoomOutButton.addEventListener('click', () => setMagnification(preferences.magnification - 25));
    }

    return { bind, loadPreferences, savePreferences, handleKeydown, handleKeyup, clearKeys, clearPointer, scheduleDraw,
      setMagnification, get preferences() { return { ...preferences }; }, get colors() { return { ...colors }; } };
  }

  globalThis.CONWAY_VIEW = { create, crop, normalizePreferences };
})();
