/**
 * 路径工具：文件树、tabs 联动共用（tabs.ts / workspace.ts / 内联输入框）。
 * Windows 主路径分隔符为 \，同时兼容 /（tree 内路径均来自主进程 path.join）。
 */

// 取路径末段作为显示名
export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

// 取父目录（无父级时返回原值）
export function dirname(p: string): string {
  const idx = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
  return idx <= 0 ? p : p.slice(0, idx);
}

// 拼接父目录与名称：跟随 parent 已用的分隔符，保证与主进程 join 结果一致
export function joinName(parent: string, name: string): string {
  const sep = parent.includes("\\") ? "\\" : "/";
  return `${parent}${sep}${name}`;
}

// child 是否等于 dir 或位于 dir 内部（目录改名/删除时匹配子孙路径）
export function isWithin(child: string, dir: string): boolean {
  if (child === dir) return true;
  return child.startsWith(`${dir}\\`) || child.startsWith(`${dir}/`);
}

// Windows 文件/文件夹命名校验：返回错误原因或 null（合法）
export function invalidNameReason(name: string): string | null {
  if (!name) return "名称不能为空";
  if (/[<>:"/\\|?*]/.test(name)) return "名称包含非法字符";
  if (name === "." || name === "..") return "名称不能为 . 或 ..";
  if (name.endsWith(".") || name.endsWith(" ")) return "名称不能以点或空格结尾";
  return null;
}
