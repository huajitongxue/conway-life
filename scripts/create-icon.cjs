'use strict';

// 用原生 Node.js 生成多尺寸 ICO：深色底板与青色滑翔机，无需图像工具依赖。
const fs = require('node:fs');
const path = require('node:path');

const sizes = [16, 24, 32, 48, 64, 128, 256];
const cells = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
const background = [7, 16, 23];
const accent = [84, 241, 210];

function inRoundedRect(x, y, left, top, width, height, radius) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const nearestX = Math.max(left + radius, Math.min(left + width - radius, x));
  const nearestY = Math.max(top + radius, Math.min(top + height - radius, y));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function sampleColor(x, y) {
  if (!inRoundedRect(x, y, 0.025, 0.025, 0.95, 0.95, 0.18)) return [0, 0, 0, 0];
  for (const [column, row] of cells) {
    const left = 0.19 + column * 0.215;
    const top = 0.19 + row * 0.215;
    if (inRoundedRect(x, y, left, top, 0.19, 0.19, 0.025)) return [...accent, 255];
  }
  return [...background, 255];
}

function makeBitmap(size) {
  const maskStride = Math.ceil(size / 32) * 4;
  const bitmap = Buffer.alloc(40 + size * size * 4 + maskStride * size);
  bitmap.writeUInt32LE(40, 0);
  bitmap.writeInt32LE(size, 4);
  bitmap.writeInt32LE(size * 2, 8);
  bitmap.writeUInt16LE(1, 12);
  bitmap.writeUInt16LE(32, 14);
  bitmap.writeUInt32LE(size * size * 4, 20);

  // 4×4 子像素采样，让小尺寸图标的边缘平滑。
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          const color = sampleColor((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          for (let channel = 0; channel < 3; channel += 1) {
            sum[channel] += color[channel] * color[3] / 255;
          }
          sum[3] += color[3];
        }
      }
      const offset = 40 + ((size - 1 - y) * size + x) * 4;
      const alpha = Math.round(sum[3] / 16);
      bitmap[offset] = alpha ? Math.round(sum[2] * 255 / sum[3]) : 0;
      bitmap[offset + 1] = alpha ? Math.round(sum[1] * 255 / sum[3]) : 0;
      bitmap[offset + 2] = alpha ? Math.round(sum[0] * 255 / sum[3]) : 0;
      bitmap[offset + 3] = alpha;
      if (!alpha) {
        const maskOffset = 40 + size * size * 4 + (size - 1 - y) * maskStride + (x >> 3);
        bitmap[maskOffset] |= 0x80 >> (x & 7);
      }
    }
  }
  return bitmap;
}

const bitmaps = sizes.map(makeBitmap);
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  directory[entry] = size === 256 ? 0 : size;
  directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(bitmaps[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += bitmaps[index].length;
});

const outputPath = path.join(__dirname, '..', 'assets', 'icon.ico');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat([directory, ...bitmaps]));
console.log('已生成 assets/icon.ico');
