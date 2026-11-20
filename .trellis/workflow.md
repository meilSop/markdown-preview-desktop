# 开发工作流

---

## 核心原则

1. **先规划再编码** — 动手之前先想清楚要做什么
2. **规范通过注入而非记忆** — 指南通过 hook/skill 注入，而非从记忆中回忆
3. **持久化一切** — 研究、决策和经验教训都写入文件；对话会被压缩，文件不会
4. **增量开发** — 一次一个任务
5. **捕获经验** — 每个任务完成后，回顾并将新知识写回规范

---

## Trellis 系统

### 开发者身份

首次使用时，初始化你的身份：

```bash
python ./.trellis/scripts/init_developer.py <your-name>
```

创建 `.trellis/.developer`（已加入 gitignore）+ `.trellis/workspace/<your-name>/`。

### 规范系统

`.trellis/spec/` 存放按包和层组织的编码指南。

- `.trellis/spec/<package>/<layer>/index.md` — 入口文件，包含 **开发前检查清单** + **质量检查**。实际指南在其指向的 `.md` 文件中。
- `.trellis/spec/guides/index.md` — 跨包思维指南。

```bash
python ./.trellis/scripts/get_context.py --mode packages   # list packages / layers
```

**何时更新规范**：发现新的模式/约定 · 需要固化的 bug 修复经验 · 新的技术决策。

### 任务系统

每个任务在 `.trellis/tasks/{MM-DD-name}/` 下拥有自己的目录，包含 `task.json`、`prd.md`、可选的 `design.md`、可选的 `implement.md`、可选的 `research/`，以及面向子代理平台的上下文清单（`implement.jsonl`、`check.jsonl`）。

```bash
# Task lifecycle
python ./.trellis/scripts/task.py create "<title>" [--slug <name>] [--parent <dir>]
python ./.trellis/scripts/task.py start <name>          # set active task (session-scoped when available)
python ./.trellis/scripts/task.py current --source      # show active task and source
python ./.trellis/scripts/task.py finish                # clear active task (triggers after_finish hooks)
python ./.trellis/scripts/task.py archive <name>        # move to archive/{year-month}/
python ./.trellis/scripts/task.py list [--mine] [--status <s>]
python ./.trellis/scripts/task.py list-archive

# Code-spec context (injected into implement/check agents via JSONL).
# `implement.jsonl` / `check.jsonl` are seeded on `task create` for sub-agent-capable
# platforms; the AI curates real spec + research entries during planning when needed.
python ./.trellis/scripts/task.py add-context <name> <action> <file> <reason>
python ./.trellis/scripts/task.py list-context <name> [action]
python ./.trellis/scripts/task.py validate <name>

# Task metadata
python ./.trellis/scripts/task.py set-branch <name> <branch>
python ./.trellis/scripts/task.py set-base-branch <name> <branch>    # PR target
python ./.trellis/scripts/task.py set-scope <name> <scope>

# Hierarchy (parent/child)
python ./.trellis/scripts/task.py add-subtask <parent> <child>
python ./.trellis/scripts/task.py remove-subtask <parent> <child>

# PR creation
python ./.trellis/scripts/task.py create-pr [name] [--dry-run]
```

> 运行 `python ./.trellis/scripts/task.py --help` 查看权威的、最新的命令列表。

**当前任务机制**：`task.py create` 创建任务目录，并在会话身份可用时自动设置每会话的活跃任务指针，使规划面包屑立即生效。`task.py start` 写入相同的指针（如果已设置则是幂等的），并将 `task.json.status` 从 `planning` 切换为 `in_progress`。状态存储在 `.trellis/.runtime/sessions/` 下。如果从 hook 输入、`TRELLIS_CONTEXT_ID` 或平台原生会话环境变量中无法获取上下文键，则没有活跃任务，`task.py start` 将失败并提示会话身份信息。`task.py finish` 删除当前会话文件（状态不变）。`task.py archive <task>` 写入 `status=completed`，将目录移动到 `archive/`，并删除仍指向已归档任务的运行时会话文件。

### 工作区系统

在 `.trellis/workspace/<developer>/` 下记录每次 AI 会话，用于跨会话追踪。

- `journal-N.md` — 会话日志。**每个文件最多 2000 行**；超出时自动创建新的 `journal-(N+1).md`。
- `index.md` — 个人索引（总会话数、最后活跃时间）。

```bash
python ./.trellis/scripts/add_session.py --title "Title" --commit "hash" --summary "Summary"
```

### 上下文脚本

