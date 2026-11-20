---
name: trellis-continue
description: "在正确的阶段恢复当前任务的工作。"
---

# 继续当前任务

恢复当前任务的工作——在 `.trellis/workflow.md` 中从正确的阶段/步骤继续。

---

## 第 1 步：加载当前上下文

```bash
python ./.trellis/scripts/get_context.py
```

确认：当前任务、git 状态、最近的提交。

## 第 2 步：加载阶段索引

```bash
python ./.trellis/scripts/get_context.py --mode phase
```

显示阶段索引（Plan / Execute / Finish）以及路由 + skill 映射。

## 第 3 步：判断当前位置

`get_context.py` 显示活跃任务的 `status` 字段。根据 `status` + 产物存在情况路由。此命令替代了用户需要记住 Trellis 流程的需求；它本身不批准实现。

- `status=planning` + 没有 `prd.md` → **1.1**（加载 `trellis-brainstorm`）
- `status=planning` + 只有 `prd.md` → 判断任务是轻量级还是复杂。轻量级可以进入 **1.4** 审查；复杂任务返回 **1.1** 添加 `design.md` + `implement.md`。
- `status=planning` + 复杂产物已完成 + 子代理 jsonl 未整理（只有种子 `_example` 行）→ **1.3**
- `status=planning` + 必需产物已完成 + 必需 jsonl 已整理或内联模式 → **1.4**（请求启动审查；仅在用户确认后运行 `task.py start`）
- `status=in_progress` + 实现未开始 → **2.1**
- `status=in_progress` + 实现已完成，尚未检查 → **2.2**
- `status=in_progress` + 检查通过 → **3.3**（规范更新）→ **3.4**（提交）
- `status=completed`（罕见；通常立即归档）→ 归档流程

阶段规则（完整详情请参见 `.trellis/workflow.md`）：

1. 在一个阶段内**按顺序**运行步骤——`[required]` 步骤不得跳过
2. `[once]` 步骤如果必需输出已存在则已完成。仅 `prd.md` 对于轻量级任务可能就足够了；复杂任务还需要 `design.md` 和 `implement.md`。
3. 如果发现需要，可以返回到更早的阶段

## 第 4 步：加载具体步骤

一旦你知道要从哪个步骤恢复：

```bash
python ./.trellis/scripts/get_context.py --mode phase --step <X.X> --platform qoder
```

遵循加载的指令。每个 `[required]` 步骤完成后，进入下一步。

---

## 参考

完整的工作流和详细阶段步骤在 `.trellis/workflow.md` 中。此命令仅是一个入口——规范的指导在那里。
