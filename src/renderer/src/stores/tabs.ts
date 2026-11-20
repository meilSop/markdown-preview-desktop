import { acceptHMRUpdate, defineStore } from "pinia";
import type { ApiResult, VoidResult } from "@shared/types";
import { basename, isWithin } from "@/utils/path";

// Tab 持有 path + content + savedContent，dirty = content !== savedContent（派生，不单独存储）
export interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
}

let tabSeq = 0;

// per-tab 写盘串行链：防抖保存与关闭/删除联动 flush 并发时，后到的快照排在前一次之后执行，
// 保证磁盘最终态等于最后一次快照（避免旧快照后落盘覆盖新内容而 savedContent 已更新的静默丢失）
const writeChains = new Map<string, Promise<void>>();

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [] as Tab[],
    activeId: null as string | null,
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
  },
});

// dev HMR：store 定义变更时替换注册表实例，避免组件已热更而 store 仍是旧实例的撕裂状态
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTabsStore, import.meta.hot));
}
