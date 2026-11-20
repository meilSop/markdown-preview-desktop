<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { FileNode } from "@shared/types";
import ConfirmDialog from "./ConfirmDialog.vue";
import FileTreeNode from "./FileTreeNode.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTabsStore } from "@/stores/tabs";

// 文件树容器：多项目根 + 懒加载树 + 右键菜单（自实现）+ 删除/移除确认。
// visible 由 SideBar 按 activeView 传入（V8 需求 29 v-show 常驻的伴生信号）
const props = defineProps<{ visible: boolean }>();

const workspace = useWorkspaceStore();
const tabs = useTabsStore();

// 树容器引用：reveal in tree 时在容器内按 data-path 查找目标节点滚动到可见（V8 需求 31）
const treeEl = ref<HTMLElement | null>(null);

// reveal 目标滚动到可见：按 focusedPath 查节点居中（CSS.escape 转义 Windows 反斜杠等
// 特殊字符，保证属性选择器字面匹配）
function scrollToFocused(): void {
  if (!workspace.focusedPath) return;
  treeEl.value
    ?.querySelector(`[data-path="${CSS.escape(workspace.focusedPath)}"]`)
    ?.scrollIntoView({ block: "center" });
}

// 隐藏期间发起的 reveal（检索跳行时 explorer 处于 display:none，scrollIntoView
// 静默失败）记一笔待补滚，切回 explorer 时补一次定位（check 轮补充）
let revealPending = false;

// 文件树跟随激活 tab（V8 需求 31）：激活路径变化（打开 / 切换 / 检索跳行）时 reveal——
// 展开父链（懒加载缺失层）+ focused 高亮，nextTick 等待新层渲染后滚动到可见。
// 只 watch 激活路径一处，展开/加载只改树状态不回写 tabs，无循环触发；
// path 为空（关闭全部 tab）直接 return 不清 focusedPath（保持既有高亮，与
// VSCode 关闭编辑器后资源管理器选中态保留的行为一致）
watch(
  () => tabs.activeTab?.path,
  async (path) => {
    if (!path) return;
    await workspace.revealInTree(path);
    await nextTick();
    if (props.visible) scrollToFocused();
    else revealPending = true;
  },
);

// 切回 explorer 视图时消费待补滚（V8 需求 31，check 轮补充）
watch(
  () => props.visible,
  (visible) => {
    if (!visible || !revealPending) return;
    revealPending = false;
    void nextTick(scrollToFocused);
  },
);

// 右键菜单状态：node 为 null 表示树空白区域（作用对象为第一个根）；
// isRoot 由 FileTreeNode 按 depth === 0 上报（第一层节点即项目根，不按路径比对）
const menu = ref<{
  x: number;
  y: number;
  node: FileNode | null;
  isRoot: boolean;
} | null>(null);
// 确认框状态：删除普通节点 / 从列表移除项目根（文案与动作不同）
const confirm = ref<
  | { type: "delete"; node: FileNode }
  | { type: "remove"; path: string; name: string }
  | null
>(null);

interface MenuItem {
  label: string;
  danger?: boolean;
  run: () => void;
}

// 菜单项按目标类型区分：目录（含空白区域）有新建项；根节点不含重命名/删除
// （避免误删整个项目盘上数据），改为提供「移除项目」（仅从列表移除，不删盘）
const menuItems = computed<MenuItem[]>(() => {
  const target = menu.value;
  const node = target?.node ?? null;
  const items: MenuItem[] = [];
  if (!node || node.isDir) {
    const parentPath = node?.path ?? workspace.roots[0]?.path ?? "";
    items.push(
      {
        label: "新建文件",
        run: () => workspace.startCreate(parentPath, "file"),
      },
      {
        label: "新建文件夹",
        run: () => workspace.startCreate(parentPath, "dir"),
      },
    );
  }
  if (node && target?.isRoot) {
    items.push({
      label: "移除项目",
      danger: true,
      run: () => {
        confirm.value = { type: "remove", path: node.path, name: node.name };
      },
    });
  } else if (node) {
    items.push({
      label: "重命名",
      run: () => workspace.startRename(node.path),
    });
    items.push({
      label: "删除",
      danger: true,
      run: () => {
        confirm.value = { type: "delete", node };
      },
    });
  }
  return items;
});

