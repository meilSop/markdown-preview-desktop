<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { renderForPreview } from "@/markdown";
import { useTabsStore } from "@/stores/tabs";

const PREVIEW_DELAY = 250; // 预览防抖 250ms（prd.md 渲染策略）

const tabs = useTabsStore();
const html = ref("");
const scrollerRef = ref<HTMLElement | null>(null); // 滚动容器
const bodyRef = ref<HTMLElement | null>(null); // v-html 内容根
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    html.value = renderForPreview(tabs.activeTab?.content ?? "");
  }, PREVIEW_DELAY);
}

watch(() => tabs.activeTab?.content, scheduleRender, { immediate: true });

// —— mermaid 异步渲染（研究文档第 4 节）——
// 动态 import 按需加载（减小主包）；串行队列逐块替换占位；renderSeq 标记渲染轮次，
// 期间出现新一轮 DOM 更新时丢弃进行中的旧任务，防竞态覆盖
type MermaidModule = (typeof import("mermaid"))["default"];
let mermaid: MermaidModule | null = null;
let mermaidIdSeq = 0;
let renderSeq = 0;

// 预览区固定浅色（V2 需求 15）：mermaid 主题固定 default，不再随应用主题切换
async function ensureMermaid(): Promise<MermaidModule> {
  if (!mermaid) {
    const m = (await import("mermaid")).default;
    m.initialize({ startOnLoad: false, theme: "default" });
    mermaid = m;
  }
  return mermaid;
}

async function renderMermaidBlocks(): Promise<void> {
  const root = bodyRef.value;
  if (!root) return;
  const seq = ++renderSeq;
  const placeholders = Array.from(
    root.querySelectorAll<HTMLElement>(".mermaid-placeholder"),
  );
  for (const el of placeholders) {
    if (seq !== renderSeq) return; // 有更新一轮任务，放弃当前轮剩余工作
    const src = el.dataset.src ?? "";
    if (!src) continue;
    try {
      const m = await ensureMermaid();
      const { svg } = await m.render(`mermaid-svg-${++mermaidIdSeq}`, src);
      if (seq !== renderSeq) return;
      el.classList.remove("mermaid-failed");
      el.innerHTML = svg;
    } catch {
      if (seq !== renderSeq) return;
      // 渲染失败占位显示原始源码（语法错误 / 不支持语法）
      el.classList.add("mermaid-failed");
      el.textContent = src;
    }
  }
}

// v-html 更新后 DOM 才就绪，nextTick 后跑 mermaid 队列
watch(html, () => {
  void nextTick(() => void renderMermaidBlocks());
});

// —— 预览滚动同步（单向：编辑器 → 预览）——
// 找文档序中最后一个 data-line <= 编辑器视口顶行号的标题，对齐到容器顶部附近
function scrollToLine(line: number): void {
  const scroller = scrollerRef.value;
  const root = bodyRef.value;
  if (!scroller || !root) return;
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>("[data-line]"),
  );
  let target: HTMLElement | null = null;
  for (const el of headings) {
    if (Number(el.dataset.line ?? "-1") <= line) target = el;
    else break;
  }
  if (!target) {
    scroller.scrollTop = 0;
    return;
  }
  scroller.scrollTop +=
    target.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    8;
}

defineExpose({ scrollToLine });

onBeforeUnmount(() => {
  renderSeq += 1; // 终止在途 mermaid 任务
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div ref="scrollerRef" class="markdown-preview">
    <div
      v-if="tabs.activeTab"
      ref="bodyRef"
      class="md-body"
      v-html="html"
    ></div>
    <div v-else class="preview-empty">无打开的文件</div>
  </div>
</template>

<style scoped>
.markdown-preview {
  height: 100%;
  overflow-y: auto;
  /* 预览容器固定浅色白底（V2 需求 15），不随应用主题变化 */
  background: #ffffff;
}
.preview-empty {
  padding: 24px;
  /* 与浅色文档配色的次要文字色一致（预览区不随主题变化） */
  color: #6a737d;
}
/* 文档排版样式在全局 preview.css（应用内预览与导出共用同一份，已锚定浅色） */
</style>
