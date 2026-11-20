<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import type {
  ReplaceParams,
  SearchMatch,
  SearchParams,
  SearchResult,
} from "@shared/types";
import { useWorkspaceStore } from "@/stores/workspace";
import { useTabsStore } from "@/stores/tabs";
import { useToast } from "@/composables/useToast";
import { basename, isWithin } from "@/utils/path";

// 全局检索面板（V7 需求 25）：关键词 + 三开关 + include/exclude glob 过滤，
// 结果按文件分组可折叠，点击命中行跳行联动，替换前先 flush 已开 tab（编排见 replaceAll）
const workspace = useWorkspaceStore();
const tabs = useTabsStore();
const toast = useToast();

const query = ref("");
const replacement = ref("");
const include = ref("");
const exclude = ref("");
// 三开关（区分大小写 / 全词 / 正则），会话内状态不持久化
const options = reactive({
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
});

const searching = ref(false);
// 详细信息显隐（V8 需求 34）：包含/排除两个 glob 输入框默认隐藏，
// 点替换行末尾的「...」按钮切换展示（VSCode 同款「切换搜索详细信息」交互）
const detailsOpen = ref(false);
// 替换进行中（check 轮补充）：防「替换全部」连点导致的重入编排
const replacing = ref(false);
const result = ref<SearchResult | null>(null);
const searchError = ref<string | null>(null);
// 折叠的文件组（默认全部展开）
const collapsedFiles = ref(new Set<string>());

interface FileGroup {
  path: string;
  display: string;
  matches: SearchMatch[];
}

// 命中文件显示路径：相对所属项目根（越过根路径与其后的分隔符）；不在任何根下时回退文件名
function relativeDisplay(path: string): string {
  const root = workspace.roots.find((r) => isWithin(path, r.path));
  if (!root) return basename(path);
  return path.slice(root.path.length + 1);
}

// 结果按文件分组（保持主进程返回顺序），文件组内为逐行命中
const groups = computed<FileGroup[]>(() => {
  const byPath = new Map<string, FileGroup>();
  for (const m of result.value?.matches ?? []) {
    let g = byPath.get(m.path);
    if (!g) {
      g = { path: m.path, display: relativeDisplay(m.path), matches: [] };
      byPath.set(m.path, g);
    }
    g.matches.push(m);
  }
  return [...byPath.values()];
});

const statusText = computed(() => {
  if (!workspace.hasWorkspace)
    return "未打开文件夹：请先通过顶部「文件」菜单添加项目";
  if (!query.value.trim()) return "输入关键词开始检索";
  if (searchError.value) return searchError.value;
  if (searching.value) return "正在搜索…";
  if (result.value) {
    if (result.value.matches.length === 0) return "无匹配结果";
    return `在 ${result.value.fileCount} 个文件中找到 ${result.value.matches.length} 处`;
  }
  return "";
});

// 组装 invoke 载荷：roots 经 map 解包为普通数组（V6 教训：禁传 reactive Proxy）；
// 重载区分检索 / 替换载荷，调用点的返回类型随实参收窄
function buildParams(): SearchParams;
function buildParams(withReplacement: true): ReplaceParams;
function buildParams(withReplacement?: boolean): SearchParams | ReplaceParams {
  const base: SearchParams = {
    roots: workspace.roots.map((r) => r.path),
    query: query.value,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    useRegex: options.useRegex,
    include: include.value.trim(),
    exclude: exclude.value.trim(),
  };
  return withReplacement ? { ...base, replacement: replacement.value } : base;
}

// 竞态防护：仅采纳最后一次请求的结果（防抖连发 / 开关连点时旧响应不得覆盖新结果）
let searchSeq = 0;
async function runSearch(): Promise<void> {
  if (!workspace.hasWorkspace || !query.value.trim()) {
    // 清空搜索（V8 需求 33）：递增序号使在途响应过期（否则旧搜索回来时序号相同会把旧结果回填），
    // 清结果列表与错误提示，并解除编辑器内的联动高亮
    searchSeq += 1;
    searching.value = false;
    result.value = null;
    searchError.value = null;
    tabs.setActiveQuery(null);
    return;
  }
  const seq = (searchSeq += 1);
  searching.value = true;
  searchError.value = null;
  const ret = await window.api.search.inWorkspace(buildParams());
  if (seq !== searchSeq) return;
  searching.value = false;
  if (!ret.ok) {
    searchError.value = ret.error;
    result.value = null;
    // 检索失败不联动高亮（V8 需求 28）
    tabs.setActiveQuery(null);
    return;
  }
  result.value = ret.data;
  // 搜索成功：记录查询串与匹配开关驱动编辑器全文联动高亮（V8 需求 28）。
  // 开关透传保证编辑器高亮与结果列表同口径（check 轮修复：原先只传字面量串，
  // 编辑器恒为大小写敏感扫描，与 caseSensitive / wholeWord / useRegex 不一致）。
  // source 标记（V8 需求 32）：workspace 来源 spec 同时记入 workspaceQuery，
  // 供文件内查找面板关闭后恢复联动高亮
  tabs.setActiveQuery({
    source: "workspace",
    query: query.value,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    useRegex: options.useRegex,
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// 输入防抖 300ms 触发搜索
function onQueryInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSearch();
  }, 300);
}
// 回车立即触发（清掉未到期的防抖）
function onEnter(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void runSearch();
}

