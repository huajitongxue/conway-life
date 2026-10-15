'use strict';

// 按版本号决定打包哪些 Tauri 安装格式。
//
// MSI（WiX）要求预发布标识必须是纯数字且不超过 65535，所以 `1.6.0-beta` 这类版本
// 打不出 MSI，只能用 NSIS。正式版（无预发布后缀）或 `1.6.0-1` 这类纯数字后缀不受影响。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();

const dashIndex = version.indexOf('-');
const prerelease = dashIndex === -1 ? '' : version.slice(dashIndex + 1);
const msiSupported = prerelease === '' || /^[0-9]+$/.test(prerelease);
const bundles = msiSupported ? 'nsis,msi' : 'nsis';

if (!msiSupported) {
  console.log(`版本 ${version} 的预发布标识「${prerelease}」不是纯数字，MSI（WiX）不支持，本次只打包 NSIS。`);
}
console.log(`tauri build --bundles ${bundles} --ci`);

const result = spawnSync('tauri', ['build', '--bundles', bundles, '--ci'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
