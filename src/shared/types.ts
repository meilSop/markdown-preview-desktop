/**
 * IPC 契约唯一事实来源（design.md 第 3 节）：
 * 通道名常量、统一返回包装 ApiResult<T>、各通道参数与返回类型。
 * 主进程 / preload / 渲染层三方均从此处引用，禁止各自定义载荷字段。
 */

// —— 通道名常量 ——
export const IpcChannel = {
  DialogOpenFile: "dialog:open-file",
  DialogOpenFolder: "dialog:open-folder",
  DialogSaveExport: "dialog:save-export",
  FsReadTree: "fs:read-tree",
  FsReadFile: "fs:read-file",
  FsWriteFile: "fs:write-file",
  FsCreate: "fs:create",
  FsRename: "fs:rename",
  FsDelete: "fs:delete",
  ExportHtml: "export:html",
  ExportPdf: "export:pdf",
  // 主题 / 偏好设置持久化（userData/settings.v2.json，主进程读写；旧 settings.json 仅迁移回退）
  SettingsRead: "settings:read",
  SettingsWrite: "settings:write",
  // 退出 flush（design.md 基础上补充）：主进程拦 close 后通知渲染层写盘
  WinFlushRequest: "win:flush-request",
  WinFlushDone: "win:flush-done", // 渲染层 flush 完成后 invoke 确认
  // 窗口控制（V3 需求 18：自绘标题栏按钮，替代本机同步失效的 titleBarOverlay）
  WinMinimize: "win:minimize",
  WinMaximizeToggle: "win:maximize-toggle",
  WinClose: "win:close",
  // 全局检索（V7 需求 25）：工作区多根递归搜索 / 替换
  SearchInWorkspace: "search:in-workspace",
  SearchReplace: "search:replace",
} as const;

// —— 统一返回包装：所有 invoke 结果均为判别联合 ——
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

// 无数据返回的通道（写盘 / 改名 / 删除等），成功即 data 为 null
export type VoidResult = null;

// —— 文件树节点（一层懒加载）——
export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
}

// —— dialog 通道 ——
export interface OpenFileResult {
  path: string;
  content: string;
}
export interface OpenFolderResult {
  path: string;
}
export interface SaveExportParams {
  defaultName: string;
}
export interface SaveExportResult {
  path: string;
}

// —— fs 通道 ——
export interface ReadTreeParams {
  dirPath: string;
}
export interface ReadFileParams {
  filePath: string;
}
export interface ReadFileResult {
  content: string;
  mtime: number;
}
export interface WriteFileParams {
  filePath: string;
  content: string;
}
export interface CreateParams {
  parentPath: string;
  name: string;
  type: "file" | "dir";
}
export interface CreateResult {
  path: string;
}
export interface RenameParams {
  oldPath: string;
  newPath: string;
}
export interface DeleteParams {
  targetPath: string;
  isDir: boolean;
}

// —— export 通道 ——
// cssTexts 由渲染层经 Vite ?raw 读出传入（排版 / hljs / katex CSS），主进程只做模板内联；
// 主进程不解析 node_modules 路径，避免打包后（asar）路径解析的可靠性问题
export interface ExportHtmlParams {
  filePath: string; // 当前文档磁盘路径，用于默认导出文件名
  htmlBody: string; // markdown-it 渲染出的 body 片段
  cssTexts: string[];
  isDark: boolean; // V2 起预览固定浅色，渲染层恒传 false；字段保留维持模板 data-theme 契约
}
export interface ExportPdfParams {
  htmlBody: string;
  cssTexts: string[];
  isDark: boolean; // 同上，恒为 false
  title: string; // 默认导出文件名（tab.name 去扩展名）
}
export interface ExportResult {
  savedPath: string;
}

// —— settings 通道 ——
export type ThemeMode = "light" | "dark" | "system";
// 主操作区布局模式（V3 需求 19）：仅编辑 / 仅预览 / 编辑与预览分屏
export type LayoutMode = "edit" | "preview" | "split";
export interface SettingsData {
  theme: ThemeMode;
  /** 界面背景色覆盖（#rrggbb）；null = 使用主题默认。预览区固定浅色，不受此设置影响 */
  backgroundColor: string | null;
  /** 文件树项目根路径列表（V2 多项目持久化，启动时按路径恢复） */
  roots: string[];
  /** 编辑/预览/分屏布局，默认 split */
  layoutMode: LayoutMode;
  /** 侧栏内容区宽度 px（48px 活动条之外，V8 需求 27），合法区间 200–600；null = 默认 288 */
  sidebarWidth: number | null;
}
export type ReadSettingsResult = SettingsData;
export type WriteSettingsParams = SettingsData;

