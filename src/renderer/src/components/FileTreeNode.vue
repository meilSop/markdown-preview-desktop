<script setup lang="ts">
import { computed, ref } from "vue";
import type { FileNode } from "@shared/types";
import InlineNameInput from "./InlineNameInput.vue";
import { useTabsStore } from "@/stores/tabs";
import { useWorkspaceStore } from "@/stores/workspace";

// 递归树节点：目录懒加载展开，.md 点击开 tab；右键上报给 FileTree 统一渲染菜单
const props = defineProps<{
  node: FileNode;
  depth: number;
}>();
// isRoot：是否第一层节点（FileTree 只在 depth 0 渲染项目根），决定菜单是否含「移除项目」
const emit = defineEmits<{
  menu: [ev: MouseEvent, node: FileNode, isRoot: boolean];
}>();

const tabs = useTabsStore();
const workspace = useWorkspaceStore();

const expanded = computed(() => workspace.expandedDirs.has(props.node.path));
const children = computed(
  () => workspace.childrenCache.get(props.node.path) ?? [],
);
const isActiveFile = computed(() => tabs.activeTab?.path === props.node.path);
// 树内聚焦高亮（V8 需求 31）：reveal in tree 的目标文件，与 active 选中态同款配色叠加
const isFocused = computed(() => workspace.focusedPath === props.node.path);
const isRenaming = computed(() => workspace.renaming?.path === props.node.path);
const isCreatingHere = computed(
  () => workspace.creating?.parentPath === props.node.path,
);
const creatingType = computed(() => workspace.creating?.type ?? "file");

// 目录点击 → 展开/折叠（懒加载一层）；.md 文件点击 → 打开 tab；非 .md 无操作
function onClick(): void {
  if (props.node.isDir) {
    void workspace.toggleDir(props.node.path);
    return;
  }
  if (!props.node.name.toLowerCase().endsWith(".md")) return;
  void tabs.openFromDisk(props.node.path).then((ret) => {
    if (!ret.ok) console.error("[filetree] 打开文件失败:", ret.error);
  });
}

// 右键：拦截默认菜单并阻断冒泡（防止 window 级监听立即关闭新菜单）
function onMouseDown(ev: MouseEvent): void {
  if (ev.button !== 2) return;
  ev.preventDefault();
  ev.stopPropagation();
  // 按层级判根而非路径比对：嵌套多根时，根的子目录若也被挂为项目，
  // 同路径的树内节点（depth > 0）不会被误判成根
  emit("menu", ev, props.node, props.depth === 0);
}

// 根行手动刷新（仅 depth 0 渲染按钮）：调 store.refreshRoot 重读该根下
// 已缓存的目录层；busy 期间忽略重复点击，图标旋转作为进行中反馈
const refreshing = ref(false);
async function onRefresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await workspace.refreshRoot(props.node.path);
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <div class="tree-node">
    <div
      class="node-row"
      :class="{ active: isActiveFile, focused: isFocused }"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      :title="node.path"
      :data-path="node.path"
      @mousedown="onMouseDown"
      @click="onClick"
    >
      <span class="node-arrow" :class="{ open: expanded }">
        {{ node.isDir ? "▸" : "" }}
      </span>
      <span class="node-icon">{{ node.isDir ? "📁" : "📄" }}</span>
      <!-- 重命名输入行：阻断行级点击，避免触发展开/折叠 -->
      <span v-if="isRenaming" class="node-edit-slot">
        <InlineNameInput mode="rename" :target-path="node.path" />
      </span>
      <span v-else class="node-name">{{ node.name }}</span>
      <!-- 根目录手动刷新按钮（仅第一层节点）：hover 显形，busy 时常驻并旋转；
           click.stop 阻断冒泡，避免触发行的展开/折叠 -->
      <button
        v-if="depth === 0"
        class="node-refresh"
        :class="{ busy: refreshing }"
        title="刷新"
        aria-label="刷新"
        @click.stop="onRefresh"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path
            d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
          />
        </svg>
      </button>
    </div>
    <template v-if="node.isDir && expanded">
      <!-- 内联新建输入行：渲染在该目录子节点列表顶部 -->
      <div
        v-if="isCreatingHere"
        class="node-row create-row"
        :style="{ paddingLeft: `${(depth + 1) * 14 + 8}px` }"
        @mousedown.stop
        @click.stop
      >
        <InlineNameInput
          mode="create"
          :parent-path="node.path"
          :type="creatingType"
        />
      </div>
      <FileTreeNode
        v-for="child in children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        @menu="(ev, n, isRoot) => emit('menu', ev, n, isRoot)"
      />
    </template>
  </div>
</template>

<style scoped>
.node-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding-right: 8px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 4px;
  user-select: none;
}
.node-row:hover {
  background: var(--color-accent-soft);
}
/* active = 点击/激活 tab 的文件；focused = reveal in tree 跟随激活 tab 的目标
   （V8 需求 31）：同款配色，两者叠加不冲突 */
.node-row.active,
.node-row.focused {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.node-row.create-row {
  cursor: default;
}
.node-arrow {
  width: 12px;
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-secondary);
  transition: transform 0.1s;
}
.node-arrow.open {
  transform: rotate(90deg);
}
.node-icon {
  flex-shrink: 0;
  font-size: 12px;
}
.node-name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-edit-slot {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}
/* 根目录手动刷新按钮：行尾右对齐，hover 显形（占位恒在，行高稳定不跳动）；
   busy 时常驻可见并旋转图标 */
.node-refresh {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}
.node-row:hover .node-refresh,
.node-refresh.busy {
  opacity: 1;
  pointer-events: auto;
}
.node-refresh:hover {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.node-refresh svg {
  width: 12px;
  height: 12px;
}
.node-refresh.busy svg {
  animation: node-refresh-spin 0.8s linear infinite;
}
@keyframes node-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
