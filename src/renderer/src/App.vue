<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import TitleBar from "@/components/TitleBar.vue";
import SideBar from "@/components/SideBar.vue";
import TabBar from "@/components/TabBar.vue";
import EditorPane from "@/components/EditorPane.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import SettingsDialog from "@/components/SettingsDialog.vue";
import Toast from "@/components/Toast.vue";
import { useTabsStore } from "@/stores/tabs";
import { useWorkspaceStore } from "@/stores/workspace";
import { useSettingsStore } from "@/stores/settings";
import { useAutoSave } from "@/composables/useAutoSave";

const tabs = useTabsStore();
const workspace = useWorkspaceStore();
const settings = useSettingsStore();
const { flushNow } = useAutoSave();

// 设置对话框开关（工具菜单 → 切换主题）
const settingsOpen = ref(false);

// 分栏比例（编辑器占比），P0 不做持久化
const splitRatio = ref(0.5);
const splitRef = ref<HTMLElement | null>(null);

// 拖拽分隔条：mousedown + window 级 mousemove，比例限制在 20%~80%
function startDrag(): void {
  const container = splitRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const onMove = (ev: MouseEvent): void => {
    splitRatio.value = Math.min(
      0.8,
      Math.max(0.2, (ev.clientX - rect.left) / rect.width),
    );
  };
  const onUp = (): void => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

// 滚动同步接线（单向）：编辑器视口顶行号 → 预览对齐到对应标题
const previewRef = ref<InstanceType<typeof MarkdownPreview> | null>(null);
function onEditorScroll(line: number): void {
  previewRef.value?.scrollToLine(line);
}

// 退出 flush：主进程拦 close 后通知过来，写盘完成再 invoke 确认，主进程销毁窗口
let offFlush: (() => void) | null = null;
onMounted(() => {
  // settings 读完后按持久化的根路径恢复文件树（逐根校验预热首层，深层仍懒加载）
  void settings
    .init()
    .then(() => workspace.restoreRoots(settings.roots))
    .catch((err) => console.error("[workspace] 根恢复失败:", err));
  offFlush = window.api.win.onFlushRequest(() => {
    void flushNow().finally(() => {
      void window.api.win.flushDone();
    });
  });
});
onBeforeUnmount(() => {
  offFlush?.();
});
</script>

<template>
  <div class="app-shell">
    <TitleBar @open-settings="settingsOpen = true" />
    <div class="app-body">
      <SideBar />
      <main class="main-area">
        <TabBar />
        <!-- 主操作区三分支（V3 需求 19）：按 layoutMode 渲染仅编辑 / 仅预览 / 分屏；
             EditorPane 在 edit 与 split 是两个挂载点，模式切换会重挂载——
             文档内容完全取自 tabs store（onMounted 初始化），无状态丢失 -->
        <div
          v-if="tabs.activeTab && settings.layoutMode === 'split'"
          ref="splitRef"
          class="split"
        >
          <section
            class="split-editor"
            :style="{ width: `${splitRatio * 100}%` }"
          >
            <EditorPane @editor-scroll="onEditorScroll" />
          </section>
          <div class="split-divider" @mousedown="startDrag"></div>
          <section class="split-preview">
            <MarkdownPreview ref="previewRef" />
          </section>
        </div>
        <section
          v-else-if="tabs.activeTab && settings.layoutMode === 'edit'"
          class="single-pane"
        >
          <EditorPane @editor-scroll="onEditorScroll" />
        </section>
        <section
          v-else-if="tabs.activeTab && settings.layoutMode === 'preview'"
          class="single-pane"
        >
          <MarkdownPreview ref="previewRef" />
        </section>
        <div v-else class="empty-state">
          <p class="empty-title">尚未打开文件</p>
          <p class="empty-hint">
            通过顶部「文件」菜单打开文件 / 文件夹开始编辑
          </p>
        </div>
      </main>
    </div>
    <SettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
    <Toast />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.split {
  flex: 1;
  display: flex;
  min-height: 0;
}
.split-editor {
  min-width: 0;
  overflow: hidden;
}
.split-preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.split-divider {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--color-border);
}
.split-divider:hover {
  background: var(--color-accent);
}
/* 单面板模式（仅编辑 / 仅预览，V3 需求 19） */
.single-pane {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}
.empty-title {
  font-size: 16px;
  margin: 0;
}
.empty-hint {
  margin-top: 8px;
  font-size: 13px;
}
</style>
