(() => {
  'use strict';

  // 文件布局保留 UInt32 状态区；版本 1 的 cellAges 按 Conway 年龄读取。
  const MAGIC = [67, 87, 76, 82, 69, 80, 76, 0];
  const MAX_BYTES = 80 * 1024 * 1024;
  const MAX_METADATA_BYTES = 1024 * 1024;
  const VERSION = 2;
  const LEGACY_VERSION = 1;
  const operations = new Set(['initial', 'evolution', 'mutation', 'draw', 'erase', 'preset', 'clear', 'random', 'boundary', 'settings']);
  const commonFields = ['generation', 'population', 'boundary'];
  const conwayFields = ['mutationEnabled', 'mutationPreferStable', 'mutationCount', 'mutationProbability', 'mutationDeathRatio', 'mutationMoveRatio'];
  const fail = (message) => { throw new Error(message); };
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const proportion = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
  const validMode = (mode) => Boolean(globalThis.CONWAY_AUTOMATA?.modes?.[mode]);

  function validateFrame(frame, size, mode) {
    if (!frame || !operations.has(frame.operation)) fail('回放包含未知操作');
    if (!integer(frame.generation, 0, Number.MAX_SAFE_INTEGER) || !integer(frame.population, 0, size)) fail('回放的代数或细胞数无效');
    if (frame.boundary !== 'wrap' && frame.boundary !== 'finite') fail('回放边界模式无效');
    if (mode === 'conway') {
      if (typeof frame.mutationEnabled !== 'boolean' || typeof frame.mutationPreferStable !== 'boolean') fail('回放突变开关无效');
      if (!integer(frame.mutationCount, 1, 1000) || !proportion(frame.mutationProbability)
        || !proportion(frame.mutationDeathRatio) || !proportion(frame.mutationMoveRatio)
        || Math.abs(frame.mutationDeathRatio + frame.mutationMoveRatio - 1) > 1e-9) fail('回放突变参数无效');
    }
  }

  function validateStates(states, frame, mode) {
    if (!states || states.length === 0) fail('回放状态数组无效');
    let population = 0;
    for (const value of states) {
      if (!integer(value, 0, 0xffffffff)) fail('回放状态值无效');
      if (mode === 'wireworld' && value > 3) fail('电线世界回放包含未知状态');
      if (mode === 'brain' && value > 2) fail('布赖恩大脑回放包含未知状态');
      if (value > 0) population += 1;
    }
    if (population !== frame.population) fail('回放细胞数与网格不一致');
  }

  function encode(timeline, cols, rows) {
    if (!timeline?.entries?.length) fail('回放记录为空');
    const mode = timeline.entries[0].snapshot.mode || 'conway';
    if (!validMode(mode)) fail('回放模式无效');
    const size = cols * rows;
    const frames = timeline.entries.map((entry) => {
      const snapshot = entry.snapshot;
      const frame = { operation: entry.operation };
      commonFields.forEach((field) => { frame[field] = snapshot[field]; });
      if (mode === 'conway') conwayFields.forEach((field) => { frame[field] = snapshot[field]; });
      if ((snapshot.mode || 'conway') !== mode) fail('一段回放只能包含同一种模式');
      validateFrame(frame, size, mode);
      const states = snapshot.states || snapshot.cellAges;
      if (states.length !== size) fail('回放网格尺寸不匹配');
      validateStates(states, frame, mode);
      return frame;
    });
    if (frames.length > 2001 || !integer(timeline.dropped, 0, Number.MAX_SAFE_INTEGER)) fail('回放记录数量无效');

    const metadata = new TextEncoder().encode(JSON.stringify({ cols, rows, mode, dropped: timeline.dropped, frames }));
    const length = 16 + metadata.length + frames.length * size * 4;
    if (metadata.length > MAX_METADATA_BYTES || length > MAX_BYTES) fail('回放文件超出大小上限');
    const bytes = new Uint8Array(length);
    bytes.set(MAGIC);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, VERSION, true);
    view.setUint32(12, metadata.length, true);
    bytes.set(metadata, 16);
    let offset = 16 + metadata.length;
    timeline.entries.forEach((entry) => {
      const states = entry.snapshot.states || entry.snapshot.cellAges;
      for (const value of states) { view.setUint32(offset, value, true); offset += 4; }
    });
    return bytes;
  }

  function decode(input, cols, rows, maxFrames = 2001, expectedMode = null) {
    const bytes = Object.prototype.toString.call(input) === '[object ArrayBuffer]' ? new Uint8Array(input)
      : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
    if (!bytes || bytes.length < 16 || bytes.length > MAX_BYTES) fail('回放文件大小无效');
    if (MAGIC.some((value, index) => bytes[index] !== value)) fail('不是 Conway 回放文件');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(8, true);
    if (version !== LEGACY_VERSION && version !== VERSION) fail('不支持此回放格式版本');
    const metadataSize = view.getUint32(12, true);
    if (!metadataSize || metadataSize > MAX_METADATA_BYTES || 16 + metadataSize > bytes.length) fail('回放元数据长度无效');
    let metadata;
    try {
      metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(16, 16 + metadataSize)));
    } catch { fail('回放元数据损坏'); }
    if (!metadata || metadata.cols !== cols || metadata.rows !== rows) fail('回放网格尺寸与当前场地不匹配');
    const mode = version === LEGACY_VERSION ? 'conway' : metadata.mode;
    if (!validMode(mode)) fail('回放模式无效');
    if (expectedMode && mode !== expectedMode) {
      fail(`该回放属于「${globalThis.CONWAY_AUTOMATA.modes[mode].label}」，当前模式无法导入`);
    }
    if (!Array.isArray(metadata.frames) || !metadata.frames.length || metadata.frames.length > maxFrames
      || !integer(metadata.dropped, 0, Number.MAX_SAFE_INTEGER)) fail('回放记录数量无效');
    const size = cols * rows;
    if (bytes.length !== 16 + metadataSize + metadata.frames.length * size * 4) fail('回放数据不完整或包含多余内容');
    metadata.frames.forEach((frame) => validateFrame(frame, size, mode));
    let offset = 16 + metadataSize;
    const entries = metadata.frames.map((frame) => {
      const snapshot = { mode, states: new Uint32Array(size) };
      commonFields.forEach((field) => { snapshot[field] = frame[field]; });
      if (mode === 'conway') conwayFields.forEach((field) => { snapshot[field] = frame[field]; });
      let population = 0;
      for (let index = 0; index < size; index += 1) {
        const value = view.getUint32(offset, true);
        offset += 4;
        snapshot.states[index] = value;
        if (value > 0) population += 1;
      }
      if (population !== snapshot.population) fail('回放细胞数与网格不一致');
      if (mode === 'wireworld' && snapshot.states.some((value) => value > 3)) fail('电线世界回放包含未知状态');
      if (mode === 'brain' && snapshot.states.some((value) => value > 2)) fail('布赖恩大脑回放包含未知状态');
      if (mode === 'conway') Object.defineProperty(snapshot, 'cellAges', { get: () => snapshot.states, enumerable: false });
      return { operation: frame.operation, snapshot };
    });
    return { mode, dropped: metadata.dropped, entries };
  }

  globalThis.CONWAY_REPLAY = { encode, decode, MAX_BYTES, VERSION, LEGACY_VERSION };
})();
