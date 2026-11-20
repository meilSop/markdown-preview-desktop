<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Extension } from "@codemirror/state";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { Decoration, EditorView, keymap } from "@codemirror/view";
import { SearchQuery } from "@codemirror/search";
import { basicSetup } from "codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import type { GlobalQuerySpec } from "@/stores/tabs";
import { useTabsStore } from "@/stores/tabs";
import { useSettingsStore } from "@/stores/settings";
import EditorFindPanel from "@/components/EditorFindPanel.vue";

const emit = defineEmits<{ "editor-scroll": [line: number] }>();

const tabs = useTabsStore();
const settings = useSettingsStore();
const hostEl = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

// 编辑器主题经 Compartment 运行时切换（暗色 oneDark，亮色默认），避免重建实例
const themeCompartment = new Compartment();
// 查找高亮挂载（V8 需求 28/32）：Compartment 承载，预留运行时重配
const globalSearchCompartment = new Compartment();

// —— 查找联动高亮（V8 需求 28 全局检索 + 需求 32 文件内查找，共用一个 StateField）——
// 下发 effect 携带 {spec, currentIndex}：spec 为当前生效查询（后写入者胜，来源见
// GlobalQuerySpec.source），currentIndex 为"当前匹配"下标（全局检索联动恒 -1 = 无当前项，
// 文件内查找面板为导航定位）。spec 变化或文档变化全量重扫，仅 currentIndex 变化复用
// 已有匹配集合只重建装饰
const setGlobalQuery = StateEffect.define<{
  spec: GlobalQuerySpec | null;
  currentIndex: number;
}>();
const allMatchMark = Decoration.mark({ class: "cm-global-search-match" });
const currentMatchMark = Decoration.mark({ class: "cm-current-search-match" });

interface FindMatchPos {
  from: number;
  to: number;
}

interface FindFieldValue {
  spec: GlobalQuerySpec | null;
  currentIndex: number;
  matches: FindMatchPos[];
  decos: DecorationSet;
}

// 大文档性能保护：命中数达到上限即停止扫描
const FIND_MATCH_LIMIT = 2000;
// 单次扫描时间预算（与主进程检索的时间预算同思路）：正则模式下病态模式（如 (a+)+$）
// 单次 exec 内部的回溯无法被上限打断，逐 keystroke 重扫可能长时间阻塞渲染进程；
// 超预算即停（该次高亮不完整），下个事务重扫
const SCAN_TIME_BUDGET_MS = 100;

// 由 spec 构造 SearchQuery：cursor 遍历复用其 wholeWord / caseSensitive / regexp 全语义
// （replace 字段对扫描无用，留空）
function toSearchQuery(spec: GlobalQuerySpec): SearchQuery {
  return new SearchQuery({
    search: spec.query,
    caseSensitive: spec.caseSensitive,
    regexp: spec.useRegex,
    wholeWord: spec.wholeWord,
  });
}

// 经 SearchQuery.getCursor 遍历全文收集匹配（安装版 6.7.2 的公开 API，流式迭代）：
// 零宽命中不收录（mark 装饰不允许空区间，主进程结果列表同口径），库内对零宽匹配
// 强制推进（RegExpCursor matchPos+1），连续同位置防御兜底防死循环
function scanFindMatches(
  state: EditorState,
  query: SearchQuery,
): FindMatchPos[] {
  if (!query.valid) return [];
  const out: FindMatchPos[] = [];
  const cursor = query.getCursor(state);
  const startedAt = Date.now();
  let steps = 0;
  let prevFrom = -1;
  let prevTo = -1;
  while (out.length < FIND_MATCH_LIMIT) {
    steps += 1;
    // 每 64 次迭代检查一次时间预算（Date.now() 调用本身也有成本）
    if ((steps & 63) === 0 && Date.now() - startedAt > SCAN_TIME_BUDGET_MS)
      break;
    const r = cursor.next();
    if (r.done) break;
    const { from, to } = r.value;
    if (from === prevFrom && to === prevTo) break;
    prevFrom = from;
    prevTo = to;
    if (to > from) out.push({ from, to });
  }
  return out;
}

// 全部匹配 mark + 当前匹配独立 mark（同区间叠加，sort=true 校验有序）
function buildFindDecos(
  matches: FindMatchPos[],
  currentIndex: number,
): DecorationSet {
  if (matches.length === 0) return Decoration.none;
  const ranges = [];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    ranges.push(allMatchMark.range(m.from, m.to));
    if (i === currentIndex) ranges.push(currentMatchMark.range(m.from, m.to));
  }
  return Decoration.set(ranges, true);
}

