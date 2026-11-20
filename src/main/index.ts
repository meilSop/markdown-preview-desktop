import { app, BrowserWindow, shell } from "electron";
import { join } from "path";
import { registerIpcHandlers } from "./ipc";
import { readSettings } from "./services/settings";
import { stopAll } from "./services/watcher";
import { IpcChannel } from "@shared/types";

// 外链统一交系统浏览器打开（预览区 linkify 会渲染真实 <a>，点击不允许劫持应用窗口）
function openExternalIfHttp(url: string): void {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // V2 需求 13 + V3 需求 18：无边框窗口隐藏系统标题栏（不再显示 icon + 应用名），
    // 窗口控制按钮改由渲染层 TitleBar 自绘（titleBarOverlay 在本机同步失效，已移除）
    frame: false,
    titleBarStyle: "hidden",
    title: "Markdown Preview", // 任务栏 / 窗口管理器仍需标题标识
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  // 导航守卫：渲染层发起的导航只放行应用自身页面（dev 的 vite 地址 / 生产的 file://），
  // 其余（预览区点击外部链接）转系统浏览器；window.open 一律拒绝
  const devUrl = process.env["ELECTRON_RENDERER_URL"] ?? "";
  win.webContents.on("will-navigate", (e, url) => {
    if ((devUrl && url.startsWith(devUrl)) || url.startsWith("file:")) return;
    e.preventDefault();
    openExternalIfHttp(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfHttp(url);
    return { action: "deny" };
  });

  // 退出 flush：拦下 close 通知渲染层写盘，完成后经 win:flush-done 销毁窗口
  win.on("close", (e) => {
    // 页面还没加载完成时不可能有脏 tab，直接放行销毁
    if (win.webContents.isLoading()) {
      win.destroy();
      return;
    }
    e.preventDefault();
    win.webContents.send(IpcChannel.WinFlushRequest);
    // 兜底：渲染层无响应（崩溃 / 挂起）时 3 秒后强制退出
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
    }, 3000);
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  // 预热 settings 缓存：启动即把磁盘配置规范化进进程内缓存（getCurrentSettings 直接取用）
  await readSettings();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 退出时关闭全部 fs.watch 句柄（需求 34），防止监听挂住进程不退出
app.on("will-quit", () => stopAll());
