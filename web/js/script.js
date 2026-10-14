(() => {
  'use strict';

  // ===== 常量与基础状态 =====
  const COLS = 120;
  const ROWS = 80;
  const EDITOR_COLS = 80;
  const EDITOR_ROWS = 50;
  // 用屏幕像素区分单击与整体拖动，避免鼠标轻微抖动误触发移动。
  const EDITOR_DRAG_THRESHOLD = 4;
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
  const history = globalThis.CONWAY_HISTORY.create(2000);

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
    playDirection: 'forward',
    reverseReadonly: false,
    replayIoBusy: false,
    replayIoKind: null,
    replayIoId: 0,
    replayReading: false,
    replayResume: null,
    pendingReplay: null,
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
    mutationResumeDirection: 'forward',
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
    historyNavigationId: 0,
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
    backButton: document.getElementById('backButton'),
    reverseButton: document.getElementById('reverseButton'),
    exitReverseButton: document.getElementById('exitReverseButton'),
    exportReplayButton: document.getElementById('exportReplayButton'),
    importReplayButton: document.getElementById('importReplayButton'),
    importReplayInput: document.getElementById('importReplayInput'),
    replayConfirmModal: document.getElementById('replayConfirmModal'),
    replayConfirmMessage: document.getElementById('replayConfirmMessage'),
    confirmReplayButton: document.getElementById('confirmReplayButton'),
    cancelReplayButton: document.getElementById('cancelReplayButton'),
    historyPosition: document.getElementById('historyPosition'),
    historyCounts: document.getElementById('historyCounts'),
    historyMode: document.getElementById('historyMode'),
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
    mutationFields: document.getElementById('mutationFields'),
    mutationLockHelp: document.getElementById('mutationLockHelp'),
    showKeysSetting: document.getElementById('showKeysSetting'),
    showStageHintSetting: document.getElementById('showStageHintSetting'),
    coordinatesSetting: document.getElementById('coordinatesSetting'),
    keyHelp: document.getElementById('keyHelp'),
    stageHint: document.getElementById('stageHint'),
    coordinateValue: document.getElementById('coordinateValue'),
    magnifierPanel: document.getElementById('magnifierPanel'),
    magnifierCanvas: document.getElementById('magnifierCanvas'),
    magnifierEmpty: document.getElementById('magnifierEmpty'),
    closeMagnifierButton: document.getElementById('closeMagnifierButton'),
    magnificationRange: document.getElementById('magnificationRange'),
    magnificationValue: document.getElementById('magnificationValue'),
    zoomInButton: document.getElementById('zoomInButton'),
    zoomOutButton: document.getElementById('zoomOutButton'),
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

  const viewTools = globalThis.CONWAY_VIEW.create({ canvas: gameCanvas, cols: COLS, rows: ROWS,
    els, blocked: modalOpen, showToast });

  function modalOpen() {
    return state.replayIoBusy || [els.mutationModal, els.renameModal, els.shapeManagerModal, els.editorModal,
      els.replayConfirmModal].some((modal) => modal.classList.contains('is-open'));
  }

  function boardLocked() {
    return state.reverseReadonly || state.replayIoBusy;
  }

  // ===== 回放文件 =====
  function beginReplayIo(kind) {
    finishGameDrawing(false);
    ensureHistory();
    state.replayResume = { running: state.running, direction: state.playDirection };
    stopRunning();
    state.replayIoBusy = true;
    state.replayIoKind = kind;
    state.replayIoId += 1;
    state.replayReading = false;
    state.historyNavigationId += 1;
    state.preview = null;
    viewTools.clearKeys();
    updatePlayButtons();
    draw();
  }

  function finishReplayIo(resume) {
    const previous = state.replayResume;
    state.replayIoBusy = false;
    state.replayIoKind = null;
    state.replayIoId += 1;
    state.replayReading = false;
    state.replayResume = null;
    state.pendingReplay = null;
    els.replayConfirmModal.classList.remove('is-open');
    updatePlayButtons();
    viewTools.scheduleDraw();
    if (resume && previous?.running) startRunning(previous.direction);
  }

  async function exportReplay() {
    if (state.replayIoBusy) return;
    beginReplayIo('export');
    try {
      const bytes = globalThis.CONWAY_REPLAY.encode(history.exportTimeline(), COLS, ROWS);
      const name = 'conway-life-replay-' + dateStamp(new Date()) + '-' + Date.now() + '.conway-replay';
      if (canSaveWithDialog()) {
        const path = await globalThis.__TAURI__.core.invoke('export_replay_file', bytes, {
          headers: { 'x-conway-filename': name }
        });
        showToast(path ? '已保存到 ' + path : '已取消导出');
      } else {
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast('已导出回放文件');
      }
    } catch (error) {
      showToast('回放导出失败：' + (error?.message || String(error)));
    } finally {
      finishReplayIo(true);
    }
  }

  function chooseReplayFile() {
    if (boardLocked()) return;
    beginReplayIo('import');
    try { els.importReplayInput.click(); }
    catch (error) { showToast('无法选择回放文件'); finishReplayIo(true); }
  }

  async function importReplayFile(file) {
    if (state.reverseReadonly || (state.replayIoBusy && state.replayIoKind !== 'import')) return;
    if (state.replayReading || state.pendingReplay) return;
    if (!file) { if (state.replayIoKind === 'import') finishReplayIo(true); return; }
    if (!state.replayIoBusy) beginReplayIo('import');
    const operationId = state.replayIoId;
    state.replayReading = true;
    try {
      if (file.size > globalThis.CONWAY_REPLAY.MAX_BYTES) throw new Error('回放文件超过 80 MiB');
      const bytes = await file.arrayBuffer();
      if (operationId !== state.replayIoId || state.replayIoKind !== 'import') return;
      state.pendingReplay = globalThis.CONWAY_REPLAY.decode(bytes, COLS, ROWS, history.status().capacity);
      state.replayReading = false;
      els.replayConfirmMessage.textContent = '将用 ' + state.pendingReplay.entries.length
        + ' 条记录替换当前场地和历史，导入后暂停在最早记录。预设库和永久设置保持不变。';
      els.replayConfirmModal.classList.add('is-open');
      els.cancelReplayButton.focus();
    } catch (error) {
      if (operationId !== state.replayIoId) return;
      showToast('回放导入失败：' + (error?.message || String(error)));
      finishReplayIo(true);
    }
  }

  function cancelReplayImport() {
    if (state.replayIoKind !== 'import') return;
    finishReplayIo(true);
  }

  function confirmReplayImport() {
    if (state.replayIoKind !== 'import' || !state.pendingReplay) return;
    try {
      const first = history.replaceTimeline(state.pendingReplay);
      restoreHistory(first);
      finishReplayIo(false);
      showToast('已导入回放，暂停在最早记录');
    } catch (error) {
      showToast('回放导入失败：' + (error?.message || String(error)));
      finishReplayIo(true);
    }
  }

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
    viewTools.loadPreferences();
    ensureHistory();
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
    viewTools.bind();
    window.addEventListener('blur', () => finishGameDrawing(false));

    els.playButton.addEventListener('click', toggleRunning);
    els.stepButton.addEventListener('click', forwardOne);
    els.backButton.addEventListener('click', backwardOne);
    els.reverseButton.addEventListener('click', toggleReverse);
    els.exitReverseButton.addEventListener('click', exitReverse);
    els.exportReplayButton.addEventListener('click', exportReplay);
    els.importReplayButton.addEventListener('click', chooseReplayFile);
    els.importReplayInput.addEventListener('change', () => {
      const file = els.importReplayInput.files?.[0] || null;
      els.importReplayInput.value = '';
      importReplayFile(file);
    });
    els.importReplayInput.addEventListener('cancel', cancelReplayImport);
    els.cancelReplayButton.addEventListener('click', cancelReplayImport);
    els.confirmReplayButton.addEventListener('click', confirmReplayImport);
    els.replayConfirmModal.addEventListener('click', (event) => {
      if (event.target === els.replayConfirmModal) cancelReplayImport();
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

  // ===== 历史记录与导航 =====
  function snapshotState() {
    const snapshot = { cellAges: state.cellAges };
    globalThis.CONWAY_HISTORY.fields.forEach((field) => { snapshot[field] = state[field]; });
    return snapshot;
  }

  function ensureHistory() {
    if (!history.status().length) history.reset(snapshotState());
  }

  function recordHistory(operation) {
    if (boardLocked()) return false;
    const hadFuture = history.status().forward > 0;
    const changed = history.append(snapshotState(), operation);
    // 从历史中编辑出新分支后，正放立即转为实时演化。
    if (changed && hadFuture) {
      state.historyNavigationId += 1;
      state.preview = null;
      restartMutationTimer();
    }
    updatePlayButtons();
    return changed;
  }

  function restoreHistory(snapshot) {
    if (!snapshot) return false;
    state.cellAges.set(snapshot.cellAges);
    globalThis.CONWAY_HISTORY.fields.forEach((field) => { state[field] = snapshot[field]; });
    for (let index = 0; index < state.grid.length; index += 1) {
      state.grid[index] = state.cellAges[index] > 0 ? 1 : 0;
    }
    state.nextGrid.fill(0);
    state.historyNavigationId += 1;
    state.preview = null;
    state.presetDrag = null;
    updateStats();
    updateMutationButton();
    draw();
    return true;
  }

  function backwardOne() {
    if (state.replayIoBusy) return;
    finishGameDrawing(false);
    stopRunning();
    ensureHistory();
    restoreHistory(history.backward());
  }

  function forwardOne() {
    if (state.replayIoBusy) return;
    finishGameDrawing(false);
    stopRunning();
    step();
  }

  function toggleReverse() {
    if (state.replayIoBusy) return;
    finishGameDrawing(false);
    if (state.running && state.playDirection === 'reverse') stopRunning();
    else startRunning('reverse');
  }

  function exitReverse() {
    if (state.replayIoBusy) return;
    stopRunning();
    state.reverseReadonly = false;
    state.historyNavigationId += 1;
    state.preview = null;
    state.presetDrag = null;
    updatePlayButtons();
    draw();
  }

  function playbackTick() {
    if (!state.running || state.drawing) return;
    if (state.playDirection === 'reverse') {
      restoreHistory(history.backward());
      if (!history.status().backward) stopRunning();
    } else {
      step();
    }
  }

  function prepareBoardEdit() {
    if (boardLocked()) return false;
    finishGameDrawing(false);
    ensureHistory();
    return true;
  }

  // ===== 游戏逻辑 =====
  function step() {
    if (state.replayIoBusy) return;
    finishGameDrawing(false);
    ensureHistory();
    if (history.status().forward) {
      restoreHistory(history.forward());
      if (state.running && !history.status().forward) restartMutationTimer();
      return;
    }
    if (state.reverseReadonly) return;
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
    recordHistory('evolution');
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
    if (state.replayIoBusy) return;
    finishGameDrawing(false);
    if (state.running) stopRunning();
    else startRunning(state.reverseReadonly ? 'reverse' : 'forward');
  }

  function startRunning(direction = 'forward') {
    if (state.replayIoBusy) return;
    finishGameDrawing(false);
    ensureHistory();
    if (direction === 'reverse') {
      state.reverseReadonly = true;
      state.historyNavigationId += 1;
      state.preview = null;
      state.presetDrag = null;
      draw();
    }
    if (state.reverseReadonly) direction = 'reverse';
    if (direction === 'reverse' && !history.status().backward) { stopRunning(); return; }
    state.playDirection = direction;
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
    state.timerId = null;
    if (!state.running) return;
    const timerId = window.setInterval(() => {
      if (state.timerId === timerId) playbackTick();
    }, 1000 / state.speed);
    state.timerId = timerId;
  }

  function restartMutationTimer() {
    if (state.mutationTimerId !== null) window.clearInterval(state.mutationTimerId);
    state.mutationTimerId = null;
    if (!boardLocked() && state.running && state.playDirection === 'forward' && !history.status().forward && state.mutationEnabled) {
      const timerId = window.setInterval(() => {
        if (state.mutationTimerId === timerId) applyMutations();
      }, 1000);
      state.mutationTimerId = timerId;
    }
  }

  function updatePlayButtons() {
    const isRunning = state.running;
    els.playButton.textContent = isRunning ? 'Ⅱ 暂停' : state.reverseReadonly ? '◀ 继续倒放' : '▶ 播放';
    els.playButton.classList.toggle('is-running', isRunning);
    els.playButton.classList.toggle('is-paused', !isRunning);
    const position = history.status();
    const reversing = isRunning && state.playDirection === 'reverse';
    els.backButton.disabled = position.backward === 0;
    els.reverseButton.disabled = position.backward === 0 && !reversing;
    els.reverseButton.textContent = reversing ? 'Ⅱ 停止倒放' : '◀ 倒放';
    els.reverseButton.classList.toggle('is-active', reversing);
    els.reverseButton.setAttribute('aria-pressed', String(reversing));
    els.exitReverseButton.hidden = !state.reverseReadonly;
    els.clearButton.disabled = boardLocked();
    els.randomButton.disabled = boardLocked();
    els.boundaryButton.disabled = boardLocked();
    els.stepButton.disabled = state.replayIoBusy || (state.reverseReadonly && !position.forward);
    els.importReplayButton.disabled = boardLocked();
    els.exportReplayButton.disabled = state.replayIoBusy;
    els.playButton.disabled = state.replayIoBusy || (state.reverseReadonly && !isRunning && !position.backward);
    els.backButton.disabled = state.replayIoBusy || !position.backward;
    els.reverseButton.disabled = state.replayIoBusy || (!position.backward && !reversing);
    els.exitReverseButton.disabled = state.replayIoBusy;
    els.historyPosition.textContent = `历史位置 ${Math.max(0, position.cursor)} / ${Math.max(0, position.length - 1)}`;
    els.historyCounts.textContent = `可倒退 ${position.backward} · 可前进 ${position.forward}`;
    const mode = state.drawing ? '绘制中' : !isRunning ? '暂停'
      : reversing ? '倒放中' : position.forward ? '历史重播' : '演化中';
    const operations = { initial: '起点', evolution: '演化', mutation: '突变', draw: '绘制',
      erase: '擦除', preset: '预设放置', clear: '清空', random: '随机', boundary: '边界切换', settings: '突变设置' };
    els.historyMode.textContent = (state.reverseReadonly ? '倒放只读 · ' : '') + (state.replayIoBusy ? '文件处理中 · ' : '') + mode
      + ' · ' + (operations[position.operation] || '历史状态') + (position.dropped ? ' · 早期记录已淘汰' : '');
  }

  function setSpeed(value) {
    state.speed = Math.max(1, Math.min(60, Math.round(value)));
    els.speedRange.value = String(state.speed);
    els.speedValue.textContent = `${state.speed} 步/秒`;
    if (state.running) restartTimer();
  }

  function clearBoard(resetGeneration) {
    if (!prepareBoardEdit()) return;
    state.grid.fill(0);
    state.nextGrid.fill(0);
    state.cellAges.fill(0);
    state.population = 0;
    if (resetGeneration) state.generation = 0;
    state.preview = null;
    recordHistory('clear');
    updateStats();
    draw();
  }

  function randomize() {
    if (!prepareBoardEdit()) return;
    if (state.running) stopRunning();
    for (let i = 0; i < state.grid.length; i += 1) {
      state.grid[i] = Math.random() < RANDOM_DENSITY ? 1 : 0;
      state.cellAges[i] = state.grid[i];
    }
    state.nextGrid.fill(0);
    state.generation = 0;
    state.population = countPopulation(state.grid);
    recordHistory('random');
    updateStats();
    draw();
  }

  function toggleBoundary() {
    if (!prepareBoardEdit()) return;
    state.boundary = state.boundary === 'wrap' ? 'finite' : 'wrap';
    recordHistory('boundary');
    updateStats();
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
    els.boundaryButton.textContent = `边界：${state.boundary === 'wrap' ? '环绕' : '有限'}`;
    els.boundaryButton.classList.toggle('is-active', state.boundary === 'wrap');
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
    els.mutationButton.textContent = '设置';
    els.mutationButton.title = '细胞突变：' + (state.mutationEnabled ? '开' : '关');
    els.mutationButton.classList.toggle('is-active', state.mutationEnabled);
  }

  function openMutationSettings() {
    if (state.replayIoBusy) return;
    if (els.mutationModal.classList.contains('is-open')) return;
    finishGameDrawing(false);
    ensureHistory();
    state.mutationResumeRunning = state.running;
    state.mutationResumeDirection = state.playDirection;
    if (state.running) stopRunning();
    viewTools.clearKeys();
    const preferences = viewTools.preferences;
    els.showKeysSetting.checked = preferences.showKeys;
    els.showStageHintSetting.checked = preferences.showStageHint;
    els.coordinatesSetting.checked = preferences.coordinates;
    els.mutationFields.disabled = state.reverseReadonly;
    els.mutationLockHelp.hidden = !state.reverseReadonly;
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
    const direction = state.mutationResumeDirection;
    state.mutationResumeRunning = false;
    els.mutationButton.focus();
    if (shouldResume) startRunning(direction);
  }

  function cancelMutationSettings() {
    closeMutationSettings(true);
  }

  function saveMutationSettings() {
    if (state.replayIoBusy) return;
    viewTools.savePreferences({ ...viewTools.preferences, showKeys: els.showKeysSetting.checked,
      showStageHint: els.showStageHintSetting.checked, coordinates: els.coordinatesSetting.checked });
    ensureHistory();
    const before = globalThis.CONWAY_HISTORY.fields
      .filter((field) => field.startsWith('mutation'))
      .map((field) => state[field]);
    if (!state.reverseReadonly) {
      state.mutationCount = clampInt(els.mutationCount.value, 1, 1000, 10);
      state.mutationProbability = clamp(Number(els.mutationProbability.value) / 100, 0, 1, 0.1);
      const movePercent = clampInt(els.mutationRatioRange.value, 0, 100, 50);
      state.mutationDeathRatio = (100 - movePercent) / 100;
      state.mutationMoveRatio = movePercent / 100;
      state.mutationPreferStable = els.mutationPreferStable.checked;
      state.mutationEnabled = els.mutationEnabled.checked;
      const changed = globalThis.CONWAY_HISTORY.fields
        .filter((field) => field.startsWith('mutation'))
        .some((field, index) => state[field] !== before[index]);
      if (changed) {
        recordHistory('settings');
        persistMutationSettings();
      }
    }
    updateMutationButton();
    restartMutationTimer();
    closeMutationSettings(true);
    showToast('设置已保存');
  }

  function applyMutations() {
    if (boardLocked()) return;
    if (!state.running || state.playDirection !== 'forward' || history.status().forward
      || state.drawing || !state.mutationEnabled || state.population === 0) return;
    ensureHistory();
    let changed = false;

    const candidates = selectMutationCells();
    for (const sourceIndex of candidates) {
      if (!state.grid[sourceIndex] || Math.random() >= state.mutationProbability) continue;
      if (Math.random() < state.mutationDeathRatio) {
        state.grid[sourceIndex] = 0;
        state.cellAges[sourceIndex] = 0;
        changed = true;
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
      changed = true;
    }

    if (!changed) return;
    state.nextGrid.fill(0);
    state.population = countPopulation(state.grid);
    recordHistory('mutation');
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
  function finishGameDrawing(resumeRunning) {
    const drawing = state.drawing;
    if (!drawing) return;
    state.drawing = null;
    if (gameCanvas.hasPointerCapture?.(drawing.pointerId)) gameCanvas.releasePointerCapture(drawing.pointerId);
    recordHistory(drawing.value ? 'draw' : 'erase');
    if (resumeRunning && drawing.resumeForward) startRunning();
  }

  function bindGameCanvasEvents() {
    gameCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
    gameCanvas.addEventListener('pointerdown', (event) => {
      if (boardLocked()) return;
      if (state.drawing || (event.button !== 0 && event.button !== 2)) return;
      event.preventDefault();
      const cell = canvasToCell(gameCanvas, event.clientX, event.clientY);
      if (!cell) return;
      ensureHistory();
      const resumeForward = state.running && state.playDirection === 'forward';
      stopRunning();
      state.drawing = { pointerId: event.pointerId, value: event.button === 2 ? 0 : 1, resumeForward };
      gameCanvas.setPointerCapture?.(event.pointerId);
      updatePlayButtons();
      setCell(cell.x, cell.y, state.drawing.value);
    });
    gameCanvas.addEventListener('pointermove', (event) => {
      if (boardLocked()) return;
      if (!state.drawing || event.pointerId !== state.drawing.pointerId) return;
      const cell = canvasToCell(gameCanvas, event.clientX, event.clientY);
      if (cell) setCell(cell.x, cell.y, state.drawing.value);
    });
    const finishDrawing = (event) => {
      if (!state.drawing || event.pointerId !== state.drawing.pointerId) return;
      const cell = canvasToCell(gameCanvas, event.clientX, event.clientY);
      if (cell) setCell(cell.x, cell.y, state.drawing.value);
      finishGameDrawing(true);
    };
    gameCanvas.addEventListener('pointerup', finishDrawing);
    const cancelDrawing = (event) => {
      if (state.drawing && event.pointerId === state.drawing.pointerId) finishGameDrawing(false);
    };
    gameCanvas.addEventListener('pointercancel', cancelDrawing);
    gameCanvas.addEventListener('lostpointercapture', cancelDrawing);
    gameCanvas.addEventListener('pointerleave', (event) => {
      if (state.drawing && event.pointerId === state.drawing.pointerId && !gameCanvas.hasPointerCapture?.(event.pointerId)) finishGameDrawing(false);
    });
  }

  function setCell(x, y, value) {
    if (boardLocked()) return;
    const index = y * COLS + x;
    if (state.grid[index] === value) return;
    if (!state.drawing) prepareBoardEdit();
    state.grid[index] = value;
    state.cellAges[index] = value ? 1 : 0;
    state.population += value ? 1 : -1;
    state.nextGrid[index] = 0;
    if (!state.drawing) recordHistory(value ? 'draw' : 'erase');
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
    viewTools.scheduleDraw();
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
      if (boardLocked()) return;
      if (event.target.closest('button')) return;
      if (event.button !== 0) return;
      event.preventDefault();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const pattern = getTransformedPattern(entry);
      const navigationId = state.historyNavigationId;
      let dragging = false;
      card.setPointerCapture?.(pointerId);

      const move = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        if (navigationId !== state.historyNavigationId) return;
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
        // 回看已经换了场地，旧拖拽不能再往恢复后的状态放置。
        const sameScene = navigationId === state.historyNavigationId;
        if (!boardLocked() && sameScene && finishEvent.type === 'pointerup' && dragging && cell) {
          placePattern(pattern, cell.x, cell.y, false);
          showToast(`已放置${pattern.label}`);
        } else if (sameScene && finishEvent.type === 'pointerup' && !dragging) {
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
    if (!prepareBoardEdit()) return;
    if (clearFirst) {
      // 清空并放置属于同一次操作，不能产生中间的空白历史。
      state.grid.fill(0);
      state.cellAges.fill(0);
      state.generation = 0;
    }
    const cells = getPlacementCells(pattern, anchorX, anchorY);
    cells.forEach(({ x, y }) => {
      const index = y * COLS + x;
      if (!state.grid[index]) state.cellAges[index] = 1;
      state.grid[index] = 1;
    });
    state.nextGrid.fill(0);
    state.population = countPopulation(state.grid);
    recordHistory('preset');
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
      name.title = entry.label;
      const kind = document.createElement('span');
      kind.className = 'preset-kind';
      kind.textContent = entry.type === 'system' ? '系统' : '自定义';

      const transformControls = document.createElement('div');
      transformControls.className = 'preset-transform-controls';
      transformControls.append(
        makeTransformButton('左右翻转', '↔', entry, 'flipX'),
        makeTransformButton('上下翻转', '↕', entry, 'flipY')
      );

      const footer = document.createElement('div');
      footer.className = 'preset-card-footer';
      footer.append(name);
      if (entry.type === 'system') {
        const systemLabel = document.createElement('span');
        systemLabel.className = 'preset-system-label';
        systemLabel.textContent = '系统预设';
        cardTop.append(systemLabel);
      } else {
        cardTop.append(kind);
        cardTop.append(
          makePresetTextButton('rename-preset', '改名', `重命名${entry.label}`, () => openRenameModal(entry.id)),
          makePresetTextButton('delete-preset', '删除', `删除${entry.label}`, () => deletePreset(entry.id))
        );
      }
      cardTop.append(transformControls);

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
        card.append(cardTop, thumb, footer);
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
    viewTools.clearKeys();
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

    const finish = () => exitPresetSelection(false);

    // 桌面版走原生“另存为”对话框：WebView 自己的下载既不弹窗也不提示，用户找不到文件。
    // 这条路径的提示由 savePresetsWithDialog 给出实际落盘路径，这里不再覆盖。
    if (canSaveWithDialog()) {
      savePresetsWithDialog(entries).then((saved) => {
        if (saved) finish();
      });
      return;
    }

    if (!downloadPresetFile(entries)) return;
    finish();
    showToast(`已导出 ${entries.length} 个形状`);
  }

  function presetFileName() {
    return `conway-life-presets-${dateStamp(new Date())}.json`;
  }

  function buildPresetPayload(entries) {
    return JSON.stringify({
      type: PRESET_FILE_TYPE,
      version: PRESET_FILE_VERSION,
      exportedAt: new Date().toISOString(),
      presets: entries.map((entry) => ({
        label: entry.label,
        width: entry.width,
        height: entry.height,
        cells: entry.cells.map(([x, y]) => [x, y])
      }))
    }, null, 2);
  }

  function canSaveWithDialog() {
    // Tauri 桌面版开了 withGlobalTauri，能直接调用 Rust 侧命令。
    return Boolean(globalThis.__TAURI__?.core?.invoke);
  }

  function savePresetsWithDialog(entries) {
    return globalThis.__TAURI__.core
      .invoke('export_presets_file', {
        fileName: presetFileName(),
        contents: buildPresetPayload(entries)
      })
      .then((savedPath) => {
        if (!savedPath) {
          showToast('已取消导出');
          return false;
        }
        showToast(`已保存到 ${savedPath}`);
        return true;
      })
      .catch((error) => {
        const detail = error && error.message ? error.message : String(error);
        showToast(`导出失败：${detail}`);
        return false;
      });
  }

  function downloadPresetFile(entries) {
    if (typeof Blob !== 'function' || typeof URL.createObjectURL !== 'function') {
      showToast('当前环境不支持导出文件');
      return false;
    }

    const blob = new Blob([buildPresetPayload(entries)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = presetFileName();
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
    viewTools.clearKeys();
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
    els.editorSubtitle.textContent = '点击或拖拽点亮格子，右键擦除；修改已有形状时可从空白处拖动整体。保存后会自动裁剪外围空白。';
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
    els.editorSubtitle.textContent = '单击格子增删细胞，右键擦除；从空白处拖动可移动整体。保存后覆盖这个形状，名称和编号保持不变。';
    els.saveEditorButton.textContent = '保存修改';
    showEditor();
  }

  function showEditor() {
    viewTools.clearKeys();
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
    state.editorDrawing = null;
    els.editorModal.classList.remove('is-open');
    state.editorPresetId = null;
  }

  function clearEditor() {
    state.editorDrawing = null;
    state.editorGrid.fill(0);
    drawEditor();
  }

  function bindEditorCanvasEvents() {
    const updateMove = (event, cell) => {
      const drawing = state.editorDrawing;
      if (drawing.mode === 'pending-move') {
        const distance = Math.hypot(event.clientX - drawing.startX, event.clientY - drawing.startY);
        if (distance < EDITOR_DRAG_THRESHOLD) return;
        drawing.mode = 'move';
      }
      if (cell) {
        moveEditorShape(cell.x - drawing.startCell.x, cell.y - drawing.startCell.y, drawing.sourceGrid);
      }
    };
    editorCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
    editorCanvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      const cell = canvasToCell(editorCanvas, event.clientX, event.clientY);
      if (!cell) return;
      const index = cell.y * EDITOR_COLS + cell.x;
      const canMoveShape = event.button === 0 && state.editorPresetId !== null && state.editorGrid[index] === 0;
      // 空白格先等待手势结束：单击新增细胞，超过阈值后才整体移动。
      state.editorDrawing = canMoveShape
        ? {
          pointerId: event.pointerId,
          mode: 'pending-move',
          startCell: cell,
          startX: event.clientX,
          startY: event.clientY,
          sourceGrid: state.editorGrid.slice()
        }
        : {
          pointerId: event.pointerId,
          mode: event.button === 2 ? 'erase' : 'draw',
          value: event.button === 2 ? 0 : state.editorGrid[index] ? 0 : 1
        };
      editorCanvas.setPointerCapture?.(event.pointerId);
      if (state.editorDrawing.mode !== 'pending-move') setEditorCell(cell.x, cell.y, state.editorDrawing.value);
    });
    editorCanvas.addEventListener('pointermove', (event) => {
      if (!state.editorDrawing || event.pointerId !== state.editorDrawing.pointerId) return;
      const cell = canvasToCell(editorCanvas, event.clientX, event.clientY);
      if (state.editorDrawing.mode === 'pending-move' || state.editorDrawing.mode === 'move') {
        updateMove(event, cell);
      } else if (cell) {
        setEditorCell(cell.x, cell.y, state.editorDrawing.value);
      }
    });
    const finish = (event, cancelled = false) => {
      const drawing = state.editorDrawing;
      if (!drawing || event.pointerId !== drawing.pointerId) return;
      if (!cancelled && (drawing.mode === 'pending-move' || drawing.mode === 'move')) {
        const cell = canvasToCell(editorCanvas, event.clientX, event.clientY);
        // 松开时也核对位移，兼容中间没有收到 pointermove 的情况。
        updateMove(event, cell);
        if (drawing.mode === 'pending-move' && cell) setEditorCell(drawing.startCell.x, drawing.startCell.y, 1);
      }
      state.editorDrawing = null;
    };
    editorCanvas.addEventListener('pointerup', finish);
    const cancel = (event) => finish(event, true);
    editorCanvas.addEventListener('pointercancel', cancel);
    editorCanvas.addEventListener('lostpointercapture', cancel);
  }

  function setEditorCell(x, y, value) {
    state.editorGrid[y * EDITOR_COLS + x] = value;
    drawEditor();
  }

  function moveEditorShape(deltaX, deltaY, sourceGrid) {
    const cells = [];
    for (let y = 0; y < EDITOR_ROWS; y += 1) {
      for (let x = 0; x < EDITOR_COLS; x += 1) {
        if (sourceGrid[y * EDITOR_COLS + x]) cells.push([x, y]);
      }
    }
    if (!cells.length) return;

    const minX = Math.min(...cells.map(([x]) => x));
    const maxX = Math.max(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const boundedX = Math.max(-minX, Math.min(EDITOR_COLS - 1 - maxX, deltaX));
    const boundedY = Math.max(-minY, Math.min(EDITOR_ROWS - 1 - maxY, deltaY));

    state.editorGrid.fill(0);
    cells.forEach(([x, y]) => {
      state.editorGrid[(y + boundedY) * EDITOR_COLS + x + boundedX] = 1;
    });
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
    if (event.key === 'Escape' && els.replayConfirmModal.classList.contains('is-open')) {
      cancelReplayImport(); return;
    }
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
    if (modalOpen()) return;

    const tag = event.target?.tagName;
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
    if (isEditable) return;
    if (viewTools.handleKeydown(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) toggleRunning();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      backwardOne();
    } else if (key === 'n' || event.key === 'ArrowRight') {
      event.preventDefault();
      forwardOne();
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
