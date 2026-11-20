import { watch } from "vue";
import { useTabsStore } from "@/stores/tabs";

const AUTOSAVE_DELAY = 1500; // 编辑停顿 1.5s 后写盘（prd.md 保存策略）

// 自动保存：编辑器写回 store 后登记待保存 tab，防抖到期统一走 fs:write-file
export function useAutoSave(): { flushNow: () => Promise<void> } {
  const tabs = useTabsStore();

  const pendingIds = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing: Promise<void> | null = null;

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flushPending();
    }, AUTOSAVE_DELAY);
  }

  function flushPending(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const ids = [...pendingIds];
    pendingIds.clear();
    // 串行化：等前一批写盘结束后再写本批，防止同 tab 两批并发时旧快照后落盘覆盖新内容
    const prev = flushing ?? Promise.resolve();
    flushing = (async () => {
      await prev.catch(() => undefined);
      for (const id of ids) {
        const ret = await tabs.flushTab(id);
        if (!ret.ok) console.error("[autosave] 写盘失败:", ret.error);
      }
    })();
    return flushing;
  }

  // 关闭标签 / 退出应用时强制写盘：先等在途写盘结束，再取此刻快照补一次，防丢尾部编辑
  async function flushNow(): Promise<void> {
    if (flushing) {
      await flushing.catch(() => undefined);
    }
    await flushPending();
  }

  watch(
    () => tabs.activeTab?.content,
    () => {
      if (!tabs.activeTab) return;
      pendingIds.add(tabs.activeTab.id);
      schedule();
    },
  );

  return { flushNow };
}
