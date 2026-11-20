import { useTabsStore } from "@/stores/tabs";
import { useToast } from "./useToast";
import { renderForExport } from "@/markdown";
import variablesCss from "@/styles/variables.css?raw";
import previewCss from "@/styles/preview.css?raw";
import hljsLightCss from "highlight.js/styles/github.css?raw";
import katexCss from "katex/dist/katex.min.css?raw";

// 导出 CSS 清单：变量 + 排版（预览同一来源，已锚定浅色）+ github.css 高亮 + katex 公式样式。
// V2 需求 15：预览固定浅色后导出不再区分主题（isDark 恒传 false），两者视觉一致。
// KaTeX 字体缺失时浏览器回退，v1 接受降级不内嵌字体文件（design.md 第 7 节）
function collectCssTexts(): string[] {
  return [variablesCss, previewCss, hljsLightCss, katexCss];
}

// 导出 HTML / PDF：渲染层只负责取当前内容 + 组装 CSS 参数，
// 模板组装、另存对话框与写盘都在主进程（export:html / export:pdf）
export function useExport(): {
  exportHtml: () => Promise<void>;
  exportPdf: () => Promise<void>;
} {
  const tabs = useTabsStore();
  const { show } = useToast();

  async function run(kind: "html" | "pdf"): Promise<void> {
    const tab = tabs.activeTab;
    if (!tab) return;
    const common = {
      htmlBody: renderForExport(tab.content),
      cssTexts: collectCssTexts(),
      isDark: false,
    };
    const ret =
      kind === "html"
        ? await window.api.export.html({ ...common, filePath: tab.path })
        : await window.api.export.pdf({
            ...common,
            title: tab.name.replace(/\.[^.]+$/, ""),
          });
    if (!ret.ok) {
      show(`导出失败：${ret.error}`);
      return;
    }
    // data 为 null = 用户取消了另存对话框，不打扰
    if (ret.data) show(`已导出：${ret.data.savedPath}`);
  }

  return {
    exportHtml: () => run("html"),
    exportPdf: () => run("pdf"),
  };
}
