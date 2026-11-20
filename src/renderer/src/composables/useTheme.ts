import hljsLightCss from "highlight.js/styles/github.css?raw";

// V2 需求 15：预览区固定浅色白底，hljs 高亮不再随应用主题切换，始终注入 github.css。
// CSS 文本经 ?raw 读入，注入同一 <style> 节点（避免 Vite 动态 import CSS 的打包复杂性）
let injected = false;

export function applyHljsTheme(): void {
  if (injected) return;
  let styleEl = document.getElementById(
    "hljs-theme",
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "hljs-theme";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = hljsLightCss;
  injected = true;
}