```bash
python ./.trellis/scripts/get_context.py                            # full session runtime
python ./.trellis/scripts/get_context.py --mode packages            # available packages + spec layers
python ./.trellis/scripts/get_context.py --mode phase --step <X.Y>  # detailed guide for a workflow step
```

---

<!--
  WORKFLOW-STATE BREADCRUMB CONTRACT (read this before editing the tag blocks below)

  The [workflow-state:STATUS] blocks embedded in the ## Phase Index section
  below are the SINGLE source of truth for the per-turn `<workflow-state>`
  breadcrumb that every supported AI platform's UserPromptSubmit hook
  reads. inject-workflow-state.py (Python platforms) and
  inject-workflow-state.js (OpenCode plugin) only parse them — there is no
  fallback dict baked into the scripts after v0.5.0-rc.0.

  STATUS charset: [A-Za-z0-9_-]+. When the hook can't find a tag, it
  degrades to a generic "Refer to workflow.md for current step." line —
  intentionally visible so users notice and fix a broken workflow.md.

  INVARIANT (test/regression.test.ts):
    Every workflow-walkthrough step marked `[required · once]` must have a
    matching enforcement line in its phase's [workflow-state:*] block. The
    breadcrumb is the only per-turn channel; if a mandatory step isn't
    mentioned there, the AI silently skips it (Phase 1 planning gate
    skip and Phase 3.4 commit skip both manifested via this gap).

  TAG ↔ PHASE scoping:
    [workflow-state:no_task]      → no active task; before Phase 1
    [workflow-state:planning]     → all of Phase 1 (status='planning')
    [workflow-state:planning-inline] → Codex inline variant of Phase 1
    [workflow-state:in_progress]  → Phase 2 + Phase 3.2-3.4
                                    (status stays 'in_progress' from
                                    task.py start until task.py archive)
    [workflow-state:in_progress-inline] → Codex inline variant of Phase 2/3
    [workflow-state:completed]    → currently DEAD: cmd_archive flips
                                    status and moves the dir in the same
                                    call, so the resolver loses the
                                    pointer (block kept for a future
                                    explicit in_progress→completed
                                    transition)

  Editing checklist:
    - When you change a [workflow-state:STATUS] block, also check the
      matching phase's `[required · once]` walkthrough steps for sync
    - Run `trellis update` after editing to push the new bodies to
      downstream user projects (block-level managed replacement)
    - Full runtime contract:
      .trellis/spec/cli/backend/workflow-state-contract.md
-->

## 阶段索引

```
Phase 1: Plan    → classify, get task-creation consent, then write planning artifacts
Phase 2: Execute → implement only after task status is in_progress
Phase 3: Finish  → verify, update spec, commit, and wrap up
```

### 请求分流

- 简单对话或小任务：只需询问本轮是否应创建 Trellis 任务。如果用户说不，则本次会话跳过 Trellis。
- 复杂任务：询问是否可以创建 Trellis 任务并进入规划阶段。如果用户说不，不要进行大范围的内联实现；应解释、澄清范围或建议更小的拆分。
- 用户同意创建任务并不意味着同意开始实现。规划仍然优先进行。

### 规划产物

- `prd.md` — 需求、约束和验收标准。不要在此放置技术设计或执行检查清单。
- `design.md` — 复杂任务的技术设计：边界、契约、数据流、权衡、兼容性、发布/回滚方案。
- `implement.md` — 复杂任务的执行计划：有序检查清单、验证命令、审查关卡和回滚点。
- `implement.jsonl` / `check.jsonl` — 子代理上下文的规范和研究清单。它们不能替代 `implement.md`。
- 轻量级任务可以仅有 PRD。复杂任务在 `task.py start` 之前必须拥有 `prd.md`、`design.md` 和 `implement.md`。

### 父/子任务树

当一个用户请求包含多个可独立验证的交付物时，使用父任务。父任务负责原始需求集、任务映射、跨子任务验收标准和最终集成审查；通常不应作为实现目标，除非父任务本身也有直接的工作。

将可独立规划、实现、检查和归档的交付物用作子任务。父/子结构不是依赖系统：如果一个子任务必须等待另一个子任务，将该顺序写入子任务的 `prd.md` / `implement.md`，并保持每个子任务的验收标准可测试。

使用 `task.py create "<title>" --slug <name> --parent <parent-dir>` 创建新的子任务。使用 `task.py add-subtask <parent> <child>` 关联已有任务，使用 `task.py remove-subtask <parent> <child>` 取消错误的关联。

<!-- Per-turn breadcrumb: shown when there is no active task (before Phase 1) -->

