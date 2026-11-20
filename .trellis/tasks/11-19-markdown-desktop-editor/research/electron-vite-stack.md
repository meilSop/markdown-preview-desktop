# 研究：electron-vite 技术栈要点（已验证）

> 验证时间：2026-11。来源：electron-vite 官方脚手架文档、社区实践文章、npm 包维护状态。

## 1. 脚手架（create-electron / @quick-start/electron）

非交互创建（npm 7+ 注意双横线）：

```bash
npm create @quick-start/electron@latest <dir> -- --template vue-ts
```

- 模板预设：vanilla / vanilla-ts / vue / vue-ts / react / react-ts / svelte / svelte-ts / solid / solid-ts
- `--template vue-ts` 只跳过框架选择；updater 插件、镜像代理两项仍会交互提问（本任务都选 No）
- 国内网络：若 Electron 二进制下载慢，设置环境变量 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
- 版本要求：Node ≥ 18（推荐 20），electron-vite ≥ 2.x，Vite ≥ 5
- 默认结构：`src/main` + `src/preload` + `src/renderer`，输出到 `out/`，package.json `main` 指向 `./out/main/index.js`
- 非空目录注意：脚手架要求目标目录基本为空；本仓库已有 .trellis / .qoder，需先生成到临时目录再合并（保留根目录已有内容）

## 2. 编辑器（CodeMirror 6）依赖清单

```bash
npm i codemirror @codemirror/state @codemirror/view @codemirror/commands \
  @codemirror/language @codemirror/lang-markdown @codemirror/language-data \
  @codemirror/theme-one-dark @lezer/highlight
```

- markdown 语言包配合 `@codemirror/language-data` 支持嵌套代码块按语言高亮
- 编辑器实例：`EditorView` + `basicSetup`（来自 codemirror 包）按需裁剪
- 主题切换：EditorView theme compartment（`Compartment`）运行时换主题，避免重建实例

## 3. markdown-it 插件链

```bash
npm i markdown-it highlight.js markdown-it-task-lists
npm i -D @types/markdown-it
# P2：
npm i katex @vscode/markdown-it-katex mermaid
npm i -D @types/katex  # mermaid 自带类型
```

- 初始化：`markdown-it({ html: false, linkify: true, typographer: true, highlight: ... })`
- highlight.js：`hljs.highlight(code, { language })`，未识别语言走 `hljs.highlightAuto` 或纯转义；CSS 用 `highlight.js/styles/xxx.css`（亮/暗各一，随主题切换）
- **KaTeX 插件选型**：`@vscode/markdown-it-katex`（VS Code 维护分支，katex 版本跟进）。原版 `markdown-it-katex` 锁死 katex ^0.6.0，与新版 markdown-it 组合有解析异常风险 → 不用。Fallback：`markdown-it-texmath` 或自写 inline/block rule
- katex CSS：`katex/dist/katex.min.css`（渲染层引入）；导出 HTML 时主进程内联该 CSS + woff2 字体引用（v1 允许字体 URL 降级）

## 4. Mermaid 集成

- fence 渲染器覆盖：`md.renderer.rules.fence` 检测 `info === 'mermaid'` → 输出 `<div class="mermaid" data-src="...">占位</div>`
- 挂载后（预览 DOM 更新回调里）：`mermaid.initialize({ startOnLoad: false, theme })` + `mermaid.render(id, src)` → 替换占位 innerHTML
- 防抖渲染中串行化渲染队列（mermaid.render 是异步的，防抖与异步竞争时丢弃旧任务）
- 主题联动：light → `default`，dark → `dark`；切换主题后需对已渲染图重建

## 5. PDF 导出（printToPDF）

```ts
const win = new BrowserWindow({ show: false })
await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml))
// 或 loadFile 临时文件（超长 HTML 时 data URL 更稳）
const pdf = await win.webContents.printToPDF({ printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } })
fs.writeFile(savePath, pdf)   // Buffer
win.destroy()
```

- `printBackground: true` 必须开，否则丢失代码块/主题底色
- data URL 有长度上限风险（~2MB），超长文档降级为临时文件 + loadFile

## 6. 自动保存与退出 flush

- 防抖：自实现（setTimeout + clearTimeout），不引入 lodash
- 退出 flush：主进程 `window.on('close', e)` → 若有脏 tab，`e.preventDefault()` → 向渲染层发事件 flush → 完成后主进程再次 `destroy()`。渲染层 `beforeunload` 只做兜底提示
- CodeMirror 内容同步：`updateListener` 里把 doc 写回 store（避免 store → CM 双向绑定循环）

## 7. 相关规范/指南路径

- `.trellis/spec/guides/index.md` — 思维指南（跨层、复用检查表）
- 本任务 `design.md` 第 3 节 — IPC 契约唯一事实来源
