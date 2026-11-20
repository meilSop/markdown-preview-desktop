# 跨层思维指南

> **目的**：在实现之前，梳理跨层的数据流。

---

## 问题

**大多数 bug 发生在层级边界**，而非层级内部。

常见的跨层 bug：

- API 返回格式 A，前端期望格式 B
- 数据库存储 X，服务转换为 Y，但丢失了数据
- 多个层级以不同方式实现了相同的逻辑

---

## 在实现跨层功能之前

### 第 1 步：绘制数据流

画出数据的移动路径：

```
Source → Transform → Store → Retrieve → Transform → Display
```

对于每一个箭头，问：

- 数据的格式是什么？
- 可能出什么错？
- 谁负责验证？

### 第 2 步：识别边界

| 边界                  | 常见问题             |
| --------------------- | -------------------- |
| API ↔ Service         | 类型不匹配、字段缺失 |
| Service ↔ Database    | 格式转换、null 处理  |
| Backend ↔ Frontend    | 序列化、日期格式     |
| Component ↔ Component | Props 结构变化       |

### 第 3 步：定义契约

对于每个边界：

- 确切的输入格式是什么？
- 确切的输出格式是什么？
- 可能出现哪些错误？

---

## 常见的跨层错误

### 错误 1：隐式的格式假设

**错误做法**：不检查就假设日期格式

**正确做法**：在边界处进行显式格式转换

### 错误 2：分散的验证逻辑

**错误做法**：在多个层级中验证相同的内容

**正确做法**：在入口点验证一次

### 错误 3：泄露的抽象

**错误做法**：组件了解数据库 schema

**正确做法**：每个层级只知道其相邻层级的信息

### 错误 4：每个消费方都自行解析同一载荷

**错误做法**：命令读取 JSONL 事件并在内联进行字段类型转换：

```typescript
const thread = (ev as { thread?: string }).thread;
const labels = (ev as { labels?: string[] }).labels;
```

这看起来是局部的，但意味着每个消费方都拥有自己的事件契约版本。下一次字段变更只会更新一个命令而遗漏另一个。

**正确做法**：在事件边界处解码一次，然后导出类型化的投影：

```typescript
if (!isThreadEvent(ev)) return false;
return ev.thread === filter.thread;
```

**规则**：对于仅追加日志、JSON 流、RPC 载荷或配置文件，为以下内容创建一个所有者：

- 事件 / 载荷类型定义
- 从 `unknown` 的类型守卫和规范化
- UI 命令使用的元数据投影
- 从真实来源重放状态的 reducer

渲染代码可以格式化字段，但不得重新定义载荷契约。

---

## 跨层功能检查清单

实现前：

- [ ] 绘制了完整的数据流
- [ ] 识别了所有层级边界
- [ ] 定义了每个边界的格式
- [ ] 确定了验证发生的位置

实现后：

- [ ] 用边界情况进行了测试（null、空值、无效值）
- [ ] 验证了每个边界的错误处理
- [ ] 检查数据在往返传输中是否完整
- [ ] 检查消费方是否导入了共享的解码器 / 投影，而非在本地转换载荷字段
- [ ] 检查派生状态是否指向源事件标识符（`seq`、`id`、`version`），而非发明第二个游标

---

## 跨平台模板一致性

在 Trellis 中，命令模板（例如 `record-session.md`）存在于**多个平台**中，内容相同或几乎相同。这是一个跨层边界。

### 检查清单：修改任何命令模板后

