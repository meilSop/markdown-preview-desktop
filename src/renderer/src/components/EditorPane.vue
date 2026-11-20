<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Extension } from "@codemirror/state";
import { Compartment, EditorState } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTabsStore } from "@/stores/tabs";
import { useSettingsStore } from "@/stores/settings";

const emit = defineEmits<{ "editor-scroll": [line: number] }>();

const tabs = useTabsStore();
const settings = useSettingsStore();
const hostEl = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

// 编辑器主题经 Compartment 运行时切换（暗色 oneDark，亮色默认），避免重建实例
const themeCompartment = new Compartment();

// markdown 语言 + 嵌套代码块按语言高亮（language-data）
function buildExtensions(): Extension[] {
  return [
    basicSetup,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    themeCompartment.of(settings.resolvedTheme === "dark" ? oneDark : []),
    EditorView.updateListener.of((u: ViewUpdate) => {
      // 只做 CM → store 单向写回，避免 store → CM 双向绑定循环
      if (!u.docChanged || !tabs.activeTab) return;
      tabs.updateContent(tabs.activeTab.id, u.state.doc.toString());
    }),
  ];
}

onMounted(() => {
  if (!hostEl.value) return;
  view = new EditorView({
    state: EditorState.create({
      doc: tabs.activeTab?.content ?? "",
      extensions: buildExtensions(),
    }),
    parent: hostEl.value,
  });
  view.scrollDOM.addEventListener("scroll", onEditorScroll);
});

// 只在 tab 切换时整体替换文档，其余内容变化由编辑器自身产生
watch(
  () => tabs.activeTab?.id,
  () => {
    if (!view) return;
    const doc = tabs.activeTab?.content ?? "";
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: doc },
    });
    // 切换后按当前滚动位置同步一次预览（滚动位置跟随新文档顶部）
    void nextTick(syncScroll);
  },
);

// 主题联动：settingsStore 的生效主题变化时重配编辑器主题 compartment
watch(
  () => settings.resolvedTheme,
  (theme) => {
    view?.dispatch({
      effects: themeCompartment.reconfigure(theme === "dark" ? oneDark : []),
    });
  },
);

// —— 滚动同步（单向：编辑器 → 预览，粗略版按行号对齐）——
// 计算视口顶部的文档行号，经 emit 交给 App 调预览 scrollToLine
function syncScroll(): void {
  if (!view) return;
  // 视口顶部对应的文档坐标高度 = scrollTop - documentTop，负值取 0
  const top = Math.max(0, view.scrollDOM.scrollTop - view.documentTop);
  const block = view.lineBlockAtHeight(top);
  emit("editor-scroll", view.state.doc.lineAt(block.from).number);
}

let scrollRaf = 0;
function onEditorScroll(): void {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    syncScroll();
  });
}

onBeforeUnmount(() => {
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  view?.scrollDOM.removeEventListener("scroll", onEditorScroll);
  view?.destroy();
  view = null;
});
</script>

<template>
  <div ref="hostEl" class="editor-pane"></div>
</template>

<style scoped>
.editor-pane {
  height: 100%;
  overflow: hidden;
}
.editor-pane :deep(.cm-editor) {
  height: 100%;
}
.editor-pane :deep(.cm-scroller) {
  font-family: Consolas, "Courier New", monospace;
}
</style>