[workflow-state:no_task]
当前没有活跃任务。首先分类本轮对话，在创建任何 Trellis 任务之前征求任务创建同意。
简单对话/小任务：只需询问本轮是否应创建 Trellis 任务。如果用户说不，则本次会话跳过 Trellis。
复杂任务：询问用户是否可以创建 Trellis 任务并进入规划阶段。如果用户说不，则解释、澄清范围或建议更小的拆分。
[/workflow-state:no_task]

### 阶段 1：规划
- 1.0 创建任务 `[required · once]`（仅在获得任务创建同意后）
- 1.1 需求探索 `[required · repeatable]`（`prd.md`；复杂任务还需要 `design.md` + `implement.md`）
- 1.2 研究 `[optional · repeatable]`
- 1.3 配置上下文 `[required · once]` — Claude Code、Cursor、OpenCode、Codex、Kiro、Gemini、Qoder、CodeBuddy、Copilot、Droid、Pi、Oh My Pi、ZCode、Snow、Reasonix、Grok、Kimi Code（仅限子代理调度平台；内联平台跳过）
- 1.4 激活任务 `[required · once]`（审查关卡，然后执行 `task.py start`；状态 → in_progress）
- 1.5 完成标准

<!-- Per-turn breadcrumb: shown throughout Phase 1 (status='planning') -->

[workflow-state:planning]
加载 `trellis-brainstorm`；保持规划状态。
轻量级：`prd.md` 可能就足够了。复杂任务：完成 `prd.md`、`design.md` 和 `implement.md`；在 `task.py start` 之前请求审查。
多交付物范围：考虑使用父任务加可独立验证的子任务；依赖关系必须写入子任务产物中，不能通过树位置隐含。
子代理模式：在启动前整理 `implement.jsonl` 和 `check.jsonl` 作为规范/研究清单。
[/workflow-state:planning]

<!-- Per-turn breadcrumb: shown throughout Phase 1 when codex.dispatch_mode=inline.
     Codex-only opt-in alternate to [workflow-state:planning]. The main agent
     edits code directly in Phase 2, so jsonl curation is skipped —
     the inline workflow loads `trellis-before-dev` instead of injecting JSONL
     into a sub-agent. -->

[workflow-state:planning-inline]
加载 `trellis-brainstorm`；保持规划状态。
轻量级：`prd.md` 可能就足够了。复杂任务：完成 `prd.md`、`design.md` 和 `implement.md`；在 `task.py start` 之前请求审查。
多交付物范围：考虑使用父任务加可独立验证的子任务；依赖关系必须写入子任务产物中，不能通过树位置隐含。
内联模式：跳过 jsonl 整理；阶段 2 通过 `trellis-before-dev` 读取产物/规范。
[/workflow-state:planning-inline]

### 阶段 2：执行
- 2.1 实现 `[required · repeatable]`
- 2.2 质量检查 `[required · repeatable]`
- 2.3 回滚 `[on demand]`

<!-- Per-turn breadcrumb: shown while status='in_progress'.
     Scope: all of Phase 2 + Phase 3.2-3.4 (status stays 'in_progress' from
     task.py start until task.py archive; only archive flips it). The body
     therefore must cover every required step from implementation through
     commit, including Phase 3.3 spec update and Phase 3.4 commit. -->

子代理调度协议适用于所有平台和所有子代理，包括原生 Codex `SubagentStart` 上下文注入（带子端拉取回退）、class-2 Gemini/Qoder/Copilot/Reasonix/Trae/Grok/Kimi Code、hook 支持的 ZCode/Snow，以及 `trellis-research`：每个调度提示都以 `Active task: <task path from task.py current>` 开头，然后才是角色特定的指令。在 Grok Build 上，使用 `spawn_subagent` 并将 `subagent_type` 设置为 Trellis 代理名称（例如 `trellis-implement`）。在 Kimi Code 上，调度内置的 `coder` / `explore` 子代理，并附带对应的 `.komi-code/skills/trellis-<role>/SKILL.md` 指令。

[workflow-state:in_progress]
工具：`trellis-implement` / `trellis-research` 仅为子代理类型（Task/Agent 工具，非 Skill；不存在这些名称的 skill）。`trellis-update-spec` 是一个 skill。`trellis-check` 两者皆可；在代码变更后验证时优先使用 Agent 形式。
流程：`trellis-implement` -> `trellis-check` -> `trellis-update-spec` -> commit（阶段 3.4）-> `/trellis:finish-work`。
主会话默认：调度 implement/check 子代理。子代理自豁免：如果已经作为 `trellis-implement` 运行，不要再生成 `trellis-implement` 或 `trellis-check`；如果已经作为 `trellis-check` 运行，不要再生成 `trellis-check` 或 `trellis-implement`。调度仅限主会话。
调度提示以 `Active task: <task path from task.py current>` 开头。读取上下文：jsonl 条目 -> `prd.md` -> `design.md if present` -> `implement.md if present`。
[/workflow-state:in_progress]

