(() => {
      'use strict';

      // ===== 常量与基础状态 =====
      const COLS = 120;
      const ROWS = 80;
      const EDITOR_COLS = 40;
      const EDITOR_ROWS = 30;
      const STORAGE_KEY = 'conway-life-custom-presets-v1';
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
        gameView: { width: 0, height: 0, dpr: 1 },
        editorView: { width: 0, height: 0, dpr: 1 },
        drawing: null,
        editorDrawing: null,
        editorGrid: new Uint8Array(EDITOR_COLS * EDITOR_ROWS),
        customPresets: [],
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
        topPlayButton: document.getElementById('topPlayButton'),
        stepButton: document.getElementById('stepButton'),
        clearButton: document.getElementById('clearButton'),
        randomButton: document.getElementById('randomButton'),
        boundaryButton: document.getElementById('boundaryButton'),
        gridButton: document.getElementById('gridButton'),
        systemToggle: document.getElementById('systemToggle'),
        systemMenu: document.getElementById('systemMenu'),
        openEditorButton: document.getElementById('openEditorButton'),
        editorModal: document.getElementById('editorModal'),
        closeEditorButton: document.getElementById('closeEditorButton'),
        cancelEditorButton: document.getElementById('cancelEditorButton'),
        clearEditorButton: document.getElementById('clearEditorButton'),
        saveEditorButton: document.getElementById('saveEditorButton'),
        presetLibrary: document.getElementById('presetLibrary'),
        toast: document.getElementById('toast')
      };

      // ===== 系统预设 =====
      const SYSTEM_PRESETS = {
        glider: makePattern('滑翔机', [
          '010',
          '001',
          '111'
        ]),
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

      // ===== 初始化 =====
      function init() {
        loadCustomPresets();
        bindEvents();
        resizeCanvases();
        renderPresetLibrary();
        updateStats();
        draw();
        drawEditor();
      }

      function bindEvents() {
        window.addEventListener('resize', resizeCanvases);
        // 监听实际可用区域，预设数量或布局变化也会触发画布适配。
        if (typeof ResizeObserver !== 'undefined') {
          const observer = new ResizeObserver(resizeCanvases);
          observer.observe(stageColumn);
          observer.observe(editorCanvas.parentElement);
        }
        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('pointerdown', handleDocumentPointerDown);

        els.playButton.addEventListener('click', toggleRunning);
        els.topPlayButton.addEventListener('click', toggleRunning);
        els.stepButton.addEventListener('click', () => {
          if (state.running) stopRunning();
          step();
        });
        els.clearButton.addEventListener('click', () => clearBoard(true));
        els.randomButton.addEventListener('click', randomize);
        els.boundaryButton.addEventListener('click', toggleBoundary);
        els.gridButton.addEventListener('click', toggleGrid);
        els.speedRange.addEventListener('input', () => {
          setSpeed(Number(els.speedRange.value));
        });
        document.querySelectorAll('[data-speed-delta]').forEach((button) => {
          button.addEventListener('click', () => {
            setSpeed(state.speed + Number(button.dataset.speedDelta));
          });
        });

        els.systemToggle.addEventListener('click', (event) => {
          event.stopPropagation();
          const isOpen = els.systemMenu.classList.toggle('is-open');
          els.systemToggle.setAttribute('aria-expanded', String(isOpen));
        });

        els.systemMenu.querySelectorAll('[data-preset-key]').forEach((button) => {
          const pattern = SYSTEM_PRESETS[button.dataset.presetKey];
          if (pattern) bindPresetPointer(button, pattern, { clickToCenter: false });
        });

        els.openEditorButton.addEventListener('click', openEditor);
        els.closeEditorButton.addEventListener('click', closeEditor);
        els.cancelEditorButton.addEventListener('click', closeEditor);
        els.editorModal.addEventListener('click', (event) => {
          if (event.target === els.editorModal) closeEditor();
        });
        els.clearEditorButton.addEventListener('click', clearEditor);
        els.saveEditorButton.addEventListener('click', saveEditorPreset);

        bindGameCanvasEvents();
        bindEditorCanvasEvents();
      }

      function handleDocumentPointerDown(event) {
        if (!event.target.closest('.topbar-side')) closeSystemMenu();
      }

      function closeSystemMenu() {
        els.systemMenu.classList.remove('is-open');
        els.systemToggle.setAttribute('aria-expanded', 'false');
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
        updatePlayButtons();
      }

      function stopRunning() {
        state.running = false;
        if (state.timerId !== null) {
          window.clearInterval(state.timerId);
          state.timerId = null;
        }
        updatePlayButtons();
      }

      function restartTimer() {
        if (state.timerId !== null) window.clearInterval(state.timerId);
        state.timerId = window.setInterval(step, 1000 / state.speed);
      }

      function updatePlayButtons() {
        const label = state.running ? 'Ⅱ 暂停' : '▶ 播放';
        els.playButton.textContent = label;
        els.topPlayButton.textContent = label;
        els.topPlayButton.classList.toggle('is-running', state.running);
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

      // ===== 主画布绘制与鼠标操作 =====
      function bindGameCanvasEvents() {
        gameCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
        gameCanvas.addEventListener('pointerdown', (event) => {
          if (event.button !== 0 && event.button !== 2) return;
          event.preventDefault();
          const cell = canvasToCell(gameCanvas, event.clientX, event.clientY, state.gameView);
          if (!cell) return;
          state.drawing = { pointerId: event.pointerId, value: event.button === 2 ? 0 : 1 };
          gameCanvas.setPointerCapture?.(event.pointerId);
          setCell(cell.x, cell.y, state.drawing.value);
        });
        gameCanvas.addEventListener('pointermove', (event) => {
          if (!state.drawing || event.pointerId !== state.drawing.pointerId) return;
          const cell = canvasToCell(gameCanvas, event.clientX, event.clientY, state.gameView);
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

      function canvasToCell(canvas, clientX, clientY, view) {
        const rect = canvas.getBoundingClientRect();
        if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
        const x = Math.floor(((clientX - rect.left) / rect.width) * (canvas === gameCanvas ? COLS : EDITOR_COLS));
        const y = Math.floor(((clientY - rect.top) / rect.height) * (canvas === gameCanvas ? ROWS : EDITOR_ROWS));
        return { x, y };
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

        for (let y = 0; y < ROWS; y += 1) {
          for (let x = 0; x < COLS; x += 1) {
            if (!state.grid[y * COLS + x]) continue;
            gameCtx.fillStyle = '#54f1d2';
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

      // ===== 预设放置 =====
      function loadPatternCentered(pattern) {
        clearBoard(true);
        placePattern(pattern, Math.floor(COLS / 2), Math.floor(ROWS / 2), false);
        state.population = countPopulation(state.grid);
        updateStats();
        draw();
        showToast(`已加载${pattern.label}`);
      }

      function placePattern(pattern, anchorX, anchorY, clearFirst) {
        if (clearFirst) clearBoard(true);
        const cells = getPlacementCells(pattern, anchorX, anchorY);
        cells.forEach(({ x, y }) => {
          const index = y * COLS + x;
          state.grid[index] = 1;
        });
        state.nextGrid.fill(0);
        state.population = countPopulation(state.grid);
        updateStats();
        draw();
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

      function bindPresetPointer(card, pattern, options = {}) {
        const clickToCenter = options.clickToCenter !== false;
        card.addEventListener('pointerdown', (event) => {
          if (event.target.closest('.delete-preset')) return;
          if (event.button !== 0) return;
          event.preventDefault();

          const pointerId = event.pointerId;
          const startX = event.clientX;
          const startY = event.clientY;
          let dragging = false;
          card.setPointerCapture?.(pointerId);

          const move = (moveEvent) => {
            if (moveEvent.pointerId !== pointerId) return;
            const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
            if (!dragging && distance > 5) dragging = true;
            if (!dragging) return;
            state.presetDrag = { pattern };
            const cell = canvasToCell(gameCanvas, moveEvent.clientX, moveEvent.clientY, state.gameView);
            state.preview = cell ? { pattern, anchor: cell } : null;
            draw();
          };

          const up = (upEvent) => {
            if (upEvent.pointerId !== pointerId) return;
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.removeEventListener('pointercancel', up);
            if (card.hasPointerCapture?.(pointerId)) card.releasePointerCapture(pointerId);

            const cell = canvasToCell(gameCanvas, upEvent.clientX, upEvent.clientY, state.gameView);
            if (upEvent.type === 'pointercancel') {
              // 触摸手势取消时只移除预览，不放置图案。
            } else if (dragging && cell) {
              placePattern(pattern, cell.x, cell.y, false);
              showToast(`已放置${pattern.label}`);
            } else if (!dragging && clickToCenter) {
              loadPatternCentered(pattern);
            } else if (!dragging && !clickToCenter) {
              showToast('系统预设只能拖拽到场地');
            }

            if (card.closest('#systemMenu')) closeSystemMenu();

            state.presetDrag = null;
            state.preview = null;
            draw();
          };

          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
          document.addEventListener('pointercancel', up);
        });
      }

      // ===== 自定义预设持久化与缩略图 =====
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
          }));
        } catch (error) {
          state.customPresets = [];
        }
      }

      function isValidPreset(preset) {
        return preset && Number.isInteger(Number(preset.id)) && Number(preset.width) > 0 && Number(preset.height) > 0 &&
          Number(preset.width) <= COLS && Number(preset.height) <= ROWS && Array.isArray(preset.cells) &&
          preset.cells.length > 0 && preset.cells.every((cell) => Array.isArray(cell) && cell.length === 2 &&
            Number.isInteger(Number(cell[0])) && Number.isInteger(Number(cell[1])) && Number(cell[0]) >= 0 && Number(cell[0]) < Number(preset.width) && Number(cell[1]) >= 0 && Number(cell[1]) < Number(preset.height));
      }

      function persistCustomPresets() {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.customPresets));
        } catch (error) {
          showToast('浏览器无法保存预设，请检查存储权限');
        }
      }

      function renderPresetLibrary() {
        els.presetLibrary.replaceChildren();
        els.presetLibrary.scrollTop = 0;
        if (!state.customPresets.length) {
          const empty = document.createElement('div');
          empty.className = 'empty-library';
          empty.textContent = '还没有自定义预设，点击右上角“自定义形状”开始绘制。';
          els.presetLibrary.appendChild(empty);
          return;
        }

        state.customPresets.forEach((pattern) => {
          const card = document.createElement('article');
          card.className = 'preset-card';
          card.setAttribute('aria-label', `${pattern.label}，点击居中放置，拖拽到场地`);

          const thumb = document.createElement('canvas');
          thumb.className = 'preset-thumb';
          thumb.width = 240;
          thumb.height = 120;
          thumb.setAttribute('aria-hidden', 'true');
          renderPatternThumb(thumb, pattern);

          const footer = document.createElement('div');
          footer.className = 'preset-card-footer';
          const name = document.createElement('span');
          name.className = 'preset-name';
          name.textContent = pattern.label;
          const deleteButton = document.createElement('button');
          deleteButton.className = 'delete-preset';
          deleteButton.type = 'button';
          deleteButton.textContent = '删除';
          deleteButton.setAttribute('aria-label', `删除${pattern.label}`);
          deleteButton.addEventListener('pointerdown', (event) => event.stopPropagation());
          deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            deletePreset(pattern.id);
          });
          footer.append(name, deleteButton);
          card.append(thumb, footer);
          bindPresetPointer(card, pattern);
          els.presetLibrary.appendChild(card);
        });
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
        pattern.cells.forEach(([x, y]) => ctx.fillRect(startX + x * cell + 0.8, startY + y * cell + 0.8, Math.max(1, cell - 1.6), Math.max(1, cell - 1.6)));
      }

      function deletePreset(id) {
        const preset = state.customPresets.find((item) => item.id === id);
        state.customPresets = state.customPresets.filter((item) => item.id !== id);
        persistCustomPresets();
        renderPresetLibrary();
        if (preset) showToast(`已删除${preset.label}`);
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
          const cell = canvasToCell(editorCanvas, event.clientX, event.clientY, state.editorView);
          if (!cell) return;
          const index = cell.y * EDITOR_COLS + cell.x;
          state.editorDrawing = { pointerId: event.pointerId, value: event.button === 2 ? 0 : state.editorGrid[index] ? 0 : 1 };
          editorCanvas.setPointerCapture?.(event.pointerId);
          setEditorCell(cell.x, cell.y, state.editorDrawing.value);
        });
        editorCanvas.addEventListener('pointermove', (event) => {
          if (!state.editorDrawing || event.pointerId !== state.editorDrawing.pointerId) return;
          const cell = canvasToCell(editorCanvas, event.clientX, event.clientY, state.editorView);
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

        for (let y = 0; y < EDITOR_ROWS; y += 1) {
          for (let x = 0; x < EDITOR_COLS; x += 1) {
            if (!state.editorGrid[y * EDITOR_COLS + x]) continue;
            editorCtx.fillStyle = '#54f1d2';
            editorCtx.fillRect(x * cellWidth + 1, y * cellHeight + 1, Math.max(1, cellWidth - 2), Math.max(1, cellHeight - 2));
          }
        }

        editorCtx.beginPath();
        editorCtx.strokeStyle = 'rgba(130, 211, 215, 0.16)';
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
        const nextId = state.customPresets.reduce((max, preset) => Math.max(max, preset.id), 0) + 1;
        const pattern = {
          id: nextId,
          label: `预设${nextId}`,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          cells: cells.map(([x, y]) => [x - minX, y - minY])
        };

        state.customPresets.push(pattern);
        persistCustomPresets();
        renderPresetLibrary();
        // 只滚动预设列表，保存的最新图案可见，地图和控制栏保持原位。
        els.presetLibrary.scrollTop = els.presetLibrary.scrollHeight;
        closeEditor();
        showToast(`已保存${pattern.label}`);
      }

      // ===== 画布适配与键盘 =====
      function resizeCanvases() {
        // 同时受宽、高限制，保持 120:80 比例，始终显示完整地图。
        const scale = Math.min(stageColumn.clientWidth / COLS, stageColumn.clientHeight / ROWS);
        gameStage.style.width = `${COLS * scale}px`;
        gameStage.style.height = `${ROWS * scale}px`;
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
        } else if (event.key === 'Escape' && els.editorModal.classList.contains('is-open')) {
          closeEditor();
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
