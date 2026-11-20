# 代码复用思维指南

> **目的**：在创建新代码之前停下来思考——它是否已经存在？

---

## 问题

**重复代码是不一致性 bug 的第一大来源。**

当你复制粘贴或重写已有逻辑时：
- bug 修复无法传播
- 行为随时间产生分歧
- 代码库变得更难理解

---

## 在编写新代码之前

### 第 1 步：先搜索

```bash
# Search for similar function names
grep -r "functionName" .

# Search for similar logic
grep -r "keyword" .
```

### 第 2 步：问自己这些问题

| 问题                             | 如果是...                 |
| -------------------------------- | ------------------------- |
| 是否已有类似的函数？             | 使用或扩展它              |
| 这个模式是否在其他地方使用过？   | 遵循已有模式              |
| 这是否可以作为共享工具？         | 在合适的位置创建它        |
| 我是否正在从另一个文件复制代码？ | **停下** - 提取为共享代码 |

---

## 常见的重复模式

### 模式 1：复制粘贴函数

**错误做法**：将验证函数复制到另一个文件

**正确做法**：提取到共享工具模块，在需要的地方导入

### 模式 2：相似的组件

**错误做法**：创建一个与现有组件 80% 相似的新组件

**正确做法**：通过 props/variants 扩展现有组件

### 模式 3：重复的常量

**错误做法**：在多个文件中定义相同的常量

**正确做法**：单一真实来源，到处导入

### 模式 4：重复的载荷字段提取

**错误做法**：多个消费方在本地对相同的 JSON/事件字段进行类型转换：

```typescript
const description = (ev as { description?: string }).description;
const context = (ev as { context?: ContextEntry[] }).context;
```

即使是两行代码，这也是重复的契约逻辑。每个消费方现在都有自己对有效载荷含义的定义。

**正确做法**：将解码器、类型守卫或投影放在数据所有者旁边：

```typescript
if (isThreadEvent(ev)) {
  renderThreadEvent(ev);
}
```

**规则**：如果相同的无类型载荷字段在 2 个及以上位置被读取，在添加第三个读取方之前，先创建共享的类型守卫 / 规范化器 / 投影。

---

## 何时进行抽象

**应该抽象的情况**：
- 相同代码出现 3 次及以上
- 逻辑足够复杂，可能产生 bug
- 多人可能需要这个功能

**不应抽象的情况**：
- 只使用一次
- 简单的单行代码
- 抽象会比重复更复杂

---

## 批量修改之后

当你对多个文件做了相似的修改后：

1. **回顾**：是否覆盖了所有实例？
2. **搜索**：运行 grep 查找遗漏的
3. **考虑**：是否应该将其抽象化？

### Reducer 应使用穷举结构

当状态基于类 action 值（`action`、`kind`、`status`、`phase`）派生时，优先使用带 `switch` 的 reducer，而非分散的 `if/else` 更新。

```typescript
// BAD - action-specific state transitions are hard to audit
if (action === "opened") { ... }
else if (action === "comment") { ... }
else if (action === "status") { ... }

// GOOD - one reducer owns the transition table
switch (event.action) {
  case "opened":
    ...
    return;
  case "comment":
    ...
    return;
}
```

这在事件日志作为真实来源时尤为重要。reducer 是文档化的重放模型；显示代码和命令不应重复该重放模型的任何部分。

---

## 提交前检查清单

- [ ] 已搜索现有的类似代码
- [ ] 没有应该共享的复制粘贴逻辑
- [ ] 没有在共享解码器之外重复提取无类型载荷字段
- [ ] 常量定义在一个位置
- [ ] 相似的模式遵循相同的结构
- [ ] Reducer/action 转换逻辑集中在一个 reducer 或命令分发器中

---

## 陷阱：Python if/elif/else 穷举检查

**问题**：Python 的 if/elif/else 链没有编译时穷举检查。当你向 `Literal` 类型添加新值时（例如 `Platform`），已有的 if/elif/else 链会悄悄落入 `else` 分支，返回错误的默认值。

**症状**：新平台部分可用 — 某些方法返回 Claude 的默认值而非平台特定的值。不会抛出任何错误。

**示例**（`cli_adapter.py`）：
```python
# BAD: "gemini" falls through to else, returns "claude"
@property
def cli_name(self) -> str:
    if self.platform == "opencode":
        return "opencode"
    else:
        return "claude"  # gemini silently gets "claude"!

# GOOD: explicit branch for every platform
@property
def cli_name(self) -> str:
    if self.platform == "opencode":
        return "opencode"
    elif self.platform == "gemini":
        return "gemini"
    else:
        return "claude"
```

**预防措施**：当向 Python `Literal` 类型添加新值时，搜索所有基于该类型进行 if/elif/else 判断的代码链，并添加显式分支。不要依赖 `else` 对新值是正确的。

---

## 陷阱：不对称机制产生相同输出

**问题**：当两种不同的机制必须产生相同的文件集时（例如，初始化时的递归目录复制 vs 更新时的手动 `files.set()`），结构性变更（重命名、移动、添加子目录）只能通过自动机制传播。手动方式会悄悄偏移。

**症状**：初始化运行完美，但更新时在错误的路径创建文件或完全遗漏文件。

**预防措施**：
- **最佳**：消除不对称性 — 让手动路径调用自动路径（例如，`collectTemplateFiles()` 调用 `getAllScripts()` 而非维护自己的列表）
- **如果不对称不可避免**：添加回归测试，比较两种机制的输出
- 迁移目录结构时，搜索引用旧结构的**所有**代码路径

**真实案例**：`trellis update` 有一个手动的 `files.set()` 列表包含 11 个脚本，而 `getAllScripts()` 已经追踪了这些脚本。修复方法：用 `for..of getAllScripts()` 循环替换手动列表。参见 v0.4.0-beta.3 中的 `update.ts` 重构。

---

## 模板文件注册（Trellis 特定）

向 `src/templates/trellis/scripts/` 添加新文件时：

**单一注册点**：`src/templates/trellis/index.ts`

1. 添加 `export const xxxScript = readTemplate("scripts/path/file.py");`
2. 添加到 `getAllScripts()` Map

仅此而已。`commands/update.ts` 直接使用 `getAllScripts()` — 无需手动同步。

**为什么这很重要**：如果没有在 `getAllScripts()` 中注册，`trellis update` 就不会将文件同步到用户项目。bug 修复和新功能将无法传播。

**历史**：在 v0.4.0-beta.3 之前，`update.ts` 有自己手动维护的文件列表，经常与 `getAllScripts()` 不同步。这导致 11 个 Python 文件在 `trellis update` 期间被悄悄跳过。修复方法是消除重复列表，使用 `getAllScripts()` 作为唯一真实来源。

### 新脚本快速检查清单

```bash
# After adding a new .py file, verify it's in getAllScripts():
grep -l "newFileName" src/templates/trellis/index.ts  # Should match
```

### 模板同步约定

`.trellis/scripts/`（自用版本）和 `packages/cli/src/templates/trellis/scripts/`（模板版本）必须保持完全一致。编辑 `.trellis/scripts/` 后，务必同步：

```bash
rsync -av --delete --exclude='__pycache__' .trellis/scripts/ packages/cli/src/templates/trellis/scripts/
```

**陷阱**：使用错误的源/目标路径运行 rsync 可能会创建嵌套的垃圾目录（例如 `.trellis/scripts/packages/cli/...`）。运行前务必仔细检查路径。