const findField = StateField.define<FindFieldValue>({
  create: () => ({
    spec: null,
    currentIndex: -1,
    matches: [],
    decos: Decoration.none,
  }),
  update(value, tr) {
    let spec = value.spec;
    let currentIndex = value.currentIndex;
    let specChanged = false;
    let idxChanged = false;
    for (const effect of tr.effects) {
      if (effect.is(setGlobalQuery)) {
        spec = effect.value.spec;
        currentIndex = effect.value.currentIndex;
        specChanged = spec !== value.spec;
        // 同 spec 引用 + 仅 currentIndex 变化（导航 / 初始定位 / 替换后重定位）
        // 也是一次有效下发，必须生效——否则 gotoFind 等场景的第二次 dispatch
        // 会被下方早退吞掉，当前项高亮与面板计数永远不动（check 轮修复）
        idxChanged = currentIndex !== value.currentIndex;
      }
    }
    if (!tr.docChanged && !specChanged && !idxChanged) return value;
    if (!spec || !spec.query) {
      // 查询为空：维持原空状态引用，避免无查询时每次输入都新建 field 值触发 facet 重算
      return value.spec === null
        ? value
        : { spec: null, currentIndex: -1, matches: [], decos: Decoration.none };
    }
    // spec 变化或文档变化（输入 / 切 tab / 替换）全量重扫；仅 currentIndex 变化
    // （导航 / 初始定位）复用已有匹配，只重建装饰
    const matches =
      specChanged || tr.docChanged || value.spec === null
        ? scanFindMatches(tr.state, toSearchQuery(spec))
        : value.matches;
    // currentIndex 钳制：无匹配置 -1（无当前项）；全局联动传入 -1 保持 -1；
    // editor 来源恒 >= 0，超出匹配数收拢到最后一项
    const idx =
      matches.length === 0 || currentIndex < 0
        ? -1
        : Math.min(currentIndex, matches.length - 1);
    return {
      spec,
      currentIndex: idx,
      matches,
      decos: buildFindDecos(matches, idx),
    };
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decos),
});

