(() => {
  'use strict';

  // ===== 常量与基础状态 =====
  const COLS = 120;
  const ROWS = 80;
  const EDITOR_COLS = 40;
  const EDITOR_ROWS = 30;
  const STORAGE_KEY = 'conway-life-custom-presets-v1';
  const MUTATION_STORAGE_KEY = 'conway-life-mutation-settings-v1';
  const RANDOM_DENSITY = 0.22;

  const gameCanvas = document.getElementById('gameCanvas');
  const gameStage = gameCanvas.parentElement;
  const stageColumn = gameStage.parentElement;
  const editorCanvas = document.getElementById('editorCanvas');
  const gameCtx = gameCanvas.getContext('2d');
  const editorCtx = editorCanvas.getContext('2d');

  const state = {
    grid: new Uint8Array(COLS * ROWS),
    nextGrid: new Uint8Array(COLS * ROWS),
    generation: 0,
    population: 0,
    running: false,
    speed: 10,
    boundary: 'wrap',
    showGrid: true,
    timerId: null,
    mutationTimerId: null,
    mutationEnabled: false,
    mutationCount: 10,
    mutationProbability: 0.1,
    mutationDeathRatio: 0.5,
    mutationMoveRatio: 0.5,
    mutationResumeRunning: false,
    gameView: { width: 0, height: 0, dpr: 1 },
    editorView: { width: 0, height: 0, dpr: 1 },
    drawing: null,
    editorDrawing: null,
    editorGrid: new Uint8Array(EDITOR_COLS * EDITOR_ROWS),
    customPresets: [],
    presetTransforms: Object.create(null),
    presetDrag: null,
    preview: null,
    toastTimer: null
  };

  const els = {
    generationValue: document.getElementById('generationValue'),
    populationValue: document.getElementById('populationValue'),
    boundaryValue: document.getElementById('boundaryValue'),
    speedRange: document.getElementById('speedRange'),
    speedValue: document.getElementById('speedValue'),
    playButton: document.getElementById('playButton'),
    stepButton: document.getElementById('stepButton'),
    clearButton: document.getElementById('clearButton'),
    randomButton: document.getElementById('randomButton'),
    boundaryButton: document.getElementById('boundaryButton'),
    gridButton: document.getElementById('gridButton'),
    mutationButton: document.getElementById('mutationButton'),
    openEditorButton: document.getElementById('openEditorButton'),
    editorModal: document.getElementById('editorModal'),
    closeEditorButton: document.getElementById('closeEditorButton'),
    cancelEditorButton: document.getElementById('cancelEditorButton'),
    clearEditorButton: document.getElementById('clearEditorButton'),
    saveEditorButton: document.getElementById('saveEditorButton'),
    mutationModal: document.getElementById('mutationModal'),
    closeMutationButton: document.getElementById('closeMutationButton'),
    cancelMutationButton: document.getElementById('cancelMutationButton'),
    saveMutationButton: document.getElementById('saveMutationButton'),
    mutationEnabled: document.getElementById('mutationEnabled'),
    mutationCount: document.getElementById('mutationCount'),
    mutationProbability: document.getElementById('mutationProbability'),
    mutationDeathRatio: document.getElementById('mutationDeathRatio'),
    mutationMoveRatio: document.getElementById('mutationMoveRatio'),
    presetLibrary: document.getElementById('presetLibrary'),
    toast: document.getElementById('toast')
  };

  // ===== 系统预设 =====
  const SYSTEM_PRESETS = {
    glider: makePattern('滑翔机', ['010', '001', '111']),
    pulsar: makePattern('脉冲星', [
      '.............',
      '...###...###.',
      '.............',
      '.#...#.#...#.',
      '.#...#.#...#.',
      '.#...#.#...#.',
      '...###...###.',
      '.............',
      '...###...###.',
      '.#...#.#...#.',
      '.#...#.#...#.',
      '.#...#.#...#.',
      '...###...###.'
    ]),
    gosper: makePattern('高斯帕滑翔机枪', [
      [24, 0], [22, 1], [24, 1],
      [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
      [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
      [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
      [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
      [10, 6], [16, 6], [24, 6],
      [11, 7], [15, 7], [24, 7],
      [12, 8], [13, 8]
    ])
  };

  function makePattern(label, source) {
    if (Array.isArray(source[0])) {
      const maxX = Math.max(...source.map(([x]) => x));
      const maxY = Math.max(...source.map(([, y]) => y));
      return { id: label, label, width: maxX + 1, height: maxY + 1, cells: source.map(([x, y]) => [x, y]) };
    }

    const cells = [];
    source.forEach((row, y) => {
      [...row].forEach((value, x) => {
        if (value === '1' || value === '#') cells.push([x, y]);
      });
    });
    return { id: label, label, width: source[0].length, height: source.length, cells };
  }

  // ===== 初始化与事件绑定 =====
  function init() {
    loadCustomPresets();
    loadMutationSettings();
    bindEvents();
    resizeCanvases();
    renderPresetLibrary();
    updateStats();
    updateMutationButton();
    draw();
    drawEditor();
  }

  function bindEvents() {
    window.addEventListener('resize', resizeCanvases);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resizeCanvases);
      observer.observe(stageColumn);
      observer.observe(editorCanvas.parentElement);
    }
    document.addEventListener('keydown', handleKeydown);

    els.playButton.addEventListener('click', toggleRunning);
    els.stepButton.addEventListener('click', () => {
      if (state.running) stopRunning();
      step();
    });
    els.clearButton.addEventListener('click', () => clearBoard(true));
    els.randomButton.addEventListener('click', randomize);
    els.boundaryButton.addEventListener('click', toggleBoundary);
    els.gridButton.addEventListener('click', toggleGrid);
    els.mutationButton.addEventListener('click', openMutationSettings);
    els.speedRange.addEventListener('input', () => setSpeed(Number(els.speedRange.value)));
    document.querySelectorAll('[data-speed-delta]').forEach((button) => {
      button.addEventListener('click', () => setSpeed(state.speed + Number(button.dataset.speedDelta)));
    });

    els.openEditorButton.addEventListener('click', openEditor);
    els.closeEditorButton.addEventListener('click', closeEditor);
    els.cancelEditorButton.addEventListener('click', closeEditor);
    els.editorModal.addEventListener('click', (event) => {
      if (event.target === els.editorModal) closeEditor();
    });
    els.clearEditorButton.addEventListener('click', clearEditor);
    els.saveEditorButton.addEventListener('click', saveEditorPreset);

    els.closeMutationButton.addEventListener('click', cancelMutationSettings);
    els.cancelMutationButton.addEventListener('click', cancelMutationSettings);
    els.saveMutationButton.addEventListener('click', saveMutationSettings);
    els.mutationModal.addEventListener('click', (event) => {
      if (event.target === els.mutationModal) cancelMutationSettings();
    });

    bindGameCanvasEvents();
    bindEditorCanvasEvents();
  }

  // ===== 游戏逻辑 =====
  function step() {
    const source = state.grid;
    const target = state.nextGrid;
    let population = 0;

    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const index = y * COLS + x;
        const neighbors = countNeighbors(x, y, source);
        const alive = source[index] === 1;
        const nextAlive = alive ? (neighbors === 2 || neighbors === 3) : neighbors === 3;
        target[index] = nextAlive ? 1 : 0;
        if (nextAlive) population += 1;
      }
    }

    state.grid = target;
    state.nextGrid = source;
    state.population = population;
    state.generation += 1;
    updateStats();
    draw();
  }

  function countNeighbors(x, y, grid) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        let nx = x + dx;
        let ny = y + dy;

        if (state.boundary === 'wrap') {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
          continue;
        }
        count += grid[ny * COLS + nx];
      }
    }
    return count;
  }

  function toggleRunning() {
    if (state.running) stopRunning();
    else startRunning();
  }

  function startRunning() {
    state.running = true;
    restartTimer();
    restartMutationTimer();
    updatePlayButtons();
  }

  function stopRunning() {
    state.running = false;
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    if (state.mutationTimerId !== null) {
      window.clearInterval(state.mutationTimerId);
      state.mutationTimerId = null;
    }
    updatePlayButtons();
  }

  function restartTimer() {
    if (state.timerId !== null) window.clearInterval(state.timerId);
    state.timerId = window.setInterval(step, 1000 / state.speed);
  }

  function restartMutationTimer() {
    if (state.mutationTimerId !== null) window.clearInterval(state.mutationTimerId);
    state.mutationTimerId = null;
    if (state.running && state.mutationEnabled) {
      state.mutationTimerId = window.setInterval(applyMutations, 1000);
    }
  }

  function updatePlayButtons() {
    const isRunning = state.running;
    els.playButton.textContent = isRunning ? 'Ⅱ 暂停' : '▶ 播放';
    els.playButton.classList.toggle('is-running', isRunning);
    els.playButton.classList.toggle('is-paused', !isRunning);
  }

  function setSpeed(value) {
    state.speed = Math.max(1, Math.min(60, Math.round(value)));
    els.speedRange.value = String(state.speed);
    els.speedValue.textContent = `${state.speed} 步/秒`;
    if (state.running) restartTimer();
  }

  function clearBoard(resetGeneration) {
    state.grid.fill(0);
    state.nextGrid.fill(0);
    state.population = 0;
    if (resetGeneration) state.generation = 0;
    state.preview = null;
    updateStats();
    draw();
  }

  function randomize() {
    if (state.running) stopRunning();
    for (let i = 0; i < state.grid.length; i += 1) {
      state.grid[i] = Math.random() < RANDOM_DENSITY ? 1 : 0;
    }
    state.nextGrid.fill(0);
    state.generation = 0;
    state.population = countPopulation(state.grid);
    updateStats();
    draw();
  }

  function toggleBoundary() {
    state.boundary = state.boundary === 'wrap' ? 'finite' : 'wrap';
    const isWrap = state.boundary === 'wrap';
    els.boundaryButton.textContent = `边界：${isWrap ? '环绕' : '有限'}`;
    els.boundaryButton.classList.toggle('is-active', isWrap);
    els.boundaryValue.textContent = isWrap ? '环绕' : '有限';
    draw();
  }

  function toggleGrid() {
    state.showGrid = !state.showGrid;
    els.gridButton.textContent = `网格线：${state.showGrid ? '开' : '关'}`;
    els.gridButton.classList.toggle('is-active', state.showGrid);
    draw();
  }

  function countPopulation(grid) {
    let count = 0;
    for (const value of grid) count += value;
    return count;
  }

  function updateStats() {
    els.generationValue.textContent = String(state.generation);
    els.populationValue.textContent = String(state.population);
    els.boundaryValue.textContent = state.boundary === 'wrap' ? '环绕' : '有限';
    els.speedValue.textContent = `${state.speed} 步/秒`;
    updatePlayButtons();
  }

  // ===== 细胞突变 =====
  function loadMutationSettings() {
    try {
      const raw = window.localStorage.getItem(MUTATION_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.mutationCount = clampInt(saved.count, 1, 1000, 10);
      state.mutationProbability = clamp(Number(saved.probability), 0, 1, 0.1);
      const ratios = normalizeRatios(Number(saved.deathRatio), Number(saved.moveRatio));
      state.mutationDeathRatio = ratios.death;
      state.mutationMoveRatio = ratios.move;
    } catch (error) {
      // 存储损坏时回退到默认值。
    }
    state.mutationEnabled = false;
  }

  function persistMutationSettings() {
    try {
      window.localStorage.setItem(MUTATION_STORAGE_KEY, JSON.stringify({
        count: state.mutationCount,
        probability: state.mutationProbability,
        deathRatio: state.mutationDeathRatio,
        moveRatio: state.mutationMoveRatio
      }));
    } catch (error) {
      showToast('浏览器无法保存突变设置，请检查存储权限');
    }
  }

  function updateMutationButton() {
    els.mutationButton.textContent = `细胞突变：${state.mutationEnabled ? '开' : '关'}`;
    els.mutationButton.classList.toggle('is-active', state.mutationEnabled);
  }

  function openMutationSettings() {
    state.mutationResumeRunning = state.running;
    if (state.running) stopRunning();
    els.mutationEnabled.checked = state.mutationEnabled;
    els.mutationCount.value = String(state.mutationCount);
    els.mutationProbability.value = String(Math.round(state.mutationProbability * 100));
    els.mutationDeathRatio.value = String(Math.round(state.mutationDeathRatio * 100));
    els.mutationMoveRatio.value = String(Math.round(state.mutationMoveRatio * 100));
    els.mutationModal.classList.add('is-open');
    els.mutationEnabled.focus();
  }

  function closeMutationSettings(restoreRunning) {
    els.mutationModal.classList.remove('is-open');
    const shouldResume = restoreRunning && state.mutationResumeRunning;
    state.mutationResumeRunning = false;
    if (shouldResume) startRunning();
  }

  function cancelMutationSettings() {
    closeMutationSettings(true);
  }

  function saveMutationSettings() {
    state.mutationCount = clampInt(els.mutationCount.value, 1, 1000, 10);
    state.mutationProbability = clamp(Number(els.mutationProbability.value) / 100, 0, 1, 0.1);
    const ratios = normalizeRatios(Number(els.mutationDeathRatio.value), Number(els.mutationMoveRatio.value));
    state.mutationDeathRatio = ratios.death;
    state.mutationMoveRatio = ratios.move;
    state.mutationEnabled = els.mutationEnabled.checked;
    persistMutationSettings();
    updateMutationButton();
    restartMutationTimer();
    closeMutationSettings(true);
    showToast(state.mutationEnabled ? '已启用细胞突变' : '已关闭细胞突变');
  }

  function applyMutations() {
    if (!state.running || !state.mutationEnabled || state.population === 0) return;

    const alive = [];
    for (let index = 0; index < state.grid.length; index += 1) {
      if (state.grid[index]) alive.push(index);
    }
    for (let i = alive.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [alive[i], alive[j]] = [alive[j], alive[i]];
    }

    const sampleCount = Math.min(state.mutationCount, alive.length);
    for (let i = 0; i < sampleCount; i += 1) {
      const sourceIndex = alive[i];
      if (!state.grid[sourceIndex] || Math.random() >= state.mutationProbability) continue;
      if (Math.random() < state.mutationDeathRatio) {
        state.grid[sourceIndex] = 0;
        continue;
      }

      const sourceX = sourceIndex % COLS;
      const sourceY = Math.floor(sourceIndex / COLS);
      const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = directions[Math.floor(Math.random() * directions.length)];
      let targetX = sourceX + dx;
      let targetY = sourceY + dy;

      if (state.boundary === 'wrap') {
        targetX = (targetX + COLS) % COLS;
        targetY = (targetY + ROWS) % ROWS;
      } else if (targetX < 0 || targetX >= COLS || targetY < 0 || targetY >= ROWS) {
        continue;
      }

      const targetIndex = targetY * COLS + targetX;
      if (state.grid[targetIndex]) continue;
      state.grid[sourceIndex] = 0;
      state.grid[targetIndex] = 1;
    }

    state.nextGrid.fill(0);
    state.population = countPopulation(state.grid);
    updateStats();
    draw();
  }

  function normalizeRatios(death, move) {
    const safeDeath = clamp(Number.isFinite(death) ? death : 50, 0, 100, 50);
    const safeMove = clamp(Number.isFinite(move) ? move : 50, 0, 100, 50);
    const total = safeDeath + safeMove;
    if (total <= 0) return { death: 0.5, move: 0.5 };
    return { death: safeDeath / total, move: safeMove / total };
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function clampInt(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback));
  }

  // ===== 主画布绘制与鼠标操作 =====
  function bindGameCanvasEvents() {
    gameCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
    gameCanvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      const cell = canvasToCell(gameCanvas, event.clientX, event.clientY);
      if (!cell) return;
      state.drawing = { pointerId: event.pointerId, value: event.button === 2 ? 0 : 1 };
      gameCanvas.setPointerCapture?.(event.pointerId);
      setCell(cell.x, cell.y, state.drawing.value);
    });
    gameCanvas.addEventListener('pointermove', (event) => {
      if (!state.drawing || event.pointerId !== state.drawing.pointerId) return;
      const cell = canvasToCell(gameCanvas, event.clientX, event.clientY);
      if (cell) setCell(cell.x, cell.y, state.drawing.value);
    });
    const finishDrawing = (event) => {
      if (state.drawing && event.pointerId === state.drawing.pointerId) state.drawing = null;
    };
    gameCanvas.addEventListener('pointerup', finishDrawing);
    gameCanvas.addEventListener('pointercancel', finishDrawing);
    gameCanvas.addEventListener('pointerleave', (event) => {
      if (state.drawing && event.pointerId === state.drawing.pointerId && !gameCanvas.hasPointerCapture?.(event.pointerId)) state.drawing = null;
    });
  }

  function setCell(x, y, value) {
    const index = y * COLS + x;
    if (state.grid[index] === value) return;
    state.grid[index] = value;
    state.population += value ? 1 : -1;
    state.nextGrid[index] = 0;
    updateStats();
    draw();
  }

  function canvasToCell(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
    const cols = canvas === gameCanvas ? COLS : EDITOR_COLS;
    const rows = canvas === gameCanvas ? ROWS : EDITOR_ROWS;
    return {
      x: Math.floor(((clientX - rect.left) / rect.width) * cols),
      y: Math.floor(((clientY - rect.top) / rect.height) * rows)
    };
  }

  function draw() {
    const { width, height } = state.gameView;
    if (!width || !height) return;
    gameCtx.clearRect(0, 0, width, height);
    gameCtx.fillStyle = '#07151c';
    gameCtx.fillRect(0, 0, width, height);

    const cellWidth = width / COLS;
    const cellHeight = height / ROWS;
    const showGrid = state.showGrid && Math.min(cellWidth, cellHeight) >= 6;
    const gap = showGrid ? Math.min(0.9, Math.max(0.35, cellWidth * 0.06)) : 0;

    gameCtx.fillStyle = '#54f1d2';
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (!state.grid[y * COLS + x]) continue;
        gameCtx.fillRect(x * cellWidth + gap, y * cellHeight + gap, Math.max(1, cellWidth - gap * 2), Math.max(1, cellHeight - gap * 2));
      }
    }

    if (state.preview) drawPreview(state.preview, cellWidth, cellHeight);

    if (showGrid) {
      gameCtx.beginPath();
      gameCtx.strokeStyle = 'rgba(130, 211, 215, 0.105)';
      gameCtx.lineWidth = 1;
      for (let x = 1; x < COLS; x += 1) {
        const px = Math.round(x * cellWidth) + 0.5;
        gameCtx.moveTo(px, 0);
        gameCtx.lineTo(px, height);
      }
      for (let y = 1; y < ROWS; y += 1) {
        const py = Math.round(y * cellHeight) + 0.5;
        gameCtx.moveTo(0, py);
        gameCtx.lineTo(width, py);
      }
      gameCtx.stroke();
    }
  }

  function drawPreview(preview, cellWidth, cellHeight) {
    const placement = getPlacementCells(preview.pattern, preview.anchor.x, preview.anchor.y);
    const gap = state.showGrid && Math.min(cellWidth, cellHeight) >= 6 ? 0.7 : 0;
    gameCtx.fillStyle = 'rgba(84, 241, 210, 0.36)';
    placement.forEach(({ x, y }) => {
      gameCtx.fillRect(x * cellWidth + gap, y * cellHeight + gap, Math.max(1, cellWidth - gap * 2), Math.max(1, cellHeight - gap * 2));
    });
  }

  // ===== 预设放置、翻转与渲染 =====
  function getPresetEntries() {
    const systemEntries = Object.entries(SYSTEM_PRESETS).map(([id, pattern]) => ({
      ...pattern,
      key: `system:${id}`,
      type: 'system'
    }));
    const customEntries = state.customPresets.map((pattern) => ({
      ...pattern,
      key: `custom:${pattern.id}`,
      type: 'custom'
    }));
    return [...systemEntries, ...customEntries];
  }

  function getTransformedPattern(entry) {
    const transform = state.presetTransforms[entry.key] || { flipX: false, flipY: false };
    return {
      ...entry,
      cells: entry.cells.map(([x, y]) => [
        transform.flipX ? entry.width - 1 - x : x,
        transform.flipY ? entry.height - 1 - y : y
      ])
    };
  }

  function getPlacementCells(pattern, anchorX, anchorY) {
    const originX = anchorX - Math.floor(pattern.width / 2);
    const originY = anchorY - Math.floor(pattern.height / 2);
    const cells = [];
    const seen = new Set();

    pattern.cells.forEach(([x, y]) => {
      let targetX = originX + x;
      let targetY = originY + y;

      if (state.boundary === 'wrap') {
        targetX = (targetX + COLS) % COLS;
        targetY = (targetY + ROWS) % ROWS;
      } else if (targetX < 0 || targetX >= COLS || targetY < 0 || targetY >= ROWS) {
        return;
      }

      const key = targetY * COLS + targetX;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push({ x: targetX, y: targetY });
      }
    });
    return cells;
  }

  function bindPresetPointer(card, entry) {
    card.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      if (event.button !== 0) return;
      event.preventDefault();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const pattern = getTransformedPattern(entry);
      let dragging = false;
      card.setPointerCapture?.(pointerId);

      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!dragging && distance > 5) dragging = true;
        if (!dragging) return;
        state.presetDrag = { pattern };
        const cell = canvasToCell(gameCanvas, moveEvent.clientX, moveEvent.clientY);
        state.preview = cell ? { pattern, anchor: cell } : null;
        draw();
      };

      const finish = (finishEvent) => {
        if (finishEvent.pointerId !== pointerId) return;
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        if (card.hasPointerCapture?.(pointerId)) card.releasePointerCapture(pointerId);

        const cell = canvasToCell(gameCanvas, finishEvent.clientX, finishEvent.clientY);
        if (finishEvent.type === 'pointerup' && dragging && cell) {
          placePattern(pattern, cell.x, cell.y, false);
          showToast(`已放置${pattern.label}`);
        } else if (finishEvent.type === 'pointerup' && !dragging) {
          showToast('预设只能拖拽到场地');
        }

        state.presetDrag = null;
        state.preview = null;
        draw();
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });
  }

  function placePattern(pattern, anchorX, anchorY, clearFirst) {
    if (clearFirst) clearBoard(true);
    const cells = getPlacementCells(pattern, anchorX, anchorY);
    cells.forEach(({ x, y }) => {
      state.grid[y * COLS + x] = 1;
    });
    state.nextGrid.fill(0);
    state.population = countPopulation(state.grid);
    updateStats();
    draw();
  }

  function renderPresetLibrary() {
    els.presetLibrary.replaceChildren();
    const entries = getPresetEntries();

    entries.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'preset-card';
      card.setAttribute('aria-label', `${entry.label}，只能拖拽到场地`);

      const thumb = document.createElement('canvas');
      thumb.className = 'preset-thumb';
      thumb.width = 240;
      thumb.height = 120;
      thumb.setAttribute('aria-hidden', 'true');
      renderPatternThumb(thumb, getTransformedPattern(entry));

      const cardTop = document.createElement('div');
      cardTop.className = 'preset-card-top';
      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = entry.label;
      const kind = document.createElement('span');
      kind.className = 'preset-kind';
      kind.textContent = entry.type === 'system' ? '系统' : '自定义';
      cardTop.append(name, kind);

      const transformControls = document.createElement('div');
      transformControls.className = 'preset-transform-controls';
      transformControls.append(
        makeTransformButton('左右翻转', '↔', entry, 'flipX'),
        makeTransformButton('上下翻转', '↕', entry, 'flipY')
      );

      const footer = document.createElement('div');
      footer.className = 'preset-card-footer';
      const deleteControl = document.createElement('span');
      deleteControl.className = entry.type === 'system' ? 'preset-system-label' : 'delete-preset';
      deleteControl.textContent = entry.type === 'system' ? '系统预设' : '删除';
      if (entry.type === 'custom') {
        deleteControl.setAttribute('role', 'button');
        deleteControl.setAttribute('tabindex', '0');
        deleteControl.setAttribute('aria-label', `删除${entry.label}`);
        deleteControl.addEventListener('pointerdown', (event) => event.stopPropagation());
        deleteControl.addEventListener('click', (event) => {
          event.stopPropagation();
          deletePreset(entry.id);
        });
        deleteControl.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            deletePreset(entry.id);
          }
        });
      }
      footer.append(deleteControl);

      card.append(cardTop, thumb, transformControls, footer);
      bindPresetPointer(card, entry);
      els.presetLibrary.appendChild(card);
    });
  }

  function makeTransformButton(label, symbol, entry, axis) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-transform';
    button.textContent = symbol;
    button.title = label;
    button.setAttribute('aria-label', `${entry.label}${label}`);
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const current = state.presetTransforms[entry.key] || { flipX: false, flipY: false };
      current[axis] = !current[axis];
      state.presetTransforms[entry.key] = current;
      renderPresetLibrary();
    });
    return button;
  }

  function renderPatternThumb(canvas, pattern) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = '#08181e';
    ctx.fillRect(0, 0, width, height);
    const cell = Math.min((width - 28) / pattern.width, (height - 24) / pattern.height);
    const startX = (width - cell * pattern.width) / 2;
    const startY = (height - cell * pattern.height) / 2;
    ctx.fillStyle = '#54f1d2';
    pattern.cells.forEach(([x, y]) => {
      ctx.fillRect(startX + x * cell + 0.8, startY + y * cell + 0.8, Math.max(1, cell - 1.6), Math.max(1, cell - 1.6));
    });
  }

  // ===== 自定义预设持久化 =====
  function loadCustomPresets() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      state.customPresets = parsed.filter(isValidPreset).map((preset) => ({
        id: Number(preset.id),
        label: String(preset.label),
        width: Number(preset.width),
        height: Number(preset.height),
        cells: preset.cells.map(([x, y]) => [Number(x), Number(y)])
      })).sort((a, b) => a.id - b.id);
    } catch (error) {
      state.customPresets = [];
    }
  }

  function isValidPreset(preset) {
    return preset && Number.isInteger(Number(preset.id)) && Number(preset.id) > 0 && Number(preset.width) > 0 && Number(preset.height) > 0 &&
      Number(preset.width) <= COLS && Number(preset.height) <= ROWS && Array.isArray(preset.cells) && preset.cells.length > 0 &&
      preset.cells.every((cell) => Array.isArray(cell) && cell.length === 2 && Number.isInteger(Number(cell[0])) && Number.isInteger(Number(cell[1])) &&
        Number(cell[0]) >= 0 && Number(cell[0]) < Number(preset.width) && Number(cell[1]) >= 0 && Number(cell[1]) < Number(preset.height));
  }

  function persistCustomPresets() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customPresets));
    } catch (error) {
      showToast('浏览器无法保存预设，请检查存储权限');
    }
  }

  function deletePreset(id) {
    const preset = state.customPresets.find((item) => item.id === id);
    state.customPresets = state.customPresets.filter((item) => item.id !== id);
    delete state.presetTransforms[`custom:${id}`];
    persistCustomPresets();
    renderPresetLibrary();
    if (preset) showToast(`已删除${preset.label}`);
  }

  function getNextPresetId() {
    const used = new Set(state.customPresets.map((preset) => preset.id));
    let nextId = 1;
    while (used.has(nextId)) nextId += 1;
    return nextId;
  }

  // ===== 自定义编辑器 =====
  function openEditor() {
    state.editorGrid.fill(0);
    drawEditor();
    els.editorModal.classList.add('is-open');
    els.closeEditorButton.focus();
    window.requestAnimationFrame(() => {
      resizeCanvas(editorCanvas, editorCtx, state.editorView);
      drawEditor();
    });
  }

  function closeEditor() {
    els.editorModal.classList.remove('is-open');
  }

  function clearEditor() {
    state.editorGrid.fill(0);
    drawEditor();
  }

  function bindEditorCanvasEvents() {
    editorCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
    editorCanvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      const cell = canvasToCell(editorCanvas, event.clientX, event.clientY);
      if (!cell) return;
      const index = cell.y * EDITOR_COLS + cell.x;
      state.editorDrawing = { pointerId: event.pointerId, value: event.button === 2 ? 0 : state.editorGrid[index] ? 0 : 1 };
      editorCanvas.setPointerCapture?.(event.pointerId);
      setEditorCell(cell.x, cell.y, state.editorDrawing.value);
    });
    editorCanvas.addEventListener('pointermove', (event) => {
      if (!state.editorDrawing || event.pointerId !== state.editorDrawing.pointerId) return;
      const cell = canvasToCell(editorCanvas, event.clientX, event.clientY);
      if (cell) setEditorCell(cell.x, cell.y, state.editorDrawing.value);
    });
    const finish = (event) => {
      if (state.editorDrawing && event.pointerId === state.editorDrawing.pointerId) state.editorDrawing = null;
    };
    editorCanvas.addEventListener('pointerup', finish);
    editorCanvas.addEventListener('pointercancel', finish);
  }

  function setEditorCell(x, y, value) {
    state.editorGrid[y * EDITOR_COLS + x] = value;
    drawEditor();
  }

  function drawEditor() {
    const { width, height } = state.editorView;
    if (!width || !height) return;
    editorCtx.clearRect(0, 0, width, height);
    editorCtx.fillStyle = '#07151c';
    editorCtx.fillRect(0, 0, width, height);
    const cellWidth = width / EDITOR_COLS;
    const cellHeight = height / EDITOR_ROWS;

    editorCtx.fillStyle = '#54f1d2';
    for (let y = 0; y < EDITOR_ROWS; y += 1) {
      for (let x = 0; x < EDITOR_COLS; x += 1) {
        if (!state.editorGrid[y * EDITOR_COLS + x]) continue;
        editorCtx.fillRect(x * cellWidth + 1, y * cellHeight + 1, Math.max(1, cellWidth - 2), Math.max(1, cellHeight - 2));
      }
    }

    editorCtx.beginPath();
    editorCtx.strokeStyle = 'rgba(130, 211, 215, 0.24)';
    editorCtx.lineWidth = 1;
    for (let x = 1; x < EDITOR_COLS; x += 1) {
      const px = Math.round(x * cellWidth) + 0.5;
      editorCtx.moveTo(px, 0);
      editorCtx.lineTo(px, height);
    }
    for (let y = 1; y < EDITOR_ROWS; y += 1) {
      const py = Math.round(y * cellHeight) + 0.5;
      editorCtx.moveTo(0, py);
      editorCtx.lineTo(width, py);
    }
    editorCtx.stroke();
  }

  function saveEditorPreset() {
    const cells = [];
    for (let y = 0; y < EDITOR_ROWS; y += 1) {
      for (let x = 0; x < EDITOR_COLS; x += 1) {
        if (state.editorGrid[y * EDITOR_COLS + x]) cells.push([x, y]);
      }
    }

    if (!cells.length) {
      showToast('请至少绘制一个活细胞');
      return;
    }

    const minX = Math.min(...cells.map(([x]) => x));
    const maxX = Math.max(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const nextId = getNextPresetId();
    const pattern = {
      id: nextId,
      label: `预设${nextId}`,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      cells: cells.map(([x, y]) => [x - minX, y - minY])
    };

    state.customPresets.push(pattern);
    state.customPresets.sort((a, b) => a.id - b.id);
    persistCustomPresets();
    renderPresetLibrary();
    els.presetLibrary.scrollTop = els.presetLibrary.scrollHeight;
    closeEditor();
    showToast(`已保存${pattern.label}`);
  }

  // ===== 画布适配与键盘 =====
  function resizeCanvases() {
    const scale = Math.min(stageColumn.clientWidth / COLS, stageColumn.clientHeight / ROWS);
    if (Number.isFinite(scale) && scale > 0) {
      gameStage.style.width = `${COLS * scale}px`;
      gameStage.style.height = `${ROWS * scale}px`;
    }
    resizeCanvas(gameCanvas, gameCtx, state.gameView);
    resizeCanvas(editorCanvas, editorCtx, state.editorView);
    draw();
    drawEditor();
  }

  function resizeCanvas(canvas, ctx, view) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = rect.width;
    view.height = rect.height;
    view.dpr = dpr;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (els.mutationModal.classList.contains('is-open')) {
        cancelMutationSettings();
        return;
      }
      if (els.editorModal.classList.contains('is-open')) {
        closeEditor();
        return;
      }
    }

    const tag = event.target?.tagName;
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (isEditable) return;

    const key = event.key.toLowerCase();
    if (event.code === 'Space') {
      event.preventDefault();
      toggleRunning();
    } else if (key === 'n') {
      event.preventDefault();
      if (state.running) stopRunning();
      step();
    } else if (key === 'r') {
      event.preventDefault();
      randomize();
    } else if (key === 'c') {
      event.preventDefault();
      clearBoard(true);
    } else if (event.key === 'F11') {
      event.preventDefault();
      window.CONWAY_PLATFORM?.toggleFullscreen().catch(() => {});
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove('is-visible'), 2200);
  }

  init();
})();
