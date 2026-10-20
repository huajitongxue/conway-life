(() => {
  'use strict';

  // 历史保存当前模式的状态；显示、播放速度和预设库不随历史变化。
  const fields = [
    'generation', 'population', 'boundary', 'mutationEnabled', 'mutationPreferStable',
    'mutationCount', 'mutationProbability', 'mutationDeathRatio', 'mutationMoveRatio'
  ];
  const commonFields = fields.slice(0, 3);
  const conwayFields = fields.slice(3);

  function addConwayAgeAlias(snapshot) {
    if (snapshot.mode === 'conway') {
      Object.defineProperty(snapshot, 'cellAges', { get: () => snapshot.states, enumerable: false });
    }
    return snapshot;
  }

  function copySnapshot(snapshot) {
    const mode = snapshot.mode || 'conway';
    const states = snapshot.states || snapshot.cellAges;
    if (!states || typeof states.slice !== 'function') throw new TypeError('历史状态数组无效');
    const copy = { mode, states: states.slice() };
    commonFields.forEach((field) => { copy[field] = snapshot[field]; });
    if (mode === 'conway') conwayFields.forEach((field) => { copy[field] = snapshot[field]; });
    return addConwayAgeAlias(copy);
  }

  function sameSnapshot(left, right) {
    if ((left.mode || 'conway') !== (right.mode || 'conway')) return false;
    const mode = left.mode || 'conway';
    const comparedFields = mode === 'conway' ? fields : commonFields;
    if (comparedFields.some((field) => left[field] !== right[field])) return false;
    const leftStates = left.states || left.cellAges;
    const rightStates = right.states || right.cellAges;
    if (leftStates.length !== rightStates.length) return false;
    for (let index = 0; index < leftStates.length; index += 1) {
      if (leftStates[index] !== rightStates[index]) return false;
    }
    return true;
  }

  function create(maxChanges = 2000) {
    if (!Number.isInteger(maxChanges) || maxChanges < 1) throw new RangeError('历史容量必须为正整数');
    const capacity = maxChanges + 1;
    const entries = new Array(capacity);
    let head = 0;
    let length = 0;
    let cursor = -1;
    let dropped = 0;
    const entryAt = (position) => entries[(head + position) % capacity];

    // 关闭记录时释放所有快照引用，不能用单帧重置替代清空。
    function clear() {
      entries.fill(undefined);
      head = 0;
      length = 0;
      cursor = -1;
      dropped = 0;
    }

    function reset(snapshot) {
      entries.fill(undefined);
      head = 0;
      length = 1;
      cursor = 0;
      dropped = 0;
      entries[0] = { snapshot: copySnapshot(snapshot), operation: 'initial' };
    }

    function append(snapshot, operation) {
      if (!length) { reset(snapshot); return false; }
      // 无变化时不截断未来；真正编辑时才释放后续记录。
      if (sameSnapshot(entryAt(cursor).snapshot, snapshot)) return false;
      for (let index = cursor + 1; index < length; index += 1) {
        entries[(head + index) % capacity] = undefined;
      }
      length = cursor + 1;
      if (length === capacity) {
        entries[head] = undefined;
        head = (head + 1) % capacity;
        length -= 1;
        dropped += 1;
      }
      entries[(head + length) % capacity] = { snapshot: copySnapshot(snapshot), operation };
      length += 1;
      cursor = length - 1;
      return true;
    }

    function move(direction) {
      const target = cursor + direction;
      if (!length || target < 0 || target >= length) return null;
      cursor = target;
      // 返回副本，调用方恢复或修改状态时不能污染历史。
      return copySnapshot(entryAt(cursor).snapshot);
    }

    function status() {
      return {
        length, cursor, capacity, dropped,
        backward: Math.max(0, cursor),
        forward: Math.max(0, length - 1 - cursor),
        operation: length ? entryAt(cursor).operation : 'initial'
      };
    }

    function exportTimeline() {
      return {
        dropped,
        entries: Array.from({ length }, (_, index) => {
          const entry = entryAt(index);
          return { operation: entry.operation, snapshot: copySnapshot(entry.snapshot) };
        })
      };
    }

    function replaceTimeline(timeline) {
      if (!timeline.entries.length || timeline.entries.length > capacity) throw new RangeError('回放记录数超出容量');
      // 先完成副本准备，失败时保持旧历史；调用方先用编解码模块验证数据。
      const prepared = timeline.entries.map((entry) => ({
        operation: entry.operation, snapshot: copySnapshot(entry.snapshot)
      }));
      if (prepared.some((entry) => entry.snapshot.mode !== prepared[0].snapshot.mode)) {
        throw new TypeError('一段历史记录只能包含同一种模式');
      }
      entries.fill(undefined);
      head = 0;
      length = prepared.length;
      cursor = 0;
      dropped = timeline.dropped;
      prepared.forEach((entry, index) => { entries[index] = entry; });
      return copySnapshot(entries[0].snapshot);
    }

    return { clear, reset, append, backward: () => move(-1), forward: () => move(1), status, exportTimeline, replaceTimeline };
  }

  globalThis.CONWAY_HISTORY = {
    create,
    fields: Object.freeze(fields),
    commonFields: Object.freeze(commonFields),
    conwayFields: Object.freeze(conwayFields)
  };
})();
