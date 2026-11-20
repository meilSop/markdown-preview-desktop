# 技术设计 — Markdown 桌面编辑器 MVP

## 1. 架构总览

三进程结构（electron-vite 标准）：

```
┌─────────────────────────── Main Process ───────────────────────────┐
│  windowManager      主窗口创建 / 生命周期 / 打印导出 (printToPDF)   │
│  fsService          全部文件 IO（读 / 写 / 树扫描 / 增删改名）      │
│  dialogService      打开文件 / 文件夹对话框、保存导出对话框          │
│  ipcRouter          统一注册所有 ipcMain.handle 通道                │
└───────────────▲──────────────────────────────────▲────────────────┘
                │ ipcRenderer.invoke (contextBridge)│
┌───────────────┴──────── Preload (sandbox) ────────┴────────────────┐
│  contextBridge.exposeInMainWorld('api', {...})  — 唯一通信面        │
└───────────────▲────────────────────────────────────────────────────┘
                │ window.api.*
┌───────────────┴────────────── Renderer (Vue3) ─────────────────────┐
│  Pinia stores: workspaceStore / tabsStore / settingsStore           │
│  CodeMirror 6 编辑器组件 ──► tabsStore.content (防抖 1.5s 写盘)     │
│  MarkdownPreview 组件 ◄─── 防抖 250ms 后 markdown-it 渲染          │
│  FileTree 组件 / TabBar 组件 / SplitPane 布局 / ThemeProvider       │
└─────────────────────────────────────────────────────────────────────┘
```

原则：**文件 IO 只在主进程**；渲染层通过 `window.api`（preload 暴露）调用；IPC 通道全部 `invoke/handle` 模式（promise 风格）。

## 2. 目录结构（脚手架生成后）

```
markdown-preview/
├── src/
│   ├── main/
│   │   ├── index.ts            # 入口：窗口创建、IPC 注册、生命周期
│   │   ├── ipc.ts              # ipcRouter：所有 handle 注册
│   │   └── services/
│   │       ├── fs.ts           # 文件/文件夹读写、树扫描、增删改名
│   │       ├── dialog.ts       # 对话框
│   │       └── export.ts       # HTML 模板组装、printToPDF
│   ├── preload/
│   │   └── index.ts            # contextBridge 暴露 window.api（带类型）
│   ├── renderer/
│   │   ├── src/
│   │   │   ├── App.vue
│   │   │   ├── main.ts
│   │   │   ├── stores/
│   │   │   │   ├── workspace.ts   # 根目录路径、文件树状态
│   │   │   │   ├── tabs.ts        # 标签数组、activeTabId、脏状态、自动保存
│   │   │   │   └── settings.ts    # 主题（light/dark/system）
│   │   │   ├── components/
│   │   │   │   ├── SideBar.vue / FileTree.vue / FileTreeNode.vue
│   │   │   │   ├── TabBar.vue / EditorPane.vue / MarkdownPreview.vue
│   │   │   │   └── EmptyState.vue
│   │   │   ├── composables/
│   │   │   │   ├── useAutoSave.ts # 防抖写盘 + flush
│   │   │   │   └── usePreview.ts  # markdown-it 实例 + 防抖渲染 + mermaid
│   │   │   └── markdown/
│   │   │       └── index.ts       # markdown-it 插件链装配
│   │   └── index.html
│   └── shared/
│       └── types.ts            # IPC 通道名、参数、返回类型（主/预加载/渲染共用）
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

## 3. IPC 契约（src/shared/types.ts 为唯一事实来源）

| 通道                 | 参数                                      | 返回                           | 说明                             |
| -------------------- | ----------------------------------------- | ------------------------------ | -------------------------------- |
| `dialog:open-file`   | —                                         | `{path, content} \| null`      | 文件选择对话框，读取 utf-8       |
| `dialog:open-folder` | —                                         | `{path} \| null`               | 文件夹选择对话框                 |
| `dialog:save-export` | `{defaultName, htmlOrPdfMeta}`            | `{path} \| null`               | 导出另存对话框                   |
| `fs:read-tree`       | `{dirPath}`                               | `FileNode[]`（仅一层，懒加载） | 目录一层扫描，含 name/path/isDir |
| `fs:read-file`       | `{filePath}`                              | `{content, mtime}`             | utf-8 读取                       |
| `fs:write-file`      | `{filePath, content}`                     | `{ok}`                         | 自动保存 / 强制 flush 写盘       |
| `fs:create`          | `{parentPath, name, type: 'file'\|'dir'}` | `{path}`                       | 冲突时报错信息返回               |
| `fs:rename`          | `{oldPath, newPath}`                      | `{ok}`                         | 重命名（同目录）                 |
| `fs:delete`          | `{targetPath, isDir}`                     | `{ok}`                         | 删除（目录递归）                 |
| `export:html`        | `{filePath, htmlBody}`                    | `{savedPath} \| null`          | 套模板 + 另存                    |
| `export:pdf`         | `{sourceHtml}`                            | `{savedPath} \| null`          | 隐藏窗口渲染 → printToPDF → 写盘 |
| `win:export-status`  | —                                         | —                              | 导出过程状态回推（可选，P2）     |

错误约定：所有 handle 内 try/catch，失败时返回 `{error: string}`（中文用户可读信息），渲染层统一处理。类型层面用 discriminated union：`ApiResult<T> = {ok: true; data: T} | {ok: false; error: string}`。

安全细节：
- `fs:read-file` / `fs:write-file` 等通道在主进程校验路径存在性，防渲染层伪造越界访问（个人工具从简：不实现工作区白名单，v1 明确不做）
- preload 仅暴露白名单方法，不透传 `ipcRenderer` 对象

## 4. 渲染管线

markdown-it 装配链（`src/renderer/src/markdown/index.ts`）：

```
markdown-it({html: false, linkify: true, typographer: true})
  + markdown-it-task-lists         # 任务列表
  + @vscode/markdown-it-katex      # 公式（P2）
  + highlight.js（highlight 选项，js/ts/python/html/css/md 必须可用）
  + mermaid：fence 渲染器拦截 ```mermaid 块 → 输出占位 <div data-mermaid>
    → DOM 挂载后调用 mermaid.render（P2，异步、按当前主题配色）
```

