<script setup lang="ts">
import { computed, ref } from "vue";

// 文件内查找替换面板（V8 需求 32）：悬浮于编辑器右上角的中文面板，替代
// @codemirror/search 的默认英文面板。纯展示组件——查找状态由 EditorPane 持有，
// 经 props 下行 / emits 上行；替换行显隐为本组件内部 UI 状态。
// 样式对齐 SearchPanel 的 toggle-btn / replace-btn 既有惯例
const props = defineProps<{
  findText: string;
  replaceText: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  preserveCase: boolean;
  current: number;
  total: number;
}>();

const emit = defineEmits<{
  "update:findText": [value: string];
  "update:replaceText": [value: string];
  "toggle:caseSensitive": [];
  "toggle:wholeWord": [];
  "toggle:useRegex": [];
  "toggle:preserveCase": [];
  next: [];
  prev: [];
  replaceOne: [];
  replaceAll: [];
  close: [];
}>();

// 替换行显隐：左侧 chevron 与右侧三横线按钮同语义，点击任一处同步切换
const expanded = ref(false);
function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

// 输入框事件（断言收敛在 script，模板不写 TS 断言）
function onFindInput(ev: Event): void {
  emit("update:findText", (ev.target as HTMLInputElement).value);
}
function onReplaceInput(ev: Event): void {
  emit("update:replaceText", (ev.target as HTMLInputElement).value);
}

// IME 组合状态机（V8 需求 33）：用 compositionstart/end 维护本地标志，配合 ev.isComposing
// 判定——不能用 keyCode === 229 一刀切：中文输入法开启时（即使直接输英文字母）Enter 的
// keyCode 常为 229，会把非组合状态的回车误吞，导致查找框回车永远不跳匹配。
// 拼音候选上屏的那次回车（isComposing true / composing 中）仍只上屏不触发动作
const composing = ref(false);
function onCompositionStart(): void {
  composing.value = true;
}
function onCompositionEnd(): void {
  composing.value = false;
}
function isComposingKey(ev: KeyboardEvent): boolean {
  return ev.isComposing || composing.value;
}

// 查找框回车：Enter=下一个 / Shift+Enter=上一个。不能用 @keydown.enter 与
// @keydown.shift.enter 两个绑定——Vue 的 .enter 修饰符只比较 key 名不含系统修饰键，
// Shift+Enter 会同时命中两个绑定（先 emit next 再 emit prev，净效果原地不动），
// 故单处理器按 shiftKey 分流（check 轮修复）
function onFindKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Enter") return;
  if (isComposingKey(ev)) return;
  ev.preventDefault();
  if (ev.shiftKey) {
    emit("prev");
  } else {
    emit("next");
  }
}

// 替换框回车 = 替换单处（IME 组合中回车仅上屏不替换）
function onReplaceKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Enter") return;
  if (isComposingKey(ev)) return;
  ev.preventDefault();
  emit("replaceOne");
}

// 面板根节点 Esc 统一拦截（输入框冒泡覆盖两个输入框与按钮区）：
// IME 组合中的 Esc 仅取消候选不上报关闭
function onPanelKeydown(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  if (isComposingKey(ev)) return;
  ev.preventDefault();
  emit("close");
}

// 计数文案：空查询不显示；非空且无结果提示「无结果」；有结果「第 N 项， 共 M 项」
const countText = computed(() => {
  if (!props.findText) return "";
  if (props.total === 0) return "无结果";
  return `第 ${Math.max(props.current, 0) + 1} 项， 共 ${props.total} 项`;
});

const findInputEl = ref<HTMLInputElement | null>(null);
// 打开面板后由 EditorPane 调用：聚焦并全选查找词（预填选区文本时便于直接输入覆盖）
function focusFind(): void {
  findInputEl.value?.focus();
  findInputEl.value?.select();
}
defineExpose({ focusFind });
</script>

