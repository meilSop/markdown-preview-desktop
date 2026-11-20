import { acceptHMRUpdate, defineStore } from "pinia";
import type { ApiResult, VoidResult } from "@shared/types";
import { basename, isWithin } from "@/utils/path";
import { useToast } from "@/composables/useToast";

// Tab 持有 path + content + savedContent，dirty = content !== savedContent（派生，不单独存储）
export interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
}

// 全局检索联动高亮数据源（V8 需求 28）：查询串 + 匹配开关，与主进程检索参数同源。
// EditorPane 按同一口径构建正则扫描当前文档，保证编辑器高亮与结果列表一致
// （check 轮修复：原先只透传字面量串，编辑器恒为大小写敏感 indexOf，与
// caseSensitive / wholeWord / useRegex 三开关口径不一致）
// source（V8 需求 32）：写入来源——workspace = 全局检索面板（SearchPanel），
// editor = 文件内查找替换面板（EditorFindPanel）。两者共用 activeQuery 单一槽位，
// 后写入者生效（互斥），编辑器面板关闭时经 restoreWorkspaceQuery 恢复全局检索 spec
export interface GlobalQuerySpec {
  source: "workspace" | "editor";
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

let tabSeq = 0;

// per-tab 写盘串行链：防抖保存与关闭/删除联动 flush 并发时，后到的快照排在前一次之后执行，
// 保证磁盘最终态等于最后一次快照（避免旧快照后落盘覆盖新内容而 savedContent 已更新的静默丢失）
const writeChains = new Map<string, Promise<void>>();

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [] as Tab[],
    activeId: null as string | null,
    // 全局检索跳行联动（V7 需求 25）：待编辑器消费的定位目标，消费后置 null
    pendingLine: null as { path: string; line: number } | null,
    // 联动高亮当前生效 spec（V8 需求 28/32）：单一槽位，后写入者胜；
    // SearchPanel 搜索成功后写入（workspace 来源），清空或失败置 null；
    // EditorFindPanel 打开期间覆盖为 editor 来源 spec，关闭时恢复 workspaceQuery
    activeQuery: null as GlobalQuerySpec | null,
    // 全局检索最近一次有效 spec（V8 需求 32）：文件内查找面板打开期间 activeQuery 被覆盖，
    // 面板关闭时经 restoreWorkspaceQuery 恢复此值联动高亮；全局检索清空/失败时同步置 null
    workspaceQuery: null as GlobalQuerySpec | null,
  }),
  getters: {
    activeTab(state): Tab | null {
      return state.tabs.find((tab) => tab.id === state.activeId) ?? null;
    },
    hasDirty(state): boolean {
      return state.tabs.some((tab) => tab.content !== tab.savedContent);
    },
  },
  actions: {
    // 打开文件：同 path 复用已有 tab（内容由 dialog:open-file 直接带回，免二次读盘）
    openFile(path: string, content: string): void {
      const existing = this.tabs.find((tab) => tab.path === path);
      if (existing) {
        this.activeId = existing.id;
        return;
      }
      tabSeq += 1;
      const tab: Tab = {
        id: `tab-${tabSeq}`,
        path,
        name: basename(path),
        content,
        savedContent: content,
      };
      this.tabs.push(tab);
      this.activeId = tab.id;
    },
    // 文件树点击入口：已打开则直接激活，否则读盘后复用/新建 tab
    async openFromDisk(filePath: string): Promise<ApiResult<VoidResult>> {
      const existing = this.tabs.find((tab) => tab.path === filePath);
      if (existing) {
        this.activeId = existing.id;
        return { ok: true, data: null };
      }
      const ret = await window.api.fs.readFile({ filePath });
      if (!ret.ok) return ret;
      this.openFile(filePath, ret.data.content);
      return { ok: true, data: null };
    },
    activate(id: string): void {
      this.activeId = id;
    },
    // 编辑器 updateListener 单向写回
    updateContent(id: string, content: string): void {
      const tab = this.tabs.find((t) => t.id === id);
      if (tab) tab.content = content;
    },
    // 更新联动高亮的数据源（SearchPanel 调用）：null = 清空搜索 / 检索失败，编辑器移除全部
    // 联动 mark；workspace 来源的 spec 同步记入 workspaceQuery 供查找面板关闭后恢复
    setActiveQuery(query: GlobalQuerySpec | null): void {
      this.activeQuery = query;
      if (query === null) this.workspaceQuery = null;
      else if (query.source === "workspace") this.workspaceQuery = query;
    },
    // 文件内查找面板写入（V8 需求 32）：仅覆盖 activeQuery 生效槽位（后写入者胜），
    // 不动 workspaceQuery——面板关闭时全局检索 spec 仍可恢复
    setEditorQuery(query: GlobalQuerySpec | null): void {
      this.activeQuery = query;
    },
    // 文件内查找面板关闭（V8 需求 32）：恢复全局检索 spec（可能 null），返回恢复值供
    // EditorPane 显式下发（同引用赋值不触发 watch，不能依赖 watch 回声）
    restoreWorkspaceQuery(): GlobalQuerySpec | null {
      this.activeQuery = this.workspaceQuery;
      return this.activeQuery;
    },
    // 写盘（防抖保存与 flush 共用）：入 per-tab 串行链排队，写盘期间的新编辑保留脏状态
    async flushTab(id: string): Promise<ApiResult<VoidResult>> {
      const tab = this.tabs.find((t) => t.id === id);
      if (!tab || tab.content === tab.savedContent) {
        return { ok: true, data: null };
      }
      const prev = writeChains.get(id) ?? Promise.resolve();
      const run = prev.then(() => this.writeTab(id));
      const tail = run.then(
        () => undefined,
        () => undefined,
      );
      writeChains.set(id, tail);
      try {
        return await run;
      } catch (err) {
        // invoke 传输层异常（handler 内业务错误已是 ApiResult）也收敛为 ApiResult
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        if (writeChains.get(id) === tail) writeChains.delete(id);
      }
    },
    // 串行链内实际写盘：执行时才取最新快照（排队期间可能又有编辑或路径改名）
    async writeTab(id: string): Promise<ApiResult<VoidResult>> {
      const tab = this.tabs.find((t) => t.id === id);
      if (!tab || tab.content === tab.savedContent) {
        return { ok: true, data: null };
      }
      const snapshot = tab.content;
      const ret = await window.api.fs.writeFile({
        filePath: tab.path,
        content: snapshot,
      });
      if (ret.ok && tab.content === snapshot) {
        tab.savedContent = snapshot;
      }
      return ret;
    },
    // 移除 tab 并修正激活态：激活 tab 被关时，落到原位置之后第一个保留的 tab（其后没有则落到前面最近的）
    removeTabs(ids: Set<string>): void {
      if (ids.size === 0) return;
      const firstRemovedIdx = this.tabs.findIndex((t) => ids.has(t.id));
      this.tabs = this.tabs.filter((t) => !ids.has(t.id));
      if (this.activeId && ids.has(this.activeId)) {
        const next =
          this.tabs[Math.min(firstRemovedIdx, this.tabs.length - 1)] ?? null;
        this.activeId = next ? next.id : null;
      }
    },
    // 关闭单个 tab：先强制 flush，写盘失败不关闭（脏内容不静默丢弃）
    async closeTab(id: string): Promise<ApiResult<VoidResult>> {
      const ret = await this.flushTab(id);
      if (!ret.ok) return ret;
      this.removeTabs(new Set([id]));
      return ret;
    },
    // 批量关闭（V4 需求 21 标签右键菜单）：逐个 flush 保持 closeTab 的"关闭即保存并关闭"
    // 语义，任一写盘失败立即中止返回该错误（已成功的保留不回滚）；全部成功后统一移除，
    // 激活 tab 落到被关集合时的回落逻辑由 removeTabs 接管
    async closeTabs(ids: Set<string>): Promise<ApiResult<VoidResult>> {
      for (const id of ids) {
        const ret = await this.flushTab(id);
        if (!ret.ok) return ret;
      }
      this.removeTabs(ids);
      return { ok: true, data: null };
    },
    // 批量 flush（文件树删除联动，盘上文件此时还在）：任一 flush 失败则整体中止，
    // 成功后返回 id 集合，供删盘完成后再统一关闭
    async flushTabsMatching(
      match: (path: string) => boolean,
    ): Promise<ApiResult<string[]>> {
      const matched = this.tabs.filter((tab) => match(tab.path));
      const ids: string[] = [];
      for (const tab of matched) {
        const ret = await this.flushTab(tab.id);
        if (!ret.ok) return ret;
        ids.push(tab.id);
      }
      return { ok: true, data: ids };
    },
    // 文件树重命名联动：文件精确匹配；目录改名时其下所有 tab 同步新路径（内容/脏状态保留）
    renamePath(oldPath: string, newPath: string): void {
      for (const tab of this.tabs) {
        if (tab.path === oldPath) {
          tab.path = newPath;
          tab.name = basename(newPath);
        } else if (isWithin(tab.path, oldPath)) {
          tab.path = newPath + tab.path.slice(oldPath.length);
          tab.name = basename(tab.path);
        }
      }
    },
    // 全局检索结果点击（V7 需求 25）：打开/激活目标 tab 后挂起跳行目标，
    // 由 EditorPane watch 消费（定位 / 居中 / 聚焦后置 null）
    async revealLine(path: string, line: number): Promise<void> {
      const ret = await this.openFromDisk(path);
      if (!ret.ok) {
        useToast().show(`打开文件失败：${ret.error}`);
        return;
      }
      const tab = this.tabs.find((t) => t.path === path);
      if (!tab) return;
      this.activate(tab.id);
      this.pendingLine = { path, line };
    },
    // 全局替换后刷新已开 tab（V7 需求 25）：对命中的已开 tab 重读盘上内容，
    // 保留 activeId 与 tab 顺序；此时脏内容已在替换前 flush，重读即最新盘面
    async reloadTabsByPaths(paths: Set<string>): Promise<void> {
      for (const tab of this.tabs) {
        if (!paths.has(tab.path)) continue;
        const ret = await window.api.fs.readFile({ filePath: tab.path });
        if (!ret.ok) {
          useToast().show(`刷新标签内容失败：${ret.error}`);
          continue;
        }
        tab.content = ret.data.content;
        tab.savedContent = ret.data.content;
      }
    },
  },
});

// dev HMR：store 定义变更时替换注册表实例，避免组件已热更而 store 仍是旧实例的撕裂状态
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTabsStore, import.meta.hot));
}
