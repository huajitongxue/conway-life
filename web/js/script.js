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
  // 预设交换文件的标识、版本与导入上限。
  const PRESET_FILE_TYPE = 'conway-life-presets';
  const PRESET_FILE_VERSION = 1;
  const MAX_IMPORT_PRESETS = 500;
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_PRESET_LABEL = 16;
  const DEFAULT_LIBRARY_HELP = '拖拽卡片到场地放置，点击卡片不会改变地图。';
  const SELECT_LIBRARY_HELP = '勾选要导出的形状，再点“导出所选”。';

  const gameCanvas = document.getElementById('gameCanvas');
  const gameStage = gameCanvas.parentElement;
  const stageColumn = gameStage.parentElement;
  const editorCanvas = document.getElementById('editorCanvas');
  const gameCtx = gameCanvas.getContext('2d');
  const editorCtx = editorCanvas.getContext('2d');

  const state = {
    grid: new Uint8Array(COLS * ROWS),
    nextGrid: new Uint8Array(COLS * ROWS),
    // 只记录当前会话中每个格子的连续存活代数，暂停不增加。
    cellAges: new Uint32Array(COLS * ROWS),
    generation: 0,
    population: 0,
    running: false,
    speed: 10,
    boundary: 'wrap',
    showGrid: true,
    timerId: null,
    mutationTimerId: null,
    mutationEnabled: false,
    mutationPreferStable: false,
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
    editorPresetId: null,
    customPresets: [],
    presetTransforms: Object.create(null),
    presetSelectionMode: false,
    selectedPresetKeys: new Set(),
    renamingPresetId: null,
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
    openShapeManagerButton: document.getElementById('openShapeManagerButton'),
    shapeManagerModal: document.getElementById('shapeManagerModal'),
    closeShapeManagerButton: document.getElementById('closeShapeManagerButton'),
    shapeManagerList: document.getElementById('shapeManagerList'),
    editorModal: document.getElementById('editorModal'),
    editorTitle: document.getElementById('editorTitle'),
    editorSubtitle: document.getElementById('editorSubtitle'),
    closeEditorButton: document.getElementById('closeEditorButton'),
    cancelEditorButton: document.getElementById('cancelEditorButton'),
    clearEditorButton: document.getElementById('clearEditorButton'),
    saveEditorButton: document.getElementById('saveEditorButton'),
    mutationModal: document.getElementById('mutationModal'),
    closeMutationButton: document.getElementById('closeMutationButton'),
    cancelMutationButton: document.getElementById('cancelMutationButton'),
    saveMutationButton: document.getElementById('saveMutationButton'),
    mutationEnabled: document.getElementById('mutationEnabled'),
    mutationPreferStable: document.getElementById('mutationPreferStable'),
    mutationCount: document.getElementById('mutationCount'),
    mutationProbability: document.getElementById('mutationProbability'),
    mutationRatioRange: document.getElementById('mutationRatioRange'),
    mutationDeathValue: document.getElementById('mutationDeathValue'),
    mutationMoveValue: document.getElementById('mutationMoveValue'),
    mutationRatioLeftButton: document.getElementById('mutationRatioLeftButton'),
    mutationRatioRightButton: document.getElementById('mutationRatioRightButton'),
    presetLibrary: document.getElementById('presetLibrary'),
    libraryHelp: document.getElementById('libraryHelp'),
    exportPresetsButton: document.getElementById('exportPresetsButton'),
    importPresetsButton: document.getElementById('importPresetsButton'),
    importPresetsInput: document.getElementById('importPresetsInput'),
    presetIoRow: document.getElementById('presetIoRow'),
    presetSelectRow: document.getElementById('presetSelectRow'),
    selectAllPresetsButton: document.getElementById('selectAllPresetsButton'),
    exportSelectedButton: document.getElementById('exportSelectedButton'),
    cancelSelectButton: document.getElementById('cancelSelectButton'),
    renameModal: document.getElementById('renameModal'),
    closeRenameButton: document.getElementById('closeRenameButton'),
    cancelRenameButton: document.getElementById('cancelRenameButton'),
    saveRenameButton: document.getElementById('saveRenameButton'),
    renameInput: document.getElementById('renameInput'),
    renameError: document.getElementById('renameError'),
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

    els.openShapeManagerButton.addEventListener('click', openShapeManager);
    els.closeShapeManagerButton.addEventListener('click', closeShapeManager);
    els.shapeManagerModal.addEventListener('click', (event) => {
      if (event.target === els.shapeManagerModal) closeShapeManager();
    });

    els.closeEditorButton.addEventListener('click', closeEditor);
    els.cancelEditorButton.addEventListener('click', closeEditor);
    els.editorModal.addEventListener('click', (event) => {
      if (event.target === els.editorModal) closeEditor();
    });
    els.clearEditorButton.addEventListener('click', clearEditor);
    els.saveEditorButton.addEventListener('click', saveEditorPreset);

    els.exportPresetsButton.addEventListener('click', enterPresetSelection);
    els.importPresetsButton.addEventListener('click', () => els.importPresetsInput.click());
    els.importPresetsInput.addEventListener('change', () => {
      const file = els.importPresetsInput.files?.[0] || null;
      // 先清空，保证连续选择同一个文件时也会再次触发 change。
      els.importPresetsInput.value = '';
      importPresetsFromFile(file);
    });
    els.selectAllPresetsButton.addEventListener('click', toggleSelectAllPresets);
    els.exportSelectedButton.addEventListener('click', exportSelectedPresets);
    els.cancelSelectButton.addEventListener('click', () => exitPresetSelection(true));

    els.closeRenameButton.addEventListener('click', closeRenameModal);
    els.cancelRenameButton.addEventListener('click', closeRenameModal);
    els.saveRenameButton.addEventListener('click', saveRenamePreset);
    els.renameModal.addEventListener('click', (event) => {
      if (event.target === els.renameModal) closeRenameModal();
    });
    els.renameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveRenamePreset();
      }
    });

    els.closeMutationButton.addEventListener('click', cancelMutationSettings);
    els.cancelMutationButton.addEventListener('click', cancelMutationSettings);
    els.saveMutationButton.addEventListener('click', saveMutationSettings);
    els.mutationModal.addEventListener('click', (event) => {
      if (event.target === els.mutationModal) cancelMutationSettings();
    });
    els.mutationRatioRange.addEventListener('input', () => {
      setMutationRatio(els.mutationRatioRange.value);
    });
    els.mutationRatioLeftButton.addEventListener('click', () => {
      setMutationRatio(Number(els.mutationRatioRange.value) - 1);
    });
    els.mutationRatioRightButton.addEventListener('click', () => {
      setMutationRatio(Number(els.mutationRatioRange.value) + 1);
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
        state.cellAges[index] = nextAlive ? (alive ? Math.min(state.cellAges[index] + 1, 0xffffffff) : 1) : 0;
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
    state.cellAges.fill(0);
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
      state.cellAges[i] = state.grid[i];
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
    state.mutationEnabled = false;
    state.mutationPreferStable = false;
    try {
      const raw = window.localStorage.getItem(MUTATION_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.mutationCount = clampInt(saved.count, 1, 1000, 10);
      state.mutationProbability = clamp(Number(saved.probability), 0, 1, 0.1);
      const ratios = normalizeRatios(Number(saved.deathRatio), Number(saved.moveRatio));
      state.mutationDeathRatio = ratios.death;
      state.mutationMoveRatio = ratios.move;
      // 旧设置缺少此字段时保持随机抽取，只有布尔值 true 才启用。
      state.mutationPreferStable = saved.preferStable === true;
    } catch (error) {
      // 存储损坏时回退到默认值。
    }
  }

  function persistMutationSettings() {
    try {
      window.localStorage.setItem(MUTATION_STORAGE_KEY, JSON.stringify({
        count: state.mutationCount,
        probability: state.mutationProbability,
        deathRatio: state.mutationDeathRatio,
        moveRatio: state.mutationMoveRatio,
        preferStable: state.mutationPreferStable
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
    if (els.mutationModal.classList.contains('is-open')) return;
    state.mutationResumeRunning = state.running;
    if (state.running) stopRunning();
    els.mutationEnabled.checked = state.mutationEnabled;
    els.mutationPreferStable.checked = state.mutationPreferStable;
    els.mutationCount.value = String(state.mutationCount);
    els.mutationProbability.value = String(Math.round(state.mutationProbability * 100));
    setMutationRatio(Math.round(state.mutationMoveRatio * 100));
    els.mutationModal.classList.add('is-open');
    els.mutationEnabled.focus();
  }

  function closeMutationSettings(restoreRunning) {
    if (!els.mutationModal.classList.contains('is-open')) return;
    els.mutationModal.classList.remove('is-open');
    const shouldResume = restoreRunning && state.mutationResumeRunning;
    state.mutationResumeRunning = false;
    els.mutationButton.focus();
    if (shouldResume) startRunning();
  }

  function cancelMutationSettings() {
    closeMutationSettings(true);
  }

  function saveMutationSettings() {
    state.mutationCount = clampInt(els.mutationCount.value, 1, 1000, 10);
    state.mutationProbability = clamp(Number(els.mutationProbability.value) / 100, 0, 1, 0.1);
    const movePercent = clampInt(els.mutationRatioRange.value, 0, 100, 50);
    state.mutationDeathRatio = (100 - movePercent) / 100;
    state.mutationMoveRatio = movePercent / 100;
    state.mutationPreferStable = els.mutationPreferStable.checked;
    state.mutationEnabled = els.mutationEnabled.checked;
    persistMutationSettings();
    updateMutationButton();
    restartMutationTimer();
    closeMutationSettings(true);
    showToast(state.mutationEnabled ? '已启用细胞突变' : '已关闭细胞突变');
  }

  function applyMutations() {
    if (!state.running || !state.mutationEnabled || state.population === 0) return;

    const candidates = selectMutationCells();
    for (const sourceIndex of candidates) {
      if (!state.grid[sourceIndex] || Math.random() >= state.mutationProbability) continue;
      if (Math.random() < state.mutationDeathRatio) {
        state.grid[sourceIndex] = 0;
        state.cellAges[sourceIndex] = 0;
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
      state.cellAges[sourceIndex] = 0;
      state.grid[targetIndex] = 1;
      state.cellAges[targetIndex] = 1;
    }

    state.nextGrid.fill(0);
    state.population = countPopulation(state.grid);
    updateStats();
    draw();
  }

  function selectMutationCells() {
    const alive = [];
    for (let index = 0; index < state.grid.length; index += 1) {
      if (state.grid[index]) alive.push(index);
    }
    for (let i = alive.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [alive[i], alive[j]] = [alive[j], alive[i]];
    }

    if (state.mutationPreferStable) {
      // 先洗牌再稳定排序，让相同连续存活代数的格子随机排列。
      alive.sort((a, b) => state.cellAges[b] - state.cellAges[a]);
    }
    return alive.slice(0, Math.min(state.mutationCount, alive.length));
  }

  function setMutationRatio(value) {
    // 仅修改弹窗草稿，保存后才应用到游戏。
    const movePercent = clampInt(value, 0, 100, 50);
    const deathPercent = 100 - movePercent;
    els.mutationRatioRange.value = String(movePercent);
    els.mutationDeathValue.textContent = `${deathPercent}%`;
    els.mutationMoveValue.textContent = `${movePercent}%`;
    els.mutationRatioRange.setAttribute('aria-valuetext', `死亡 ${deathPercent}%，移动 ${movePercent}%`);
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
    state.cellAges[index] = value ? 1 : 0;
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
      const index = y * COLS + x;
      if (!state.grid[index]) state.cellAges[index] = 1;
      state.grid[index] = 1;
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
      if (entry.type === 'system') {
        const systemLabel = document.createElement('span');
        systemLabel.className = 'preset-system-label';
        systemLabel.textContent = '系统预设';
        footer.append(systemLabel);
      } else {
        footer.append(
          makePresetTextButton('rename-preset', '改名', `重命名${entry.label}`, () => openRenameModal(entry.id)),
          makePresetTextButton('delete-preset', '删除', `删除${entry.label}`, () => deletePreset(entry.id))
        );
      }

      if (state.presetSelectionMode) {
        const selected = state.selectedPresetKeys.has(entry.key);
        card.classList.add('is-selecting');
        card.classList.toggle('is-selected', selected);
        card.setAttribute('role', 'checkbox');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-checked', selected ? 'true' : 'false');
        card.setAttribute('aria-label', `选择${entry.label}`);

        const check = document.createElement('span');
        check.className = 'preset-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = selected ? '✓' : '';

        card.append(cardTop, thumb, check, footer);
        bindPresetSelection(card, entry, check);
      } else {
        card.append(cardTop, thumb, transformControls, footer);
        bindPresetPointer(card, entry);
      }
      els.presetLibrary.appendChild(card);
    });
  }

  function makePresetTextButton(className, text, ariaLabel, onClick) {
    const control = document.createElement('span');
    control.className = className;
    control.textContent = text;
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.setAttribute('aria-label', ariaLabel);
    control.addEventListener('pointerdown', (event) => event.stopPropagation());
    control.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }
    });
    return control;
  }

  function bindPresetSelection(card, entry, check) {
    const toggle = () => {
      if (state.selectedPresetKeys.has(entry.key)) state.selectedPresetKeys.delete(entry.key);
      else state.selectedPresetKeys.add(entry.key);
      const selected = state.selectedPresetKeys.has(entry.key);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-checked', selected ? 'true' : 'false');
      check.textContent = selected ? '✓' : '';
      updateSelectControls();
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
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

  // ===== 重命名自定义预设 =====
  function openRenameModal(id) {
    const preset = state.customPresets.find((item) => item.id === id);
    if (!preset) return;

    state.renamingPresetId = id;
    els.renameInput.value = preset.label;
    setRenameError('');
    els.renameModal.classList.add('is-open');
    els.renameInput.focus();
    els.renameInput.select?.();
  }

  function closeRenameModal() {
    if (!els.renameModal.classList.contains('is-open')) return;
    els.renameModal.classList.remove('is-open');
    state.renamingPresetId = null;
    setRenameError('');
  }

  function setRenameError(message) {
    els.renameError.textContent = message;
  }

  function saveRenamePreset() {
    const preset = state.customPresets.find((item) => item.id === state.renamingPresetId);
    if (!preset) {
      closeRenameModal();
      return;
    }

    const name = els.renameInput.value.trim().slice(0, MAX_PRESET_LABEL);
    if (!name) {
      setRenameError('名称不能为空');
      return;
    }
    if (state.customPresets.some((item) => item.id !== preset.id && item.label === name)) {
      setRenameError('已经有同名的形状，请换一个名称');
      return;
    }
    if (name === preset.label) {
      closeRenameModal();
      return;
    }

    preset.label = name;
    persistCustomPresets();
    renderPresetLibrary();
    closeRenameModal();
    showToast(`已改名为${name}`);
  }

  // ===== 预设导出与导入 =====
  function enterPresetSelection() {
    const entries = getPresetEntries();
    if (!entries.length) {
      showToast('预设库是空的，没有可导出的形状');
      return;
    }
    state.presetSelectionMode = true;
    state.selectedPresetKeys.clear();
    els.presetIoRow.hidden = true;
    els.presetSelectRow.hidden = false;
    els.libraryHelp.textContent = SELECT_LIBRARY_HELP;
    renderPresetLibrary();
    updateSelectControls();
    showToast('勾选要导出的形状，再点“导出所选”');
  }

  function exitPresetSelection(showMessage) {
    if (!state.presetSelectionMode) return;
    state.presetSelectionMode = false;
    state.selectedPresetKeys.clear();
    els.presetIoRow.hidden = false;
    els.presetSelectRow.hidden = true;
    els.libraryHelp.textContent = DEFAULT_LIBRARY_HELP;
    renderPresetLibrary();
    if (showMessage) showToast('已取消导出');
  }

  function updateSelectControls() {
    const total = getPresetEntries().length;
    const count = state.selectedPresetKeys.size;
    els.exportSelectedButton.textContent = count ? `导出所选（${count}）` : '导出所选';
    els.selectAllPresetsButton.textContent = count && count === total ? '全不选' : '全选';
  }

  function toggleSelectAllPresets() {
    const entries = getPresetEntries();
    const allSelected = entries.length > 0 && state.selectedPresetKeys.size === entries.length;
    state.selectedPresetKeys.clear();
    if (!allSelected) entries.forEach((entry) => state.selectedPresetKeys.add(entry.key));
    renderPresetLibrary();
    updateSelectControls();
  }

  function exportSelectedPresets() {
    const entries = getPresetEntries().filter((entry) => state.selectedPresetKeys.has(entry.key));
    if (!entries.length) {
      showToast('请先勾选要导出的形状');
      return;
    }
    if (!writePresetFile(entries)) return;
    exitPresetSelection(false);
    showToast(`已导出 ${entries.length} 个形状`);
  }

  function writePresetFile(entries) {
    if (typeof Blob !== 'function' || typeof URL.createObjectURL !== 'function') {
      showToast('当前环境不支持导出文件');
      return false;
    }

    const payload = {
      type: PRESET_FILE_TYPE,
      version: PRESET_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      presets: entries.map((entry) => ({
        label: entry.label,
        width: entry.width,
        height: entry.height,
        cells: entry.cells.map(([x, y]) => [x, y])
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conway-life-presets-${dateStamp(new Date())}.json`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  function dateStamp(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }

  function importPresetsFromFile(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast('文件过大，可能不是预设文件');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showToast('无法读取所选文件');
    reader.onload = () => {
      try {
        const result = mergeImportedPresets(String(reader.result));
        renderPresetLibrary();
        els.presetLibrary.scrollTop = els.presetLibrary.scrollHeight;
        showToast(result.skipped
          ? `已导入 ${result.count} 个预设，跳过 ${result.skipped} 个无效项`
          : `已导入 ${result.count} 个预设`);
      } catch (error) {
        showToast(error && error.message ? error.message : '导入失败');
      }
    };
    reader.readAsText(file);
  }

  function parsePresetFile(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error('文件不是有效的 JSON');
    }

    // 兼容导出文件对象和纯预设数组两种写法。
    const list = Array.isArray(data)
      ? data
      : (data && Array.isArray(data.presets) ? data.presets : null);
    if (!list) throw new Error('文件里没有预设数据');
    if (!list.length) throw new Error('文件里没有预设');
    if (list.length > MAX_IMPORT_PRESETS) throw new Error(`一次最多导入 ${MAX_IMPORT_PRESETS} 个预设`);
    return list;
  }

  function normalizeImportedPreset(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (!Array.isArray(entry.cells) || !entry.cells.length) return null;

    const unique = new Map();
    for (const cell of entry.cells) {
      if (!Array.isArray(cell) || cell.length < 2) return null;
      const x = Number(cell[0]);
      const y = Number(cell[1]);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return null;
      unique.set(`${x},${y}`, [x, y]);
    }

    // 与编辑器保存一致：按活细胞范围裁剪外围空白，再据此确定宽高。
    const cells = [...unique.values()];
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const normalized = cells.map(([x, y]) => [x - minX, y - minY]);
    const width = Math.max(...normalized.map(([x]) => x)) + 1;
    const height = Math.max(...normalized.map(([, y]) => y)) + 1;
    if (width > COLS || height > ROWS) return null;

    normalized.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
    return { width, height, cells: normalized };
  }

  function normalizeImportedLabel(value, fallbackId) {
    const text = typeof value === 'string' ? value.trim().slice(0, MAX_PRESET_LABEL) : '';
    return text || `预设${fallbackId}`;
  }

  function mergeImportedPresets(text) {
    const list = parsePresetFile(text);
    const used = new Set(state.customPresets.map((preset) => preset.id));
    const accepted = [];
    let skipped = 0;

    list.forEach((entry) => {
      const pattern = normalizeImportedPreset(entry);
      if (!pattern) {
        skipped += 1;
        return;
      }
      // 编号仍取当前最小可用值；名称沿用文件里的名字，缺失时才回退成“预设N”。
      let nextId = 1;
      while (used.has(nextId)) nextId += 1;
      used.add(nextId);
      accepted.push({
        id: nextId,
        label: normalizeImportedLabel(entry.label, nextId),
        width: pattern.width,
        height: pattern.height,
        cells: pattern.cells
      });
    });

    if (!accepted.length) throw new Error('文件里没有可导入的预设');

    state.customPresets.push(...accepted);
    state.customPresets.sort((a, b) => a.id - b.id);
    persistCustomPresets();
    return { count: accepted.length, skipped };
  }

  // ===== 形状管理弹窗 =====
  function openShapeManager() {
    if (els.shapeManagerModal.classList.contains('is-open')) return;
    renderShapeManager();
    els.shapeManagerModal.classList.add('is-open');
    els.closeShapeManagerButton.focus();
  }

  function closeShapeManager() {
    if (!els.shapeManagerModal.classList.contains('is-open')) return;
    els.shapeManagerModal.classList.remove('is-open');
    els.openShapeManagerButton.focus();
  }

  function renderShapeManager() {
    els.shapeManagerList.replaceChildren();

    const createCard = document.createElement('button');
    createCard.type = 'button';
    createCard.className = 'shape-manager-card is-new';
    createCard.textContent = '＋ 新建空白形状';
    createCard.addEventListener('click', openEditor);
    els.shapeManagerList.appendChild(createCard);

    getPresetEntries().forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'shape-manager-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', entry.type === 'system'
        ? `${entry.label}，系统预设，不能直接修改`
        : `修改${entry.label}`);

      const thumb = document.createElement('canvas');
      thumb.className = 'shape-manager-thumb';
      thumb.width = 240;
      thumb.height = 120;
      thumb.setAttribute('aria-hidden', 'true');
      renderPatternThumb(thumb, entry);

      const top = document.createElement('div');
      top.className = 'shape-manager-top';
      const name = document.createElement('span');
      name.className = 'shape-manager-name';
      name.textContent = entry.label;
      name.title = entry.label;
      const kind = document.createElement('span');
      kind.className = 'shape-manager-kind';
      kind.textContent = entry.type === 'system' ? '系统' : '自定义';
      top.append(name, kind);

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'shape-manager-copy';
      copy.textContent = '复制一份';
      copy.setAttribute('aria-label', `复制一份${entry.label}`);
      copy.addEventListener('click', (event) => {
        event.stopPropagation();
        duplicatePreset(entry);
      });

      card.append(thumb, top, copy);

      const activate = () => {
        if (entry.type === 'system') {
          showToast('系统预设不能直接修改，先“复制一份”再改');
          return;
        }
        openEditorForPreset(entry.id);
      };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });

      els.shapeManagerList.appendChild(card);
    });
  }

  function duplicatePreset(entry) {
    const nextId = getNextPresetId();
    const pattern = {
      id: nextId,
      label: makeCopyLabel(entry.label),
      width: entry.width,
      height: entry.height,
      cells: entry.cells.map(([x, y]) => [x, y])
    };

    state.customPresets.push(pattern);
    state.customPresets.sort((a, b) => a.id - b.id);
    persistCustomPresets();
    renderPresetLibrary();
    renderShapeManager();
    showToast(`已复制为${pattern.label}`);
  }

  function makeCopyLabel(label) {
    const used = new Set(state.customPresets.map((preset) => preset.label));
    const build = (suffix) => {
      const head = String(label).slice(0, Math.max(1, MAX_PRESET_LABEL - suffix.length));
      return `${head}${suffix}`;
    };

    const first = build(' 副本');
    if (!used.has(first)) return first;
    for (let index = 2; index <= 99; index += 1) {
      const candidate = build(` 副本${index}`);
      if (!used.has(candidate)) return candidate;
    }
    return build(' 副本99');
  }

  // ===== 自定义编辑器 =====
  function openEditor() {
    // 新建空白形状
    state.editorPresetId = null;
    state.editorGrid.fill(0);
    els.editorTitle.textContent = '新建形状';
    els.editorSubtitle.textContent = '点击或拖拽点亮格子，右键擦除。保存后会自动裁剪外围空白。';
    els.saveEditorButton.textContent = '保存为新预设';
    showEditor();
  }

  function openEditorForPreset(id) {
    const preset = state.customPresets.find((item) => item.id === id);
    if (!preset) return;

    state.editorPresetId = id;
    state.editorGrid.fill(0);
    // 形状坐标相对自己的左上角，放进编辑区左上角，方便继续增删格子。
    preset.cells.forEach(([x, y]) => {
      if (x >= 0 && x < EDITOR_COLS && y >= 0 && y < EDITOR_ROWS) {
        state.editorGrid[y * EDITOR_COLS + x] = 1;
      }
    });
    els.editorTitle.textContent = `修改「${preset.label}」`;
    els.editorSubtitle.textContent = '在上面继续增删格子。保存后覆盖这个形状，名称和编号保持不变。';
    els.saveEditorButton.textContent = '保存修改';
    showEditor();
  }

  function showEditor() {
    closeShapeManager();
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
    state.editorPresetId = null;
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
    const shape = {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      cells: cells.map(([x, y]) => [x - minX, y - minY])
    };

    // 从形状管理进来修改已有形状：覆盖原预设，编号和名称都不变。
    const editing = state.customPresets.find((item) => item.id === state.editorPresetId);
    if (editing) {
      editing.width = shape.width;
      editing.height = shape.height;
      editing.cells = shape.cells;
      persistCustomPresets();
      renderPresetLibrary();
      closeEditor();
      showToast(`已保存「${editing.label}」的修改`);
      return;
    }

    const nextId = getNextPresetId();
    const pattern = {
      id: nextId,
      label: `预设${nextId}`,
      width: shape.width,
      height: shape.height,
      cells: shape.cells
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
      if (els.renameModal.classList.contains('is-open')) {
        closeRenameModal();
        return;
      }
      if (els.shapeManagerModal.classList.contains('is-open')) {
        closeShapeManager();
        return;
      }
      if (els.editorModal.classList.contains('is-open')) {
        closeEditor();
        return;
      }
      if (state.presetSelectionMode) {
        exitPresetSelection(true);
        return;
      }
    }

    // 弹窗打开期间只允许编辑参数，游戏快捷键不会改变场地或播放状态。
    if (els.mutationModal.classList.contains('is-open')
      || els.renameModal.classList.contains('is-open')
      || els.shapeManagerModal.classList.contains('is-open')) return;

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
