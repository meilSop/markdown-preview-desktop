import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import katexPlugin from "@vscode/markdown-it-katex";
import hljs from "highlight.js";

// mermaid fence 输出模式开关：md.render 同步执行，flag 在调用期间内稳定
let mermaidAsPlaceholder = true;

// 装配链（design.md 第 4 节）：html:false 安全 + task-lists + katex 公式 + highlight.js 代码高亮
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});
md.use(taskLists);
// throwOnError:false — 公式语法错误时降级为红色原文而不是抛异常打断渲染
md.use(katexPlugin, { throwOnError: false });

// fence 渲染：识别语言走 highlight.js，未识别语言纯转义兜底
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = token.info ? token.info.trim().split(/\s+/)[0] : "";
  const code = token.content.replace(/\n$/, "");
  // mermaid 图表：预览输出占位 div（源码存 data-src，挂载后由预览组件异步渲染）；
  // 导出模式退化为普通源码块（导出文档不内嵌 mermaid JS，显示源码是可接受降级）
  if (info === "mermaid") {
    if (!mermaidAsPlaceholder) {
      return `<pre><code class="language-mermaid">${md.utils.escapeHtml(code)}\n</code></pre>\n`;
    }
    return `<div class="mermaid-placeholder" data-src="${md.utils.escapeHtml(code)}"></div>\n`;
  }
  let body = md.utils.escapeHtml(code);
  // 语言名与 markdown-it 默认 fence 一致做转义，防止 info 里夹带的引号注入 class 属性
  let cls = info ? `language-${md.utils.escapeHtml(info)}` : "";
  if (info && hljs.getLanguage(info)) {
    try {
      body = hljs.highlight(code, {
        language: info,
        ignoreIllegals: true,
      }).value;
      cls = `hljs ${cls}`.trim();
    } catch {
      // 高亮异常时保持纯转义输出
    }
  }
  return `<pre><code class="${cls}">${body}\n</code></pre>\n`;
};

// 标题注入 data-line（源码起始行号，token.map[0]）：预览滚动同步按此与编辑器行号对齐
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (token.map && token.map.length > 0) {
    token.attrSet("data-line", String(token.map[0]));
  }
  return self.renderToken(tokens, idx, options);
};

// 渲染入口（预览组件防抖后调用）：mermaid 输出占位 div
export function renderForPreview(src: string): string {
  mermaidAsPlaceholder = true;
  return md.render(src);
}

// 导出入口（useExport 调用）：mermaid 退化为源码块，标题 data-line 同样保留
export function renderForExport(src: string): string {
  mermaidAsPlaceholder = false;
  const html = md.render(src);
  mermaidAsPlaceholder = true;
  return html;
}