- `html: false`：不透传原始 HTML（安全 + 排版一致性）
- 预览防抖 250ms（watch tabsStore.activeTab.content）
- 滚动同步：P2 做粗略版——按渲染结果中的标题元素与源码行号对齐（markdown-it 渲染后记录 `data-line`），不做逐像素同步

## 5. 状态管理

**tabsStore**（核心）：
```ts
interface Tab { id: string; path: string; name: string; content: string; savedContent: string; }
// dirty = content !== savedContent（派生，不单独存储）
```
- 打开文件：去重（同 path 复用已有 tab）→ 读盘 → push tab → activate
- 自动保存：composable `useAutoSave` 对 activeTab.content 做 1.5s 防抖 `fs:write-file`；写盘成功后更新 `savedContent`
- flush 时机：关闭标签、切换工作区、`window.beforeunload`（主进程 `close` 事件通知渲染层 flush 后再允许关闭）
- 空状态：tabs 为空显示 EmptyState（引导打开文件/文件夹）

**workspaceStore**：根目录 path、树数据（Map<dirPath, FileNode[]> 缓存）、树操作后局部刷新对应目录节点。

**settingsStore**：`theme: 'light' | 'dark' | 'system'`，持久化到 `app.getPath('userData')/settings.json`（经主进程 IPC 读写）。

## 6. 主题系统

- CSS 变量定义在 `:root[data-theme='light']` 与 `:root[data-theme='dark']`（背景 / 前景 / 边框 / 强调色 / 代码块底色 等约 12 个变量）
- CodeMirror 6：引入 `@codemirror/theme-one-dark` 作为暗色编辑器主题，亮色用默认 + 少量变量对齐
- Mermaid：`mermaid.initialize({theme: 'default' | 'dark'})` 随主题切换重建实例
- system 模式：`window.matchMedia('(prefers-color-scheme: dark)')` 监听
- P0 只定义变量体系 + 亮色值；暗色值 P2 补全

## 7. 导出

- **HTML**：渲染层拿到当前预览 HTML body → 主进程套内联样式模板（含 highlight.js / KaTeX 的 CSS 内联）→ `dialog:save-export` 另存。KaTeX 字体问题接受降级（字体缺失时浏览器回退），v1 不内嵌字体文件
- **PDF**：主进程创建隐藏 BrowserWindow 加载导出 HTML → `webContents.printToPDF({printBackground: true})` → 写盘。复用 export:html 的模板，保证两者视觉一致

## 8. 权衡记录

| 决策                        | 取舍                                                                                                                                           | 否决的备选                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CodeMirror 6                | 轻量、markdown 嵌套语法支持好、可增量扩展                                                                                                      | Monaco（重，桌面工具没必要）；Vditor（所见即所得路线，与分栏形态冲突） |
| markdown-it                 | 插件生态最全，fence 拦截做 mermaid 简单                                                                                                        | marked（插件少）、remark（偏 AST 工具链，组件集成繁琐）                |
| invoke/handle 单一 IPC 模式 | 全 promise，类型好约束                                                                                                                         | send/on 事件流（仅导出进度这类回推场景才用）                           |
| 树懒加载（一层扫描）        | 大文件夹不卡，实现简单                                                                                                                         | 全量递归（大目录首开慢）                                               |
| 不做 chokidar 外部监听      | v1 范围控制，个人单机场景冲突概率低                                                                                                            | 外部修改检测 + 冲突提示（延后）                                        |
| 外部监听改用 fs.watch       | 需求 34（2026-11-20）反转上项决策，改用 Node 内置 fs.watch（recursive，Windows 支持）替代 chokidar，原因：多编辑器并行工作实测反馈文件树不同步 | —                                                                      |
| PDF 用 printToPDF           | 原生能力零依赖                                                                                                                                 | puppeteer（重）、pdfmake（重排版）                                     |

## 9. 打包

- electron-builder + NSIS（`electron-builder.yml`：appId、productName=Markdown Preview、win nsis oneClick=false）
- 不签名、不发更新通道
- `files` 只打包 `out/`（electron-vite 构建产物）

## 10. 兼容性与回滚

- Node ≥ 18（electron-vite 要求）；包管理用 npm（避免引入 pnpm 环境差异）
- 项目从零开始，无向后兼容负担；回滚 = git revert（按 implement.md 的检查点分批提交）
