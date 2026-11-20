# 工作区索引

> 所有 AI 代理工作记录的汇总

---

## 概述

此目录跟踪所有使用 AI 代理进行开发的开发者记录。

### 文件结构

```
workspace/
|-- index.md              # 本文件 - 主索引
+-- {developer}/          # 每个开发者的目录
    |-- index.md          # 个人索引，含会话历史
    |-- tasks/         # 任务文件
    |   |-- *.json        # 活跃任务
    |   +-- archive/      # 按月份归档的任务
    +-- journal-N.md     # Journal 文件（顺序编号：1, 2, 3...）
```

---

## 活跃开发者

| 开发者   | 最后活跃 | 会话数 | 活跃文件 |
| -------- | -------- | ------ | -------- |
| （暂无） | -        | -      | -        |

---

## 快速开始

### 新开发者

运行初始化脚本：

```bash
python ./.trellis/scripts/init_developer.py <your-name>
```

这将：
1. 创建你的身份文件（已 gitignore）
2. 创建你的进度目录
3. 创建你的个人索引
4. 创建初始 journal 文件

### 已有开发者

1. 获取你的开发者名称：
   ```bash
   python ./.trellis/scripts/get_developer.py
   ```

2. 读取你的个人索引：
   ```bash
   cat .trellis/workspace/$(python ./.trellis/scripts/get_developer.py)/index.md
   ```

---

## 规范

### Journal 文件规则

- 每个 journal 文件**最多 2000 行**
- 达到上限时，创建 `journal-{N+1}.md`
- 创建新文件时更新你的个人 `index.md`

### 会话记录格式

每个会话应包含：
- 摘要：一行描述
- 分支：工作在哪个分支上
- 主要变更：修改了什么
- Git 提交：提交哈希和信息
- 后续步骤：接下来做什么

---

## 会话模板

记录会话时使用此模板：

```markdown
## Session {N}: {Title}

**Date**: YYYY-MM-DD
**Task**: {task-name}
**Branch**: `{branch-name}`

### Summary

{One-line summary}

### Main Changes

- {Change 1}
- {Change 2}

### Git Commits

| Hash      | Message          |
| --------- | ---------------- |
| `abc1234` | {commit message} |

### Testing

- [OK] {Test result}

### Status

[OK] **Completed** / # **In Progress** / [P] **Blocked**

### Next Steps

- {Next step 1}
- {Next step 2}
```

---

**语言**：所有文档必须使用**中文**编写。
