---
name: trellis-channel
description: 使用 Trellis channel 进行实时多代理协作、生成工作进程、跨代理审查、进度检查、论坛频道和频道日志调试。
---

# trellis-channel

`trellis channel` 是本地多代理协作运行时。当代理需要通过持久化事件日志进行通信、当工作进程需要作为对等进程生成、当运行中的工作进程需要中断/调试、或当反馈需要记录到持久化的 `--type forum` 频道时，使用它。

典型的用户信号："和 codex/claude 讨论"、"brainstorm with another agent"、"spawn an implement/check worker"、"let agent review"、"open an issue board / changelog forum"、"look at this thread"、"channel is stuck / no output"、"progress was truncated"、"how do I write that channel command"。

此技能是一个索引。只加载当前任务对应的参考文件——不要预加载所有文件。

## 初始命令

```bash
trellis --version
trellis channel --help
trellis channel list --all
trellis channel list --scope global --all
```

如果用户指定了频道或线程名称，先检查它再询问背景信息：

```bash
trellis channel forum <board> --scope global
trellis channel thread <board> <thread> --scope global
trellis channel context list <board> --scope global --thread <thread>
```

## 按用户意图路由

| 用户意图                                                            | 阅读                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| "和 codex/claude 讨论一下"、"brainstorm with another agent"         | `references/workflows.md`                               |
| "派一个 implement/check agent"、"让 agent review"、"spawn a worker" | `references/workflows.md`，然后 `references/workers.md` |
| "开 issue 区 / topic 群 / changelog / board"、"make a forum"        | `references/forum.md`                                   |
| "看看这个 thread / linked context"、"inspect a thread"              | `references/forum.md`                                   |
| "channel 卡住了 / 没输出 / progress 被截断"、"worker stalled"       | `references/progress-debugging.md`                      |
| "具体命令怎么写"、"what flags does X take"                          | `references/command-reference.md`                       |

## 核心规则

- 新论坛频道使用 `--type forum`。`thread` 是论坛频道中的一个条目。
- 使用 `--context-file` / `--context-raw` 和 `trellis channel context add/delete/list`。`--linked-context-*` 是已弃用的术语。
- 对长消息使用 `--stdin` 或 `--text-file`。不要在位置参数 shell 参数中放置长的中英文混合文本。
- 美观的 `messages` 输出是运维面板，可能会截断进度。使用 `--raw` 进行审计。
- `--as` 是发言者或工作进程句柄，取决于命令。当涉及多个代理或会话时，使用明确、稳定的名称。
- `--scope project`（默认）操作当前 cwd 的项目桶；`--scope global` 操作共享的 `__global__` 桶。有意识地选择范围——除非传递 `--scope global`，否则从项目列表中看不到全局频道。
- 对于头脑风暴，进行多轮压力测试。一个答案加一次确认是审查，不是头脑风暴。
- **派遣者等待模式**：使用 `--kind done` / `--kind turn_finished`（trellis 发出的系统事件），而不是用户 `--tag` 作为完成信号。CLI 帮助列出 `phase_done` / `question` 作为 `--tag` 示例，但只有 `interrupt` 是具有硬编码 trellis 行为的保留标签；其他是不透明的用户标签。依赖工作进程运行 `send --tag <my_signal>` 是不可靠的——LLM 工作进程通常将标签字符串写入文本而不是运行实际的 CLI 命令。参见 `references/command-reference.md` 中的 "tag vs kind"。
- 论坛频道是事件溯源的。不要先解析 `events.jsonl`；使用 `forum`、`thread`、`messages --thread` 和 `context list`。
- `@mindfoldhq/trellis-core` 负责可复用的频道/线程状态、事件追加、序列号分配、上下文/标题投影、归约器和任务辅助。CLI 负责标志、终端渲染、提示、工作进程生命周期和进程退出。

## 参考文件

- `references/workflows.md` — 规范协作模式 A–F（对等头脑风暴、生成式审查、派遣并等待、论坛问题捕获、中断并重定向、一次性运行）。
- `references/forum.md` — 论坛频道、上下文、标题、重命名、changelog 论坛、线程过滤。
- `references/workers.md` — 生成、代理卡片、上下文注入（`--file` / `--jsonl`）、中断、终止语义。
- `references/progress-debugging.md` — 进度/原始检查、停滞工作进程诊断、OOM 防护、退出码。
- `references/command-reference.md` — 当前 CLI 命令参考（每个子命令、每个标志、输出约定、范围/类型模型）。

## 不适用场景

- 一次静态审查，使用 markdown 文件和提示即可满足。
- 用自记录替代正常的工具调用。
- 长期记忆检索。使用持久化论坛频道记录可操作的问题，使用 `trellis mem`（`trellis-session-insight` 技能）进行会话/历史搜索。