// —— 替换文本生成（复刻 @codemirror/search 安装版 6.7.2 的替换语义，内部方法
// getReplacement 未公开，故按源码行为自行实现）——
// 字面量模式：\n \r \t 与 \\ 转义（SearchQuery.unquote，literal=false 时两模式都转义；
// 本组件构造 query 未传 literal，恒 false，与库行为一致）
function unquoteText(text: string): string {
  return text.replace(/\\([nrt\\])/g, (_, ch) =>
    ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : "\\",
  );
}
// 正则模式：先转义再展开 $&（整个匹配）/ $1..$99（捕获组）/ $$（字面 $）
// （RegExpQuery.getReplacement 行为：unquote 在前、$ 展开在后，含多位数字回退匹配）
function applyRegexReplacement(
  replacement: string,
  match: RegExpExecArray,
): string {
  return unquoteText(replacement).replace(
    /\$([$&]|\d+)/g,
    (raw, key: string) => {
      if (key === "&") return match[0];
      if (key === "$") return "$";
      for (let l = key.length; l > 0; l -= 1) {
        const n = Number(key.slice(0, l));
        if (n > 0 && n < match.length) return match[n] + key.slice(l);
      }
      return raw;
    },
  );
}
// preserveCase（AB 开关）：匹配文本全大写 → 替换词转大写；首字母大写 → 替换词首字母
// 大写；其余原样（VSCode 同款语义）
function applyPreserveCase(matched: string, replacement: string): string {
  if (matched === matched.toUpperCase() && matched !== matched.toLowerCase()) {
    return replacement.toUpperCase();
  }
  const first = matched.charAt(0);
  if (
    first &&
    first.toUpperCase() !== first.toLowerCase() &&
    first === first.toUpperCase()
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// 正则模式替换需要捕获组信息：getCursor 只给位置，此处用与 RegExpCursor 相同 flags
// （baseFlags "gmu" + 可选 i，安装版 dist 已核实）构造正则，在匹配终点为止的前缀
// 文本上重放 exec，取与目标位置/长度对齐的匹配（wholeWord 只是过滤不改匹配本身，
// 裸正则必在同位置产出相同匹配）
function replayMatchExec(
  state: EditorState,
  query: SearchQuery,
  m: FindMatchPos,
): RegExpExecArray | null {
  let reg: RegExp;
  try {
    reg = new RegExp(query.search, (query.caseSensitive ? "" : "i") + "gmu");
  } catch {
    return null;
  }
  const prefix = state.doc.sliceString(0, m.to);
  reg.lastIndex = 0;
  let r: RegExpExecArray | null;
  while ((r = reg.exec(prefix)) !== null) {
    if (r.index === m.from && r[0].length === m.to - m.from) return r;
    if (r.index > m.from) return null;
    // 零宽匹配手动推进防死循环（越前缀尾即停）
    if (r[0].length === 0) {
      reg.lastIndex += 1;
      if (reg.lastIndex > prefix.length) break;
    }
  }
  return null;
}

// 全部替换的捕获组收集：一次全文重放（O(文档长度)，与 matches 序列对齐验证——
// 全部替换逐匹配重放前缀是 O(n²)，大文档不可接受）；对不齐的匹配回退字面量替换
function replayAllExecs(
  state: EditorState,
  query: SearchQuery,
  matches: FindMatchPos[],
): (RegExpExecArray | null)[] {
  const out: (RegExpExecArray | null)[] = matches.map(() => null);
  let reg: RegExp;
  try {
    reg = new RegExp(query.search, (query.caseSensitive ? "" : "i") + "gmu");
  } catch {
    return out;
  }
  const full = state.doc.sliceString(0);
  reg.lastIndex = 0;
  const startedAt = Date.now();
  let mi = 0;
  let steps = 0;
  let r: RegExpExecArray | null;
  while ((r = reg.exec(full)) !== null && mi < matches.length) {
    steps += 1;
    if ((steps & 255) === 0 && Date.now() - startedAt > SCAN_TIME_BUDGET_MS)
      break;
    const m = matches[mi];
    if (r.index === m.from) out[mi++] = r;
    else if (r.index > m.from) out[mi++] = null;
    // r.index < m.from：wholeWord 过滤掉的中间匹配，跳过继续对齐
    if (r[0].length === 0) {
      reg.lastIndex += 1;
      if (reg.lastIndex > full.length) break;
    }
  }
  return out;
}

// —— 文件内查找面板状态（V8 需求 32）——
const findOpen = ref(false);
const findText = ref("");
const findReplaceText = ref("");
const findCaseSensitive = ref(false);
const findWholeWord = ref(false);
const findRegex = ref(false);
const findPreserveCase = ref(false);
const findPanelRef = ref<InstanceType<typeof EditorFindPanel> | null>(null);
// 面板计数（由 updateListener 从 field 值同步）：total 总匹配数，current 当前项下标
const findTotal = ref(0);
const findCurrent = ref(-1);

// 面板查询条件 → spec（findText 为空时 null = 无查询）
function editorSpec(): GlobalQuerySpec | null {
  if (!findOpen.value || !findText.value) return null;
  return {
    source: "editor",
    query: findText.value,
    caseSensitive: findCaseSensitive.value,
    wholeWord: findWholeWord.value,
    useRegex: findRegex.value,
  };
}

// 面板替换词对应的 SearchQuery（含 replace 文本）
function editorSearchQuery(): SearchQuery {
  return new SearchQuery({
    search: findText.value,
    replace: findReplaceText.value,
    caseSensitive: findCaseSensitive.value,
    regexp: findRegex.value,
    wholeWord: findWholeWord.value,
  });
}

// 读取当前 field 值（matches / currentIndex / spec 的权威来源）
function findFieldValue(): FindFieldValue | null {
  return view?.state.field(findField, false) ?? null;
}

// 统一下发 effect（spec 引用变化触发重扫；仅 currentIndex 变化只重建装饰）
function dispatchFind(
  spec: GlobalQuerySpec | null,
  currentIndex: number,
): void {
  view?.dispatch({ effects: setGlobalQuery.of({ spec, currentIndex }) });
}

// 单个匹配的替换文本：正则展开捕获组引用 / 字面量转义 + preserveCase
function computeReplacement(
  state: EditorState,
  query: SearchQuery,
  spec: GlobalQuerySpec,
  m: FindMatchPos,
): string {
  const matched = state.doc.sliceString(m.from, m.to);
  let base: string;
  if (spec.useRegex) {
    const exec = replayMatchExec(state, query, m);
    base = exec
      ? applyRegexReplacement(query.replace, exec)
      : unquoteText(query.replace);
  } else {
    base = unquoteText(query.replace);
  }
  return findPreserveCase.value ? applyPreserveCase(matched, base) : base;
}

// 打开面板 / 查找条件变化统一入口：写入 store spec（互斥覆盖生效槽位）并触发扫描，
// 初始当前项 = 选区起点之后第一个匹配，否则第一个
function applyEditorQuery(): void {
  const spec = editorSpec();
  tabs.setEditorQuery(spec);
  dispatchFind(spec, 0);
  // dispatch 后 field 已重扫，从 field 值读取匹配集合做初始定位
  const fv = findFieldValue();
  if (fv && fv.matches.length > 0) {
    const head = view?.state.selection.main.head ?? 0;
    const idx = fv.matches.findIndex((m) => m.from >= head);
    const target = idx < 0 ? 0 : idx;
    if (target > 0) dispatchFind(spec, target);
  }
}

// Ctrl+F 唤起（再次按下仅聚焦查找框）：非空单行选区预填查找词，多行选区不预填
function openFindPanel(): void {
  if (findOpen.value) {
    void nextTick(() => findPanelRef.value?.focusFind());
    return;
  }
  findOpen.value = true;
  if (view) {
    const sel = view.state.selection.main;
    if (
      !sel.empty &&
      view.state.doc.lineAt(sel.from).number ===
        view.state.doc.lineAt(sel.to).number
    ) {
      findText.value = view.state.doc.sliceString(sel.from, sel.to);
    }
  }
  applyEditorQuery();
  void nextTick(() => findPanelRef.value?.focusFind());
}

// 关闭面板：恢复全局检索 spec（可能 null，全局检索从未搜索或已清空时）并显式下发
function closeFindPanel(): void {
  findOpen.value = false;
  tabs.restoreWorkspaceQuery();
  dispatchFind(tabs.workspaceQuery, -1);
}

// F3 / Mod-g：面板未开时先打开（VSCode 同款"直接查找下一个"），已开则导航
function onFindStep(dir: 1 | -1): void {
  if (!findOpen.value) {
    openFindPanel();
    return;
  }
  gotoFind(dir);
}

// 导航 ↑↓：环绕推进当前项 → 选中该匹配 + 滚动居中；不调 v.focus()——DOM 焦点保持
// 调用方原处：面板 Enter/↑↓ 时留在查找框可连续回车跳下一个（V8 需求 33），
// 编辑器内 F3/Mod-g 时焦点本就在编辑器
function gotoFind(dir: 1 | -1): void {
  const v = view;
  if (!v) return;
  const fv = findFieldValue();
  if (!fv || !fv.spec || fv.matches.length === 0) return;
  let next = fv.currentIndex + dir;
  if (next < 0) next = fv.matches.length - 1;
  if (next >= fv.matches.length) next = 0;
  const m = fv.matches[next];
  v.dispatch({
    effects: [
      setGlobalQuery.of({ spec: fv.spec, currentIndex: next }),
      EditorView.scrollIntoView(m.from, { y: "center" }),
    ],
    selection: EditorSelection.range(m.from, m.to),
  });
}

// 替换单处：对当前匹配生成替换文本并发 doc 事务（走 updateListener → tabs.updateContent
// → 1.5s 自动保存链，不绕过）；替换后跳到替换点之后的下一个匹配并选中，无则环绕第一个
function replaceOne(): void {
  const v = view;
  if (!v) return;
  const fv = findFieldValue();
  if (
    !fv ||
    !fv.spec ||
    fv.currentIndex < 0 ||
    fv.currentIndex >= fv.matches.length
  ) {
    return;
  }
  const spec = fv.spec;
  const m = fv.matches[fv.currentIndex];
  const text = computeReplacement(v.state, editorSearchQuery(), spec, m);
  v.dispatch({
    changes: { from: m.from, to: m.to, insert: text },
    selection: { anchor: m.from + text.length },
  });
  // docChanged 已触发 field 按新文档重扫；从新匹配集合定位下一个
  const nv = findFieldValue();
  if (nv && nv.spec && nv.matches.length > 0) {
    const after = m.from + text.length;
    let idx = nv.matches.findIndex((mm) => mm.from >= after);
    if (idx < 0) idx = 0;
    const nm = nv.matches[idx];
    v.dispatch({
      effects: [
        setGlobalQuery.of({ spec: nv.spec, currentIndex: idx }),
        EditorView.scrollIntoView(nm.from, { y: "center" }),
      ],
      selection: EditorSelection.range(nm.from, nm.to),
    });
  }
}

// 全部替换：一次事务替换全部匹配（changes 数组按位置升序），同样走自动保存链；
// 替换后计数与高亮重扫（通常清零），当前项归位第一项
function replaceAll(): void {
  const v = view;
  if (!v) return;
  const fv = findFieldValue();
  if (!fv || !fv.spec || fv.matches.length === 0) return;
  const spec = fv.spec;
  const query = editorSearchQuery();
  // 正则模式一次全文重放收集各匹配的捕获组（与 getCursor 匹配序列同源对齐）
  const execs = spec.useRegex
    ? replayAllExecs(v.state, query, fv.matches)
    : null;
  const changes = fv.matches.map((m, i) => {
    const base =
      spec.useRegex && execs && execs[i]
        ? applyRegexReplacement(query.replace, execs[i])
        : unquoteText(query.replace);
    const text = findPreserveCase.value
      ? applyPreserveCase(v.state.doc.sliceString(m.from, m.to), base)
      : base;
    return { from: m.from, to: m.to, insert: text };
  });
  v.dispatch({ changes });
  dispatchFind(editorSpec(), 0);
}

// 面板事件（输入 / 开关切换即时生效，替换词不参与扫描不触发重扫）
function setFindText(value: string): void {
  findText.value = value;
  applyEditorQuery();
}
function setReplaceText(value: string): void {
  findReplaceText.value = value;
}
function toggleFindOption(
  key: "caseSensitive" | "wholeWord" | "useRegex",
): void {
  if (key === "caseSensitive")
    findCaseSensitive.value = !findCaseSensitive.value;
  else if (key === "wholeWord") findWholeWord.value = !findWholeWord.value;
  else findRegex.value = !findRegex.value;
  applyEditorQuery();
}
function togglePreserveCase(): void {
  findPreserveCase.value = !findPreserveCase.value;
}

// 文件内查找键位（V8 需求 32）：Prec.high 压过 basicSetup 内置 searchKeymap 的同键位，
// 彻底阻断默认英文面板——Mod-f 的 openSearchPanel；F3 / Mod-g 的 findNext（其 searchCommand
// 包装在无搜索状态时会先 openSearchPanel）；Mod-Alt-g 的 goToLine 也是英文面板，吞掉不提供
// 替代。Mod-Shift-l / Mod-d 是纯选区操作不弹面板，保留默认。@codemirror/search 仅保留
// SearchQuery 底层能力（cursor 遍历 / 替换语义）
const findKeymap = Prec.high(
  keymap.of([
    {
      key: "Mod-f",
      run: () => {
        openFindPanel();
        return true;
      },
    },
    {
      key: "F3",
      run: () => {
        onFindStep(1);
        return true;
      },
    },
    {
      key: "Shift-F3",
      run: () => {
        onFindStep(-1);
        return true;
      },
    },
    {
      key: "Mod-g",
      run: () => {
        onFindStep(1);
        return true;
      },
    },
    {
      key: "Shift-Mod-g",
      run: () => {
        onFindStep(-1);
        return true;
      },
    },
    { key: "Mod-Alt-g", run: () => true },
    // Esc：面板打开时关闭；未打开返回 false 走默认行为（简化选区等）
    {
      key: "Escape",
      run: () => {
        if (!findOpen.value) return false;
        closeFindPanel();
        return true;
      },
    },
  ]),
);

// markdown 语言 + 嵌套代码块按语言高亮（language-data）
function buildExtensions(): Extension[] {
  return [
    basicSetup,
    findKeymap,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    themeCompartment.of(settings.resolvedTheme === "dark" ? oneDark : []),
    globalSearchCompartment.of(findField),
    EditorView.updateListener.of((u: ViewUpdate) => {
      // 只做 CM → store 单向写回，避免 store → CM 双向绑定循环
      if (!u.docChanged || !tabs.activeTab) return;
      tabs.updateContent(tabs.activeTab.id, u.state.doc.toString());
    }),
    EditorView.updateListener.of((u: ViewUpdate) => {
      // 面板计数随 field 值同步（重扫 / 导航 / 文档变化都会经过这里）
      const fv = u.state.field(findField, false);
      const total = fv ? fv.matches.length : 0;
      const current = fv ? fv.currentIndex : -1;
      if (findTotal.value !== total) findTotal.value = total;
      if (findCurrent.value !== current) findCurrent.value = current;
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
  // 仅预览模式下挂起的跳行目标（V7 需求 25）：重挂载编辑器后补一次消费
  consumePendingLine();
  // 重挂载（布局切换）恢复：findOpen 为新实例初始关闭态，若 activeQuery 残留编辑器
  // 查找 spec（上一实例面板打开期间被卸载），恢复全局检索 spec 后再补同步联动高亮
  if (tabs.activeQuery?.source === "editor") tabs.restoreWorkspaceQuery();
  dispatchFind(tabs.activeQuery, -1);
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
    // 面板保持打开时切 tab：以新文档重扫当前查找条件并重新定位（V8 需求 32）
    if (findOpen.value) applyEditorQuery();
  },
);

// store 内容被外部更新时同步编辑器文档（V7 需求 25，check 轮补充）：
// 全局替换后 reloadTabsByPaths 重读盘面改写 activeTab.content，若不同步会出现
// 「编辑器显示旧内容 → 下次编辑写回旧内容 → 自动保存覆盖替换结果」的数据回退。
// 编辑器自身输入经 updateListener 写回的 content 与 doc 恒相等，此处比较后 no-op，
// dispatch 引发的 updateListener 写回为同值赋值、不再触发本 watch，无双向回环
watch(
  () => tabs.activeTab?.content,
  (content) => {
    if (!view || content === undefined) return;
    if (view.state.doc.toString() === content) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
    });
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

// —— 查询联动接线（V8 需求 28/32，与全局检索的互斥）——
// 面板关闭：activeQuery 即全局检索联动 spec（或 null），原样下发（后写入者胜）
// 面板打开：互斥——编辑器高亮由面板流程全权管理（applyEditorQuery 已显式下发，
// 含查询清空），activeQuery 的任何变化（workspace 来源写入、全局检索清空 / 失败
// 置 null）一律忽略，防止面板打开期间查找高亮与计数被中途清除
watch(
  () => tabs.activeQuery,
  (spec) => {
    if (findOpen.value) return;
    dispatchFind(spec, -1);
  },
);

// —— 全局检索跳行（V7 需求 25）——
// tabs.pendingLine 有目标且路径匹配当前 tab 时定位：选中该行 + 滚动居中 + 聚焦，消费后置 null。
// 与上面的 id watch 同批触发时按创建顺序执行（文档先替换，此处再定位）
function consumePendingLine(): void {
  const pending = tabs.pendingLine;
  if (!pending || !view) return;
  if (tabs.activeTab?.path !== pending.path) return;
  const doc = view.state.doc;
  const lineNo = Math.min(Math.max(1, pending.line), doc.lines);
  const line = doc.line(lineNo);
  view.dispatch({
    selection: { anchor: line.from, head: line.to },
    effects: EditorView.scrollIntoView(line.from, { y: "center" }),
  });
  view.focus();
  tabs.pendingLine = null;
}
watch(
  () => tabs.pendingLine,
  () => consumePendingLine(),
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
  <div ref="hostEl" class="editor-pane">
    <EditorFindPanel
      v-if="findOpen"
      ref="findPanelRef"
      :find-text="findText"
      :replace-text="findReplaceText"
      :case-sensitive="findCaseSensitive"
      :whole-word="findWholeWord"
      :use-regex="findRegex"
      :preserve-case="findPreserveCase"
      :current="findCurrent"
      :total="findTotal"
      @update:find-text="setFindText"
      @update:replace-text="setReplaceText"
      @toggle:case-sensitive="toggleFindOption('caseSensitive')"
      @toggle:whole-word="toggleFindOption('wholeWord')"
      @toggle:use-regex="toggleFindOption('useRegex')"
      @toggle:preserve-case="togglePreserveCase"
      @next="gotoFind(1)"
      @prev="gotoFind(-1)"
      @replace-one="replaceOne"
      @replace-all="replaceAll"
      @close="closeFindPanel"
    />
  </div>
</template>

<style scoped>
/* position relative：查找面板（V8 需求 32）absolute 定位的包含块 */
.editor-pane {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.editor-pane :deep(.cm-editor) {
  height: 100%;
}
.editor-pane :deep(.cm-scroller) {
  font-family: Consolas, "Courier New", monospace;
}
/* 全部匹配高亮（V8 需求 28）：accent-soft 背景，文件内查找面板与全局检索共用 */
.editor-pane :deep(.cm-global-search-match) {
  background: var(--color-accent-soft);
  border-radius: 2px;
}
/* 当前匹配高亮（V8 需求 32）：更强背景 + outline，与全部匹配同区间叠加更醒目 */
.editor-pane :deep(.cm-current-search-match) {
  background: var(--color-search-current-bg);
  outline: 1px solid var(--color-search-current-outline);
  outline-offset: -1px;
  border-radius: 2px;
}
</style>
