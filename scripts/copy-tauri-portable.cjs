'use strict';

// 本地自用：把 tauri build --no-bundle 产出的裸 exe 复制到 dist/，方便直接双击运行。
// 正式发布由 GitHub Actions 完成（见 .github/workflows/build.yml），本脚本只服务本机试玩。
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const source = path.join(root, 'src-tauri', 'target', 'release', 'conway-life.exe');

if (!fs.existsSync(source)) {
  console.error(`没有找到 ${source}`);
  console.error('请先完成构建：npm run tauri:portable');
  process.exit(1);
}

const distDir = path.join(root, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const target = path.join(distDir, `Conway-Life-${version}-Tauri-Windows-x64-portable.exe`);

// Windows 上刚构建完的 exe 常被实时防护短暂占用，覆盖写入会报 EBUSY/EPERM，这里重试几次。
function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function replaceFile(from, to, attempts = 6) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // 先删掉旧文件再复制，避免个别环境下覆盖写入被拒绝。
      if (fs.existsSync(to)) fs.unlinkSync(to);
      fs.copyFileSync(from, to);
      return;
    } catch (error) {
      lastError = error;
      sleep(400);
    }
  }
  throw lastError;
}

replaceFile(source, target);

const megabytes = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
console.log('');
console.log(`已就绪：${version}｜${megabytes} MB｜双击即可运行`);
console.log(target);
console.log('（这是本地构建的版本，和 GitHub Release 上的附件逐字节不同，做校验请以 Release 上的 SHA256SUMS 为准）');
console.log('');
