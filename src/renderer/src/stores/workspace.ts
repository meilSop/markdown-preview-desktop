import { acceptHMRUpdate, defineStore } from "pinia";
import type {
  ApiResult,
  CreateResult,
  FileNode,
  VoidResult,
} from "@shared/types";
import { useTabsStore } from "@/stores/tabs";
import { useSettingsStore } from "@/stores/settings";
import { basename, dirname, isWithin } from "@/utils/path";

// 项目根（V2 多项目：左侧可同时挂载多个目录）
export interface WorkspaceRoot {
  path: string;
  name: string;
}

// 内联新建输入行状态（渲染在 creating.parentPath 目录下）
export interface CreatingState {
  parentPath: string;
  type: "file" | "dir";
}
// 内联重命名输入行状态
export interface RenamingState {
  path: string;
}

export const useWorkspaceStore = defineStore("workspace", {
  state: () => ({
    // 多项目根列表（路径持久化到 settings.v2.json，重启恢复后树内容仍懒加载）
    roots: [] as WorkspaceRoot[],
    // 目录懒加载缓存：dirPath → 该层子节点（一层扫描，展开时才读）
    childrenCache: new Map<string, FileNode[]>(),
    expandedDirs: new Set<string>(),
    creating: null as CreatingState | null,
    renaming: null as RenamingState | null,
    // 文件树聚焦路径（V8 需求 31）：跟随激活 tab 的 reveal in tree 目标，
    // FileTreeNode 命中时叠加 focused 高亮；文件不在树中时保留（树外无从高亮）
    focusedPath: null as string | null,
    // 工作区级错误（FileTree 底部展示；内联输入的错误由输入框就地显示）
    error: null as string | null,
  }),
  getters: {
    hasWorkspace(state): boolean {
      return state.roots.length > 0;
    },
    // 根作为第一层树节点渲染（isDir: true，与普通目录同样可展开/收起）
    rootNodes(state): FileNode[] {
      return state.roots.map((r) => ({
        name: r.name,
        path: r.path,
        isDir: true,
      }));
    },
  },
  actions: {
    // 启动恢复：settings.v2.json 里的根路径还原成根列表。逐根经 fs:read-tree 校验：
    // 磁盘上已删除/不可访问的根剔除并回写持久化列表（避免僵尸项目残留），
    // 成功的根顺手预热一层缓存，首次展开免读盘
    async restoreRoots(paths: string[]): Promise<void> {
      const results = await Promise.allSettled(
        paths.map(async (path) => {
          const tree = await window.api.fs.readTree({ dirPath: path });
          if (!tree.ok) throw new Error(tree.error);
          return tree.data;
        }),
      );
      const restored: WorkspaceRoot[] = [];
      let dropped = false;
      results.forEach((res, index) => {
        const path = paths[index];
        if (res.status === "fulfilled") {
          restored.push({ path, name: basename(path) });
          this.childrenCache.set(path, res.value);
        } else {
          dropped = true;
          console.warn(`[workspace] 项目根已不存在，跳过恢复: ${path}`);
        }
      });
      this.roots = restored;
      if (dropped) await this.persistRoots();
    },
    // 打开文件夹：弹窗选择 → 追加新根（重复路径不重复添加，tab 不受影响）
    async openFolder(): Promise<ApiResult<VoidResult>> {
      const ret = await window.api.dialog.openFolder();
      if (!ret.ok) return ret;
      if (!ret.data) return { ok: true, data: null }; // 用户取消
      const path = ret.data.path;
      if (this.roots.some((r) => r.path === path)) {
        return { ok: false, error: "该文件夹已在项目中，请勿重复添加" };
      }
      const tree = await window.api.fs.readTree({ dirPath: path });
      if (!tree.ok) {
        return { ok: false, error: `打开文件夹失败：${tree.error}` };
      }
      this.roots.push({ path, name: basename(path) });
      this.childrenCache.set(path, tree.data);
      this.expandedDirs.add(path); // 新根默认展开一层
      this.error = null;
      await this.persistRoots();
      return { ok: true, data: null };
    },
    // 仅从左侧列表移除根（不删磁盘文件）：清对应缓存与展开态；
    // 根下已打开的 tab 保留不动（文件还在盘上，自动保存照常）
    removeRoot(path: string): void {
      this.roots = this.roots.filter((r) => r.path !== path);
      for (const dir of [...this.childrenCache.keys()]) {
        if (isWithin(dir, path)) this.childrenCache.delete(dir);
      }
      for (const dir of [...this.expandedDirs]) {
        if (isWithin(dir, path)) this.expandedDirs.delete(dir);
      }
      if (this.creating && isWithin(this.creating.parentPath, path)) {
        this.creating = null;
      }
      if (this.renaming && isWithin(this.renaming.path, path)) {
        this.renaming = null;
      }
      void this.persistRoots();
    },
    // 根列表持久化：经 settings 通道写入 settings.v2.json（失败在 settings persist 内提示）
    async persistRoots(): Promise<void> {
      await useSettingsStore().setRoots(this.roots.map((r) => r.path));
    },
    // 懒加载一层子节点进缓存
    async loadChildren(dirPath: string): Promise<ApiResult<FileNode[]>> {
      const ret = await window.api.fs.readTree({ dirPath });
      if (!ret.ok) {
        this.error = ret.error;
        return ret;
      }
      this.childrenCache.set(dirPath, ret.data);
      return ret;
    },
    // 展开/折叠目录；展开时若无缓存则先懒加载
    async toggleDir(dirPath: string): Promise<void> {
      if (this.expandedDirs.has(dirPath)) {
        this.expandedDirs.delete(dirPath);
        return;
      }
      if (!this.childrenCache.has(dirPath)) {
        const ret = await this.loadChildren(dirPath);
        if (!ret.ok) return; // 加载失败不展开（error 已展示）
      }
      this.expandedDirs.add(dirPath);
    },
    // 从所属根到目标目录逐层展开（懒加载缺失层），保证深层目录的内联输入行可见
    async expandTo(dirPath: string): Promise<void> {
      const root = this.roots.find((r) => isWithin(dirPath, r.path));
      if (!root) return;
      // 相对根的中间路径逐段拼出（与主进程 path.join 用的分隔符保持一致）
      const rel = dirPath.slice(root.path.length);
      const sep = rel.includes("\\") ? "\\" : "/";
      const chain = [root.path];
      let acc = root.path;
      for (const seg of rel.split(sep).filter(Boolean)) {
        acc = acc + sep + seg;
        chain.push(acc);
      }
      for (const dir of chain) {
        if (this.expandedDirs.has(dir)) continue;
        if (!this.childrenCache.has(dir)) {
          const ret = await this.loadChildren(dir);
          if (!ret.ok) return; // 加载失败中止（error 已展示）
        }
        this.expandedDirs.add(dir);
      }
    },
    // reveal in tree（V8 需求 31）：记录聚焦路径并逐层展开父链让目标可见。
    // 复用 expandTo（懒加载缺失层）——其链尾即展开目标，文件路径改传父目录，
    // 避免对文件路径 readTree 报错；文件不在任何项目根下时静默不展开但保留
    // focusedPath（树外节点无从渲染，高亮自然不可见）。展开加载只改树状态，
    // 不回写 tabs，不会循环触发
    async revealInTree(path: string): Promise<void> {
      this.focusedPath = path;
      if (!this.roots.some((r) => isWithin(path, r.path))) return;
      const parent = dirname(path);
      if (parent === path) return; // 防御：路径无父级（不应出现）
      await this.expandTo(parent);
    },
    // 进入内联新建：从根到目标逐层展开，保证输入行可见
    startCreate(parentPath: string, type: "file" | "dir"): void {
      this.creating = { parentPath, type };
      void this.expandTo(parentPath);
    },
    startRename(path: string): void {
      this.renaming = { path };
    },
    clearPending(): void {
      this.creating = null;
      this.renaming = null;
    },
    // 新建文件/文件夹：成功后局部刷新父目录
    async createNode(
      parentPath: string,
      name: string,
      type: "file" | "dir",
    ): Promise<ApiResult<CreateResult>> {
      const ret = await window.api.fs.create({ parentPath, name, type });
      if (!ret.ok) return ret;
      await this.refreshDir(parentPath);
      this.error = null;
      return ret;
    },
    // 重命名：成功后联动 tabs（文件精确匹配 / 目录下整批换前缀），再重映射缓存与展开态
    async renameNode(
      oldPath: string,
      newPath: string,
    ): Promise<ApiResult<VoidResult>> {
      const ret = await window.api.fs.rename({ oldPath, newPath });
      if (!ret.ok) return ret;
      useTabsStore().renamePath(oldPath, newPath);
      remapTreePaths(this, oldPath, newPath);
      const refresh = await this.refreshDir(dirname(newPath));
      if (refresh.ok) this.error = null;
      return ret;
    },
    // 删除：先 flush 受影响 tab（此时盘上文件还在），任一失败则中止；删盘成功后再关 tab、清缓存
    // （删盘失败时 tab 保留：内容已落盘，用户可直接继续编辑）
    async removeNode(
      targetPath: string,
      isDir: boolean,
    ): Promise<ApiResult<VoidResult>> {
      const flushRet = await useTabsStore().flushTabsMatching((p) =>
        isWithin(p, targetPath),
      );
      if (!flushRet.ok) {
        this.error = `删除中止，文件写盘失败：${flushRet.error}`;
        return flushRet;
      }
      const ret = await window.api.fs.remove({ targetPath, isDir });
      if (!ret.ok) {
        // 删盘失败（文件被占用等）在树内可见，不只留在 console
        this.error = `删除失败：${ret.error}`;
        return ret;
      }
      useTabsStore().removeTabs(new Set(flushRet.data));
      dropTreePaths(this, targetPath);
      const refresh = await this.refreshDir(dirname(targetPath));
      if (refresh.ok) this.error = null;
      return ret;
    },
    // 增删改名后的定向刷新：只重读对应一层
    async refreshDir(dirPath: string): Promise<ApiResult<FileNode[]>> {
      const ret = await window.api.fs.readTree({ dirPath });
      if (!ret.ok) {
        this.error = ret.error;
        return ret;
      }
      this.childrenCache.set(dirPath, ret.data);
      return ret;
    },
  },
});

