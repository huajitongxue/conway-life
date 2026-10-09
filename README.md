# 康威生命游戏 · Conway Life

用原生 HTML、CSS 和 JavaScript 实现的康威生命游戏。绘制细胞、拖拽图案，观察简单规则产生的复杂演化。

当前版本：**v1.1.0**。

桌面版请前往 [GitHub Releases](https://github.com/huajitongxue/conway-life/releases) 下载 `.exe` 附件，双击即可运行。

## 快速开始

下载仓库 ZIP 并解压，或克隆仓库：

```bash
git clone https://github.com/huajitongxue/conway-life.git
```

双击目录中的 `index.html` 即可运行。请保持 `index.html`、`css/` 和 `js/` 的相对位置。

网页无需安装依赖、构建或启动服务器，不加载外部库、字体及 CDN，支持离线使用。建议使用支持 Canvas、Pointer Events 和 ResizeObserver 的现代浏览器。

### Windows 桌面版

桌面版使用 Electron，启动后默认最大化，直接显示游戏，没有浏览器的标签页、地址栏和收藏夹栏。按 `F11` 切换全屏，按 `Esc` 退出全屏；其余操作与网页版一致。

打包产物为 `dist/Conway-Life-1.1.0-Windows-x64.exe`，适用于 Windows 10 / 11 的 x64 系统。双击即可运行，无需安装 Node.js、浏览器或其他依赖。免安装程序启动时会解压到临时目录，首次打开可能稍慢。

自定义预设保存在 `%APPDATA%\conway-life`，移动或替换 `.exe` 不会清除预设。网页版和桌面版的存储相互独立，已有浏览器预设不会自动迁移。

### 桌面版开发与打包

在本项目目录中安装依赖，需要 Node.js 22.12 或更新版本：

```bash
npm ci
npm start
```

生成 Windows x64 免安装程序：

```bash
npm run dist
```

仅生成解压后的程序目录（`dist/win-unpacked/`）：

```bash
npm run pack
```

首次安装与打包需要联网下载 Electron 和打包工具；生成的桌面程序可以完全离线运行。构建产物和 `node_modules/` 不提交到代码仓库，依赖版本由 `package-lock.json` 固定。打包命令不会自动发布到 GitHub。

如果下载 Electron 时连接 GitHub 超时，可在当前 PowerShell 窗口临时设置镜像后再打包；文件校验保持开启：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '{{ version }}'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run dist
```

这些设置只影响当前终端及其子进程，不会修改系统环境变量；开发时首次运行 `npm start` 下载超时也可使用同一组设置。

### 发布约定

后续打包好的桌面程序统一作为 GitHub Release 附件发布，代码仓库保留源码和构建配置，不提交 `dist/`、`node_modules/` 或本地测试文件。

每次发布保持 `VERSION`、`package.json`、`package-lock.json` 和 README 的版本号一致，重新打包后提交源码并推送对应的 `vX.Y.Z` 标签。Release 页面附上简短的更新和使用说明，说明保存在 `docs/releases/`，并上传该版本的 `.exe`。

## 功能

- 固定 **120 列 × 80 行**逻辑网格，画布保持 3:2 比例并随窗口大小调整。
- 标准 **B3/S23** 规则，采用包含对角线的 8 邻域。
- 默认环绕边界，可切换有限边界；切换模式会保留现有细胞。
- 播放、暂停、单步、清空和随机填充；显示代数与存活细胞数。
- 速度范围 **1～60 步/秒**，默认 10 步/秒；支持滑块及 `+1`、`+10`、`-1`、`-10` 微调。
- 网格线开关；主场地单元格边长达到 6 像素时显示网格线。
- 系统预设：滑翔机、脉冲星、高斯帕滑翔机枪。
- **40×30** 自定义形状编辑器，支持绘制、擦除和保存时自动裁剪空白。
- 自定义预设包含名称、缩略图、拖放和删除功能，保存到浏览器本地存储。
- 深色主题；桌面端完整地图与控制面板同屏，预设列表独立滚动，窄屏采用上下布局。

## 操作

| 操作 | 功能 |
| --- | --- |
| 鼠标左键点击或拖拽主场地 | 绘制活细胞 |
| 鼠标右键点击或拖拽主场地 | 擦除细胞，阻止右键菜单 |
| `Space` | 播放 / 暂停 |
| `N` | 单步执行；正在播放时先暂停 |
| `R` | 暂停并随机填充，默认密度为 22% |
| `C` | 清空场地 |
| `Esc` | 关闭自定义编辑器 |

绘制和拖放可以在播放过程中进行。手动绘制不会推进代数；单步或自动演化才会推进代数。清空、随机填充或点击加载自定义预设会将代数重置为 0。

### 系统预设

点击左上角“系统预设”展开列表，按住图案并拖到场地，松开后放置。系统预设**只支持拖拽**；单独点击不会改变场地。

拖放时显示半透明预览，并在已有细胞上追加图案，不清空场地。松开位置作为图案中心；环绕模式下越界部分从另一侧出现，有限模式下越界部分裁掉。

### 自定义预设

1. 点击右上角“自定义形状”。
2. 在编辑器中点击格子切换状态，或拖拽连续绘制；右键可擦除。
3. 点击“保存为新预设”，图案会裁剪空白，并出现在“我的预设”列表中。
4. 拖拽卡片到场地，追加图案；点击卡片则**清空场地并在中央加载该图案**。
5. 点击卡片上的“删除”移除该预设，并更新本地存储。

预设命名为“预设1”“预设2”等。自定义预设保存在当前浏览器的 `localStorage` 中，刷新或再次打开页面可恢复；不会上传到服务器。清除浏览器存储、更换浏览器或移动网页路径可能导致无法访问原来的预设。游戏场地和播放状态不会自动保存。

## 游戏规则

每一代同时更新全部细胞：

- 活细胞有 2 或 3 个活邻居时存活，否则死亡。
- 死细胞恰好有 3 个活邻居时复活。
- 邻居包括上、下、左、右及四个对角线方向。

环绕边界将左右、上下连接起来；有限边界将场地外的位置视为死亡细胞。

## 目录结构

```text
conway-life/
├── index.html          # 页面结构与入口
├── css/
│   └── style.css       # 深色主题、布局和响应式样式
├── js/
│   └── script.js       # 初始化、游戏规则、渲染、事件和预设管理
├── electron/
│   └── main.cjs        # 桌面入口、窗口、全屏快捷键与本地页面协议
├── assets/
│   └── icon.ico        # 程序图标
├── scripts/
│   └── create-icon.cjs # 图标生成脚本，npm run icon 可重新生成
├── docs/
│   └── releases/       # 各版本的 Release 说明
├── package.json        # Electron 依赖与 Windows 打包配置
├── package-lock.json   # 固定依赖版本
├── README.md           # 使用说明
├── VERSION             # 当前版本号
└── LICENSE             # MIT 开源协议
```

网页版无需打包，修改 HTML、CSS 或 JavaScript 后刷新页面即可；桌面版发布前需重新执行 `npm run dist`。`script.js` 按初始化、逻辑更新、画布绘制、预设管理、编辑器和 UI 事件划分。

## 开源协议

本项目采用 [MIT License](LICENSE)。
