import { BrowserWindow } from "electron";
import { promises as fsPromises } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import type {
  ExportHtmlParams,
  ExportPdfParams,
  ExportResult,
} from "@shared/types";
import * as dialogService from "./dialog";

// 组装可独立打开的 HTML 文档：渲染层传来的 CSS 全部内联，
// 亮暗由 html 根节点 data-theme 切换（variables.css 同时带两套变量值）
function buildDocument(
  body: string,
  cssTexts: string[],
  isDark: boolean,
): string {
  return [
    "<!DOCTYPE html>",
    `<html lang="zh-CN" data-theme="${isDark ? "dark" : "light"}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>\n${cssTexts.join("\n")}\n</style>`,
    "<style>",
    // 文档级基础样式（预览容器样式不适用于独立文档，这里给等效排版环境）
    "body { margin: 0; background: var(--color-bg); color: var(--color-text);",
    '  font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; font-size: 14px; }',
    ".md-body { max-width: 820px; margin: 0 auto; padding: 24px 32px; }",
    "</style>",
    "</head>",
    `<body><article class="md-body">\n${body}\n</article></body>`,
    "</html>",
  ].join("\n");
}

// data URL 有 ~2MB 上限（研究文档第 5 节），超过阈值降级为临时文件 loadFile。
// 必须按 encodeURIComponent 之后的实际长度判断：中文等多字节字符编码后膨胀 3 倍，
// 按原始字符数判断会让 CJK 长文档漏过阈值、导航时才失败
const DATA_URL_LIMIT = 1_500_000;

// 导出 HTML：先另存（取消则不产文件），后写盘
export async function exportHtml(
  params: ExportHtmlParams,
): Promise<ExportResult | null> {
  const defaultName = basename(params.filePath).replace(/\.md$/i, "") + ".html";
  const saved = await dialogService.saveExport({ defaultName });
  if (!saved) return null;
  const html = buildDocument(params.htmlBody, params.cssTexts, params.isDark);
  await fsPromises.writeFile(saved.path, html, "utf-8");
  return { savedPath: saved.path };
}

// 导出 PDF：隐藏窗口加载同一模板（与 export:html 视觉一致）→ printToPDF → 写盘 → 销毁窗口
export async function exportPdf(
  params: ExportPdfParams,
): Promise<ExportResult | null> {
  const saved = await dialogService.saveExport({
    defaultName: `${params.title}.pdf`,
  });
  if (!saved) return null;
  const html = buildDocument(params.htmlBody, params.cssTexts, params.isDark);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  let tmpFile: string | null = null;
  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    if (dataUrl.length > DATA_URL_LIMIT) {
      tmpFile = join(tmpdir(), `md-preview-export-${Date.now()}.html`);
      await fsPromises.writeFile(tmpFile, html, "utf-8");
      await win.loadFile(tmpFile);
    } else {
      await win.loadURL(dataUrl);
    }
    // printBackground 必须开，否则代码块/主题底色丢失（研究文档第 5 节）
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    await fsPromises.writeFile(saved.path, pdf);
  } finally {
    win.destroy();
    if (tmpFile) await fsPromises.rm(tmpFile, { force: true });
  }
  return { savedPath: saved.path };
}
