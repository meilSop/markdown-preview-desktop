---
name: trellis-session-insight
description: "通过 `trellis mem` CLI 回溯过去的 AI 对话历史。适用于用户询问'上次我们怎么解决 X 的'、'我们之前讨论过这个吗'、'关于 X 的决定是什么'、'提醒我我们在这个任务中做了什么'、'上次怎么解的'、'之前讨论过吗'、'想起一段对话'，或在开始与先前工作重叠的头脑风暴、调试熟悉的 Bug、跨会话继续任务、或进行工作完成回顾时使用。返回原始历史对话；自行决定是更新规范、追加到任务笔记、在回答中内联引用，还是仅仅内化。"
---

# Trellis Session Insight

此技能教 AI **如何调用 `trellis mem`** ——项目的跨会话记忆数据源——以及**何时使用它是正确的选择**。

它有意设计为**能力技能，而非工作流**。没有固定的输出文件，没有必需的写回步骤，没有"每次完成工作后必须运行"的规则。用 `mem` 返回的内容做什么，是在对话的当下做出的判断。此技能的存在是为了让 AI 知道这个能力可用并可以自行决定。

## `trellis mem` 是什么

一个本地 CLI，索引用户过去的 Claude Code、Codex、Pi Agent 和 ZCode 对话日志，并允许你列出、搜索、按 Trellis 任务边界切片，以及从中导出清理后的对话。Claude 和 Codex 使用 `~/.claude/projects/` 和 `~/.codex/sessions/`。Pi 使用其默认或环境配置的会话根目录、全局 `~/.pi/agent/settings.json`，以及所属项目的 `.pi/settings.json`；相对 `sessionDir` 值从设置文件目录解析。项目本地的 Pi 设置需要通过当前 cwd 或 `--cwd` 进行项目范围查找。ZCode 使用 `~/.zcode/cli/db/db.sqlite`。OpenCode 日志目前不可索引（提供商适配器待开发）——当 OpenCode 会话是明显目标时，说明此限制而非猜测。

`mem` 中的内容不会被上传。所有读取都是本地的。

## 何时使用

标准是"一个资深队友是否会问'我们不是已经讨论过这个了吗？'"——就是那些时刻。一些具体场景：

- **头脑风暴重复风险。** 开始一个涉及用户之前接触过的领域的新任务，你想检查是否已经做出了决定——在重新询问用户之前。
- **熟悉 Bug 的调试。** 当前的 Bug 模式感觉像用户之前报告/修复过的。拉取相关的历史会话可以节省完整的调试循环。
- **跨会话继续。** 用户在中断后恢复工作并说"我们到哪了" / "继续上次的"，但没有具体说明。
- **决策检索。** 用户提到"我们关于 X 做的决定"，但决定在旧的头脑风暴中，不在任何 `prd.md` / `spec/` 中。
- **工作完成回顾。** 当用户明确要求总结此任务中决定了什么/遇到了什么困难/什么让他们意外时——不是作为每次完成工作的强制步骤。
- **跨历史工作的模式发现。** 用户问"我是不是一直在 X 上犯同样的错误" / "我每次都踩这个坑吗"——跨会话搜索可以回答这个问题。

如果以上都不适用，不要调用 `mem`。它是一个工具，不是仪式。

## 何时不使用

- 相关上下文已在当前轮次、`prd.md`、`design.md`、最近的 `git log` 或打开的文件中。`mem` 用于已经超出即时范围的内容。
- 用户在询问代码中的事实，而非过去对话中的事实。`git log -p` / `grep` / 直接阅读文件更快、更权威。
- 你在一个子代理（`trellis-implement` / `trellis-check`）中，其派遣提示已包含策划的 `implement.jsonl` / `check.jsonl` 上下文。在此基础上添加 `mem` 通常只会增加噪音。
- 用户明确说了"不要翻历史，直接回答我的问题"。

## 用 `mem` 返回的内容做什么

将输出视为**原材料**，而非交付物。获得后，根据当前对话决定：

- **在回复中内联引用**，如果特定的历史交流回答了用户当前的问题——并引用 session-id / phase 以便用户验证。
- **更新 `<task>/prd.md` 或 `<task>/design.md`**，如果 `mem` 发现了一个本应记录但未记录的关键决策。先向用户展示提议的编辑。
- **追加到任务本地笔记文件**（例如 `<task>/notes.md` 或扩展现有文件），如果发现属于当前任务的记录但不适合 PRD。
- **更新 `.trellis/spec/`**，如果发现是项目范围的约定或注意事项，有助于未来任务。为此运行 `trellis-update-spec` 技能——`session-insight` 在发现时结束。
- **仅仅吸收**，在接下来的几轮中更好地回答，不写任何东西。这对于一次性回忆通常是正确的选择。

Trellis 不规定单一目标。强制每次回忆都写入固定文件会使该文件变成噪音。让情况来决定。

## 如何调用

完整 CLI 参考在 `references/cli-quick-reference.md` 中。80% 的场景是以下之一：

```bash
# 查找内容提到关键词的会话（默认为项目范围；
# 添加 --global 搜索此机器上的所有项目）。
trellis mem search "<keyword>"

# 从一个会话导出对话，可选按阶段或关键词过滤。
trellis mem extract <session-id> --phase brainstorm
trellis mem extract <session-id> --grep "<keyword>"

# 深入查看会话：前 N 个命中轮次 + 周围上下文。
trellis mem context <session-id> --turns 3 --around 2

# 当你还不知道 session id 时，从 list + filter 开始。
trellis mem list --cwd <project-path>
trellis mem projects   # → 列出活动项目 cwd，然后缩小范围
```

阶段切片（`--phase brainstorm|implement|all`）在 `task.py create` 和 `task.py start` 边界处切割会话。对于当前任务的完成工作回顾，`--phase brainstorm` 恢复规划讨论，`--phase implement` 恢复执行循环。默认为 `all`。

## 触发模式

`references/triggering-patterns.md` 列出了更多原文用户措辞（英文 + 中文），应该让你想到"使用 `mem`"——在训练直觉时保持参考。

## 超出范围

- `mem` 不编辑代码或更新文件。任何写回都是你在当下的决定。
- `mem` 对平台 JSONL 存储是只读的。它不推送或同步到远程。
- 此技能不替代 `trellis-update-spec`（后者是将发现提升为项目范围指导的正确工具）或平台原生的任务/规范工作流。
