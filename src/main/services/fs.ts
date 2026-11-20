import { promises as fsPromises, existsSync } from "fs";
import { dirname, join } from "path";
import type { CreateResult, FileNode, ReadFileResult } from "@shared/types";
import { noteSelfChange } from "./watcher";

// 目录一层扫描（懒加载）：文件夹优先，名称忽略大小写排序
export async function readTree(dirPath: string): Promise<FileNode[]> {
  const stat = await fsPromises.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`路径不是文件夹: ${dirPath}`);
  }
  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  const nodes = entries.map((entry) => ({
    name: entry.name,
    path: join(dirPath, entry.name),
    isDir: entry.isDirectory(),
  }));
  nodes.sort((a, b) =>
    a.isDir === b.isDir
      ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      : a.isDir
        ? -1
        : 1,
  );
  return nodes;
}

// utf-8 读文件，附带 mtime（外部修改检测预留）
export async function readFile(filePath: string): Promise<ReadFileResult> {
  const stat = await fsPromises.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error(`路径是文件夹，不是文件: ${filePath}`);
  }
  const content = await fsPromises.readFile(filePath, "utf-8");
  return { content, mtime: stat.mtimeMs };
}

// utf-8 写文件（自动保存 / flush 走此通道）
// design.md 第 3 节：主进程校验路径存在性，新建文件必须走 fs:create，防越界写入
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  const stat = await fsPromises.stat(filePath);
  if (stat.isDirectory()) {
    throw new Error(`路径是文件夹，不是文件: ${filePath}`);
  }
  await fsPromises.writeFile(filePath, content, "utf-8");
  // 自噪音埋点（需求 34）：抑制自身写盘引发的外部变更推送回环
  noteSelfChange([dirname(filePath)]);
}

// 新建文件 / 文件夹，同名冲突直接报错
export async function create(
  parentPath: string,
  name: string,
  type: "file" | "dir",
): Promise<CreateResult> {
  const target = join(parentPath, name);
  if (existsSync(target)) {
    throw new Error(`已存在同名${type === "dir" ? "文件夹" : "文件"}: ${name}`);
  }
  if (type === "dir") {
    await fsPromises.mkdir(target); // 不用 recursive，父目录不存在应报错
  } else {
    await fsPromises.writeFile(target, "", { flag: "wx" });
  }
  noteSelfChange([parentPath]);
  // 返回形状必须对齐 shared 的 CreateResult（渲染层读 data.path），不能返回裸字符串
  return { path: target };
}

// 重命名（同目录移动），Windows 下 fs.rename 会覆盖已有目标，需先检查冲突
export async function rename(oldPath: string, newPath: string): Promise<void> {
  if (existsSync(newPath)) {
    throw new Error(`目标已存在: ${newPath}`);
  }
  await fsPromises.rename(oldPath, newPath);
  noteSelfChange([dirname(oldPath), dirname(newPath)]);
}

// 删除，目录递归
export async function remove(
  targetPath: string,
  isDir: boolean,
): Promise<void> {
  if (!existsSync(targetPath)) {
    throw new Error(`目标不存在: ${targetPath}`);
  }
  await fsPromises.rm(targetPath, { recursive: isDir });
  // 目录删除时其内部变化事件也需被抑制：targetPath 前缀一并记录
  noteSelfChange([dirname(targetPath), targetPath]);
}
