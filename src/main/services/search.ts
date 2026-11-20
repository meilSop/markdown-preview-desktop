import { promises as fsPromises } from "fs";
import { join, relative, sep } from "path";
import type {
  ReplaceResult,
  SearchMatch,
  SearchParams,
  ReplaceParams,
  SearchResult,
} from "@shared/types";

// —— 上限常量（防大工作区卡顿，超出置 truncated 或跳过）——
const MAX_FILE_SIZE = 512 * 1024; // 单文件超过 512KB 跳过
const MAX_FILES = 5000; // 收集文件总数上限，超出 truncated
const MAX_MATCHES = 1000; // 总命中条目上限，超出 truncated
const MAX_MATCHES_PER_FILE = 50; // 单文件最多收集的命中条目
const MAX_LINETEXT_LEN = 240; // 命中行文本超过此长度以命中点为中心截断
// 总时间预算（check 轮补充）：文件间检查点，防病态正则在大工作区上累积卡顿。
// 注意：单次 exec 内部的灾难性回溯（如 (a+)+$ 遇 200+ 个 a）无法被预算打断，
// 属已知限制——根治需把正则执行隔离到可终止的 Worker 线程，超出本轮范围
const MAX_SEARCH_MS = 15_000; // 搜索总时间预算，超出置 truncated
const MAX_REPLACE_MS = 30_000; // 替换总时间预算，超出返回已完成部分（truncated）

// 默认排除的目录名：任意层级命中即整棵剪掉，不再深入
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  ".vscode",
  "coverage",
  ".trellis",
]);

// 仅扫描的文本类扩展白名单
const TEXT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdx",
  "txt",
  "json",
  "js",
  "ts",
  "tsx",
  "jsx",
  "vue",
  "css",
  "scss",
  "less",
  "html",
  "yml",
  "yaml",
  "xml",
  "sh",
  "py",
  "java",
  "go",
  "rs",
  "c",
  "cpp",
  "h",
  "sql",
  "toml",
  "ini",
  "bat",
  "ps1",
]);

// glob → RegExp：** → .*、* → [^/]*、? → .，其余字符转义；
// 匹配对象是相对根的 POSIX 风格路径（注意 * 仅匹配单层，跨层需用 **）
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // `**/` = 零层或多层目录（`**/*.md` 同时命中根层与深层文件，与通用 glob 语义一致）；
        // 其余位置的 `**` 退化为任意串
        if (glob[i + 2] === "/") {
          source += "(?:.*/)?";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if (ch === "?") {
      source += ".";
    } else {
      source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

// 逗号分隔的 glob 模式 → 正则列表（空串 → 空数组 = 不过滤）
function parseGlobs(pattern: string): RegExp[] {
  return pattern
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(globToRegExp);
}

// 相对根的 POSIX 风格路径（glob 匹配基准；Windows 分隔符统一转 /）
function posixRelative(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join("/");
}

// 扩展名小写化提取（无扩展名返回空串）
function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx < 0 ? "" : name.slice(idx + 1).toLowerCase();
}

interface CollectedFile {
  root: string;
  path: string;
}

// 多根递归收集文本文件：子目录并发遍历，边收集边做 glob 过滤与上限控制
async function collectTargetFiles(
  roots: string[],
  includeRes: RegExp[],
  excludeRes: RegExp[],
): Promise<{ files: CollectedFile[]; truncated: boolean }> {
  const files: CollectedFile[] = [];
  let truncated = false;

  async function walk(root: string, dir: string): Promise<void> {
    if (truncated) return;
    let entries;
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // 无权限 / 已被删除的目录静默跳过
    }
    const subdirs: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) subdirs.push(join(dir, entry.name));
      } else if (entry.isFile()) {
        const ext = extOf(entry.name);
        if (!ext || !TEXT_EXTENSIONS.has(ext)) continue;
        const path = join(dir, entry.name);
        const rel = posixRelative(root, path);
        if (includeRes.length > 0 && !includeRes.some((re) => re.test(rel)))
          continue;
        if (excludeRes.some((re) => re.test(rel))) continue;
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        files.push({ root, path });
      }
    }
    await Promise.all(subdirs.map((sub) => walk(root, sub)));
  }

  await Promise.all(roots.map((root) => walk(root, root)));
  return { files, truncated };
}

// 按参数构造全文匹配正则：非正则时转义字面量、全词加 \b 包裹、大小写不敏感加 i，统一 g 标志
function buildRegExp(params: SearchParams): RegExp {
  let source = params.useRegex
    ? params.query
    : params.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (params.wholeWord) source = `\\b(?:${source})\\b`;
  try {
    return new RegExp(source, params.caseSensitive ? "g" : "gi");
  } catch {
    throw new Error(`正则表达式无效: ${params.query}`);
  }
}

// 命中行超长时以命中点为中心截出固定窗口，返回截断后文本与同步换算的偏移
function clipLine(
  line: string,
  start: number,
  end: number,
): { text: string; start: number; end: number } {
  if (line.length <= MAX_LINETEXT_LEN) return { text: line, start, end };
  const center = Math.floor((start + end) / 2);
  const half = Math.floor(MAX_LINETEXT_LEN / 2);
  let from = Math.max(0, center - half);
  let to = Math.min(line.length, from + MAX_LINETEXT_LEN);
  from = Math.max(0, to - MAX_LINETEXT_LEN);
  return {
    text: line.slice(from, to),
    start: Math.max(0, start - from),
    end: Math.min(to - from, end - from),
  };
}

