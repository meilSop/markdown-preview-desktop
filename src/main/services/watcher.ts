import { watch, type FSWatcher } from "fs";
import { dirname, join } from "path";
import type { WebContents } from "electron";
import { IpcChannel, type FsEventPayload } from "@shared/types";

// 工作区外部文件变更监听服务（需求 34）：
// 对每个项目根用 Node 内置 fs.watch({ recursive: true }) 监听（Windows 支持 recursive），
// 变化目录归并去抖（300ms）后批量推送渲染层；自身写盘经 1s 过期前缀回环抑制不触发多余刷新。
// 注意：本文件不许 import services/fs（fs.ts 单向依赖本服务埋点，防环）。

// rootPath → fs.watch 句柄
const watchers = new Map<string, FSWatcher>();
// 推送目标（单窗口应用，startWatch 时更新）
let sender: WebContents | null = null;
// 去抖窗口内的待推送目录（Set 天然去重）
const pendingDirs = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// 自身变更抑制记录：路径前缀 → 过期时间戳（noteSelfChange 写入，flush 时消费）
const selfNoise = new Map<string, number>();

// 去抖窗口：主进程把 300ms 内的变化归并为一次批量推送
const DEBOUNCE_MS = 300;
// 自噪音抑制时长：应用内写盘引发的 fs.watch 事件在此窗口内被前缀匹配抑制
const SELF_NOISE_MS = 1000;

// dir 是否落在某条自噪音前缀之下（含相等）：主进程无渲染层 path.ts，
// 直接写前缀判断，两种分隔符兼容
function isSelfNoise(dir: string, now: number): boolean {
  for (const [noisePath, expireAt] of selfNoise) {
    if (expireAt <= now) continue;
    if (
      dir === noisePath ||
      dir.startsWith(noisePath + "\\") ||
      dir.startsWith(noisePath + "/")
    ) {
      return true;
    }
  }
  return false;
}

// 去抖到期统一推送：取快照清空 → 过滤自噪音 → 批量 send。
// 过滤后为空（纯自身变更）或 sender 已销毁时静默，渲染层无从感知即无副作用
function flush(): void {
  flushTimer = null;
  const snapshot = [...pendingDirs];
  pendingDirs.clear();
  const now = Date.now();
  // 顺带清理过期自噪音条目，防 Map 无界增长
  for (const [noisePath, expireAt] of selfNoise) {
    if (expireAt <= now) selfNoise.delete(noisePath);
  }
  const filtered = snapshot.filter((dir) => !isSelfNoise(dir, now));
  if (filtered.length === 0) return;
  if (!sender || sender.isDestroyed()) return;
  // 排序保证载荷稳定（同类变化多次推送内容可预期），仅便于排查
  const payload: FsEventPayload = { dirs: [...filtered].sort() };
  sender.send(IpcChannel.FsWatchEvent, payload);
}

// 归并一个候选目录后启动/重置去抖计时
function scheduleFlush(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

// 监听项目根：重复 start 同一路径幂等（直接返回成功语义由调用方 wrap 承接）；
// Linux 无 recursive 支持时 fs.watch 同步抛 ERR_FEATURE_UNAVAILABLE_ON_PLATFORM，
// 静默降级不阻塞主功能（目标平台 Windows 必然可用）
export function startWatch(dirPath: string, senderRef: WebContents): void {
  sender = senderRef;
  if (watchers.has(dirPath)) return; // 幂等
  let watcher: FSWatcher;
  try {
    watcher = watch(dirPath, { recursive: true }, handleChange(dirPath));
  } catch (err) {
    console.warn(`[watcher] 监听失败（降级为不监听）: ${dirPath}`, err);
    return;
  }
  // 运行期错误（根目录被外部删除等）：把根目录自身加入待推送集合，
  // 让渲染层刷新根失败后剔除僵尸根；随即停止该根的监听（句柄已不可靠）
  watcher.on("error", (err) => {
    console.warn(`[watcher] 监听出错，停止监听: ${dirPath}`, err);
    pendingDirs.add(dirPath);
    scheduleFlush();
    stopWatch(dirPath);
  });
  watchers.set(dirPath, watcher);
}

// 构造事件 handler：归并两个候选目录——
// 变化路径的父层（dirname(abs)，该层列表可能增删）与变化路径自身（abs 可能是
// 目录，其一层列表可能变化）；filename 为 null 时（个别平台丢弃文件名）以根目录归并兜底
function handleChange(dirPath: string) {
  return (eventType: string, filename: string | Buffer | null): void => {
    if (filename === null) {
      pendingDirs.add(dirPath);
    } else {
      const abs = join(dirPath, filename.toString());
      pendingDirs.add(dirname(abs));
      pendingDirs.add(abs);
    }
    scheduleFlush();
  };
}

// 停止监听指定根：close 并移除；未命中静默
export function stopWatch(dirPath: string): void {
  const watcher = watchers.get(dirPath);
  if (!watcher) return;
  watchers.delete(dirPath);
  watcher.close();
}

// 退出时关闭全部句柄，防止 fs.watch 挂住进程不退出
export function stopAll(): void {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
}

// 自身变更埋点：fs.ts 各写盘函数成功后调用，记录路径前缀的抑制过期时间；
// 顺带清理过期条目
export function noteSelfChange(paths: string[]): void {
  const now = Date.now();
  for (const [noisePath, expireAt] of selfNoise) {
    if (expireAt <= now) selfNoise.delete(noisePath);
  }
  const expireAt = now + SELF_NOISE_MS;
  for (const path of paths) selfNoise.set(path, expireAt);
}
