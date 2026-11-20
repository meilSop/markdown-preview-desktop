import { dialog } from "electron";
import type {
  OpenFileResult,
  OpenFolderResult,
  SaveExportParams,
  SaveExportResult,
} from "@shared/types";
import { readFile } from "./fs";

// 选择 .md 文件并直接读出内容（取消返回 null）
export async function openFile(): Promise<OpenFileResult | null> {
  const ret = await dialog.showOpenDialog({
    title: "打开 Markdown 文件",
    filters: [{ name: "Markdown", extensions: ["md"] }],
    properties: ["openFile"],
  });
  if (ret.canceled || ret.filePaths.length === 0) return null;
  const filePath = ret.filePaths[0];
  const { content } = await readFile(filePath);
  return { path: filePath, content };
}

// 选择文件夹工作区根目录（取消返回 null）
export async function openFolder(): Promise<OpenFolderResult | null> {
  const ret = await dialog.showOpenDialog({
    title: "打开文件夹",
    properties: ["openDirectory"],
  });
  if (ret.canceled || ret.filePaths.length === 0) return null;
  return { path: ret.filePaths[0] };
}

// 导出另存对话框（P2 的 export:html / export:pdf 复用）
export async function saveExport(
  params: SaveExportParams,
): Promise<SaveExportResult | null> {
  const ret = await dialog.showSaveDialog({
    title: "导出",
    defaultPath: params.defaultName,
  });
  if (ret.canceled || !ret.filePath) return null;
  return { path: ret.filePath };
}
