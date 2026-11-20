---
name: trellis-meta
description: "理解和自定义用户项目内的本地 Trellis 架构。适用于修改 .trellis 及平台钩子、设置、代理、技能、命令、提示、工作流、channel 运行时（trellis channel）、.trellis/agents/ 下的捆绑运行时代理、可选工作流模板、注册表支持的规范刷新、由 trellis init 生成的跨会话记忆（trellis mem），或面向 AI 的捆绑技能（trellis-channel、trellis-session-insight、trellis-spec-bootstrap）及捆绑技能自动派遣流程。"
---

# Trellis Meta

此技能面向已在项目中运行 `trellis init` 的本地 Trellis 用户。阅读后，AI 应理解该用户项目内的 Trellis 架构、运行模型和自定义入口，然后根据用户请求修改生成的 `.trellis/` 和平台目录文件。

Trellis v0.6 在 v0.6 之前的工作流/持久化/平台模型之上增加了三个架构层面。第一，多代理协作运行时：`trellis channel` 通过位于 `~/.trellis/channels/<project>/<channel>/events.jsonl` 的项目范围 JSONL 事件日志协调多个 AI 工作进程，具备工作进程 OOM 防护、论坛/线程频道、持久化幂等键，以及捆绑的 `.trellis/agents/{check,implement}.md` 运行时定义。第二，跨会话记忆：`trellis mem list | search | context | extract | projects` 读取磁盘上已有的 Claude Code、Codex 和 Pi Agent JSONL，按 `--phase brainstorm|implement|all` 切片，且不上传任何内容。第三，双包 npm 发布：`@mindfoldhq/trellis`（CLI）和 `@mindfoldhq/trellis-core`（包含 `/channel`、`/task`、`/mem`、`/testing` 子路径的 SDK）同步发布，共享同一版本。将这些视为与每平台集成文件并列的一等自定义层面。

默认操作范围是用户项目中的本地文件：

- `.trellis/`：工作流、配置、任务、规范、工作区、脚本、捆绑运行时代理和运行时状态。
- 平台目录：`.claude/`、`.codex/`、`.cursor/`、`.opencode/`、`.kiro/`、`.gemini/`、`.qoder/`、`.codebuddy/`、`.github/`、`.factory/`、`.pi/`、`.reasonix/`、`.kilocode/`、`.agent/`、`.devin/`、`.kimi-code/` 及类似目录。Pi 还额外暴露原生 `trellis_subagent` 工具，支持 `single` / `parallel` / `chain` 派遣模式、节流进度卡片和 `isTrellisAgent()` 验证。Reasonix 将工作流技能和子代理技能都存储为 `.reasonix/skills/<name>/SKILL.md`；子代理技能携带 `runAs: subagent` frontmatter。Kimi Code 将工作流技能放在共享的 `.agents/skills/` 层，将命令和代理提示作为 `.kimi-code/skills/<name>/SKILL.md` 交付，并将相同的代理提示作为自定义子代理安装在 `.kimi-code/agents/<name>.md` 下。
- 共享技能层：`.agents/skills/`。
- 项目树之外的用户自有频道存储：`~/.trellis/channels/<project>/<channel>/events.jsonl`。
- 可通过 `trellis mem` 查询的原始平台对话日志：`~/.claude/projects/`、`~/.codex/sessions/` 和 `~/.pi/agent/sessions/`（OpenCode 适配器在 v0.6 行降级）。

不要假设用户拥有 Trellis 源代码仓库。不要默认修改全局 npm 安装目录或 `node_modules`——`@mindfoldhq/trellis` 和 `@mindfoldhq/trellis-core` 都作为已发布包发布，每次发布共享一个版本和一个 git 标签。

## 使用方法

1. 首先阅读 `references/local-architecture/overview.md` 以建立本地 Trellis 系统模型。
2. 如果请求涉及特定 AI 工具，阅读 `references/platform-files/platform-map.md` 和相关平台文件说明。
3. 如果请求涉及多代理派遣或频道工作进程，阅读 `references/local-architecture/multi-agent-channel.md` 和捆绑的 `.trellis/agents/` 文件。
4. 如果用户想更改行为，阅读 `references/customize-local/overview.md`，然后打开具体的自定义主题。
5. 编辑之前，阅读用户项目中的实际文件，并将本地内容视为权威。

## 参考资料