// 开关切换即时重发搜索（有关键词时）
function onToggle(key: "caseSensitive" | "wholeWord" | "useRegex"): void {
  options[key] = !options[key];
  if (query.value.trim()) void runSearch();
}

function toggleGroup(path: string): void {
  if (collapsedFiles.value.has(path)) collapsedFiles.value.delete(path);
  else collapsedFiles.value.add(path);
}

// 点击命中行 → 打开/激活 tab 并跳行（tabs.revealLine 内部处理打开失败 toast）
function onMatchClick(m: SearchMatch): void {
  void tabs.revealLine(m.path, m.line);
}

const canReplace = computed(
  () =>
    !!result.value &&
    result.value.matches.length > 0 &&
    !searching.value &&
    !replacing.value,
);

// 替换编排：flush 命中文件的已开 tab → 主进程替换写盘 → 已开 tab 重读盘面 →
// toast 汇总 → 重发一次搜索刷新结果列表。
// check 轮补充：replacing 防重入；入口先清未到期防抖（替换期间不穿插旧输入触发的搜索）；
// 主进程超预算截断时（truncated）提示可再次执行续替剩余文件（已替换部分保持写盘）
async function replaceAll(): Promise<void> {
  if (!canReplace.value || replacing.value) return;
  replacing.value = true;
  try {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const hitPaths = new Set(result.value?.matches.map((m) => m.path) ?? []);
    const flush = await tabs.flushTabsMatching((p) => hitPaths.has(p));
    if (!flush.ok) {
      toast.show(`替换中止，文件写盘失败：${flush.error}`);
      return;
    }
    const ret = await window.api.search.replace(buildParams(true));
    if (!ret.ok) {
      toast.show(`替换失败：${ret.error}`);
      return;
    }
    await tabs.reloadTabsByPaths(new Set(ret.data.files.map((f) => f.path)));
    toast.show(
      `已替换 ${ret.data.totalReplaced} 处（${ret.data.files.length} 个文件）` +
        (ret.data.truncated ? "；耗时超限已截断，可再次执行替换完成剩余" : ""),
    );
    void runSearch();
  } finally {
    replacing.value = false;
  }
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div class="search-panel">
    <div class="search-row">
      <input
        v-model="query"
        class="search-input"
        type="text"
        placeholder="搜索"
        @input="onQueryInput"
        @keydown.enter.prevent="onEnter"
      />
      <button
        class="toggle-btn"
        :class="{ active: options.caseSensitive }"
        title="区分大小写"
        @click="onToggle('caseSensitive')"
      >
        Aa
      </button>
      <button
        class="toggle-btn"
        :class="{ active: options.wholeWord }"
        title="全词匹配"
        @click="onToggle('wholeWord')"
      >
        ab
      </button>
      <button
        class="toggle-btn"
        :class="{ active: options.useRegex }"
        title="使用正则"
        @click="onToggle('useRegex')"
      >
        .*
      </button>
    </div>
    <div class="search-row">
      <input
        v-model="replacement"
        class="search-input"
        type="text"
        placeholder="替换为"
      />
      <!-- V8 需求 26：「替换全部」文字按钮改为 16px 图标按钮，tooltip 走原生 title，
           禁用态沿用 canReplace 既有逻辑 -->
      <button
        class="replace-btn"
        title="替换全部"
        :disabled="!canReplace"
        @click="replaceAll"
      >
        <!-- 替换图标：双箭头交换（上行右出 / 下行左回），stroke=currentColor 随按钮变色 -->
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
      <!-- 详细信息切换（V8 需求 34）：三点图标，切换包含/排除输入框显隐 -->
      <button
        class="replace-btn dots-btn"
        :class="{ active: detailsOpen }"
        title="切换搜索详细信息"
        @click="detailsOpen = !detailsOpen"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="3" cy="8" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="13" cy="8" r="1.2" />
        </svg>
      </button>
    </div>
    <!-- 包含/排除：默认隐藏，由「...」按钮切换展示 -->
    <div v-show="detailsOpen" class="detail-rows">
      <input
        v-model="include"
        class="search-input glob-input"
        type="text"
        placeholder="包含（glob，如 *.md, docs/**，逗号分隔，留空不过滤）"
        @input="onQueryInput"
      />
      <input
        v-model="exclude"
        class="search-input glob-input"
        type="text"
        placeholder="排除（glob，如 node_modules/**，逗号分隔）"
        @input="onQueryInput"
      />
    </div>

    <p v-if="statusText" class="status-hint" :class="{ error: !!searchError }">
      {{ statusText }}
    </p>
    <p v-if="result?.truncated" class="truncated-hint">
      结果过多或耗时超限，仅显示部分命中
    </p>

    <div class="result-list">
      <div v-for="g in groups" :key="g.path" class="result-group">
        <button class="group-header" @click="toggleGroup(g.path)">
          <span class="group-arrow">
            {{ collapsedFiles.has(g.path) ? "▸" : "▾" }}
          </span>
          <span class="group-name" :title="g.path">{{ g.display }}</span>
          <span class="group-count">{{ g.matches.length }}</span>
        </button>
        <template v-if="!collapsedFiles.has(g.path)">
          <div
            v-for="(m, idx) in g.matches"
            :key="idx"
            class="match-line"
            :title="`${g.display}:${m.line}`"
            @click="onMatchClick(m)"
          >
            <span class="match-lineno">{{ m.line }}</span>
            <!-- lineText 来自文件内容：用 mustache 插值三段拼接（自动转义，防 XSS） -->
            <span class="match-text"
              ><span>{{ m.lineText.slice(0, m.matchStart) }}</span
              ><span class="match-hl">{{
                m.lineText.slice(m.matchStart, m.matchEnd)
              }}</span
              ><span>{{ m.lineText.slice(m.matchEnd) }}</span></span
            >
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding-top: 2px;
}
.search-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
/* 详细信息容器：两个 glob 输入框纵向堆叠，间距与父容器一致 */
.detail-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
/* 三点切换按钮：复用 replace-btn 尺寸，激活态与 toggle-btn 一致 */
.dots-btn.active {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.search-input {
  padding: 4px 6px;
  font-size: 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-bg);
  color: var(--color-text);
}
.search-row .search-input {
  flex: 1;
  min-width: 0;
}
.glob-input {
  width: 100%;
  flex-shrink: 0;
}
.search-input:focus {
  outline: none;
  border-color: var(--color-accent);
}
.search-input::placeholder {
  color: var(--color-text-secondary);
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
/* 替换全部图标按钮（V8 需求 26）：尺寸/视觉与 toggle-btn 一致 */
.replace-btn {
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
.replace-btn:hover:not(:disabled) {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.replace-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.replace-btn svg {
  display: block;
}
.status-hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.status-hint.error {
  color: var(--color-danger);
  word-break: break-all;
}
.truncated-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.result-list {
  flex: 1;
  min-height: 0;
  margin-top: 2px;
  overflow-y: auto;
  font-size: 12px;
}
.result-group {
  margin-bottom: 2px;
}
.group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 3px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}
.group-header:hover {
  background: var(--color-accent-soft);
}
.group-arrow {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--color-text-secondary);
}
.group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-count {
  flex-shrink: 0;
  min-width: 20px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--color-bg-code);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
.match-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 4px 2px 14px;
  border-radius: 4px;
  cursor: pointer;
}
.match-line:hover {
  background: var(--color-accent-soft);
}
.match-lineno {
  flex-shrink: 0;
  width: 28px;
  text-align: right;
  color: var(--color-text-secondary);
  font-family: Consolas, "Courier New", monospace;
}
.match-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-family: Consolas, "Courier New", monospace;
}
/* 命中片段高亮强化（V8 需求 28）：accent-soft 背景 + accent 文字，明显可辨 */
.match-hl {
  background: var(--color-accent-soft);
  color: var(--color-accent);
  border-radius: 2px;
}
</style>
