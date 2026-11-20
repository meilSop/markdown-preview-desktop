# 引导任务：填充项目开发规范

**你（AI）正在运行此任务。开发者不阅读此文件。**

开发者刚刚在此项目上首次运行了 `trellis init`。
`.trellis/` 已存在，包含空的规范脚手架，此引导任务
存在于 `.trellis/tasks/` 下。当他们想要处理时，应该从
提供 Trellis 会话身份的会话中启动此任务。

**你的任务**：帮助他们将团队的真实编码约定填充到 `.trellis/spec/` 中。
每个未来的 AI 会话 — 此项目的 `trellis-implement` 和 `trellis-check` 子代理 —
会自动加载每任务 jsonl 清单中列出的规范文件。空的规范 = 子代理编写通用代码。
真实的规范 = 子代理匹配团队的实际模式。

不要直接抛出指令。先简短问候，了解仓库是否有现有的约定文档
（CLAUDE.md、.cursorrules 等），然后以对话方式推进。

---

## 状态（完成每项后勾选复选框）

- [ ] 填充 syfb-backend 的规范
- [ ] 填充 sungrow-repo 的规范
- [ ] 添加代码示例

---

## 需要填充的规范文件

### 包：syfb-backend (`spec/syfb-backend/`)

- 后端规范：`.trellis/spec/syfb-backend/backend/`

### 包：sungrow-repo (`spec/sungrow-repo/`)

- 前端规范：`.trellis/spec/sungrow-repo/frontend/`


### 思维指南（已填充）

`.trellis/spec/guides/` 包含预填充了最佳实践的通用思维指南。
仅在某些内容明显不适用于此项目时才进行定制。

---

## 如何填充规范

### 步骤 1：优先从现有约定文件导入

搜索仓库中现有的约定文档。如果存在，读取它们并将相关规则提取到
对应的 `.trellis/spec/` 文件中 — 通常比从头编写快得多。

| 文件 / 目录                                                                 | 工具                                 |
| --------------------------------------------------------------------------- | ------------------------------------ |
| `CLAUDE.md` / `CLAUDE.local.md`                                             | Claude Code                          |
| `AGENTS.md`                                                                 | Codex / Claude Code / 兼容代理的工具 |
| `.cursorrules`                                                              | Cursor                               |
| `.cursor/rules/*.mdc`                                                       | Cursor（rules 目录）                 |
| `.windsurfrules`                                                            | Windsurf                             |
| `.clinerules`                                                               | Cline                                |
| `.roomodes`                                                                 | Roo Code                             |
| `.github/copilot-instructions.md`                                           | GitHub Copilot                       |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot                      |
| `CONVENTIONS.md` / `.aider.conf.yml`                                        | aider                                |
| `CONTRIBUTING.md`                                                           | 通用项目约定                         |
| `.editorconfig`                                                             | 编辑器格式化规则                     |

### 步骤 2：分析代码库中现有文档未覆盖的部分

扫描实际代码以发现模式。在编写每个规范文件之前：
- 在代码库中找到每个模式的 2-3 个真实示例。
- 引用真实的文件路径（不是假设的路径）。
- 记录团队明确避免的反模式。

### 步骤 3：记录现实，而非理想

**关键**：写代码*实际*的做法，而不是应该怎么做。
子代理匹配规范，所以代码库中不存在的理想模式会导致子代理
编写看起来格格不入的代码。

如果团队有已知的技术债务，记录当前状态 — 改进是另一个独立的讨论，
不是引导阶段需要关注的。

---

## 运行时简要说明（当他们问"为什么需要规范"时分享）

- 每个 AI 编码任务会生成两个子代理：`trellis-implement`（编写代码）
  和 `trellis-check`（验证质量）。
- 每个任务有 `implement.jsonl` / `check.jsonl` 清单，列出要加载的规范文件。
- 平台钩子自动将这些规范文件 + 任务的 `prd.md` 注入到每个子代理提示中，
  这样子代理就按照团队约定编码/审查，无需手动粘贴。
- 真实来源：`.trellis/spec/`。这就是为什么现在填充好它能持续受益。

---

## 完成

当开发者确认上面的清单项已完成（带有真实示例，不是占位符）时，
引导他们运行：

```bash
python ./.trellis/scripts/task.py finish
python ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

归档后，每个加入此项目的新开发者将获得 `00-join-<slug>` 入职任务，
而不是此引导任务。

---

## 建议的开场白

"欢迎使用 Trellis！初始化已设置好让我帮你填充项目规范 — 这是一次性设置，
让每个未来的 AI 会话都遵循团队约定，而不是编写通用代码。在开始之前，
你有任何现有的约定文档（CLAUDE.md、.cursorrules、CONTRIBUTING.md 等）
可以从中提取，还是需要我从头扫描代码库？"