### 本地架构

- `references/local-architecture/overview.md`：分层的本地 Trellis 架构（工作流/持久化/平台/频道运行时）和自定义原则。
- `references/local-architecture/generated-files.md`：`trellis init` 生成的文件及其自定义边界，包括 `.trellis/agents/`。
- `references/local-architecture/workflow.md`：阶段、路由、工作流状态块，以及 `.trellis/workflow.md` 中可选的工作流模板（`native`、`tdd`、`channel-driven-subagent-dispatch`、marketplace）。
- `references/local-architecture/task-system.md`：任务目录、活动任务、JSONL 上下文、父子任务树和任务运行时。
- `references/local-architecture/spec-system.md`：`.trellis/spec/` 的组织方式、注入方式，以及如何从 `registry.spec` 源刷新。
- `references/local-architecture/workspace-memory.md`：`.trellis/workspace/` 日志以及 `trellis mem` 跨会话回忆和 `@mindfoldhq/trellis-core/mem` SDK。
- `references/local-architecture/context-injection.md`：钩子、子代理前言和频道运行时工作进程收件箱路由。
- `references/local-architecture/multi-agent-channel.md`：`trellis channel` 子命令、项目范围事件存储、论坛/线程频道、工作进程 OOM 防护、持久化幂等键，以及捆绑的 `.trellis/agents/` 运行时代理。
- `references/local-architecture/bundled-skills.md`：自动派遣的捆绑技能（`trellis-meta`、`trellis-spec-bootstrap`、`trellis-session-insight`）以及 `getBundledSkillTemplates()` 如何将它们分发到每个平台技能根目录。

### 平台文件

- `references/platform-files/overview.md`：共享的 `.trellis/` 文件与平台目录的关系，以及四种平台集成模式（钩子驱动、代理前言、主会话工作流、频道运行时）。
- `references/platform-files/platform-map.md`：所有支持平台（包括 Reasonix 和 Pi 的原生 `trellis_subagent` 扩展）的技能、代理、钩子和扩展的平台目录和路径。
- `references/platform-files/hooks-and-settings.md`：设置/配置文件、钩子、插件和扩展如何连接到 Trellis；涵盖 `channel.worker_guard.*` 和 `codex.dispatch_mode`。
- `references/platform-files/agents.md`：每平台的 `trellis-research` / `trellis-implement` / `trellis-check` 子代理文件，以及频道运行时的捆绑 `.trellis/agents/{check,implement}.md`。
- `references/platform-files/skills-and-commands.md`：技能、命令、提示和工作流之间的区别，以及如何修改它们。

### 本地自定义

- `references/customize-local/overview.md`：为用户请求选择合适的本地自定义入口。
- `references/customize-local/change-workflow.md`：更改阶段、路由、下一步操作、工作流状态和选定的工作流模板。
- `references/customize-local/change-task-lifecycle.md`：更改任务创建、状态、归档行为、父子链接、归档 slug 冲突处理和生命周期钩子。
- `references/customize-local/change-context-loading.md`：更改任务、规范、日志、钩子上下文、频道收件箱消息和 `trellis mem` 回忆的加载方式。
- `references/customize-local/change-hooks.md`：更改平台钩子、设置、任务生命周期钩子（`hooks.after_*`）和 shell 会话桥接。
- `references/customize-local/change-agents.md`：更改研究、实现和检查代理在平台子代理、捆绑频道运行时代理以及 Codex `dispatch_mode` 切换中的行为。
- `references/customize-local/change-skills-or-commands.md`：添加或修改本地技能、命令、提示和工作流；涵盖上游捆绑技能自动派遣。
- `references/customize-local/change-spec-structure.md`：调整 `.trellis/spec/` 下的项目规范结构，包括注册表支持的源。
- `references/customize-local/add-project-local-conventions.md`：将团队规则放入项目本地规范或本地技能。

## 当前规则

