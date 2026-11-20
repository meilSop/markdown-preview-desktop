<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useTabsStore } from "@/stores/tabs";
import { useToast } from "@/composables/useToast";

const tabs = useTabsStore();
const { show } = useToast();

// 关闭前强制 flush（写盘失败则保留 tab，脏内容不静默丢弃；失败原因 toast 可见）。
// promise reject（如 dev 下 store 热更撕裂导致 action 缺失的 TypeError）也必须可见，
// 不能静默吞掉
async function onClose(id: string): Promise<void> {
  try {
    const ret = await tabs.closeTab(id);
    if (!ret.ok) show(`关闭标签失败：${ret.error}`);
  } catch (err) {
    show(`关闭标签失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// 批量关闭入口（V4 需求 21）：store 侧任一 flush 失败即整批中止，不丢脏内容；
// promise reject（如 store action 缺失的 TypeError）同样经 catch 转 toast，避免静默失败
async function onCloseBatch(ids: string[]): Promise<void> {
  try {
    const ret = await tabs.closeTabs(new Set(ids));
    if (!ret.ok) show(`关闭标签失败：${ret.error}`);
  } catch (err) {
    show(`关闭标签失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

// 右键菜单状态（自实现，模式同 FileTree）：id 为右键锚点 tab
const menu = ref<{ x: number; y: number; id: string } | null>(null);

interface MenuItem {
  label: string;
  disabled?: boolean;
  run: () => void;
}

// 菜单项以锚点 tab 在数组中的位置计算各关闭集合；
// 脏判定与 store 同口径（content !== savedContent），「关闭已保存」含锚点自身
const menuItems = computed<MenuItem[]>(() => {
  const target = menu.value;
  if (!target) return [];
  const all = tabs.tabs;
  const anchorIdx = all.findIndex((t) => t.id === target.id);
  if (anchorIdx < 0) return [];
  const others = all.filter((t) => t.id !== target.id).map((t) => t.id);
  const right = all.slice(anchorIdx + 1).map((t) => t.id);
  const left = all.slice(0, anchorIdx).map((t) => t.id);
  const saved = all
    .filter((t) => t.content === t.savedContent)
    .map((t) => t.id);
  return [
    { label: "关闭", run: () => void onClose(target.id) },
    {
      label: "关闭其他",
      disabled: all.length <= 1,
      run: () => void onCloseBatch(others),
    },
    {
      label: "关闭右侧标签页",
      disabled: anchorIdx >= all.length - 1,
      run: () => void onCloseBatch(right),
    },
    {
      label: "关闭左侧标签页",
      disabled: anchorIdx <= 0,
      run: () => void onCloseBatch(left),
    },
    {
      label: "关闭已保存",
      disabled: saved.length === 0,
      run: () => void onCloseBatch(saved),
    },
    {
      label: "关闭全部",
      run: () => void onCloseBatch(all.map((t) => t.id)),
    },
  ];
});

// 打开菜单：贴边时向内收，避免溢出窗口（宽约 150px / 六项高约 190px）
function openMenu(ev: MouseEvent, id: string): void {
  ev.preventDefault();
  ev.stopPropagation();
  const x = Math.min(ev.clientX, window.innerWidth - 150);
  const y = Math.min(ev.clientY, window.innerHeight - 190);
  menu.value = { x, y, id };
}

// 点击菜单项后关闭菜单再执行动作（禁用项 button 不触发 click）
function runItem(item: MenuItem): void {
  menu.value = null;
  item.run();
}

// window 级 mousedown / Esc 关闭菜单（菜单内部与打开源已阻断冒泡）
function onWindowMouseDown(): void {
  menu.value = null;
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") menu.value = null;
}
onMounted(() => {
  window.addEventListener("mousedown", onWindowMouseDown);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("mousedown", onWindowMouseDown);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="tab in tabs.tabs"
      :key="tab.id"
      class="tab-item"
      :class="{ active: tab.id === tabs.activeId }"
      :title="tab.path"
      @click="tabs.activate(tab.id)"
      @mousedown.middle.prevent="onClose(tab.id)"
      @contextmenu="openMenu($event, tab.id)"
    >
      <span
        v-if="tab.content !== tab.savedContent"
        class="tab-dirty"
        title="未写盘"
      ></span>
      <span class="tab-name">{{ tab.name }}</span>
      <span class="tab-close" title="关闭" @click.stop="onClose(tab.id)"
        >×</span
      >
    </div>

    <!-- 自实现右键菜单（V4 需求 21）：contextmenu 打开 + window 级 mousedown/Esc 关闭 -->
    <div
      v-if="menu"
      class="ctx-menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @mousedown.stop
      @contextmenu.prevent
    >
      <button
        v-for="item in menuItems"
        :key="item.label"
        class="ctx-item"
        :disabled="item.disabled"
        @click="runItem(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: var(--tabbar-height);
  background: var(--color-tab-bar-bg);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
}
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  border-right: 1px solid var(--color-border);
  user-select: none;
}
.tab-item.active {
  background: var(--color-tab-active-bg);
  color: var(--color-text);
  box-shadow: inset 0 2px 0 var(--color-accent);
}
.tab-dirty {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
}
.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-close {
  width: 16px;
  height: 16px;
  line-height: 14px;
  text-align: center;
  border-radius: 4px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.tab-close:hover {
  background: var(--color-accent-soft);
  color: var(--color-text);
}
/* —— 右键菜单：样式复制自 FileTree（scoped 样式不共享，保持类名与视觉一致）—— */
.ctx-menu {
  position: fixed;
  z-index: 100;
  min-width: 120px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  box-shadow: 0 4px 12px var(--color-shadow);
}
.ctx-item {
  display: block;
  width: 100%;
  padding: 5px 12px;
  font-size: 13px;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}
.ctx-item:hover {
  background: var(--color-accent-soft);
}
/* 禁用形态参照 TitleBar 的 .menu-item:disabled */
.ctx-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ctx-item:disabled:hover {
  background: transparent;
}
</style>