// —— search 通道（V7 需求 25：全局检索 / 替换）——
export interface SearchParams {
  /** 工作区根路径列表（渲染层从 workspace store 取值后 map 解包为普通数组，禁传 reactive Proxy） */
  roots: string[];
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  /** 逗号分隔 glob（相对根的 POSIX 风格路径，如 "*.md, docs/**"）；空串 = 不过滤 */
  include: string;
  /** 同 include，任一模式命中即排除 */
  exclude: string;
}
export interface SearchMatch {
  path: string;
  /** 1-based 行号 */
  line: number;
  /** 命中行文本（超长时以命中点为中心截断，偏移相对截断后的文本） */
  lineText: string;
  /** matchStart/matchEnd 为 lineText 内的字符偏移，高亮区间 [matchStart, matchEnd) */
  matchStart: number;
  matchEnd: number;
}
export interface SearchResult {
  matches: SearchMatch[];
  /** 命中文件数（matches 内去重后的文件路径数） */
  fileCount: number;
  /** 文件数或命中行达到上限被截断 */
  truncated: boolean;
}
export interface ReplaceParams extends SearchParams {
  replacement: string;
}
export interface ReplaceResult {
  totalReplaced: number;
  files: { path: string; count: number }[];
  /** 达到总时间预算被截断：已替换部分保持写盘，可再次执行替换完成剩余（check 轮补充） */
  truncated: boolean;
}

// —— preload 暴露给渲染层的 window.api 对象结构（类型链：shared → preload → renderer）——
export interface WindowApi {
  fs: {
    readTree(params: ReadTreeParams): Promise<ApiResult<FileNode[]>>;
    readFile(params: ReadFileParams): Promise<ApiResult<ReadFileResult>>;
    writeFile(params: WriteFileParams): Promise<ApiResult<VoidResult>>;
    create(params: CreateParams): Promise<ApiResult<CreateResult>>;
    rename(params: RenameParams): Promise<ApiResult<VoidResult>>;
    /** 对应 fs:delete 通道（目录递归删除） */
    remove(params: DeleteParams): Promise<ApiResult<VoidResult>>;
  };
  dialog: {
    openFile(): Promise<ApiResult<OpenFileResult | null>>;
    openFolder(): Promise<ApiResult<OpenFolderResult | null>>;
    saveExport(
      params: SaveExportParams,
    ): Promise<ApiResult<SaveExportResult | null>>;
  };
  export: {
    html(params: ExportHtmlParams): Promise<ApiResult<ExportResult | null>>;
    pdf(params: ExportPdfParams): Promise<ApiResult<ExportResult | null>>;
  };
  settings: {
    read(): Promise<ApiResult<ReadSettingsResult>>;
    write(params: WriteSettingsParams): Promise<ApiResult<VoidResult>>;
  };
  win: {
    /** 渲染层 flush 完成后确认，主进程随之销毁窗口 */
    flushDone(): Promise<ApiResult<VoidResult>>;
    /** 订阅主进程退出 flush 请求，返回取消订阅函数 */
    onFlushRequest(listener: () => void): () => void;
    /** 最小化窗口（V3 需求 18：自绘标题栏按钮） */
    minimize(): Promise<ApiResult<VoidResult>>;
    /** 最大化 / 还原切换 */
    maximizeToggle(): Promise<ApiResult<VoidResult>>;
    /** 关闭窗口（走主进程 close 拦截 flush 流程，非 destroy） */
    close(): Promise<ApiResult<VoidResult>>;
  };
  search: {
    /** 全局检索（多根递归扫描，上限防卡顿） */
    inWorkspace(params: SearchParams): Promise<ApiResult<SearchResult>>;
    /** 全局替换：逐行匹配替换后写盘 UTF-8（已开 tab 的写盘保护由渲染层编排） */
    replace(params: ReplaceParams): Promise<ApiResult<ReplaceResult>>;
  };
}