const confirmMessage = computed(() => {
  const c = confirm.value;
  if (!c) return "";
  if (c.type === "remove") {
    return `将项目「${c.name}」从左侧列表移除？仅从列表移除，不会删除磁盘文件。`;
  }
  return c.node.isDir
    ? `删除文件夹「${c.node.name}」？其中所有内容将一并删除，且不可恢复。`
    : `删除文件「${c.node.name}」？该操作不可恢复。`;
});

const confirmText = computed(() =>
  confirm.value?.type === "remove" ? "移除" : "删除",
);

// 打开菜单：贴边时向内收，避免溢出窗口
function openMenu(ev: MouseEvent, node: FileNode | null, isRoot = false): void {
  ev.preventDefault();
  ev.stopPropagation();
  if (!workspace.hasWorkspace) return;
  const x = Math.min(ev.clientX, window.innerWidth - 150);
  const y = Math.min(ev.clientY, window.innerHeight - 140);
  menu.value = { x, y, node, isRoot };
}

// 树空白区域右键：以第一个根为新建目标
function onBgMouseDown(ev: MouseEvent): void {
  if (ev.button === 2) openMenu(ev, null);
}

// 点击菜单项后关闭菜单再执行动作
function runItem(item: MenuItem): void {
  menu.value = null;
  item.run();
}

// 任意区域按下鼠标即关闭菜单（菜单内部与打开源已阻断冒泡）
function onWindowMouseDown(): void {
  menu.value = null;
}
onMounted(() => window.addEventListener("mousedown", onWindowMouseDown));
onBeforeUnmount(() =>
  window.removeEventListener("mousedown", onWindowMouseDown),
);

async function onConfirm(): Promise<void> {
  const c = confirm.value;
  confirm.value = null;
  if (!c) return;
  if (c.type === "delete") {
    const ret = await workspace.removeNode(c.node.path, c.node.isDir);
    if (!ret.ok) console.error("[filetree] 删除失败:", ret.error);
  } else {
    workspace.removeRoot(c.path);
  }
}
</script>

<template>
  <div
    ref="treeEl"
    class="file-tree"
    @mousedown="onBgMouseDown"
    @contextmenu.prevent
  >
    <template v-if="workspace.hasWorkspace">
      <!-- 项目根作为第一层节点渲染：可展开/收起，懒加载逻辑与普通目录一致 -->
      <FileTreeNode
        v-for="root in workspace.rootNodes"
        :key="root.path"
        :node="root"
        :depth="0"
        @menu="openMenu"
      />
    </template>
    <p v-else class="tree-hint">
      未打开文件夹<br />
      通过顶部「文件」菜单 →「打开文件夹」添加项目
    </p>
    <p v-if="workspace.error" class="tree-error">{{ workspace.error }}</p>

    <!-- 自实现右键菜单：mousedown 打开 + window 级监听关闭 -->
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
        :class="{ danger: item.danger }"
        @click="runItem(item)"
      >
        {{ item.label }}
      </button>
    </div>

    <ConfirmDialog
      v-if="confirm"
      :message="confirmMessage"
      :confirm-text="confirmText"
      @confirm="onConfirm"
      @cancel="confirm = null"
    />
  </div>
</template>

<style scoped>
.file-tree {
  flex: 1;
  min-height: 0;
  padding: 4px 0 8px;
  overflow-y: auto;
}
.tree-hint {
  margin: 8px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.tree-error {
  margin: 8px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--color-danger);
  background: var(--color-bg);
  border: 1px solid var(--color-danger);
  border-radius: 4px;
  word-break: break-all;
}
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
.ctx-item.danger {
  color: var(--color-danger);
}
</style>
