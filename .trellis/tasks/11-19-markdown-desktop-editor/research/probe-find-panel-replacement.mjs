// check 轮探针：用安装版 @codemirror/search 的真实 SearchQuery.getCursor 流式扫描，
// 复刻 EditorPane.vue 的 scanFindMatches / replayAllExecs / applyRegexReplacement /
// unquoteText / applyPreserveCase 全套逻辑，端到端验证替换正确性。
// 运行：node .trellis/tasks/11-19-markdown-desktop-editor/research/probe-find-panel-replacement.mjs
import { SearchQuery } from "@codemirror/search";
import { Text } from "@codemirror/state";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(
      `FAIL ${name}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`,
    );
  }
}

// —— 以下函数与 EditorPane.vue 实现逐字一致 ——
function unquoteText(text) {
  return text.replace(/\\([nrt\\])/g, (_, ch) =>
    ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : "\\",
  );
}
function applyRegexReplacement(replacement, match) {
  return unquoteText(replacement).replace(/\$([$&]|\d+)/g, (raw, key) => {
    if (key === "&") return match[0];
    if (key === "$") return "$";
    for (let l = key.length; l > 0; l -= 1) {
      const n = Number(key.slice(0, l));
      if (n > 0 && n < match.length) return match[n] + key.slice(l);
    }
    return raw;
  });
}
function applyPreserveCase(matched, replacement) {
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
const FIND_MATCH_LIMIT = 2000;
const SCAN_TIME_BUDGET_MS = 100;
function scanFindMatchesDoc(doc, query) {
  if (!query.valid) return [];
  const out = [];
  const cursor = query.getCursor(doc);
  const startedAt = Date.now();
  let steps = 0;
  let prevFrom = -1;
  let prevTo = -1;
  while (out.length < FIND_MATCH_LIMIT) {
    steps += 1;
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
function replayAllExecsDoc(doc, query, matches) {
  const out = matches.map(() => null);
  let reg;
  try {
    reg = new RegExp(query.search, (query.caseSensitive ? "" : "i") + "gmu");
  } catch {
    return out;
  }
  const full = doc.sliceString(0);
  reg.lastIndex = 0;
  const startedAt = Date.now();
  let mi = 0;
  let steps = 0;
  let r;
  while ((r = reg.exec(full)) !== null && mi < matches.length) {
    steps += 1;
    if ((steps & 255) === 0 && Date.now() - startedAt > SCAN_TIME_BUDGET_MS)
      break;
    const m = matches[mi];
    if (r.index === m.from) out[mi++] = r;
    else if (r.index > m.from) out[mi++] = null;
    if (r[0].length === 0) {
      reg.lastIndex += 1;
      if (reg.lastIndex > full.length) break;
    }
  }
  return out;
}
// replaceAll 的完整复刻（收集 changes → 拼接结果文档）
function simulateReplaceAll(docText, spec, replaceText, preserveCase) {
  const doc = Text.of(docText.split("\n"));
  const query = new SearchQuery({
    search: spec.query,
    caseSensitive: spec.caseSensitive ?? false,
    regexp: spec.useRegex ?? false,
    wholeWord: spec.wholeWord ?? false,
    replace: replaceText,
  });
  const matches = scanFindMatchesDoc(doc, query);
  const execs = spec.useRegex ? replayAllExecsDoc(doc, query, matches) : null;
  const changes = matches.map((m, i) => {
    const matched = doc.sliceString(m.from, m.to);
    const base =
      spec.useRegex && execs && execs[i]
        ? applyRegexReplacement(replaceText, execs[i])
        : unquoteText(replaceText);
    const text = preserveCase ? applyPreserveCase(matched, base) : base;
    return { from: m.from, to: m.to, insert: text };
  });
  // 升序 changes 拼接（CM changes 语义：按原文档位置依序替换）
  let result = "";
  let pos = 0;
  for (const c of changes) {
    result += doc.sliceString(pos, c.from) + c.insert;
    pos = c.to;
  }
  result += doc.sliceString(pos);
  return { result, count: changes.length };
}

// —— 用例 1：多行多匹配 + $1 引用（无 preserveCase）——
// 文档 4 行 4 处命中（行中/行首/两处同行/最后一行），查询 (\w+)@example\.com 大小写不敏感
{
  const doc = [
    "contact alice@example.com first",
    "no hit on this line bob@test.org",
    "Alice@Example.COM and alice@example.com",
    "last ALICE@example.com end",
  ].join("\n");
  const r = simulateReplaceAll(
    doc,
    { query: "(\\w+)@example\\.com", useRegex: true, caseSensitive: false },
    "<$1@ok>",
    false,
  );
  check("用例1 命中数（4 处）", r.count, 4);
  check(
    "用例1 替换结果",
    r.result,
    [
      "contact <alice@ok> first",
      "no hit on this line bob@test.org",
      "<Alice@ok> and <alice@ok>",
      "last <ALICE@ok> end",
    ].join("\n"),
  );
}

// —— 用例 1b：用例 1 文档 + preserveCase ——
// ALICE@example.com 非全大写串（域名小写）→ 走第二形态首字母大写（"<" 无大小写 → 原样）；
// 全大写命中须是 "ALICE@EXAMPLE.COM" 才触发第一形态
{
  const doc = [
    "contact alice@example.com first",
    "no hit on this line bob@test.org",
    "Alice@Example.COM and alice@example.com",
    "last ALICE@EXAMPLE.COM end",
  ].join("\n");
  const r = simulateReplaceAll(
    doc,
    { query: "(\\w+)@example\\.com", useRegex: true, caseSensitive: false },
    "<$1@ok>",
    true,
  );
  check(
    "用例1b preserveCase（非全大写走形态二 / 全大写走形态一 / 小写原样）",
    r.result,
    [
      "contact <alice@ok> first",
      "no hit on this line bob@test.org",
      "<Alice@ok> and <alice@ok>",
      "last <ALICE@OK> end",
    ].join("\n"),
  );
}

// —— 用例 2：preserveCase 三形态（纯词）——
{
  const r = simulateReplaceAll(
    "hello Hello HELLO hEllO hello",
    { query: "hello", caseSensitive: false },
    "world",
    true,
  );
  check("用例2 preserveCase 三形态", r.result, "world World WORLD world world");
  check("用例2 命中数", r.count, 5);
}

// —— 用例 3：$& / $$ / 多位捕获组回退 ——
{
  // $11 在 12 组正则中应取第 11 组（组序：a=1..j=10、k=11、l?=12）→ "k"，不是 $1+"1"="a1"
  const r = simulateReplaceAll(
    "abcdefghijk",
    { query: "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)?", useRegex: true },
    "$11",
    false,
  );
  check("用例3a $11 多位回退取第 11 组", r.result, "k");
  // $2/$1/$&/$$/$99（未定义组回退原样）
  const r2 = simulateReplaceAll(
    "x=42",
    { query: "(\\w+)=(\\d+)", useRegex: true },
    "[$2|$1|$&|$$|$99]",
    false,
  );
  check("用例3b $2/$1/$&/$$/$99", r2.result, "[42|x|x=42|$|$99]");
}

// —— 用例 4：unquoteText 转义（\n \t \\ 字面量模式）——
{
  const r = simulateReplaceAll("A B", { query: "A" }, "X\\nY\\tZ\\\\W", false);
  check("用例4 字面量 \\n\\t\\\\ 转义", r.result, "X\nY\tZ\\W B");
}

// —— 用例 5：wholeWord 过滤下 replayAllExecs 与 matches 对齐 ——
{
  const r = simulateReplaceAll(
    "foo foobar foo bar foo",
    { query: "foo", wholeWord: true },
    "X",
    false,
  );
  check("用例5a wholeWord 命中数（3 处，foobar 不算）", r.count, 3);
  check("用例5a wholeWord 替换结果", r.result, "X foobar X bar X");
}

// —— 用例 6：正则 + wholeWord + $1 组合对齐 ——
{
  const r = simulateReplaceAll(
    "id=1 xid=2 id=3",
    { query: "id=(\\d+)", useRegex: true, wholeWord: true },
    "N$1",
    false,
  );
  // wholeWord：xid=2 的 xid 不算全词 → 只替换 id=1 / id=3
  check("用例6 正则+wholeWord+$1", r.result, "N1 xid=2 N3");
}

// —— 用例 7：多行正则（\n 入模式，MultilineRegExpCursor 路径）——
{
  const r = simulateReplaceAll(
    "start\nmiddle\nend\nstart\nmiddle",
    { query: "start\\nmiddle", useRegex: true },
    "BLOCK",
    false,
  );
  check("用例7 跨行匹配替换", r.result, "BLOCK\nend\nBLOCK");
}

// —— 用例 8：零宽匹配防御（a* 既有非零宽又有零宽命中，不死循环不收录零宽）——
{
  const doc = Text.of(["baaab", "x"]);
  const q = new SearchQuery({ search: "a*", regexp: true });
  const ms = scanFindMatchesDoc(doc, q);
  check("用例8 零宽防御仅收录非零宽命中", ms, [{ from: 1, to: 4 }]);
}

// —— 用例 9：非法正则 valid=false 不扫描 ——
{
  const doc = Text.of(["(ab"]);
  const q = new SearchQuery({ search: "(ab", regexp: true });
  check("用例9 非法正则 valid=false", q.valid, false);
  check("用例9 非法正则扫描结果为空", scanFindMatchesDoc(doc, q), []);
}

// —— 用例 10：单处替换后重扫对齐（replaceOne 路径）——
{
  const docT = Text.of(["aa aa aa"]);
  const q = new SearchQuery({ search: "aa" });
  const ms = scanFindMatchesDoc(docT, q);
  check("用例10a 初始 3 处", ms, [
    { from: 0, to: 2 },
    { from: 3, to: 5 },
    { from: 6, to: 8 },
  ]);
  // 替换第 0 处为 X → 新文档 "X aa aa"，重扫应得 2 处
  const docT2 = Text.of(["X aa aa"]);
  const ms2 = scanFindMatchesDoc(docT2, q);
  check("用例10b 替换后重扫 2 处", ms2, [
    { from: 2, to: 4 },
    { from: 5, to: 7 },
  ]);
  // after = 0 + 1 = 1 → 首个 from >= 1 的是 idx=0（from=2）→ 当前项落回第 1 处
  const idx = ms2.findIndex((m) => m.from >= 1);
  check("用例10c 替换后定位 idx", idx, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