// 收集单条命中（行号 1-based，行文本与偏移经 clipLine 归一）
function makeMatch(
  file: CollectedFile,
  line: number,
  rawLine: string,
  start: number,
  end: number,
): SearchMatch {
  const clipped = clipLine(rawLine, start, end);
  return {
    path: file.path,
    line,
    lineText: clipped.text,
    matchStart: clipped.start,
    matchEnd: clipped.end,
  };
}

// 全局检索：多根收集 → 逐文件逐行 exec 收集命中（零宽命中强制推进防死循环）
export async function searchInWorkspace(
  params: SearchParams,
): Promise<SearchResult> {
  if (!params.query) return { matches: [], fileCount: 0, truncated: false };
  const reg = buildRegExp(params);
  const { files, truncated: filesTruncated } = await collectTargetFiles(
    params.roots,
    parseGlobs(params.include),
    parseGlobs(params.exclude),
  );

  const startedAt = Date.now();
  const matches: SearchMatch[] = [];
  const hitFiles = new Set<string>();
  let truncated = filesTruncated;

  for (const file of files) {
    if (matches.length >= MAX_MATCHES) {
      truncated = true;
      break;
    }
    // 时间预算检查点：防病态正则在大工作区上累积卡顿（已收集结果照常返回）
    if (Date.now() - startedAt > MAX_SEARCH_MS) {
      truncated = true;
      break;
    }
    const stat = await fsPromises.stat(file.path).catch(() => null);
    if (!stat || !stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
    const content = await fsPromises
      .readFile(file.path, "utf-8")
      .catch(() => null);
    if (content === null) continue;

    const lines = content.split(/\r?\n/);
    let fileMatchCount = 0;
    for (let i = 0; i < lines.length; i += 1) {
      if (
        matches.length >= MAX_MATCHES ||
        fileMatchCount >= MAX_MATCHES_PER_FILE
      ) {
        truncated = true;
        break;
      }
      const rawLine = lines[i];
      reg.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = reg.exec(rawLine)) !== null) {
        if (m[0].length === 0) {
          // 零宽命中不展示：lastIndex 无推进会死循环，强制 +1 后越过行尾即停
          reg.lastIndex += 1;
          if (reg.lastIndex > rawLine.length) break;
          continue;
        }
        matches.push(
          makeMatch(file, i + 1, rawLine, m.index, m.index + m[0].length),
        );
        hitFiles.add(file.path);
        fileMatchCount += 1;
        if (
          matches.length >= MAX_MATCHES ||
          fileMatchCount >= MAX_MATCHES_PER_FILE
        ) {
          truncated = true;
          break;
        }
      }
      if (truncated && matches.length >= MAX_MATCHES) break;
    }
    if (truncated && matches.length >= MAX_MATCHES) break;
  }

  return { matches, fileCount: hitFiles.size, truncated };
}

// 单行命中计数：推进规则与 String.replace 的内部匹配一致（零宽命中手动 +1），计数准确
function countInLine(line: string, reg: RegExp): number {
  reg.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = reg.exec(line)) !== null) {
    count += 1;
    if (m[0].length === 0) {
      reg.lastIndex += 1;
      if (reg.lastIndex > line.length) break;
    }
  }
  return count;
}

// 全局替换：与搜索同参数语义——同样逐行匹配（split 保留换行分隔符后逐行替换再拼回，
// 保证 ^ / $ 等行锚点与搜索结果严格一致，换行形态原样保留）。
// 字面量模式用替换函数挡掉 $ 插值语义；正则模式透传 replacement 支持 $1 / $& 引用。
// 已打开 tab 的写盘保护（先 flush 再替换再重读）由渲染层编排，主进程直接读写
export async function replaceInWorkspace(
  params: ReplaceParams,
): Promise<ReplaceResult> {
  if (!params.query) return { totalReplaced: 0, files: [], truncated: false };
  const reg = buildRegExp(params);
  const { files } = await collectTargetFiles(
    params.roots,
    parseGlobs(params.include),
    parseGlobs(params.exclude),
  );

  const startedAt = Date.now();
  let totalReplaced = 0;
  let truncated = false;
  const replacedFiles: { path: string; count: number }[] = [];
  for (const file of files) {
    // 时间预算检查点：超预算返回已完成部分（truncated 标记），可再次执行续替剩余文件
    if (Date.now() - startedAt > MAX_REPLACE_MS) {
      truncated = true;
      break;
    }
    const stat = await fsPromises.stat(file.path).catch(() => null);
    if (!stat || !stat.isFile() || stat.size > MAX_FILE_SIZE) continue;
    const content = await fsPromises
      .readFile(file.path, "utf-8")
      .catch(() => null);
    if (content === null) continue;
    // split 捕获组保留分隔符：偶数索引为行、奇数为换行符，join 回写保证换行形态不变
    const parts = content.split(/(\r?\n)/);
    let count = 0;
    let changed = false;
    for (let i = 0; i < parts.length; i += 2) {
      const line = parts[i];
      const lineCount = countInLine(line, reg);
      if (lineCount === 0) continue;
      parts[i] = params.useRegex
        ? line.replace(reg, params.replacement)
        : line.replace(reg, () => params.replacement);
      count += lineCount;
      changed = true;
    }
    if (!changed) continue;
    await fsPromises.writeFile(file.path, parts.join(""), "utf-8");
    replacedFiles.push({ path: file.path, count });
    totalReplaced += count;
  }

  return { totalReplaced, files: replacedFiles, truncated };
}