<!-- Per-turn breadcrumb: shown while status='in_progress' when
     codex.dispatch_mode=inline. Codex-only opt-in alternate to
     [workflow-state:in_progress]. The main session edits code directly
     instead of dispatching sub-agents. -->

[workflow-state:in_progress-inline]
流程：`trellis-before-dev` -> edit -> `trellis-check` -> validation -> `trellis-update-spec` -> commit（阶段 3.4）-> `/trellis:finish-work`。
内联模式下不要调度 implement/check 子代理。
读取上下文：`prd.md` -> `design.md if present` -> `implement.md if present`，加上 skill 加载的相关规范/研究。
[/workflow-state:in_progress-inline]

### 阶段 3：收尾
- 3.2 调试回顾 `[on demand]`
- 3.3 规范更新 `[required · once]`
- 3.4 提交变更 `[required · once]`
- 3.5 收尾提醒

> 注意：步骤 3.1 已合并到 2.2（最后一次迭代的全范围检查）和 3.4（提交前言）中。编号保持不变以避免破坏外部引用。

<!-- Per-turn breadcrumb: shown while status='completed'.
     Currently DEAD in normal flow: cmd_archive writes status='completed' in
     the same call that moves the task dir to archive/, so the active-task
     resolver loses the pointer and the hook never fires on archived tasks.
     Block preserved for a future status-transition redesign (e.g. an
     explicit in_progress→completed command). Edit through the same spec
     channel as the live blocks. -->

[workflow-state:completed]
代码已提交。运行 `/trellis:finish-work`；如果有未提交的更改，先返回阶段 3.4。
[/workflow-state:completed]

### 规则

1. 识别当前处于哪个阶段，然后从该阶段的下一步继续
2. 在每个阶段内按顺序运行步骤；`[required]` 步骤不可跳过
3. 阶段可以回滚（例如，执行阶段发现 prd 缺陷 → 返回规划阶段修复，然后重新进入执行阶段）
4. 标记为 `[once]` 的步骤在输出已存在时跳过；不要重新运行
5. 产物的存在与否为下一步提供信息；缺少 `design.md` / `implement.md` 对于轻量级任务是有效的，对于复杂任务则表示规划未完成。

### 活跃任务路由

当用户请求在活跃任务中匹配以下意图之一时，先路由，然后按需加载详细的阶段步骤。

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

- 规划或需求不明确 -> `trellis-brainstorm`。
- `in_progress` 实现/检查 -> 调度 `trellis-implement` / `trellis-check`。
- 反复调试 -> `trellis-break-loop`；规范更新 -> `trellis-update-spec`。

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

[codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

- 规划或需求不明确 -> `trellis-brainstorm`。
- 编辑前 -> `trellis-before-dev`；编辑后 -> `trellis-check`。
- 反复调试 -> `trellis-break-loop`；规范更新 -> `trellis-update-spec`。

[/codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

### 护栏

- 任务创建批准不等于实现批准；实现在产物审查后通过 `task.py start` 启动。
- 仅 PRD 对轻量级任务是有效的；复杂任务需要 `design.md` + `implement.md`。
- 规划必须持久化到任务产物中；检查必须在报告完成之前运行。

### 加载步骤详情

在每个步骤中，运行以下命令获取详细指导：

```bash
python ./.trellis/scripts/get_context.py --mode phase --step <step>
# e.g. python ./.trellis/scripts/get_context.py --mode phase --step 1.1
```

---

## 阶段 1：规划

目标：分类请求，在需要任务时获取任务创建同意，并生成实现前所需的规划产物。

#### 1.0 创建任务 `[required · once]`

仅在获得任务创建同意后创建任务目录。该命令将状态设为 `planning`，写入 `task.json`，创建默认的 `prd.md`，并在会话身份可用时自动定位到新任务：

```bash
python ./.trellis/scripts/task.py create "<task title>" --slug <name>
```

`--slug` 仅为人类可读的名称。**不要**包含 `MM-DD-` 日期前缀；`task.py create` 会自动添加该前缀。

对于任务树，先创建父任务，然后使用 `--parent <parent-dir>` 创建每个子任务。不要仅因为子任务存在就启动父任务；启动拥有下一个可独立验证交付物的子任务。

此命令成功后，每轮面包屑会自动切换到 `[workflow-state:planning]`，告知 AI 保持规划状态。

此处仅运行 `create` — 不要同时运行 `start`。`start` 会将状态切换为 `in_progress`，这会在规划产物审查之前将面包屑切换到实现阶段。将 `start` 留到步骤 1.4。

当 `python ./.trellis/scripts/task.py current --source` 已指向一个任务时跳过。

#### 1.1 需求探索 `[required · repeatable]`

加载 `trellis-brainstorm` skill，并根据该 skill 的指导与用户交互式地探索需求。

brainstorm skill 将引导你：
- 每次只问一个问题
- 优先研究而非直接询问用户
- 优先提供选项而非开放式问题
- 在每次用户回答后立即更新 `prd.md`
- 当交付物可独立验证时，将大范围拆分为父任务加子任务
- 保持 `prd.md` 聚焦于需求和验收标准
- 对于复杂任务，在实现开始前产出 `design.md` 和 `implement.md`

考虑父/子拆分时：
- 当一个请求包含多个可独立验证的交付物时，使用父任务。
- 父任务负责原始需求、子任务映射、跨子任务验收标准和最终集成审查。
- 子任务负责可独立规划、实现、检查和归档的实际交付物。
- 父/子结构不是依赖系统。如果子任务 B 依赖子任务 A，将该顺序写入子任务 B 的 `prd.md` / `implement.md`。
- 启动拥有下一个交付物的子任务。除非父任务本身有直接的实现工作，否则不要启动父任务。

每当需求变更时返回此步骤并修订相关产物。

#### 1.2 研究 `[optional · repeatable]`

研究可以在需求探索的任何时候进行。不仅限于本地代码 — 可以使用任何可用工具（MCP 服务器、skill、网络搜索等）查找外部信息，包括第三方库文档、行业实践、API 参考等。

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

生成研究子代理：

- **Agent type**: `trellis-research`
- **Task description**: Research <specific question>
- **Key requirement**: Research output MUST be persisted to `{TASK_DIR}/research/`

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

[codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

直接在主会话中进行研究，并将发现写入 `{TASK_DIR}/research/`。`codex-inline` 是将工作保留在主会话中的显式模式。

[/codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

**研究产物约定**：
- 每个研究主题一个文件（例如 `research/auth-library-comparison.md`）
- 在文件中记录第三方库使用示例、API 参考、版本约束
- 记录发现的相关规范文件路径以便后续参考

Brainstorm 和研究可以自由交替 — 暂停去研究技术问题，然后返回与用户交流。

**关键原则**：研究输出必须写入文件，不能仅留在聊天中。对话会被压缩；文件不会。

#### 1.3 配置上下文 `[required · once]`

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

整理 `implement.jsonl` 和 `check.jsonl`，使阶段 2 的子代理获得正确的规范/研究上下文。这些文件在 `task create` 时已用一行自描述的 `_example` 行作为种子；你的工作是填入真实条目。

**位置**：`{TASK_DIR}/implement.jsonl` 和 `{TASK_DIR}/check.jsonl`（已存在）。

**格式**：每行一个 JSON 对象 — `{"file": "<path>", "reason": "<why>"}`。路径相对于仓库根目录。

**应填入的内容**：
- **规范文件** — `.trellis/spec/<package>/<layer>/index.md` 和与本任务相关的特定指南文件（`error-handling.md`、`conventions.md` 等）
- **研究文件** — 子代理需要参考的 `{TASK_DIR}/research/*.md`

**不应填入的内容**：
- 代码文件（`src/**`、`packages/**/*.ts` 等）— 这些由子代理在实现过程中读取，不在此预注册
- 即将修改的文件 — 同理

**两个文件之间的分配**：
- `implement.jsonl` → implement 子代理正确编写代码所需的规范 + 研究
- `check.jsonl` → check 子代理的规范（质量指南、检查约定，以及需要的相同研究）

这些清单不能替代 `implement.md`。`implement.md` 是复杂任务的人类可读执行计划；jsonl 文件仅列出要注入或加载的上下文文件。

**如何发现相关规范**：

```bash
python ./.trellis/scripts/get_context.py --mode packages
```

列出每个包及其规范层和路径。选择与本任务领域匹配的条目。

**如何追加条目**：

可以直接在编辑器中编辑 jsonl 文件，或使用：

```bash
python ./.trellis/scripts/task.py add-context "$TASK_DIR" implement "<path>" "<reason>"
python ./.trellis/scripts/task.py add-context "$TASK_DIR" check "<path>" "<reason>"
```

一旦有了真实条目，可以删除种子 `_example` 行（可选 — 消费者会自动跳过它）。

就绪关卡：在 `task.py start` 之前，`implement.jsonl` 和 `check.jsonl` 都必须包含至少一个真实的 `{"file": "...", "reason": "..."}` 条目。仅有种子 `_example` 行不算就绪。

仅在两个文件都已有真实整理条目时跳过此步骤。

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

[codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

跳过此步骤。上下文在阶段 2 由 `trellis-before-dev` skill 直接加载。

[/codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

#### 1.4 激活任务 `[required · once]`

产物审查完成后，将任务状态切换为 `in_progress`：

```bash
python ./.trellis/scripts/task.py start <task-dir>
```

对于轻量级任务，`prd.md` 可能就足够了。对于复杂任务，`prd.md`、`design.md` 和 `implement.md` 必须在启动前存在并已审查。在子代理调度平台上，`implement.jsonl` 和 `check.jsonl` 在启动前都必须有真实的整理条目。运行时消费者为了兼容性会容忍缺失或仅有种子的清单，但这种容忍不代表规划就绪状态。

此命令成功后，面包屑会自动切换到 `[workflow-state:in_progress]`，随后进入阶段 2 / 3 的其余部分。

如果 `task.py start` 报错会话身份信息（从 hook 输入、`TRELLIS_CONTEXT_ID` 或平台原生会话环境变量中无法获取上下文键），请按照错误提示设置会话身份，然后重试。

#### 1.5 完成标准

| 条件                                         | 是否必须 |
| -------------------------------------------- | :------: |
| `prd.md` 存在                                |    ✅     |
| 用户确认任务应进入实现                       |    ✅     |
| `task.py start` 已运行（状态 = in_progress） |    ✅     |
| `research/` 有产物（复杂任务）               |   推荐   |
| `design.md` 存在（复杂任务）                 |    ✅     |
| `implement.md` 存在（复杂任务）              |    ✅     |

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

| `implement.jsonl` 和 `check.jsonl` 各自包含至少一个真实的整理条目（种子行不计入） | ✅ |

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

---

## 阶段 2：执行

目标：将已审查的规划产物转化为通过质量检查的代码。

#### 2.1 实现 `[required · repeatable]`

[Claude Code, Cursor, OpenCode, codex-sub-agent, CodeBuddy, Droid, Pi, ZCode, Snow, Oh My Pi]

生成实现子代理：

- **Agent type**: `trellis-implement`
- **Task description**: Implement the reviewed task artifacts, consulting materials under `{TASK_DIR}/research/`; finish by running project lint and type-check
- **Dispatch prompt guard**: The prompt MUST start with `Active task: <task path>`, then tell the spawned agent it is already the `trellis-implement` sub-agent and must implement directly, not spawn another `trellis-implement` / `trellis-check`.

平台 hook/插件自动处理：
- 读取 `implement.jsonl` 并将引用的规范/研究文件注入代理提示
- 注入 `prd.md`、`design.md`（如存在）和 `implement.md`（如存在）
- 对于 Codex，`SubagentStart` 提供原生上下文注入；代理配置保留子端加载作为回退

[/Claude Code, Cursor, OpenCode, codex-sub-agent, CodeBuddy, Droid, Pi, ZCode, Snow, Oh My Pi]

[Gemini, Qoder, Copilot, Reasonix, Trae, Grok, Kimi Code]

生成实现子代理：

- **Agent type**: `trellis-implement`
- **Task description**: Implement the reviewed task artifacts, consulting materials under `{TASK_DIR}/research/`; finish by running project lint and type-check
- **Dispatch prompt guard**: The prompt MUST start with `Active task: <task path>`, then explicitly say the spawned agent is already `trellis-implement` and must implement directly without spawning another `trellis-implement` / `trellis-check`.

基于拉取的子代理定义自动处理上下文加载需求：
- 使用 `task.py current --source` 解析活跃任务，然后读取 `prd.md`、`design.md`（如存在）和 `implement.md`（如存在）
- 读取 `implement.jsonl` 并要求代理在编码前加载每个引用的规范/研究文件

[/Gemini, Qoder, Copilot, Reasonix, Trae, Grok, Kimi Code]

[Kiro]

生成实现子代理：

- **Agent type**: `trellis-implement`
- **Task description**: Implement the reviewed task artifacts, consulting materials under `{TASK_DIR}/research/`; finish by running project lint and type-check
- **Dispatch prompt guard**: Tell the spawned agent it is already the `trellis-implement` sub-agent and must implement directly, not spawn another `trellis-implement` / `trellis-check`.

平台前奏自动处理上下文加载需求：
- 读取 `implement.jsonl` 并将引用的规范/研究文件注入代理提示
- 注入 `prd.md`、`design.md`（如存在）和 `implement.md`（如存在）

[/Kiro]

[codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

1. 加载 `trellis-before-dev` skill 以读取项目指南
2. 读取 `{TASK_DIR}/prd.md`，然后读取 `design.md`（如存在），再读取 `implement.md`（如存在）
3. 参考 `{TASK_DIR}/research/` 下的材料
4. 按照已审查的产物实现代码
5. 运行项目 lint 和 type-check

[/codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

#### 2.2 质量检查 `[required · repeatable]`

[Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

生成检查子代理：

- **Agent type**: `trellis-check`
- **Task description**: Review all code changes against specs and task artifacts; fix any findings directly; ensure lint and type-check pass
- **Dispatch prompt guard**: The prompt MUST start with `Active task: <task path>`, then tell the spawned agent it is already the `trellis-check` sub-agent and must review/fix directly, not spawn another `trellis-check` / `trellis-implement`.

检查代理的职责：
- 对照规范审查代码变更
- 对照 `prd.md`、`design.md`（如存在）和 `implement.md`（如存在）审查代码变更
- 自动修复发现的问题
- 运行 lint 和 typecheck 进行验证

[/Claude Code, Cursor, OpenCode, codex-sub-agent, Kiro, Gemini, Qoder, CodeBuddy, Copilot, Droid, Pi, Oh My Pi, ZCode, Snow, Reasonix, Trae, Grok, Kimi Code]

[codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

加载 `trellis-check` skill 并按其指导验证代码：
- 规范合规性
- lint / type-check / tests
- 跨层一致性（当变更跨越多层时）

如果发现问题 → 修复 → 重新检查，直到全部通过。

[/codex-inline, Kilo, Antigravity, Devin, DeepSeek Harness]

**最终检查（阶段 3.4 提交之前）**：任务的最后一次 2.2 必须运行全范围检查，而不仅仅是最新的实现块。使用 `python ./.trellis/scripts/get_context.py --mode packages` 列出所有受影响的包，然后加载每个包的规范索引质量检查部分。这能捕获迭代中期局部 2.2 无法发现的跨层/多包问题。

#### 2.3 回滚 `[on demand]`

- `check` 发现 prd 缺陷 → 返回阶段 1，修复 `prd.md`，然后重做 2.1
- 实现出错 → 回退代码，重做 2.1
- 需要更多研究 → 进行研究（同阶段 1.2），将发现写入 `research/`

---

## 阶段 3：收尾

目标：确保代码质量，捕获经验教训，记录工作成果。

#### 3.2 调试回顾 `[on demand]`

如果此任务涉及反复调试（同一问题被修复了多次），加载 `trellis-break-loop` skill 来：
- 分类根本原因
- 解释为什么早期修复失败
- 提出预防措施

目标是捕获调试经验，使同类问题不再重现。

#### 3.3 规范更新 `[required · once]`

加载 `trellis-update-spec` skill，回顾此任务是否产生了值得记录的新知识：
- 新发现的模式或约定
- 遇到的陷阱
- 新的技术决策

相应更新 `.trellis/spec/` 下的文档。即使结论是"无需更新"，也要走一遍判断过程。

#### 3.4 提交变更 `[required · once]`

**规范同步前言**：在起草提交之前，先问：此任务是否修复了 bug 或产生了非显而易见的知识，应写入 `.trellis/spec/` 以便未来的你（或未来的 AI）不重蹈覆辙？如果是，先返回阶段 3.3 — 规范写入应属于同一任务的提交批次，而不是被遗忘的后续操作。

AI 驱动此任务代码变更的批量提交，以便 `/finish-work` 之后可以干净地运行。目标：先产出工作提交，然后记账（归档 + 日志）提交在后面 — 绝不交错。

**逐步操作**：

1. **检查脏状态**：
   ```bash
   git status --porcelain
   ```
   快照每个脏路径。如果工作树是干净的，跳到 3.5。

2. **从最近历史学习提交风格**（使起草的消息风格一致）：
   ```bash
   git log --oneline -5
   ```
   注意前缀约定（`feat:` / `fix:` / `chore:` / `docs:` ...）、语言（中文/English）和长度风格。

3. **将脏文件分为两组**：
   - **本会话 AI 编辑的** — 你通过 Edit/Write/Bash 工具调用编写/编辑的文件。你知道改了什么以及为什么。
   - **未识别的** — 你本会话未触及的脏文件（可能是用户的手动编辑、上一个会话遗留的 WIP，或不相关的工作）。不要默默包含这些。

4. **起草提交计划**。将 AI 编辑的文件分组为逻辑提交（每个连贯变更单元 1 次提交，而非每个文件 1 次提交）。每个条目：`<commit message>` + 文件列表。在底部单独列出未识别的文件。

5. **展示计划一次，请求一次性确认**。格式：
   ```
   Proposed commits (in order):
     1. <message>
        - <file>
        - <file>
     2. <message>
        - <file>

   Unrecognized dirty files (NOT in any commit — confirm include/exclude):
     - <file>
     - <file>

   Reply 'ok' / '行' to execute. Reply with edits, or '我自己来' / 'manual' to abort.
   ```

6. **确认后**：按顺序为每个批次运行 `git add <files>` + `git commit -m "<msg>"`。不要 amend。不要 push。

7. **拒绝时**（用户回复"不行" / "我自己来" / "manual" / 对计划有任何异议）：停止。不要尝试第二个计划。用户将手动提交；你一旦确认就跳到 3.5。

**规则**：
- 任何地方都不使用 `git commit --amend` — 三阶段三提交流程（工作提交 → 归档提交 → 日志提交）。
- 此步骤中绝不推送到远程。
- 如果用户想要不同的消息措辞但接受文件分组，编辑消息并重新确认一次 — 但如果他们拒绝分组，退出到手动模式。
- 批量计划是一次提示；不要每次提交都提示。

#### 3.5 收尾提醒

完成上述步骤后，提醒用户可以运行 `/finish-work` 来收尾（归档任务、记录会话）。

---

## 自定义 Trellis（适用于 fork）

本节面向希望修改 Trellis 工作流本身的开发者。所有自定义通过编辑此文件完成；脚本仅作为解析器。

### 更改步骤含义

编辑上方阶段 1 / 2 / 3 部分中对应步骤的演练内容。关键不变量：
- 没有活跃任务时必须先分流并在创建 Trellis 任务之前征求任务创建同意。
- 规划必须区分轻量级仅 PRD 任务和需要在启动前拥有 `prd.md`、`design.md` 和 `implement.md` 的复杂任务。
- 每条必需的执行路径必须在 `/trellis:finish-work` 之前保持阶段 3.4 提交提醒可达。

所有标签块位于上方 `## 阶段索引` 部分，紧接在每个阶段摘要之后：

| 范围                                        | 对应标签                                                        |
| ------------------------------------------- | --------------------------------------------------------------- |
| 无活跃任务（阶段 1 之前）                   | `[workflow-state:no_task]`（阶段索引 ASCII 图之后）             |
| 整个阶段 1（任务创建 → 准备实现）           | `[workflow-state:planning]`（阶段 1 摘要之后）                  |
| Codex 内联阶段 1                            | `[workflow-state:planning-inline]`                              |
| 阶段 2 + 阶段 3.2–3.4（实现 + 检查 + 收尾） | `[workflow-state:in_progress]`（阶段 2 摘要之后）               |
| Codex 内联阶段 2 + 阶段 3.2–3.4             | `[workflow-state:in_progress-inline]`                           |
| 阶段 3.5 之后（已归档）                     | `[workflow-state:completed]`（阶段 3 摘要之后；**当前已失效**） |

### 更改每轮提示文本

直接编辑对应 `[workflow-state:STATUS]` 块的内容。编辑后，运行 `trellis update`（如果你是模板维护者）或重启你的 AI 会话（如果你在自定义自己的项目）— 无需修改脚本。

### 添加自定义状态

添加新块：

```
[workflow-state:my-status]
your per-turn prompt text
[/workflow-state:my-status]
```

约束：
- STATUS 字符集：`[A-Za-z0-9_-]+`（允许下划线和连字符，例如 `in-review`、`blocked-by-team`）
- 必须有一个生命周期 hook 将 `task.json.status` 写入你的自定义值，否则该标签永远不会被读取
- 生命周期 hook 位于 `task.json.hooks.after_*`，绑定到 `after_create / after_start / after_finish / after_archive` 之一

### 添加生命周期 hook

在 `task.json` 中添加 `hooks` 字段：

```json
{
  "hooks": {
    "after_finish": [
      "your-script-or-command-here"
    ]
  }
}
```

支持的事件：`after_create / after_start / after_finish / after_archive`。注意 `after_finish` ≠ 状态变更（它仅清除活跃任务指针）；使用 `after_archive` 来触发"任务完成"通知。

### 完整契约

关于工作流状态机的运行时契约、所有状态写入器的位置、伪状态（`no_task` / `stale_<source_type>`）、hook 可达性矩阵以及其他深层细节，参见：

- `.trellis/spec/cli/backend/workflow-state-contract.md` — 运行时契约 + 写入器表 + 测试不变量
- `.trellis/scripts/inject-workflow-state.py` — 实际解析器（仅读取 workflow.md，无嵌入文本）
