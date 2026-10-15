(() => {
  'use strict';

  const DEFAULT_COLOR = '#54f1d2';
  const presets = [
    { id: 'mint', label: '薄荷', color: DEFAULT_COLOR },
    { id: 'lime', label: '荧光绿', color: '#b4f564' },
    { id: 'cyan', label: '青蓝', color: '#55d9fa' },
    { id: 'blue', label: '海蓝', color: '#80aaff' },
    { id: 'lavender', label: '薰衣草', color: '#b9a0ff' },
    { id: 'violet', label: '紫罗兰', color: '#df91fa' },
    { id: 'rose', label: '玫粉', color: '#ff94c2' },
    { id: 'coral', label: '珊瑚', color: '#ff9b84' },
    { id: 'amber', label: '琥珀', color: '#f6cd64' },
    { id: 'white', label: '月白', color: '#e4eef5' }
  ];

  function normalize(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      theme: source.theme === 'custom' || presets.some((item) => item.id === source.theme)
        ? source.theme : 'mint',
      customColor: typeof source.customColor === 'string' && /^#[\da-f]{6}$/i.test(source.customColor)
        ? source.customColor.toLowerCase() : DEFAULT_COLOR
    };
  }

  function toRgb(hex) {
    return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  }

  function toHex(rgb) {
    return '#' + rgb.map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  // 色卡横轴为饱和度，纵轴为明度；色相条与 RGB 输入覆盖完整 RGB 色域。
  function hsvToRgb(hue, saturation, value) {
    const h = ((hue % 360) + 360) % 360 / 60;
    const chroma = value * saturation;
    const x = chroma * (1 - Math.abs(h % 2 - 1));
    const base = value - chroma;
    const components = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x],
      [0, x, chroma], [x, 0, chroma], [chroma, 0, x]][Math.floor(h)];
    return components.map((part) => Math.round((part + base) * 255));
  }

  function rgbToHsv(rgb) {
    const [r, g, b] = rgb.map((value) => value / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return { hue, saturation: max ? delta / max : 0, value: max };
  }

  function colorAt(rect, clientX, clientY, hue) {
    if (!rect.width || !rect.height) return null;
    const saturation = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const value = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return hsvToRgb(hue, saturation, value);
  }

  function luminance(rgb) {
    const channels = rgb.map((part) => {
      const c = part / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function palette(preferences) {
    const choice = normalize(preferences);
    const cell = choice.theme === 'custom' ? choice.customColor
      : presets.find((item) => item.id === choice.theme).color;
    const rgb = toRgb(cell);
    // 细胞忠实使用所选 RGB；过暗的自定义色只提亮界面文字，保持控件可读。
    let accent = [...rgb];
    const backgroundLuminance = luminance([10, 28, 36]);
    for (let amount = 0; (luminance(accent) + 0.05) / (backgroundLuminance + 0.05) < 4.5; amount += 0.05) {
      accent = rgb.map((part) => Math.round(part + (255 - part) * Math.min(1, amount + 0.05)));
    }
    return { cell, preview: 'rgba(' + rgb.join(', ') + ', 0.36)', accent: toHex(accent), channels: accent.join(', ') };
  }

  function apply(preferences) {
    const colors = palette(preferences);
    const style = document.documentElement.style;
    style.setProperty('--accent', colors.accent);
    style.setProperty('--accent-rgb', colors.channels);
    return colors;
  }

  function create({ els }) {
    let draft = normalize(null);
    let hsv = rgbToHsv(toRgb(draft.customColor));
    let bound = false;
    const inputs = [els.themeRed, els.themeGreen, els.themeBlue];

    function rgbText(rgb) {
      return 'RGB(' + rgb.join(', ') + ')';
    }

    function validateInputs() {
      let valid = true;
      inputs.forEach((input) => {
        const text = String(input.value).trim();
        const ok = /^\d+$/.test(text) && Number(text) <= 255;
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        valid = valid && ok;
      });
      els.themeColorError.hidden = valid;
      return valid;
    }

    function render() {
      const colors = palette(draft);
      els.themeSelectionSwatch.style.backgroundColor = colors.cell;
      els.themeSelectionValue.textContent = rgbText(toRgb(colors.cell));
      els.themeCustomSwatch.style.backgroundColor = draft.customColor;
      els.themeCustomButton.setAttribute('aria-pressed', String(draft.theme === 'custom'));
      for (const button of els.themePresetColors.children) {
        button.setAttribute('aria-pressed', String(button.dataset.theme === draft.theme));
      }
      els.themeSpectrum.style.backgroundColor = 'hsl(' + hsv.hue + ', 100%, 50%)';
      els.themeColorMarker.style.left = hsv.saturation * 100 + '%';
      els.themeColorMarker.style.top = (1 - hsv.value) * 100 + '%';
      els.themeHue.value = String(Math.round(hsv.hue) % 360);
      inputs.forEach((input, index) => { input.value = String(toRgb(draft.customColor)[index]); });
      validateInputs();
      els.themeHoverValue.textContent = '已选自定义色：' + rgbText(toRgb(draft.customColor));
    }

    function pick(rgb, preserveHue = false) {
      draft = { theme: 'custom', customColor: toHex(rgb) };
      if (!preserveHue) {
        const next = rgbToHsv(rgb);
        hsv = { ...next, hue: next.saturation ? next.hue : hsv.hue };
      }
      render();
    }

    function open(preferences) {
      draft = normalize(preferences);
      hsv = rgbToHsv(toRgb(draft.customColor));
      els.themeCustomPanel.hidden = draft.theme !== 'custom';
      els.themeCustomButton.setAttribute('aria-expanded', String(!els.themeCustomPanel.hidden));
      render();
    }

    function readDraft() {
      if (!els.themeCustomPanel.hidden && !validateInputs()) {
        inputs.find((input) => !/^\d+$/.test(String(input.value).trim()) || Number(input.value) > 255)?.focus();
        return null;
      }
      return { ...draft };
    }

    function bind() {
      if (bound) return;
      bound = true;
      presets.forEach(({ id, label, color }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-color-choice';
        button.dataset.theme = id;
        button.setAttribute('aria-label', label + '，' + rgbText(toRgb(color)));
        button.title = label + ' · ' + rgbText(toRgb(color));
        const swatch = document.createElement('span');
        swatch.className = 'theme-color-swatch';
        swatch.style.backgroundColor = color;
        const name = document.createElement('span');
        name.textContent = label;
        button.append(swatch, name);
        button.addEventListener('click', () => {
          draft.theme = id;
          els.themeCustomPanel.hidden = true;
          els.themeCustomButton.setAttribute('aria-expanded', 'false');
          render();
        });
        els.themePresetColors.appendChild(button);
      });
      els.themeCustomButton.addEventListener('click', () => {
        draft.theme = 'custom';
        els.themeCustomPanel.hidden = false;
        els.themeCustomButton.setAttribute('aria-expanded', 'true');
        render();
      });
      els.themeSpectrum.addEventListener('pointermove', (event) => {
        const rgb = colorAt(els.themeSpectrum.getBoundingClientRect(), event.clientX, event.clientY, hsv.hue);
        if (rgb) els.themeHoverValue.textContent = '鼠标位置：' + rgbText(rgb) + ' · 左键选取';
      });
      els.themeSpectrum.addEventListener('pointerleave', () => {
        els.themeHoverValue.textContent = '已选自定义色：' + rgbText(toRgb(draft.customColor));
      });
      els.themeSpectrum.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        const rgb = colorAt(els.themeSpectrum.getBoundingClientRect(), event.clientX, event.clientY, hsv.hue);
        if (rgb) { event.preventDefault(); pick(rgb); }
      });
      els.themeSpectrum.addEventListener('contextmenu', (event) => event.preventDefault());
      els.themeHue.addEventListener('input', () => {
        hsv.hue = Math.max(0, Math.min(359, Number(els.themeHue.value) || 0));
        pick(hsvToRgb(hsv.hue, hsv.saturation, hsv.value), true);
      });
      inputs.forEach((input) => input.addEventListener('input', () => {
        if (validateInputs()) pick(inputs.map((field) => Number(field.value)));
      }));
    }

    return { bind, open, readDraft };
  }

  globalThis.CONWAY_THEME = { presets, normalize, palette, apply, create, toRgb, toHex, hsvToRgb, rgbToHsv, colorAt };
})();
