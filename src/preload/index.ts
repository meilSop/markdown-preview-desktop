import { contextBridge, ipcRenderer } from "electron";
import { IpcChannel, type FsEventPayload, type WindowApi } from "@shared/types";

// sandbox 模式下只能用 ipcRenderer.invoke，不透传 ipcRenderer 本身
const api: WindowApi = {
  fs: {
    readTree: (params) => ipcRenderer.invoke(IpcChannel.FsReadTree, params),
    readFile: (params) => ipcRenderer.invoke(IpcChannel.FsReadFile, params),
    writeFile: (params) => ipcRenderer.invoke(IpcChannel.FsWriteFile, params),
    create: (params) => ipcRenderer.invoke(IpcChannel.FsCreate, params),
    rename: (params) => ipcRenderer.invoke(IpcChannel.FsRename, params),
    remove: (params) => ipcRenderer.invoke(IpcChannel.FsDelete, params),
    // 项目根外部变更监听（需求 34）
    watchRoot: (params) => ipcRenderer.invoke(IpcChannel.FsWatchStart, params),
    unwatchRoot: (params) => ipcRenderer.invoke(IpcChannel.FsWatchStop, params),
    // 订阅外部变更推送（模式同 win.onFlushRequest）：listener 包一层 wrapped，
    // 返回 removeListener 取消函数
    onFsEvent: (listener) => {
      const wrapped = (_event: unknown, payload: FsEventPayload): void =>
        listener(payload);
      ipcRenderer.on(IpcChannel.FsWatchEvent, wrapped);
      return () => ipcRenderer.removeListener(IpcChannel.FsWatchEvent, wrapped);
    },
  },
  dialog: {
    openFile: () => ipcRenderer.invoke(IpcChannel.DialogOpenFile),
    openFolder: () => ipcRenderer.invoke(IpcChannel.DialogOpenFolder),
    saveExport: (params) =>
      ipcRenderer.invoke(IpcChannel.DialogSaveExport, params),
  },
  export: {
    html: (params) => ipcRenderer.invoke(IpcChannel.ExportHtml, params),
    pdf: (params) => ipcRenderer.invoke(IpcChannel.ExportPdf, params),
  },
  settings: {
    read: () => ipcRenderer.invoke(IpcChannel.SettingsRead),
    write: (params) => ipcRenderer.invoke(IpcChannel.SettingsWrite, params),
  },
  win: {
    flushDone: () => ipcRenderer.invoke(IpcChannel.WinFlushDone),
    onFlushRequest: (listener) => {
      const wrapped = (): void => listener();
      ipcRenderer.on(IpcChannel.WinFlushRequest, wrapped);
      return () =>
        ipcRenderer.removeListener(IpcChannel.WinFlushRequest, wrapped);
    },
    // 窗口控制（V3 需求 18：自绘标题栏按钮）
    minimize: () => ipcRenderer.invoke(IpcChannel.WinMinimize),
    maximizeToggle: () => ipcRenderer.invoke(IpcChannel.WinMaximizeToggle),
    close: () => ipcRenderer.invoke(IpcChannel.WinClose),
  },
  // 全局检索（V7 需求 25）
  search: {
    inWorkspace: (params) =>
      ipcRenderer.invoke(IpcChannel.SearchInWorkspace, params),
    replace: (params) => ipcRenderer.invoke(IpcChannel.SearchReplace, params),
  },
};

contextBridge.exposeInMainWorld("api", api);
