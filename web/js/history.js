(() => {
  'use strict';

  // 历史只保存影响演化的状态。界面显示、播放速度和预设库不随历史变化。
  const fields = [
    'generation', 'population', 'boundary', 'mutationEnabled', 'mutationPreferStable',
    'mutationCount', 'mutationProbability', 'mutationDeathRatio', 'mutationMoveRatio'
  ];

  function copySnapshot(snapshot) {
    const copy = { cellAges: snapshot.cellAges.slice() };
    fields.forEach((field) => { copy[field] = snapshot[field]; });
    return copy;
  }

  function sameSnapshot(left, right) {
    if (fields.some((field) => left[field] !== right[field])) return false;
    if (left.cellAges.length !== right.cellAges.length) return false;
    for (let index = 0; index < left.cellAges.length; index += 1) {
      if (left.cellAges[index] !== right.cellAges[index]) return false;
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
      entries.fill(undefined);
      head = 0;
      length = prepared.length;
      cursor = 0;
      dropped = timeline.dropped;
      prepared.forEach((entry, index) => { entries[index] = entry; });
      return copySnapshot(entries[0].snapshot);
    }

    return { reset, append, backward: () => move(-1), forward: () => move(1), status, exportTimeline, replaceTimeline };
  }

  globalThis.CONWAY_HISTORY = { create, fields: Object.freeze(fields) };
})();
