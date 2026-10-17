(() => {
  'use strict';

  const MAX_AGE = 0xffffffff;
  const modes = Object.freeze({
    conway: Object.freeze({
      id: 'conway',
      label: '康威生命游戏',
      english: 'Game of Life',
      rule: '三个邻居就出生，两三个就活着，否则死掉',
      defaultSpeed: 10,
      populationLabel: '存活细胞',
      nextState(state, neighbors) {
        const alive = state > 0;
        const count = neighbors[1];
        const survives = alive ? count === 2 || count === 3 : count === 3;
        return survives ? Math.min(alive ? state + 1 : 1, MAX_AGE) : 0;
      }
    }),
    wireworld: Object.freeze({
      id: 'wireworld',
      label: '电线世界',
      english: 'Wireworld',
      rule: '电子头向前移动，导线旁恰有一两个电子头时被点燃',
      defaultSpeed: 4,
      populationLabel: '占用格数',
      nextState(state, neighbors) {
        if (state === 2) return 3;
        if (state === 3) return 1;
        if (state === 1 && (neighbors[2] === 1 || neighbors[2] === 2)) return 2;
        return state;
      }
    }),
    brain: Object.freeze({
      id: 'brain',
      label: '布赖恩大脑',
      english: "Brian's Brain",
      rule: '亮格变将熄，将熄变暗；恰有两个亮邻居时变亮',
      defaultSpeed: 15,
      populationLabel: '活跃格数',
      nextState(state, neighbors) {
        if (state === 1) return 2;
        if (state === 2) return 0;
        return neighbors[1] === 2 ? 1 : 0;
      }
    })
  });

  function step(source, target, cols, rows, boundary, modeId) {
    const mode = modes[modeId];
    if (!mode) throw new RangeError('未知的游戏模式');
    if (source.length !== cols * rows || target.length !== source.length) {
      throw new RangeError('状态数组尺寸不匹配');
    }

    const neighbors = new Uint8Array(4);
    let population = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        neighbors.fill(0);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            let nx = x + dx;
            let ny = y + dy;
            if (boundary === 'wrap') {
              nx = (nx + cols) % cols;
              ny = (ny + rows) % rows;
            } else if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
              continue;
            }
            const value = source[ny * cols + nx];
            const bucket = modeId === 'conway' ? (value > 0 ? 1 : 0) : value;
            if (bucket > 0 && bucket < neighbors.length) neighbors[bucket] += 1;
          }
        }
        const index = y * cols + x;
        const value = mode.nextState(source[index], neighbors);
        target[index] = value;
        if (value > 0) population += 1;
      }
    }
    return population;
  }

  function countPopulation(states) {
    let count = 0;
    for (const value of states) if (value > 0) count += 1;
    return count;
  }

  function createPreview(modeId, cols = 7, rows = 7) {
    const states = new Uint32Array(cols * rows);
    const put = (x, y, value = 1) => { states[y * cols + x] = value; };
    if (modeId === 'conway') {
      [[2, 1], [3, 2], [1, 3], [2, 3], [3, 3]].forEach(([x, y]) => put(x, y));
    } else if (modeId === 'wireworld') {
      for (let x = 1; x <= 5; x += 1) { put(x, 1); put(x, 5); }
      for (let y = 2; y <= 4; y += 1) { put(1, y); put(5, y); }
      put(3, 1, 2);
      put(2, 1, 3);
    } else if (modeId === 'brain') {
      put(Math.floor(cols / 2), Math.floor(rows / 2));
      put(Math.floor(cols / 2) + 1, Math.floor(rows / 2));
    }
    return states;
  }

  globalThis.CONWAY_AUTOMATA = Object.freeze({ modes, step, countPopulation, createPreview, MAX_AGE });
})();
