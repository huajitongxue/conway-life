# 康威生命游戏 · Conway Life

用原生 HTML、CSS 和 JavaScript 实现的康威生命游戏。绘制细胞、拖拽图案，观察简单规则产生的复杂演化。

当前版本：**v1.2.0**，已发布到 GitHub Release。

已发布的桌面版可在 [GitHub Releases](https://github.com/huajitongxue/conway-life/releases) 下载。Electron `.exe` 为免安装程序；Tauri `setup.exe` 和 `.msi` 是两种安装程序，选择一种即可。

## 快速开始

下载仓库 ZIP 并解压，或克隆仓库：

```bash
git clone https://github.com/huajitongxue/conway-life.git
```

双击目录中的 `index.html` 即可运行；它会打开 `web/index.html`。也可以直接打开 `web/index.html`。请保持 `web/` 内的 HTML、CSS 和 JavaScript 相对位置不变。

网页无需安装依赖、构建或启动服务器，不加载外部库、字体及 CDN，支持离线使用。建议使用支持 Canvas、Pointer Events 和 ResizeObserver 的现代浏览器。

### Windows 桌面版

桌面版使用 Electron，启动后默认最大化，直接显示游戏，没有浏览器的标签页、地址栏和收藏夹栏。按 `F11` 切换全屏，按 `Esc` 退出全屏；其余操作与网页版一致。

打包产物为 `dist/Conway-Life-1.2.0-Windows-x64.exe`，适用于 Windows 10 / 11 的 x64 系统。双击即可运行，无需安装 Node.js、浏览器或其他依赖。免安装程序启动时会解压到临时目录，首次打开可能稍慢。

自定义预设保存在 `%APPDATA%\conway-life`，移动或替换 `.exe` 不会清除预设。网页版和桌面版的存储相互独立，已有浏览器预设不会自动迁移。

### Tauri Windows 安装版

项目同时提供 Tauri 2 的 Windows x64 安装版，可选择 NSIS `setup.exe` 或 MSI 安装程序，安装界面为简体中文，NSIS 默认仅为当前用户安装。Tauri 使用系统 WebView2；缺少 WebView2 时，安装程序会联网下载并安装运行时，不内置离线 WebView2 安装包。已安装 WebView2 后，游戏本身可以离线运行。

v1.2.0 的产物已作为 [v1.2.0 Release](https://github.com/huajitongxue/conway-life/releases/tag/v1.2.0) 的附件发布，本地产物位于 `dist/`：

- `Conway-Life-1.2.0-Tauri-Windows-x64-setup.exe`
- `Conway-Life-1.2.0-Tauri-Windows-x64.msi`

开始 Tauri 开发前，需要安装 Rust stable-msvc、Microsoft C++ Build Tools 和 WebView2。运行开发版：

```bash
npm ci
npm run tauri:dev
```

检查 Rust 项目：

```bash
npm run tauri:check
```

生成两种 Tauri Windows x64 安装包：

```bash
npm run tauri:build
```

原始安装包生成于 `src-tauri/target/release/bundle/nsis/` 和 `src-tauri/target/release/bundle/msi/`，交付时复制到 `dist/` 并按上述文件名区分 Electron 与 Tauri。首次构建可能需要联网下载 Rust 依赖、NSIS 和 WiX 工具。

NSIS 和 WiX 缓存放在项目的 `src-tauri/target/.tauri/` 内，避免在 C 盘重复保存打包工具。

Tauri、Electron 和浏览器共用 `web/` 目录中的游戏页面。不同运行方式的自定义预设分别保存在各自的 WebView 存储中，不会自动互相迁移。

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

后续打包好的桌面程序统一作为 GitHub Release 附件发布：Electron 免安装版和 Tauri 安装版会放在同一个 Release 中。代码仓库保留源码和构建配置，不提交 `dist/`、`node_modules/` 或本地测试文件。本次 v1.2.0 的源码已提交并推送，三个附件已随 `v1.2.0` 标签发布。

每次发布保持 `VERSION`、npm 元数据、Rust 元数据、Tauri 配置和 README 的版本号一致，重新打包后提交源码并推送对应的 `vX.Y.Z` 标签。Release 页面附上简短的更新和使用说明，说明保存在 `docs/releases/`，并上传该版本的 Electron `.exe`、Tauri `setup.exe` 和 `.msi`。

## 功能

- 固定 **120 列 × 80 行**逻辑网格，画布保持 3:2 比例并随窗口大小调整。
- 标准 **B3/S23** 规则，采用包含对角线的 8 邻域。
- 默认环绕边界，可切换有限边界；切换模式会保留现有细胞。
- 播放、暂停、单步、清空和随机填充；显示代数与存活细胞数。
- 速度范围 **1～60 步/秒**，默认 10 步/秒；支持滑块及 `+1`、`+10`、`-1`、`-10` 微调。
- 网格线开关；主场地单元格边长达到 6 像素时显示网格线。
- 系统预设：滑翔机、脉冲星、高斯帕滑翔机枪。
- **40×30** 自定义形状编辑器，支持绘制、擦除和保存时自动裁剪空白。
- 系统预设与自定义预设合并显示在右侧预设库，卡片提供缩略图、左右翻转和上下翻转。
- 预设只能拖拽到场地，放置时会追加到现有细胞；系统预设不可删除，自定义预设支持删除。
- 细胞突变可单独配置：每秒抽取数量、单个细胞突变概率以及死亡／移动比例；参数保存在本地，启用状态每次打开游戏时默认关闭。
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
| `Esc` | 关闭当前弹窗 |

绘制和拖放可以在播放过程中进行。手动绘制、预设放置和突变不会推进代数；单步或自动演化才会推进代数。清空和随机填充会将代数重置为 0。

### 预设库

系统预设和自定义预设都在右侧“预设库”中。按住卡片并拖到场地，松开后放置；预设**只支持拖拽**，单独点击不会改变场地。

拖放时显示半透明预览，并在已有细胞上追加图案，不清空场地。松开位置作为图案中心；环绕模式下越界部分从另一侧出现，有限模式下越界部分裁掉。

每张卡片右上角有左右翻转和上下翻转按钮。翻转会同步更新缩略图、拖拽预览和最终放置方向，仅在当前页面会话内有效，刷新后恢复原始方向。系统预设底部显示“系统预设”，自定义预设底部显示“删除”。

### 自定义预设

1. 点击右侧预设库标题旁的“自定义形状”。
2. 在编辑器中点击格子切换状态，或拖拽连续绘制；右键可擦除。
3. 点击“保存为新预设”，图案会裁剪空白，并出现在预设库中。
4. 拖拽卡片到场地，追加图案；点击卡片不会改变场地。
5. 点击卡片上的“删除”移除该预设，并更新本地存储。

预设命名为“预设1”“预设2”等，每次保存会使用当前最小的可用编号，例如删除“预设1”后再次保存会重新使用“预设1”。自定义预设保存在当前浏览器的 `localStorage` 中，刷新或再次打开页面可恢复；不会上传到服务器。清除浏览器存储、更换浏览器或移动网页路径可能导致无法访问原来的预设。游戏场地和播放状态不会自动保存。

### 细胞突变

点击右侧“细胞突变：关”打开独立设置。默认关闭，参数默认为每秒抽取 10 个细胞、单个细胞 10% 概率、死亡和移动各占 50%。打开设置时游戏会暂停，保存或取消后恢复打开前的播放状态。启用后，游戏播放期间每秒从当前存活细胞中抽取指定数量，并让每个被抽取的细胞按概率发生突变：按死亡／移动比例死亡，或向上、下、左、右随机移动一格。移动目标已有细胞或有限边界越界时，该次移动保持原位；环绕边界会从另一侧出现。突变不会增加代数，但会立即更新画面和存活数量。

## 游戏规则

每一代同时更新全部细胞：

- 活细胞有 2 或 3 个活邻居时存活，否则死亡。
- 死细胞恰好有 3 个活邻居时复活。
- 邻居包括上、下、左、右及四个对角线方向。

环绕边界将左右、上下连接起来；有限边界将场地外的位置视为死亡细胞。

## 目录结构

```text
conway-life/
├── index.html          # 网页兼容跳转入口
├── web/
│   ├── index.html      # 共用页面结构与入口
│   ├── css/
│   │   └── style.css   # 深色主题、布局和响应式样式
│   └── js/
│       ├── platform.js # 浏览器 / Tauri 平台适配
│       └── script.js   # 初始化、游戏规则、渲染、事件和预设管理
├── electron/
│   └── main.cjs        # 桌面入口、窗口、全屏快捷键与本地页面协议
├── src-tauri/
│   ├── src/             # Tauri Rust 入口
│   ├── capabilities/   # 最小窗口权限
│   └── tauri.conf.json  # Tauri 窗口与 Windows 安装包配置
├── assets/
│   └── icon.ico        # 程序图标
├── scripts/
│   └── create-icon.cjs # 图标生成脚本，npm run icon 可重新生成
├── docs/
│   └── releases/       # 各版本的 Release 说明
├── package.json        # Electron / Tauri 依赖与桌面脚本
├── package-lock.json   # 固定依赖版本
├── README.md           # 使用说明
├── VERSION             # 当前版本号
└── LICENSE             # MIT 开源协议
```

网页版无需打包，修改 `web/` 中的 HTML、CSS 或 JavaScript 后刷新页面即可；Electron 桌面版发布前需重新执行 `npm run dist`，Tauri 安装版执行 `npm run tauri:build`。`script.js` 按初始化、逻辑更新、画布绘制、预设管理、编辑器和 UI 事件划分。

## 开源协议

本项目采用 [MIT License](LICENSE)。
