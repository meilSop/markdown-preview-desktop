---
name: front-create
description: "创建前端代码模块。基于项目编码规范和代码模式，生成 Vue 3 组件、API 模块、页面视图、路由配置等。"
---

# 创建前端代码

使用 `front-creator` 子代理按照项目编码规范和代码模式创建前端代码。

---

## 第 1 步：明确创建目标

确认用户要创建的前端模块类型：

- **完整模块** — 页面 + API + 类型 + 路由（推荐）
- **Vue 组件** — 单个组件或页面私有组件
- **API 模块** — 接口调用函数和类型定义
- **页面视图** — 完整页面（index.vue + 私有组件）
- **类型定义** — TypeScript 接口/类型
- **路由配置** — 页面路由注册

## 第 2 步：加载项目规范

在创建代码之前，确保了解项目规范：

1. 阅读 `.qoder/agents/front-creator.md` 中的编码规范和代码模板
2. 搜索现有类似模块作为参考：
   ```bash
   # 查找已有的页面模块结构
   ls play/src/view/
   # 查找已有的 API 模块结构
   ls play/src/api/
   ```
3. 确认导入路径别名：
   - `@sg/lib` → 核心库
   - `@sg/pages` → 页面路由子模块
   - `@/*` → `play/src/*`
   - `~/*` → `play/*`

## 第 3 步：调度 front-creator 子代理

使用 `front-creator` 子代理执行代码创建。提供以下上下文：

- 目标模块名称和描述
- 业务逻辑和数据流
- 依赖的类型和接口
- 参考的现有模块（如有）

## 第 4 步：验证创建的代码

创建完成后，检查：

- [ ] 所有文件遵循命名约定（kebab-case 文件名/目录名，camelCase 变量名）
- [ ] 代码格式正确（无分号、单引号、120 字符行宽、2 空格缩进）
- [ ] 自动导入函数没有多余 import
- [ ] 组件使用 `<script setup lang="ts">` 语法
- [ ] 文件头注释完整（`@Desc`, `@Date`）
- [ ] 导入路径正确
- [ ] 代码顺序正确（imports → props/emits → state → computed → methods → lifecycle）

## 第 5 步：后续步骤

根据创建的模块类型，提醒用户完成后续工作：

- **页面模块** → 在路由配置中注册路由
- **API 模块** → 确认后端接口可用
- **组件** → 在父组件中引用
- **类型定义** → 在相关模块中导入使用

---

## 参考

- 编码规范详情: `.qoder/agents/front-creator.md`
- 前端架构分析: `syfb-frontend-pc/research/frontend-codebase-analysis.md`
- 编码规范速查: `syfb-frontend-pc/research/coding-conventions-quickref.md`

## 实际执行

- 当用户输入 `/front-creator <任务描述>` 时，按照上述流程分析需求、探索代码、声明式开发、实现逻辑，并确保输出符合规范。
- 阅读 `.document/{任务描述}.md` 文件，了解详细执行流程和输出规范并执行。

## 上下文保存

- 将新开发的功能模块的目录结构自动更新到.trellis/spec/sungrow-repo/frontend 架构文档中。
- 将分析到的代码注释、接口文档、文案翻译等信息也保存到知识库文档中。
- 将此次开发的技术决策更新保存到技术决策文档中。
- 当会话记录自动更新保存到会话记录中。
- 当历史会话记录过大时，自动压缩历史会话记录，保留最近一次会话记录。