- [ ] 找到拥有相同命令的所有平台：`find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] 更新所有平台副本（Markdown `.md` 和 TOML `.toml`）
- [ ] 对于 Gemini TOML：适配行续符（`\\` vs `\`）和三引号字符串
- [ ] 运行 `/trellis:check-cross-layer` 验证没有遗漏

**真实案例**：在 Claude 中更新了 `record-session.md` 以使用 `--mode record`，但忘记了 iFlow、Kilo、OpenCode 和 Gemini — 被跨层检查发现。

---

## 生成的运行时模板升级一致性

某些生成的文件既是文档又是运行时输入。在 Trellis 中，
`.trellis/workflow.md` 被 `get_context.py`、`workflow_phase.py`、
SessionStart 过滤器和每轮 hook 解析。模板变更必须针对全新初始化和升级路径进行验证。

### 检查清单：修改运行时解析模板后

- [ ] 识别读取该模板的每个运行时解析器，而不仅仅是安装它的文件写入器
- [ ] 检查相关语法是否位于明显的托管区域（如标签块）之外
- [ ] 验证全新的 `init` 输出和写入了旧版 `.trellis/.version` 的版本化 `update` 场景
- [ ] 使用旧版的原始模板夹具添加升级回归测试，然后断言安装后的文件达到当前打包的形状
- [ ] 更新拥有运行时契约的后端 spec

---

## 版本文档边界

版本文档是一个跨层边界：源路径、`docs.json` 版本路由和渲染的版本选择器必须描述相同的发布线。

### 检查清单：编辑版本文档前

- [ ] 确定目标发布线：stable、beta 或 RC
- [ ] 验证编辑的 MDX 路径是否与该发布线匹配：
  - stable: `docs-site/{start,advanced,...}` 和 `docs-site/zh/{start,advanced,...}`
  - beta: `docs-site/beta/**` 和 `docs-site/zh/beta/**`
  - RC: `docs-site/rc/**` 和 `docs-site/zh/rc/**`
- [ ] 验证 `docs.json` 导航将版本标签指向相同的路径
- [ ] 在提交前，对相反的目录树 grep 发布线特定的术语
- [ ] 将 beta 内容出现在根发布路径下视为源路径 bug，而非渲染 bug

**真实案例**：一个仅涉及 beta 的任务工作流变更，在根 `start/` 和 `advanced/` 路径下记录了 `prd.md` + `design.md` + `implement.md`、任务创建同意和 Codex 模式横幅。然后文档站点在 Release 选择器下提供了 0.6 beta 的行为。修复方法是恢复根发布文档，将 0.6 内容移至 `beta/` 和 `zh/beta/`，并对根发布目录树进行 grep 审计以检查 beta 标记。

**真实案例**：Codex 内联模式将工作流平台标记从 `[Codex]` / `[Kilo, Antigravity, Windsurf]` 更改为 `[codex-sub-agent]` / `[codex-inline, Kilo, Antigravity, Windsurf]`。全新初始化是正确的，但 `trellis update` 只合并了 `[workflow-state:*]` 块，保留了这些块之外的旧标记。结果：升级后的项目获得了新的 hook 脚本但使用旧的工作流路由，因此 `get_context.py --mode phase --platform codex` 可能返回空的 Phase 2.1 详情。

---

## 模式检测探测检查清单

当 CLI 通过探测远程资源来自动检测模式时（例如，检查 `index.json` 是否存在来决定市场下载还是直接下载）：

### 实现前：

- [ ] 探测在使用结果的**所有**代码路径中运行（交互式、`-y`、`--flag` 组合）
- [ ] 区分 404 和临时错误 — 不要将两者都视为"未找到"
- [ ] 临时错误**中止或重试**，永远不要悄悄切换模式
- [ ] 当上下文变化时（例如用户切换来源），**重置**共享状态（缓存、预取数据）
- [ ] **快捷路径**（例如 `--template` 跳过选择器）必须具有与探测路径相同的错误处理质量 — 检查下游函数是否调用了全包捕获的包装器

### 实现后：

- [ ] 追踪从探测结果到模式决策分支的每条路径 — 不允许遗漏
- [ ] 外部格式契约（giget URI、原始 URL）已测试或至少作为注释记录
- [ ] 元数据读取消耗完整响应或使用流式解析器 — 永远不要将固定大小的前缀解析为完整的 JSON
- [ ] 从解析的部分重建复合标识符时，验证**所有**字段都已包含且位于**正确的位置**（例如 `provider:repo/path#ref` 而非 `provider:repo#ref/path`）
- [ ] 验证快捷路径之后调用的**操作函数**在内部不使用旧的全包捕获 fetch — 当需要区分错误时，它们必须使用探测质量的变体

**真实案例**：自定义注册表流程在 3 轮审查中出现了 8 个 bug：(1) 探测仅在交互模式下运行，(2) 临时错误遗漏到错误的模式，(3) giget URI 的 `#ref` 位置错误，(4) 预取的模板在来源切换时泄漏，(5) `--template` 快捷路径绕过了探测，但 `downloadTemplateById` 内部使用了全包捕获的 `fetchTemplateIndex`，将超时变成了"Template not found"。

**真实案例**：Agent 会话更新提示使用 `response.read(4096)` 获取 npm `latest` 元数据，然后将其解析为完整的 JSON。`@mindfoldhq/trellis` 包的元数据超过了 4 KB，因此 JSON 被截断，解析悄悄失败，第一次会话注入没有显示更新提示。修复方法：在解析前读取完整响应，并添加一个回归测试，其中 `version` 后面跟着 8 KB 的元数据尾部。

---

## 何时创建流程文档

在以下情况创建详细的流程文档：

- 功能涉及 3 个及以上层级
- 涉及多个团队
- 数据格式复杂
- 功能曾经导致过 bug

---

## 事件日志 / 投影边界

仅追加日志是跨层契约。一个事件经过以下路径：

```
CLI input → event writer → events.jsonl → reader → filter → reducer → display
```

### 检查清单：添加新事件类型或字段后

- [ ] 将事件类型添加到中央事件分类表
- [ ] 在事件层添加类型化的事件变体或类型守卫
- [ ] 为来自用户输入或 JSON 的数组/对象字段添加规范化辅助函数
- [ ] 将 `seq` / `id` 赋值保留在事件写入器中
- [ ] 让过滤器和 reducer 消费类型化的事件守卫，而非本地类型转换
- [ ] 让显示代码消费 reducer 输出或类型化事件，而非原始 JSON
- [ ] 添加至少一个回归测试，证明历史重放和实时过滤使用相同的过滤模型

**真实案例**：Thread 通道添加了 `kind: "thread"`、`description`、`context`、labels 和 `lastSeq`。第一个实现正确地重放了 thread 状态，但几个命令仍然用本地类型转换重新解析事件载荷字段。修复方法是让核心事件层拥有 `ThreadChannelEvent` 和 `isThreadEvent`，让 `reduceChannelMetadata` 成为唯一的通道元数据投影，让 `reduceThreads` 成为唯一的 thread 重放 reducer。