type WorkspaceStoreInstance = ReturnType<typeof useWorkspaceStore>;

// 旧前缀 → 新前缀的映射（含自身与子孙路径，两种分隔符兼容）
function remap(oldPath: string, newPath: string, p: string): string {
  return p === oldPath ? newPath : newPath + p.slice(oldPath.length);
}

// 目录改名后：重映射缓存 key、节点 path 与展开状态中的旧前缀，保持已展开的树状态不丢失；
// 挂起的内联新建/重命名目标在旧前缀下时同步换算，避免输入行指向陈旧路径
function remapTreePaths(
  store: WorkspaceStoreInstance,
  oldPath: string,
  newPath: string,
): void {
  for (const [dir, children] of [...store.childrenCache]) {
    if (!isWithin(dir, oldPath)) continue;
    store.childrenCache.delete(dir);
    store.childrenCache.set(remap(oldPath, newPath, dir), children);
  }
  // 缓存内 FileNode.path 的旧前缀单独换算（目录自身与子孙节点都在旧前缀下）
  for (const children of store.childrenCache.values()) {
    for (const node of children) {
      if (isWithin(node.path, oldPath))
        node.path = remap(oldPath, newPath, node.path);
    }
  }
  for (const dir of [...store.expandedDirs]) {
    if (isWithin(dir, oldPath)) {
      store.expandedDirs.delete(dir);
      store.expandedDirs.add(remap(oldPath, newPath, dir));
    }
  }
  if (store.creating && isWithin(store.creating.parentPath, oldPath)) {
    store.creating.parentPath = remap(
      oldPath,
      newPath,
      store.creating.parentPath,
    );
  }
  if (store.renaming && isWithin(store.renaming.path, oldPath)) {
    store.renaming.path = remap(oldPath, newPath, store.renaming.path);
  }
}

// 删除目录后：清掉其自身及内部所有缓存与展开状态（父层由 refreshDir 刷新）；
// 目标内部的挂起内联输入随之失效，一并清掉
function dropTreePaths(
  store: WorkspaceStoreInstance,
  targetPath: string,
): void {
  for (const dir of [...store.childrenCache.keys()]) {
    if (isWithin(dir, targetPath)) store.childrenCache.delete(dir);
  }
  for (const dir of [...store.expandedDirs]) {
    if (isWithin(dir, targetPath)) store.expandedDirs.delete(dir);
  }
  if (store.creating && isWithin(store.creating.parentPath, targetPath)) {
    store.creating = null;
  }
  if (store.renaming && isWithin(store.renaming.path, targetPath)) {
    store.renaming = null;
  }
}

// dev HMR：store 定义变更时替换注册表实例，避免组件已热更而 store 仍是旧实例的撕裂状态
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useWorkspaceStore, import.meta.hot));
}
