import { ipcMain, BrowserWindow } from "electron";
import {
  IpcChannel,
  type ApiResult,
  type CreateParams,
  type DeleteParams,
  type ExportHtmlParams,
  type ExportPdfParams,
  type ReadFileParams,
  type ReadTreeParams,
  type RenameParams,
  type ReplaceParams,
  type SaveExportParams,
  type SearchParams,
  type VoidResult,
  type WriteFileParams,
  type WriteSettingsParams,
} from "@shared/types";
import * as fsService from "./services/fs";
import * as dialogService from "./services/dialog";
import * as exportService from "./services/export";
import * as settingsService from "./services/settings";
import * as searchService from "./services/search";

// 统一包装：业务异常转成 ApiResult{ok:false}，错误信息用户可读
async function wrap<T>(fn: () => Promise<T> | T): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// 统一注册全部 IPC handler，在 app.whenReady 中调用
export function registerIpcHandlers(): void {
  // fs 通道
  ipcMain.handle(IpcChannel.FsReadTree, (_e, params: ReadTreeParams) =>
    wrap(() => fsService.readTree(params.dirPath)),
  );
  ipcMain.handle(IpcChannel.FsReadFile, (_e, params: ReadFileParams) =>
    wrap(() => fsService.readFile(params.filePath)),
  );
  ipcMain.handle(IpcChannel.FsWriteFile, (_e, params: WriteFileParams) =>
    wrap(() => fsService.writeFile(params.filePath, params.content)),
  );
  ipcMain.handle(IpcChannel.FsCreate, (_e, params: CreateParams) =>
    wrap(() => fsService.create(params.parentPath, params.name, params.type)),
  );
  ipcMain.handle(IpcChannel.FsRename, (_e, params: RenameParams) =>
    wrap(() => fsService.rename(params.oldPath, params.newPath)),
  );
  ipcMain.handle(IpcChannel.FsDelete, (_e, params: DeleteParams) =>
    wrap(() => fsService.remove(params.targetPath, params.isDir)),
  );

  // dialog 通道
  ipcMain.handle(IpcChannel.DialogOpenFile, () =>
    wrap(() => dialogService.openFile()),
  );
  ipcMain.handle(IpcChannel.DialogOpenFolder, () =>
    wrap(() => dialogService.openFolder()),
  );
  ipcMain.handle(IpcChannel.DialogSaveExport, (_e, params: SaveExportParams) =>
    wrap(() => dialogService.saveExport(params)),
  );

  // export 通道（模板组装 / 隐藏窗口 printToPDF 在 services/export）
  ipcMain.handle(IpcChannel.ExportHtml, (_e, params: ExportHtmlParams) =>
    wrap(() => exportService.exportHtml(params)),
  );
  ipcMain.handle(IpcChannel.ExportPdf, (_e, params: ExportPdfParams) =>
    wrap(() => exportService.exportPdf(params)),
  );

  // settings 通道（userData/settings.v2.json 读写，旧 settings.json 仅迁移回退）
  ipcMain.handle(IpcChannel.SettingsRead, () =>
    wrap(() => settingsService.readSettings()),
  );
  ipcMain.handle(IpcChannel.SettingsWrite, (_e, params: WriteSettingsParams) =>
    wrap(() => settingsService.writeSettings(params)),
  );

  // search 通道（V7 需求 25：全局检索 / 替换，多根递归扫描在 services/search）
  ipcMain.handle(IpcChannel.SearchInWorkspace, (_e, params: SearchParams) =>
    wrap(() => searchService.searchInWorkspace(params)),
  );
  ipcMain.handle(IpcChannel.SearchReplace, (_e, params: ReplaceParams) =>
    wrap(() => searchService.replaceInWorkspace(params)),
  );

  // 退出 flush 确认：渲染层写盘完成后销毁窗口（close 事件里已 preventDefault）
  ipcMain.handle(IpcChannel.WinFlushDone, (event): ApiResult<VoidResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.destroy();
    return { ok: true, data: null };
  });

  // 窗口控制（V3 需求 18：自绘标题栏按钮，替代在本机同步失效的 titleBarOverlay）
  ipcMain.handle(IpcChannel.WinMinimize, (event) =>
    wrap(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) win.minimize();
      return null;
    }),
  );
  ipcMain.handle(IpcChannel.WinMaximizeToggle, (event) =>
    wrap(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      }
      return null;
    }),
  );
  // close 而非 destroy：触发 close 拦截 → 渲染层 flush → 确认后销毁的既有退出流程
  ipcMain.handle(IpcChannel.WinClose, (event) =>
    wrap(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) win.close();
      return null;
    }),
  );
}
