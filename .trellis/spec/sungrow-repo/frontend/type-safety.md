# 类型安全

> 本项目中的类型安全模式。

---

## 概述

项目使用 **TypeScript 5** 配合 Vue 3 的类型系统。TypeScript 严格模式**未启用**（`strict: false`），项目采用务实的类型化方式——重点关注 API 数据模型和组件 props，同时在工具代码中保持灵活性。

**核心原则**：对数据层进行类型化（API 响应、store 状态、组件 props），其他地方务实处理。

---

## 类型组织

### 存放位置

| 类型分类        | 位置                                                | 示例                       |
| --------------- | --------------------------------------------------- | -------------------------- |
| API 响应类型    | `play/src/api/{module}/types.ts`                    | `XxxVO`、`XxxPageReqVO`    |
| 页面业务类型    | `play/src/view/{module}/types.ts`                   | 页面专属接口               |
| 全局类型声明    | `play/src/index.d.ts`                               | `Recordable<T>`、`VueNode` |
| 自动生成的类型  | `play/auto-import.d.ts`                             | 自动导入函数声明           |
| 组件 props 类型 | `<script setup>` 中通过 `defineProps<{...}>()` 内联 | 组件专属                   |
| Store 类型      | `packages/lib/hooks/pinia/`                         | Store 状态和操作类型       |

### 类型命名规范

| 模式                 | 后缀             | 示例                       |
| -------------------- | ---------------- | -------------------------- |
| 视图对象（API 响应） | `XxxVO`          | `DictDataVO`、`DemoRespVO` |
| 分页请求             | `XxxPageReqVO`   | `DictDataPageReqVO`        |
| 导出请求             | `XxxExportReqVO` | `DemoExportReqVO`          |
| 业务枚举             | PascalCase       | `ProductType`、`LOCALE`    |

---

## 类型定义模式

### API 数据模型（interface）

```typescript
// api/dict/types.ts
export interface DictDataVO {
  id: number
  sort: number
  label: string
  value: string
  dictType: string
  status: number
  createTime: Date
}

export interface DictDataPageReqVO {
  label: string
  dictType: string
  status: number
}
```

### 业务枚举

```typescript
export enum ProductType {
  BOOK = 'BOOK',
  ELECTRONIC = 'ELECTRONIC'
}
```

### 全局类型

```typescript
// index.d.ts
type Recordable<T = any> = Record<string, T>
type VueNode = import('vue').VNode
type TimeoutHandle = ReturnType<typeof setTimeout>
type PropType<T> = import('vue').PropType<T>
```

### 组件 Props

```vue
<script lang="ts" setup>
import type { Product } from '../types'

defineProps<{
  list: Product[]
  loading?: boolean
}>()
</script>
```

---

## TypeScript 配置

```json
{
  "target": "ES2020",
  "module": "ESNext",
  "lib": ["ES2021", "DOM", "DOM.Iterable"],
  "moduleResolution": "bundler",
  "strict": false,
  "noUnusedLocals": false,
  "noUnusedParameters": true
}
```

### 当前务实配置

- `strict: false` — 允许隐式 `any` 和非严格 null 检查
- `noUnusedLocals: false` — 开发期间容忍未使用的变量
- `noUnusedParameters: true` — 标记未使用的函数参数

---

## 数据校验

### 运行时校验

项目目前未使用专门的运行时校验库（如 Zod 或 Yup）。运行时校验通过以下方式处理：

1. **后端校验**：服务端的 JSR-303 注解（`@NotNull`、`@NotEmpty`）
2. **Ant Design Vue 表单校验**：表单组件的 `rules` 属性
3. **手动检查**：组合式函数/服务中对关键数据的条件逻辑

### 表单校验模式

```vue
<template>
  <a-form :model="formData" :rules="rules">
    <a-form-item label="Name" name="name">
      <a-input v-model:value="formData.name" />
    </a-form-item>
  </a-form>
</template>

<script lang="ts" setup>
const formData = reactive({ name: '' })
const rules = {
  name: [{ required: true, message: 'Name is required', trigger: 'blur' }]
}
</script>
```

---

## 常用模式

### 类型工具

```typescript
// 可空类型
type Nullable<T> = T | null

// 可选类型
type Optional<T> = T | undefined

// 数组元素类型
type ElementOf<T extends any[]> = T[number]
```

### 类型守卫

```typescript
function isNotNull<T>(value: T | null | undefined): value is T {
  return value != null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
```

---

## 禁止使用的模式

### 当前现状与目标

项目目前大量使用 `any`（尤其是 API 参数：`param?: any`）。**新代码**的目标是：

- **避免 `any`**：使用 `unknown` 配合类型守卫，或定义正确的接口
- **禁止 `@ts-ignore`**：使用 `@ts-expect-error` 并附解释性注释
- **禁止函数参数中的隐式 `any`**：始终显式标注函数参数类型
- **禁止类型断言（`as any`）**：使用正确的类型收窄替代

### `any` 的可接受使用场景（遗留代码）

- 后端类型尚未确定的 API 响应参数
- 缺少类型定义的第三方库集成
- 临时原型开发（合并前应补充类型）

---

## 常见错误

1. **所有场景都用 `interface`**：对有限集合使用 `enum`，对联合/交叉类型使用 `type`
2. **未定义 API 响应类型**：每个 API 模块必须有包含响应接口的 `types.ts`
3. **混淆 `Date` 和 `string`**：API 日期可能以字符串形式返回——类型中使用 `Date`，但要注意序列化问题
4. **不使用 `Recordable<T>`**：使用全局 `Recordable<T>` 替代 `Record<string, any>`
5. **缺少 `import type`**：对仅类型的导入使用 `import type { Xxx }`，避免将类型引用打包进产物
