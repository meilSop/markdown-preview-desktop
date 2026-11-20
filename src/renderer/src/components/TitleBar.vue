<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useTabsStore } from "@/stores/tabs";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import { useExport } from "@/composables/useExport";
import { useToast } from "@/composables/useToast";
import { dirname, isWithin } from "@/utils/path";

// 应用内菜单栏（V2 需求 13-14）：替代系统标题栏，整条可拖拽移动窗口，
// 菜单区与右上角窗口控制按钮 no-drag；窗口控制按钮为渲染层自绘
// （V3 需求 18，titleBarOverlay 在本机主题同步失效已移除），颜色走 CSS 变量，
// 随主题与自定义背景色自然联动
const emit = defineEmits<{ "open-settings": [] }>();

const tabs = useTabsStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const { exportHtml, exportPdf } = useExport();
const { show } = useToast();

type MenuName = "file" | "tools";
const openMenu = ref<MenuName | null>(null);
// 二级菜单（V3 需求 19）：记录当前展开子面板的父项 label
const openSubmenu = ref<string | null>(null);

interface MenuItem {
  label: string;
  disabled?: boolean;
  active?: boolean;
  children?: MenuItem[];
  // 带 children 的父项仅作展开入口，无 run
  run?: () => void;
}

function toggleMenu(name: MenuName): void {
  openSubmenu.value = null;
  openMenu.value = openMenu.value === name ? null : name;
}

// 收起全部菜单（含二级子面板）
function closeMenus(): void {
  openMenu.value = null;
  openSubmenu.value = null;
}

// 点击菜单项后先收起再执行（父项仅有 children，无 run）
function runItem(item: MenuItem): void {
  closeMenus();
  item.run?.();
}

// 二级菜单交互（V3 需求 19）：父项包裹元素（按钮 + 子面板）hover 展开 / 移出收起，
// 子面板在包裹元素内部，移入子面板不会误触发 mouseleave
function enterParent(item: MenuItem): void {
  if (item.children) openSubmenu.value = item.label;
}
function leaveParent(item: MenuItem): void {
  if (openSubmenu.value === item.label) openSubmenu.value = null;
}
// 父项点击同样可开合（无 hover / 键盘操作兜底）
function toggleSubmenu(item: MenuItem): void {
  openSubmenu.value = openSubmenu.value === item.label ? null : item.label;
}

// 「创建文件」：优先激活 tab 所在目录（须在某项目根内，内联输入行才能渲染到树上），
// 其次第一个根；两者皆无则提示先打开文件夹
function createFile(): void {
  const tabDir = tabs.activeTab ? dirname(tabs.activeTab.path) : null;
  const parentPath =
    (tabDir && workspace.roots.some((r) => isWithin(tabDir, r.path))
      ? tabDir
      : null) ??
    workspace.roots[0]?.path ??
    null;
  if (!parentPath) {
    show("请先打开文件夹，再创建文件");
    return;
  }
  workspace.startCreate(parentPath, "file");
}

// 打开单个 .md 文件（内容随对话框直接带回，免二次读盘）
async function openFile(): Promise<void> {
  const ret = await window.api.dialog.openFile();
  if (!ret.ok) {
    show(`打开文件失败：${ret.error}`);
    return;
  }
  if (ret.data) tabs.openFile(ret.data.path, ret.data.content);
}

// 打开文件夹 = 追加新项目根；失败（含重复添加提示）toast 可见
async function openFolder(): Promise<void> {
  const ret = await workspace.openFolder();
  if (!ret.ok) show(ret.error);
}

const fileItems = computed<MenuItem[]>(() => [
  { label: "创建文件", run: createFile },
  { label: "打开文件", run: () => void openFile() },
  { label: "打开文件夹", run: () => void openFolder() },
  {
    label: "导出 HTML",
    disabled: !tabs.activeTab,
    run: () => void exportHtml(),
  },
  {
    label: "导出 PDF",
    disabled: !tabs.activeTab,
    run: () => void exportPdf(),
  },
]);

// 工具菜单：「切换主题」+「模式切换」二级菜单（当前模式前置 ✓ 标识）
const toolsItems = computed<MenuItem[]>(() => [
  { label: "切换主题", run: () => emit("open-settings") },
  {
    label: "模式切换",
    children: [
      {
        label: "编辑",
        active: settings.layoutMode === "edit",
        run: () => void settings.setLayoutMode("edit"),
      },
      {
        label: "预览",
        active: settings.layoutMode === "preview",
        run: () => void settings.setLayoutMode("preview"),
      },
      {
        label: "编辑与预览分屏",
        active: settings.layoutMode === "split",
        run: () => void settings.setLayoutMode("split"),
      },
    ],
  },
]);

