'use strict';

const { app, BrowserWindow, dialog, Menu, net, protocol, screen, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'conway';
const APP_URL = `${APP_SCHEME}://app/index.html`;
const WINDOW_TITLE = '康威生命游戏 · F11 全屏';
let mainWindow = null;

// 固定页面来源，让便携程序解压路径变化时仍能读取原来的自定义预设。
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true } }
]);

function registerLocalPages() {
  const pages = new Map([
    ['/index.html', 'index.html'],
    ['/css/style.css', 'css/style.css'],
    ['/js/script.js', 'js/script.js']
  ]);

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const relativePath = pages.get(url.pathname);
    if (url.host !== 'app' || !relativePath || request.method !== 'GET') {
      return new Response('Not found', { status: 404 });
    }

    const fileUrl = pathToFileURL(path.join(app.getAppPath(), relativePath));
    const response = await net.fetch(fileUrl.href);
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'"
    ].join('; '));
    return new Response(response.body, { status: response.status, headers });
  });
}

function bindWindowEvents(window) {
  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  window.on('page-title-updated', (event) => event.preventDefault());

  // 主窗口只承载本地游戏，不给页面 Node.js 或系统权限。
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      if (!input.isAutoRepeat) window.setFullScreen(!window.isFullScreen());
    } else if (input.key === 'Escape' && window.isFullScreen()) {
      // 不拦截 Esc，游戏中的编辑器也能按原来的方式关闭。
      window.setFullScreen(false);
    }
  });
}

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    title: WINDOW_TITLE,
    width: Math.min(1280, width),
    height: Math.min(900, height),
    minWidth: Math.min(800, width),
    minHeight: Math.min(560, height),
    show: false,
    backgroundColor: '#071017',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  mainWindow = window;
  bindWindowEvents(window);
  await window.loadURL(APP_URL);
}

// 在获取实例锁前固定数据目录，开发版和打包版也使用同一份存储。
const dataDirectory = path.join(app.getPath('appData'), 'conway-life');
fs.mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', dataDirectory);

// 同一用户只打开一个实例，重复启动时回到已经打开的游戏。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerLocalPages();
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch(showStartupError);
      }
    });
  }).catch(showStartupError);
}

function showStartupError(error) {
  dialog.showErrorBox('康威生命游戏启动失败', error.message);
  app.quit();
}
