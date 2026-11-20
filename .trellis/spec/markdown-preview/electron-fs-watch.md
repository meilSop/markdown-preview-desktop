# 主进程 fs.watch 工作区监听规范（需求 34）

## 场景：fs.watch 工作区外部变更监听

### 1. 范围 / 触发条件

- 触发条件：主进程对项目根启用文件监听、新增/修改 `fs:watch-*` 推送契约、修改 `services/watcher.ts` 或 `services/fs.ts` 写盘函数时必须遵守本规范。
- 目标：外部编辑器在已打开文件夹内新建/删除/改名文件时，渲染层文件树自动同步；同时应用自身写盘不触发冗余刷新。

### 2. 签名

IPC 通道（唯一事实来源 `src/shared/types.ts`，三方同步 preload/ipc/renderer）：

```ts
FsWatchStart: "fs:watch-start"  // invoke，watchRoot(dirPath)，重复 start 同路径幂等
FsWatchStop: "fs:watch-stop"    // invoke，unwatchRoot(dirPath)，未监听时静默成功
FsWatchEvent: "fs:watch-event"  // main→renderer 单向推送，无 invoke
```

主进程服务导出（`src/main/services/watcher.ts`）：

```ts
startWatch(dirPath: string, senderRef: WebContents): void  // 幂等；recursive 失败降级
stopWatch(dirPath: string): void
stopAll(): void                                             // app will-quit 必调
noteSelfChange(paths: string[]): void                       // fs 服务写盘成功后必调
```

### 3. 契约

- `WatchRootParams { dirPath: string }`：start/stop 共用。
- `FsEventPayload { dirs: string[] }`：变化目录绝对路径，主进程 300ms 去抖归并去重后批量推送；每条变化归并两个候选目录 `dirname(abs)` 与 `abs`（后者可能是新目录）。
- 推送方向只能 main→renderer；渲染层经 `window.api.fs.onFsEvent(listener)` 订阅，返回取消函数（模式同 `onFlushRequest`）。

### 4. 验证与错误矩阵

| 条件                                                           | 行为                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 重复 startWatch 同一路径                                       | 幂等返回，不重复注册                                                      |
| Linux 无 recursive 支持（ERR_FEATURE_UNAVAILABLE_ON_PLATFORM） | startWatch try/catch 降级 console.warn，渲染层静默                        |
| watcher error（根被删/不可读）                                 | 根目录加入 pendingDirs 推送渲染层 → stopWatch 该根                        |
| sender 已销毁                                                  | flush 时跳过 send，不抛错                                                 |
| 事件目录命中未过期自噪音前缀                                   | 抑制推送（回环消除）                                                      |
| 渲染层刷新目录失败（目录消失）                                 | dropTreePaths 清子树缓存/展开态/挂起输入，仅 console.warn，不写全局 error |

### 5. 好/基准/坏用例

- 好：外部新建 `docs/a.md` → 推送含 `...\docs` → 渲染层刷新已缓存的 `...\docs` 层，≤1s 可见。
- 基准：自动保存写盘 → noteSelfChange 抑制 → 文件树零刷新。
- 坏：外部删除根目录 + 任意错误都剔根 → EPERM/EBUSY 临时不可读（本机加密驱动实证）即永久丢失用户项目列表。

### 6. 所需测试（无自动化测试框架，手动验收断言点）

1. 资源管理器向已展开目录新建文件/文件夹/改名/删除 → 文件树 ≤1s 反映。
2. 编辑器自动保存期间文件树无多余刷新（回环抑制生效）。
3. 外部删除已展开子目录 → 该分支消失、无错误提示；外部删除根 → 根剔除且重启后不再恢复。

### 7. 错误 vs 正确

#### 错误（任意错误都执行不可自愈的持久化后果）

```ts
// 外部刷新失败一律剔根并持久化：临时不可读（EPERM/EBUSY）也会永久丢项目列表
if (!ret.ok) {
  dropTreePaths(this, dir);
  this.roots = this.roots.filter((r) => r.path !== dir); // 误伤！
  void this.persistRoots();
}
```

#### 正确（不可自愈后果必须加错误码门槛）

```ts
// 仅确认路径不存在（ENOENT）才剔根；缓存清理无条件（自愈无害）
if (!ret.ok) {
  dropTreePaths(this, dir);
  if (ret.error.startsWith("ENOENT") && this.roots.some((r) => r.path === dir)) {
    this.roots = this.roots.filter((r) => r.path !== dir);
    void this.persistRoots();
  }
}
```

## 附加约定

- 回环抑制：fs 服务写盘成功（writeFile/create/rename/remove）后必须调 `noteSelfChange`（writeFile→dirname；create→parentPath；rename→新旧 dirname；remove→dirname+targetPath），噪音前缀 1s 过期（覆盖 300ms 去抖窗口）。
- 外部变更引发的刷新失败一律静默降级（console.warn + 清缓存自愈），不得写入 `workspace.error` 全局提示。
- watcher.ts 不得 import fs.ts（fs.ts → watcher.ts 单向依赖，防环）。
