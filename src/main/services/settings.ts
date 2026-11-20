import { app } from "electron";
import { promises as fsPromises } from "fs";
import { join } from "path";
import type { LayoutMode, SettingsData, ThemeMode } from "@shared/types";

// 设置存储文件：settings.v2.json 存 userData 目录：主题 + 界面背景色覆盖
// + 文件树项目根列表（V2 多项目）+ 布局模式（V3 需求 19）+ 侧栏宽度（V8 需求 27）
// V6 需求 23 最终根因（修正早先"亿赛通加密驱动锁文件"的误判）：V2 起渲染层
// persist 把 Pinia reactive Proxy 数组直接传 invoke，V8 structured clone 对
// Proxy 抛 DataCloneError，写调用从未到达主进程——失效与主进程写盘无关，已在
// 渲染层载荷解包修复；settings.v2.json 文件名保留（换名无害），旧文件保留盘上
// 仅作迁移回退，不做删除
const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];
// 布局模式白名单（编辑 / 预览 / 分屏），校验风格同 THEME_MODES
const LAYOUT_MODES: LayoutMode[] = ["edit", "preview", "split"];
// 背景色只接受 #rrggbb（渲染层 color input 的输出格式），其余一律视为未自定义
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// 侧栏内容区宽度限幅（V8 需求 27）：合法区间 200–600，越界回落 null（默认 288）
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 600;
// 写盘重试参数（V3 需求 20）：最多 4 次尝试、每次间隔 250ms
const WRITE_MAX_ATTEMPTS = 4;
const WRITE_RETRY_INTERVAL_MS = 250;
const DEFAULT_SETTINGS: SettingsData = {
  theme: "system",
  backgroundColor: null,
  roots: [],
  layoutMode: "split",
  sidebarWidth: null,
};

// 进程内缓存最近一次读写的配置：主进程侧消费方经 getCurrentSettings 直接取用
let current: SettingsData = normalize(DEFAULT_SETTINGS);

function settingsFile(): string {
  return join(app.getPath("userData"), "settings.v2.json");
}

// 旧存储文件（P2/V2 时代，正常时内容为 {theme, backgroundColor}）：
// 仅在 v2 缺失 / 损坏 / 缺 theme 字段时回读迁移，不写不删
function legacySettingsFile(): string {
  return join(app.getPath("userData"), "settings.json");
}

export function getCurrentSettings(): SettingsData {
  return current;
}

// 边界规范化（跨层指南）：字段缺失 / 非法值一律回落默认，防止手改配置带来脏状态
function normalize(raw: unknown): SettingsData {
  const obj = (raw ?? {}) as Partial<SettingsData>;
  return {
    theme: THEME_MODES.includes(obj.theme as ThemeMode)
      ? (obj.theme as ThemeMode)
      : DEFAULT_SETTINGS.theme,
    backgroundColor:
      typeof obj.backgroundColor === "string" &&
      HEX_COLOR.test(obj.backgroundColor)
        ? obj.backgroundColor
        : null,
    roots: Array.isArray(obj.roots)
      ? obj.roots.filter(
          (p): p is string => typeof p === "string" && p.length > 0,
        )
      : [...DEFAULT_SETTINGS.roots],
    layoutMode: LAYOUT_MODES.includes(obj.layoutMode as LayoutMode)
      ? (obj.layoutMode as LayoutMode)
      : DEFAULT_SETTINGS.layoutMode,
    // 非 null 且非有限数值 / 超出 200–600 限幅一律回落 null（= 默认宽度），
    // 与主题色同风格的越界即视为未自定义
    sidebarWidth:
      typeof obj.sidebarWidth === "number" &&
      Number.isFinite(obj.sidebarWidth) &&
      obj.sidebarWidth >= SIDEBAR_WIDTH_MIN &&
      obj.sidebarWidth <= SIDEBAR_WIDTH_MAX
        ? obj.sidebarWidth
        : null,
  };
}

// 读配置（V6 需求 23 迁移式读取）：优先读 settings.v2.json；v2 缺失（首次升级
// 启动）、JSON 损坏，或 JSON 合法但缺 theme 字段（obj.theme === undefined，即
// 非应用写入的合法配置——盘上现存被诊断探针污染的 {"t":2}，该目录删除被管控
// 无法清理）时，均视同 v2 不存在，回读旧 settings.json 迁移，旧字段经 normalize
// 补齐默认（roots/layoutMode/sidebarWidth 回落默认值）；v2 已损坏但有 theme 的
// 情况维持现状（损坏即回退旧文件）；两者都无则回落默认——保持"首次启动无文件
// 回落默认"的既有语义，不视为错误
export async function readSettings(): Promise<SettingsData> {
  // v2 有效判定：能解析成对象且含 theme 字段才算 v2 存在，其余一律迁移回退
  let v2: unknown = null;
  try {
    const text = await fsPromises.readFile(settingsFile(), "utf-8");
    v2 = JSON.parse(text);
    if ((v2 as Partial<SettingsData> | null)?.theme === undefined) {
      v2 = null; // 缺 theme（含 null / 非对象等缺字段 JSON）：视同 v2 不存在
    }
  } catch {
    v2 = null; // v2 缺失 / JSON 损坏：视同 v2 不存在，继续走旧文件迁移回退
  }
  if (v2 !== null) {
    current = normalize(v2);
    return current;
  }
  try {
    const text = await fsPromises.readFile(legacySettingsFile(), "utf-8");
    current = normalize(JSON.parse(text));
  } catch {
    current = normalize(DEFAULT_SETTINGS);
  }
  return current;
}

// 异步等待：写盘重试的间隔手段。异步上下文禁用 Atomics.wait（patch-exdev.cjs
// 的同步阻塞方式在此会卡死主进程事件循环）
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 写盘重试（V3 需求 20）：防御 userData 目录文件被占用 / 锁竞争等环境因素导致
// 的单次 writeFile 瞬时失败（V6 需求 23 最终诊断：此前 settings 写失败真因在
// 渲染层载荷 Proxy，主进程写从未被调用，重试保留作兜底无害）。最多 4 次尝试、
// 间隔 250ms；最终仍失败先输出主进程日志（dev 终端可见，V6 需求 23 消除排查
// 盲区）再原样 rethrow（由 IPC wrap 转 {ok:false} 返回渲染层）
export async function writeSettings(data: SettingsData): Promise<void> {
  current = normalize(data);
  const text = JSON.stringify(current, null, 2);
  for (let attempt = 1; attempt <= WRITE_MAX_ATTEMPTS; attempt++) {
    try {
      await fsPromises.writeFile(settingsFile(), text, "utf-8");
      return;
    } catch (err) {
      if (attempt === WRITE_MAX_ATTEMPTS) {
        const code = (err as NodeJS.ErrnoException).code;
        console.error("[settings] 写盘失败:", code ?? err, settingsFile());
        throw err;
      }
      await sleep(WRITE_RETRY_INTERVAL_MS);
    }
  }
}