- `.trellis/workflow.md` 是本地工作流的权威来源；其初始内容在 `trellis init` 时从工作流模板（内置 `native`、`tdd`、`channel-driven-subagent-dispatch` 或 marketplace 模板）中选择，可通过 `trellis workflow --template <id>` 重新选择。活动模板引用的缺失 `.trellis/agents/<name>.md` 文件会触发非阻塞的 stderr 警告，指向 `trellis update`。
- `.trellis/config.yaml` 是项目级 Trellis 配置入口。它承载任务生命周期钩子（`hooks.after_create` / `after_start` / `after_finish` / `after_archive`）、日志形状（`session_commit_message` / `max_journal_lines` / `session_auto_commit`）、频道工作进程防护（`channel.worker_guard.idle_timeout` / `max_live_workers`）、Codex 派遣模式（`codex.dispatch_mode: inline | sub-agent`），以及规范注册表块（`registry.spec.source` + `registry.spec.template`）。
- `.trellis/spec/` 存储用户项目特定的编码约定和设计约束。当设置了 `registry.spec` 时，文件由 `trellis update` 刷新；本地编辑会在 `.trellis/.template-hashes.json` 中显示为 "modified by user" 冲突。
- `.trellis/tasks/` 存储任务 PRD、设计说明、实现计划、研究文件和 JSONL 上下文。任务形成父子树：`task.py create --parent <slug>`、`task.py add-subtask <parent> <child>`、`task.py remove-subtask <parent> <child>` 和 `task.py list-context <task>`。`task.py create` 拒绝已存在于 `.trellis/tasks/archive/**` 中的 slug。
- `.trellis/workspace/` 存储**有意编写的**开发者日志。原始跨会话对话**不**存储在这里——它位于 `~/.claude/projects/`、`~/.codex/sessions/` 和 `~/.pi/agent/sessions/` 的磁盘上，通过 `trellis mem search|extract|context` 恢复。捆绑的 `trellis-session-insight` 技能教授何时使用 `mem`。
- `.trellis/agents/{check,implement}.md` 是捆绑的、平台无关的频道运行时代理定义，由 `trellis channel spawn --agent <name>` 加载。可编辑；`trellis update` 会补全缺失的文件。编辑每平台的 `trellis-implement.md` / `trellis-check.md` **不会**改变频道运行时工作进程的行为。
- `~/.trellis/channels/<project>/<channel>/events.jsonl` 是每个项目每个频道的频道运行时事件日志。用户自有、文件锁序列号分配、支持持久化 `idempotencyKey`；永远不在 `.trellis/` 下。
- 捆绑的多文件技能（`trellis-meta`、`trellis-spec-bootstrap`、`trellis-session-insight`、`trellis-channel`）由 `packages/cli/src/templates/common/index.ts` 中的 `getBundledSkillTemplates()` 自动分发到每个平台技能根目录。在 `packages/cli/src/templates/common/bundled-skills/`（上游）下放置新目录会在下次 `trellis update` 时将其分发到每个平台。
- 平台设置/配置文件决定哪些钩子、代理、技能、命令、提示和工作流实际运行。Reasonix 没有设置文件——行为编码在技能 frontmatter 中。
- `.trellis/.template-hashes.json` 和 `.trellis/.runtime/` 是管理/运行时状态文件。编辑前确认必要性。

## 禁止事项

- 不要将 Trellis 上游源代码视为本地自定义的默认目标。
- 不要修改全局 npm 安装目录或 `node_modules/@mindfoldhq/trellis` 或 `node_modules/@mindfoldhq/trellis-core` 来实现项目需求；两个包同步发布。
- 不要用默认模板覆盖用户修改的本地文件；先检查 `.trellis/.template-hashes.json`，优先使用 `.new` 附属文件而非破坏性覆盖。
- 不要将团队私有的项目规则放入任何公共捆绑技能（`trellis-meta`、`trellis-spec-bootstrap`、`trellis-session-insight`、`trellis-channel`）；将项目规则放在 `.trellis/spec/`、项目本地技能、当前任务或工作区日志中——`trellis update` 会覆盖捆绑技能目录中的任何内容。
- 不要手动编辑 `~/.trellis/channels/<project>/<channel>/events.jsonl`；序列号在文件锁下分配，安全重放写入通过 `trellis channel` CLI 或 `@mindfoldhq/trellis-core/channel` SDK 进行。
- 当目标是更改频道运行时工作进程行为时，不要编辑 `.claude/agents/trellis-implement.md`（或任何其他每平台子代理文件）——改为编辑 `.trellis/agents/<name>.md`。
- 不要将已移除或从未发布的机制描述为当前 Trellis 行为；在声称某个配置项存在之前，对照本地 `.trellis/config.yaml` 和已安装 CLI 的 `trellis --help` 进行交叉检查。
