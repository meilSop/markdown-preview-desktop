# 执行计划 — Markdown 桌面编辑器 MVP

> 前置阅读：`prd.md` → `design.md` → `research/electron-vite-stack.md`
> 核心类型与 IPC 契约以 `design.md` 第 3 节为准，实现时先落 `src/shared/types.ts`。

## Step 0 — 脚手架与工程基线

- [ ] `npm create @quick-start/electron@latest` 生成 Vue + TS 模板（目录名用当前仓库根，注意非空目录处理：先生成到临时子目录再合并，或按官方 `.` 方式初始化）
- [ ] 安装依赖：`vue-router` 不需要（单页面无路由）；`pinia`、`@codemirror/*`、`markdown-it`、`highlight.js`、`@types/markdown-it`（P2 再加 `katex`、`@vscode/markdown-it-katex`、`mermaid`）
- [ ] 建目录：`src/shared/types.ts`、`src/main/services/`、`src/renderer/src/{stores,components,composables,markdown}/`
- [ ] 验证：`npm run dev` 能启动空窗口；`npm run typecheck` 通过
- ⚠️ Windows 下 create 脚手架交互式提问 → 使用非交互参数（参考 research 文档中的命令）

## Step 1 — IPC 契约与主进程服务（P0 后端面）

- [ ] `src/shared/types.ts`：所有通道名常量、`ApiResult<T>`、`FileNode`、参数/返回类型
- [ ] `src/main/services/fs.ts`：readTree（一层）/ readFile / writeFile / create / rename / delete
- [ ] `src/main/services/dialog.ts`：open-file / open-folder / save-export
- [ ] `src/main/ipc.ts`：统一注册 + try/catch 包装成 `ApiResult`
- [ ] `src/preload/index.ts`：contextBridge 暴露 `window.api`，类型对齐 shared
- [ ] 验证：devtools console 手动调 `window.api.fs.readFile` 冒烟

## Step 2 — P0 界面骨架（打开文件 → 编辑 → 自动保存 → 预览）

- [ ] 布局：App.vue 三栏（SideBar 占位 + 主区）→ 主区（TabBar 占位 + SplitPane + 分栏编辑/预览）
- [ ] `tabsStore` + `useAutoSave`（防抖 1.5s，写盘成功更新 savedContent）
- [ ] `EditorPane`：CodeMirror 6 + `@codemirror/lang-markdown` + 嵌套代码块 language-data
- [ ] `MarkdownPreview`：markdown-it 装配（GFM + task-lists + highlight.js）+ 250ms 防抖
- [ ] 顶部菜单/按钮：打开文件；`beforeunload`/close 拦截 flush（主进程 close 事件 → 渲染层 flush → 允许退出）
- [ ] 亮色 CSS 变量体系（`:root` 变量 + 组件引用）
- [ ] 验证：打开 md → 编辑 → 停 1.5s → 文件内容变化；表格/任务列表/三种语言代码高亮正确

## Step 3 — P1 工作区与多标签

- [ ] `workspaceStore` + `FileTree/FileTreeNode`（懒加载、展开状态、右键菜单：新建/重命名/删除）
- [ ] 新建/重命名/删除走 `window.api.fs.*`，成功后刷新对应目录节点；删除带确认
- [ ] 多标签：TabBar（激活/关闭），关闭最后一个标签显示 EmptyState
- [ ] 关闭标签时 flush 该 tab；标签去重（同 path 复用）
- [ ] 验证：验收标准第 2/6/7 条

## Step 4 — P2 增强

- [ ] KaTeX：`@vscode/markdown-it-katex` + katex CSS 引入
- [ ] Mermaid：fence 拦截 → 占位 div → 挂载后 `mermaid.render`（防抖渲染内只重建变化的图）
- [ ] 导出 HTML：渲染层取 preview HTML → 主进程模板（内联 hljs/katex CSS）→ 另存
- [ ] 导出 PDF：主进程隐藏窗口加载导出 HTML → printToPDF → 另存
- [ ] 暗色主题：暗色变量值、one-dark 编辑器主题、Mermaid 主题联动、system 模式监听、settings 持久化（主进程读写 settings.json）
- [ ] 预览滚动同步（粗略：标题 data-line 对齐）
- [ ] 验证：验收标准第 5/9/10/12 条

## Step 5 — 打包与收尾

- [ ] `electron-builder.yml`（appId / productName / win nsis）
- [ ] `npm run build && npm run build:win` 产出 NSIS 包，安装后冒烟（开文件夹/编辑/导出）
- [ ] 全量 typecheck + lint
- [ ] 走 trellis-check 全范围检查

## 验证命令

```bash
npm run typecheck        # vue-tsc 全量类型检查
npm run lint             # eslint
npm run dev              # 开发启动
npm run build            # electron-vite 构建
npm run build:win        # NSIS 打包
```

## 提交检查点（每步一个 commit，便于回滚）

Step 0/1/2/3/4/5 各一个提交点；任一步失败可 revert 到上一个检查点重做。

## 风险与回退

- 脚手架在非空目录创建失败 → 临时目录生成后手动合并（保留 .trellis/.qoder）
- printToPDF 在部分 Windows 环境字体/分页异常 → 降级方案：导出 HTML 为主，PDF 标记实验性
- Mermaid 异步渲染与防抖竞争 → 占位 div 复用 + 渲染队列串行化
