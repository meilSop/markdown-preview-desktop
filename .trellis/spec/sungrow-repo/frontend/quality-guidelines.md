# 质量规范

> 前端开发的代码质量标准。

---

## 概述

代码质量通过 **ESLint** + **Prettier** 及项目特定规则来保证。项目遵循无分号、单引号、120 字符行宽的代码风格。Vue 组件统一使用 Composition API。

---

## 代码风格规则

### 格式化（Prettier + ESLint）

| 规则           | 设置                                                      |
| -------------- | --------------------------------------------------------- |
| 分号           | **不使用**（`semi: false`）                               |
| 引号           | **单引号**（`singleQuote: true`）                         |
| 行宽           | **120** 字符                                              |
| 缩进           | **2** 个空格                                              |
| 尾随逗号       | **从不**（`comma-dangle: [2, 'never']`）                  |
| 函数括号前空格 | **不使用**（`space-before-function-paren: [2, 'never']`） |
| 每行一个属性   | **是**（`singleAttributePerLine: true`）                  |
| 比较运算符     | 始终使用 **`===`**，`null` 比较除外                       |

### ESLint 关键规则

```javascript
{
  'semi': [2, 'never'],                    // 不使用分号
  'quotes': [2, 'single'],                 // 单引号
  'eqeqeq': ['error', 'always', { null: 'ignore' }],
  'prefer-const': 2,                       // 默认使用 const
  'no-console': 'off',                     // 允许 console
  'comma-dangle': [2, 'never'],            // 不使用尾随逗号
  'space-before-function-paren': [2, 'never']
}
```

---

## 禁止使用的模式

### Vue

- **禁止 Options API**：不要使用 `export default { data(), methods: {} }` 模式
- **禁止对用户输入使用 `v-html`**：仅对可信/已清理的内容使用 `v-html`
- **禁止使用内联样式进行布局**：使用 CSS 类或 WindiCSS 工具类
- **禁止使用非 scoped 样式**：始终为 `<style>` 块添加 `scoped` 属性

### TypeScript

- **新代码中禁止使用 `any`**：使用正确的类型或 `unknown` 配合类型守卫。（注意：现有代码的 API 参数中存在 `any`——新代码应改进这一点）
- **禁止使用 `@ts-ignore`**：使用 `@ts-expect-error` 并附注释说明原因
- **禁止类型断言（`as`）**：优先使用类型守卫和类型收窄

### JavaScript

- **禁止使用 `var`**：默认使用 `const`，需要重新赋值时使用 `let`
- **禁止使用 `==` / `!=`**：始终使用 `===` / `!==`（null 比较例外）
- **生产代码中禁止 `console.log`**：使用项目的 `msg` 工具函数处理面向用户的消息（注意：`no-console` 目前为 `off`，但这是目标标准）
- **禁止魔法数字/字符串**：提取为命名常量

### CSS

- **禁止硬编码颜色**：使用主题变量（`var(--primary-color)`）或 Less 变量（`@primary-color`）
- **禁止使用 `!important`**：通过提高选择器优先级替代
- **禁止使用深度选择器覆盖第三方样式**：谨慎使用 `:deep()`，并附注释说明原因

---

## 必须遵循的模式

### 每个 Vue 组件必须

- [ ] 使用 `<script setup lang="ts">`
- [ ] 包含带有 `@Desc` 和 `@Date` 的文件头注释
- [ ] 使用 `scoped` 样式
- [ ] 遵循代码组织顺序（导入 → props → 状态 → 计算属性 → 方法 → 生命周期）

### 每个 API 模块必须

- [ ] 包含用于 API 调用的 `data.ts` 和用于类型定义的 `types.ts`
- [ ] 从 `@sg/lib` 导入 `http`
- [ ] 响应类型定义为 `XxxVO`，请求类型定义为 `XxxPageReqVO`

### 每个页面/视图必须

- [ ] 以 `index.vue` 作为入口
- [ ] 路由中使用懒加载（`() => import(...)`）
- [ ] 页面私有组件放在 `components/` 子目录中

---

## 代码审查清单

- [ ] 无分号、单引号、无尾随逗号
- [ ] 行宽不超过 120 字符
- [ ] 组件使用 `<script setup lang="ts">`
- [ ] Props 使用 TypeScript 泛型定义
- [ ] 新代码中无 `any` 类型
- [ ] 模板中无业务逻辑（移至 computed/methods）
- [ ] 样式使用 scoped
- [ ] 无硬编码颜色或魔法数字
- [ ] 已自动导入的函数未被手动导入
- [ ] 文件不超过 600 行，函数不超过 100 行
