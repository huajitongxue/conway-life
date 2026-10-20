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
    let shiftPending = false;
    let magnifier = false;
    let panelPosition = { x: 1, y: 0 };
    let panelDrag = null;
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
        ? '左 Shift 单独按下松开：开关 · ＋/−：倍率 · 拖动可挪动'
        : '左 Shift 快捷键已禁用 · ＋/−：倍率 · 拖动可挪动';
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
      shiftPending = false;
      stopPanelDrag();
      clearPointer();
    }

    function inputFocused(event) {
      const target = event.target || document.activeElement;
      return target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
    }

    function handleKeydown(event) {
      if (event.code !== 'ShiftLeft') shiftPending = false;
      if (blocked() || inputFocused(event)) { shiftPending = false; return false; }
      if (event.code === 'ControlLeft') {
        leftControl = true;
        scheduleDraw();
        return true;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) { shiftPending = false; return false; }
      if (event.code === 'ShiftLeft') {
        if (!event.repeat) shiftPending = preferences.magnifierShortcut;
        return true;
      }
      const increase = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd';
      const decrease = event.key === '-' || event.code === 'NumpadSubtract';
      if (!magnifier || (!increase && !decrease)) return false;
      event.preventDefault();
      if (!event.repeat) setMagnification(preferences.magnification + (increase ? 25 : -25));
      return true;
    }

    function handleKeyup(event) {
      if (event.code === 'ControlLeft') { leftControl = false; scheduleDraw(); }
      if (event.code === 'ShiftLeft') {
        const toggle = shiftPending && preferences.magnifierShortcut && !blocked() && !inputFocused(event)
          && !event.ctrlKey && !event.metaKey && !event.altKey;
        shiftPending = false;
        if (toggle) {
          magnifier = !magnifier;
          if (!magnifier) stopPanelDrag();
          scheduleDraw();
        }
      }
    }

    function stopPanelDrag() {
      const drag = panelDrag;
      panelDrag = null;
      els.magnifierPanel.classList.remove('is-dragging');
      if (drag && els.magnifierPanel.hasPointerCapture?.(drag.pointerId)) els.magnifierPanel.releasePointerCapture(drag.pointerId);
    }

    function positionPanel() {
      const panel = els.magnifierPanel;
      if (!magnifier) { panel.hidden = true; stopPanelDrag(); return null; }
      const bounds = els.controlPanel.getBoundingClientRect();
      const left = Math.max(0, bounds.left) + 4, top = Math.max(0, bounds.top) + 4;
      const right = Math.min(window.innerWidth, bounds.right) - 4;
      const bottom = Math.min(window.innerHeight, bounds.bottom) - 4;
      // 控制区离开视口或没有容纳浮窗的空间时，不允许浮窗覆盖网格。
      if (!(right - left >= 40 && bottom - top >= 40)) {
        panel.hidden = true;
        stopPanelDrag();
        return null;
      }
      panel.hidden = false;
      panel.style.width = Math.min(320, right - left) + 'px';
      panel.style.maxHeight = (bottom - top) + 'px';
      const rect = panel.getBoundingClientRect();
      const width = Math.min(rect.width, right - left), height = Math.min(rect.height, bottom - top);
      const travelX = Math.max(0, right - left - width), travelY = Math.max(0, bottom - top - height);
      const x = left + travelX * panelPosition.x, y = top + travelY * panelPosition.y;
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      return { left, top, travelX, travelY, x, y };
    }

    function scheduleDraw() {
      if (scheduled) return;
      scheduled = true;
      const callback = () => { scheduled = false; draw(); };
      if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
      else callback();
    }

    function draw() {
      if (blocked()) stopPanelDrag();
      const panelArea = positionPanel();
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
      if (!panelArea) return;
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
      const offsetX = (rect.width - area.targetWidth) / 2;
      const offsetY = (rect.height - area.targetHeight) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas,
        area.x * canvas.width / sourceRect.width, area.y * canvas.height / sourceRect.height,
        area.width * canvas.width / sourceRect.width, area.height * canvas.height / sourceRect.height,
        offsetX, offsetY, area.targetWidth, area.targetHeight);

      // 按真实裁剪和留白换算鼠标位置；边缘处的准星不固定在预览中心。
      const pointerX = offsetX + (ratioX * sourceRect.width - area.x) * area.targetWidth / area.width;
      const pointerY = offsetY + (ratioY * sourceRect.height - area.y) * area.targetHeight / area.height;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pointerX - 8, pointerY);
      ctx.lineTo(pointerX - 2, pointerY);
      ctx.moveTo(pointerX + 2, pointerY);
      ctx.lineTo(pointerX + 8, pointerY);
      ctx.moveTo(pointerX, pointerY - 8);
      ctx.lineTo(pointerX, pointerY - 2);
      ctx.moveTo(pointerX, pointerY + 2);
      ctx.lineTo(pointerX, pointerY + 8);
      // 黑白双描边在亮格和暗色背景上都可见，中心留出空隙观察细胞。
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    function bind() {
      if (bound) return;
      bound = true;
      const updatePointer = (event) => {
        const rect = canvas.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
          clearPointer(); return;
        }
        point = { clientX: event.clientX, clientY: event.clientY };
        scheduleDraw();
      };
      canvas.addEventListener('pointermove', updatePointer);
      canvas.addEventListener('pointerdown', updatePointer);
      canvas.addEventListener('pointerleave', clearPointer);
      document.addEventListener('keyup', handleKeyup);
      // 捕获阶段识别 Shift 组合，避免上层快捷键提前返回后误触发放大镜。
      document.addEventListener('keydown', (event) => {
        if (event.code !== 'ShiftLeft' || blocked() || inputFocused(event)) shiftPending = false;
      }, true);
      document.addEventListener('pointerdown', () => { shiftPending = false; }, true);
      window.addEventListener('resize', scheduleDraw);
      window.addEventListener('scroll', scheduleDraw, true);
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(scheduleDraw);
        observer.observe(els.controlPanel);
        observer.observe(els.magnifierPanel);
      }
      const panel = els.magnifierPanel;
      panel.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || blocked() || panelDrag || event.target?.closest('button, input, label, select, textarea, a')) return;
        const area = positionPanel();
        if (!area) return;
        event.preventDefault();
        panelDrag = { pointerId: event.pointerId, offsetX: event.clientX - area.x, offsetY: event.clientY - area.y };
        panel.classList.add('is-dragging');
        panel.setPointerCapture?.(event.pointerId);
      });
      const movePanel = (event) => {
        const drag = panelDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (blocked()) { stopPanelDrag(); return; }
        const area = positionPanel();
        if (!area) return;
        panelPosition = {
          x: area.travelX ? Math.max(0, Math.min(1, (event.clientX - drag.offsetX - area.left) / area.travelX)) : panelPosition.x,
          y: area.travelY ? Math.max(0, Math.min(1, (event.clientY - drag.offsetY - area.top) / area.travelY)) : panelPosition.y
        };
        positionPanel();
      };
      panel.addEventListener('pointermove', movePanel);
      panel.addEventListener('pointerup', (event) => {
        if (panelDrag?.pointerId !== event.pointerId) return;
        movePanel(event);
        stopPanelDrag();
      });
      const cancelDrag = (event) => { if (panelDrag?.pointerId === event.pointerId) stopPanelDrag(); };
      panel.addEventListener('pointercancel', cancelDrag);
      panel.addEventListener('lostpointercapture', cancelDrag);
      window.addEventListener('blur', clearKeys);
      document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
      els.closeMagnifierButton.addEventListener('click', () => {
        magnifier = false;
        stopPanelDrag();
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