<template>
  <!-- Esc 在面板任意输入框内均可关闭（keydown 冒泡到根节点统一拦截） -->
  <div class="find-panel" @keydown="onPanelKeydown">
    <!-- 左侧展开/收起竖条：align-self stretch 贯穿两行，展开时高度自动撑开（VSCode 同形态） -->
    <button
      class="expand-rail"
      :title="expanded ? '收起替换' : '展开替换'"
      @click="toggleExpanded"
    >
      <svg
        v-if="!expanded"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
      <svg
        v-else
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
    <div class="find-body">
      <div class="find-row">
        <input
          ref="findInputEl"
          :value="findText"
          class="find-input"
          type="text"
          placeholder="查找"
          @input="onFindInput"
          @keydown="onFindKeydown"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
        />
        <button
          class="toggle-btn"
          :class="{ active: caseSensitive }"
          title="区分大小写"
          @click="emit('toggle:caseSensitive')"
        >
          Aa
        </button>
        <button
          class="toggle-btn"
          :class="{ active: wholeWord }"
          title="全词匹配"
          @click="emit('toggle:wholeWord')"
        >
          ab
        </button>
        <button
          class="toggle-btn"
          :class="{ active: useRegex }"
          title="使用正则"
          @click="emit('toggle:useRegex')"
        >
          .*
        </button>
        <span class="count-text">{{ countText }}</span>
        <button
          class="icon-btn"
          title="上一个匹配（Shift+F3）"
          :disabled="total === 0"
          @click="emit('prev')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 12.5V3.5" />
            <path d="M4.5 7L8 3.5 11.5 7" />
          </svg>
        </button>
        <button
          class="icon-btn"
          title="下一个匹配（F3）"
          :disabled="total === 0"
          @click="emit('next')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3.5v9" />
            <path d="M4.5 9L8 12.5 11.5 9" />
          </svg>
        </button>
        <!-- 三横线带缩进（中间行右移）：切换替换行显隐，与左侧 chevron 同语义 -->
        <button class="icon-btn" title="显示替换" @click="toggleExpanded">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2 4.5h12" />
            <path d="M5 8h9" />
            <path d="M2 11.5h12" />
          </svg>
        </button>
        <button class="icon-btn" title="关闭（Esc）" @click="emit('close')">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4.5 4.5l7 7" />
            <path d="M11.5 4.5l-7 7" />
          </svg>
        </button>
      </div>
      <div v-if="expanded" class="replace-row">
        <input
          :value="replaceText"
          class="find-input"
          type="text"
          placeholder="替换"
          @input="onReplaceInput"
          @keydown="onReplaceKeydown"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
        />
        <button
          class="toggle-btn"
          :class="{ active: preserveCase }"
          title="保留大小写"
          @click="emit('toggle:preserveCase')"
        >
          AB
        </button>
        <!-- 替换单处：一行文本 + 右箭头（当前匹配被替换为新内容） -->
        <button
          class="icon-btn"
          title="替换"
          :disabled="total === 0"
          @click="emit('replaceOne')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 5h8" />
            <path d="M8 2.5L10.5 5 8 7.5" />
            <path d="M2.5 11h11" />
          </svg>
        </button>
        <!-- 全部替换：双箭头交换（与 SearchPanel 替换全部图标同款，风格统一） -->
        <button
          class="icon-btn"
          title="全部替换"
          :disabled="total === 0"
          @click="emit('replaceAll')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 5h9" />
            <path d="M9.5 2.5L12 5l-2.5 2.5" />
            <path d="M13 11H4" />
            <path d="M6.5 8.5L4 11l2.5 2.5" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 悬浮面板：绝对定位于编辑器容器右上角，浮层背景/边框/阴影走主题变量（浅深两套）
   布局：横排 [左侧展开竖条 | 右侧查找/替换两行]（V8 需求 33） */
.find-panel {
  position: absolute;
  top: 4px;
  right: 12px;
  z-index: 10;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-elevated);
  box-shadow: 0 4px 12px var(--color-shadow);
}
/* 左侧竖条：align-self stretch 贯穿两行，展开时高度自动撑开（VSCode 同形态） */
.expand-rail {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
  cursor: pointer;
}
.expand-rail:hover {
  background: var(--color-accent-soft);
  filter: brightness(1.15);
}
.expand-rail svg {
  display: block;
}
/* 右侧内容列：查找行 + 替换行纵向堆叠 */
.find-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.find-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.find-input {
  width: 200px;
  padding: 4px 6px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
}
.find-input:focus {
  outline: none;
  border-color: var(--color-accent);
}
.find-input::placeholder {
  color: var(--color-text-secondary);
}
.count-text {
  flex-shrink: 0;
  min-width: 78px;
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}
/* 图标按钮与文字开关：尺寸/视觉对齐 SearchPanel 的 replace-btn / toggle-btn */
.icon-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.icon-btn svg {
  display: block;
}
.toggle-btn {
  flex-shrink: 0;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.toggle-btn:hover {
  background: var(--color-accent-soft);
}
.toggle-btn.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
</style>
