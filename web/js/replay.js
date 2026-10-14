(() => {
  'use strict';

  // 文件：8 字节标识、Uint32 版本、Uint32 元数据字节数、UTF-8 JSON、逐帧小端 Uint32 年龄。
  const MAGIC = [67, 87, 76, 82, 69, 80, 76, 0];
  const MAX_BYTES = 80 * 1024 * 1024;
  const MAX_METADATA_BYTES = 1024 * 1024;
  const VERSION = 1;
  const operations = new Set(['initial', 'evolution', 'mutation', 'draw', 'erase', 'preset', 'clear', 'random', 'boundary', 'settings']);
  const fail = (message) => { throw new Error(message); };
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const proportion = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

  function validateFrame(frame, size) {
    if (!frame || !operations.has(frame.operation)) fail('回放包含未知操作');
    if (!integer(frame.generation, 0, Number.MAX_SAFE_INTEGER) || !integer(frame.population, 0, size)) fail('回放的代数或细胞数无效');
    if (frame.boundary !== 'wrap' && frame.boundary !== 'finite') fail('回放边界模式无效');
    if (typeof frame.mutationEnabled !== 'boolean' || typeof frame.mutationPreferStable !== 'boolean') fail('回放突变开关无效');
    if (!integer(frame.mutationCount, 1, 1000) || !proportion(frame.mutationProbability)
      || !proportion(frame.mutationDeathRatio) || !proportion(frame.mutationMoveRatio)
      || Math.abs(frame.mutationDeathRatio + frame.mutationMoveRatio - 1) > 1e-9) fail('回放突变参数无效');
  }

  function encode(timeline, cols, rows) {
    const size = cols * rows;
    const frames = timeline.entries.map((entry) => {
      const frame = { operation: entry.operation };
      globalThis.CONWAY_HISTORY.fields.forEach((field) => { frame[field] = entry.snapshot[field]; });
      validateFrame(frame, size);
      if (entry.snapshot.cellAges.length !== size) fail('回放网格尺寸不匹配');
      let population = 0;
      for (const age of entry.snapshot.cellAges) {
        if (!integer(age, 0, 0xffffffff)) fail('回放细胞年龄无效');
        if (age) population++;
      }
      if (population !== frame.population) fail('回放细胞数与网格不一致');
      return frame;
    });
    if (!frames.length || frames.length > 2001 || !integer(timeline.dropped, 0, Number.MAX_SAFE_INTEGER)) fail('回放记录数量无效');
    const metadata = new TextEncoder().encode(JSON.stringify({ cols, rows, dropped: timeline.dropped, frames }));
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
      for (const age of entry.snapshot.cellAges) { view.setUint32(offset, age, true); offset += 4; }
    });
    return bytes;
  }

  function decode(input, cols, rows, maxFrames = 2001) {
    const bytes = Object.prototype.toString.call(input) === '[object ArrayBuffer]' ? new Uint8Array(input)
      : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
    if (!bytes || bytes.length < 16 || bytes.length > MAX_BYTES) fail('回放文件大小无效');
    if (MAGIC.some((value, index) => bytes[index] !== value)) fail('不是 Conway 回放文件');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8, true) !== VERSION) fail('不支持此回放格式版本');
    const metadataSize = view.getUint32(12, true);
    if (!metadataSize || metadataSize > MAX_METADATA_BYTES || 16 + metadataSize > bytes.length) fail('回放元数据长度无效');
    let metadata;
    try {
      metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(16, 16 + metadataSize)));
    } catch { fail('回放元数据损坏'); }
    if (!metadata || metadata.cols !== cols || metadata.rows !== rows) fail('回放网格尺寸与当前场地不匹配');
    if (!Array.isArray(metadata.frames) || !metadata.frames.length || metadata.frames.length > maxFrames
      || !integer(metadata.dropped, 0, Number.MAX_SAFE_INTEGER)) fail('回放记录数量无效');
    const size = cols * rows;
    if (bytes.length !== 16 + metadataSize + metadata.frames.length * size * 4) fail('回放数据不完整或包含多余内容');
    metadata.frames.forEach((frame) => validateFrame(frame, size));
    let offset = 16 + metadataSize;
    const entries = metadata.frames.map((frame) => {
      const snapshot = { cellAges: new Uint32Array(size) };
      globalThis.CONWAY_HISTORY.fields.forEach((field) => { snapshot[field] = frame[field]; });
      let population = 0;
      for (let index = 0; index < size; index++) {
        const age = view.getUint32(offset, true);
        offset += 4;
        snapshot.cellAges[index] = age;
        if (age) population++;
      }
      if (population !== snapshot.population) fail('回放细胞数与网格不一致');
      return { operation: frame.operation, snapshot };
    });
    return { dropped: metadata.dropped, entries };
  }

  globalThis.CONWAY_REPLAY = { encode, decode, MAX_BYTES, VERSION };
})();