// —— 窗口控制（V3 需求 18）：IPC 交主进程执行 ——
function onMinimize(): void {
  void window.api.win.minimize();
}
function onMaximizeToggle(): void {
  void window.api.win.maximizeToggle();
}
function onClose(): void {
  void window.api.win.close();
}

// window 级 mousedown / Esc 关闭下拉（按钮与面板已阻断冒泡）
function onWindowMouseDown(): void {
  closeMenus();
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") closeMenus();
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
  <header class="title-bar">
    <nav class="menu-area">
      <div class="menu-root">
        <button
          class="menu-btn"
          :class="{ open: openMenu === 'file' }"
          @mousedown.stop
          @click.stop="toggleMenu('file')"
        >
          文件
        </button>
        <div v-if="openMenu === 'file'" class="menu-panel" @mousedown.stop>
          <button
            v-for="item in fileItems"
            :key="item.label"
            class="menu-item"
            :disabled="item.disabled"
            @click="runItem(item)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="menu-root">
        <button
          class="menu-btn"
          :class="{ open: openMenu === 'tools' }"
          @mousedown.stop
          @click.stop="toggleMenu('tools')"
        >
          工具
        </button>
        <div v-if="openMenu === 'tools'" class="menu-panel" @mousedown.stop>
          <div
            v-for="item in toolsItems"
            :key="item.label"
            class="menu-row"
            @mouseenter="enterParent(item)"
            @mouseleave="leaveParent(item)"
          >
            <!-- 带子菜单的父项：右侧 › 箭头；点击可开合，hover 由 .menu-row 接管 -->
            <button
              v-if="item.children"
              class="menu-item menu-parent"
              @click="toggleSubmenu(item)"
            >
              {{ item.label }}
              <span class="menu-arrow">›</span>
            </button>
            <button v-else class="menu-item" @click="runItem(item)">
              {{ item.label }}
            </button>
            <!-- 子面板（V3 需求 19）：复用 .menu-panel 样式，锚定父项右侧展开 -->
            <div
              v-if="item.children && openSubmenu === item.label"
              class="menu-panel submenu-panel"
              @mousedown.stop
            >
              <button
                v-for="child in item.children"
                :key="child.label"
                class="menu-item"
                @click="runItem(child)"
              >
                <span class="menu-check">{{ child.active ? "✓" : "" }}</span>
                {{ child.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
    <div class="title-drag-fill"></div>
    <!-- 窗口控制按钮（V3 需求 18）：自绘替代 titleBarOverlay，颜色随主题/背景色联动 -->
    <div class="win-controls">
      <button
        class="win-btn"
        title="最小化"
        @mousedown.stop
        @click="onMinimize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M0 5h10" stroke="currentColor" />
        </svg>
      </button>
      <button
        class="win-btn"
        title="最大化 / 还原"
        @mousedown.stop
        @click="onMaximizeToggle"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
        </svg>
      </button>
      <button
        class="win-btn win-close"
        title="关闭"
        @mousedown.stop
        @click="onClose"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  height: 36px;
  /* 用 --color-bg 而非 tab-bar-bg：右上角自绘窗口控制按钮区同锚 --color-bg
     （含自定义背景色覆盖），整条标题栏同色，避免出现色差矩形补丁 */
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
  -webkit-app-region: drag;
}
.menu-area {
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
}
.menu-root {
  position: relative;
  display: flex;
}
.menu-btn {
  padding: 0 12px;
  font-size: 13px;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}
.menu-btn:hover,
.menu-btn.open {
  background: var(--color-accent-soft);
}
.menu-panel {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 150;
  min-width: 150px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  box-shadow: 0 4px 12px var(--color-shadow);
}
.menu-item {
  display: block;
  width: 100%;
  padding: 5px 16px;
  font-size: 13px;
  text-align: left;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  white-space: nowrap;
}
.menu-item:hover {
  background: var(--color-accent-soft);
}
.menu-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.menu-item:disabled:hover {
  background: transparent;
}
/* —— 二级菜单（V3 需求 19）：父项行 + 右侧展开的子面板 —— */
.menu-row {
  position: relative;
}
.menu-parent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.menu-arrow {
  font-size: 12px;
  opacity: 0.7;
}
/* 覆盖 .menu-panel 的 top/left：子面板锚定父项行右侧（-4px 对齐一级面板内边距） */
.submenu-panel {
  top: -4px;
  left: 100%;
}
/* 勾选列固定宽度：非激活项占位，保证子项文本左对齐 */
.menu-check {
  display: inline-block;
  width: 16px;
}
/* —— 窗口控制按钮（V3 需求 18）—— */
.win-controls {
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
}
.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}
.win-btn svg {
  display: block;
}
.win-btn:hover {
  background: var(--color-accent-soft);
}
.win-btn.win-close:hover {
  /* Windows 关闭按钮惯例红底白叉 */
  background: #e81123;
  color: #ffffff;
}
.title-drag-fill {
  flex: 1;
}
</style>
