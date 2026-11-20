# 状态管理

> 本项目中状态的管理方式。

---

## 概述

项目使用 **Pinia** 作为唯一的状态管理方案。所有 store 定义存放在 `@sg/lib` 子模块（`packages/lib/hooks/pinia/`）中，而非主应用。`play/src/store/index.ts` 文件故意留空。

Stores 自动导入，全局可用，无需手动导入。

---

## 状态分类

### 全局状态（Pinia Stores）

| Store                   | 用途       | 关键数据                       |
| ----------------------- | ---------- | ------------------------------ |
| `useUserStore()`        | 用户会话   | Token、用户信息、租户 ID、角色 |
| `useAppStore()`         | 应用配置   | 主题、布局设置、侧边栏状态     |
| `useDictStore()`        | 字典数据   | 系统字典条目（已缓存）         |
| `usePermissionStore()`  | 访问控制   | 路由、菜单、权限               |
| `useMultipleTabStore()` | 标签页管理 | 已打开标签页、标签页历史       |
| `usePluginStore()`      | 插件状态   | 功能开关、插件配置             |

### 本地状态（组件级别）

使用 `ref()` 和 `reactive()` 管理组件作用域内的状态：

```vue
<script lang="ts" setup>
const formData = reactive({
  name: '',
  status: 0
})
const visible = ref(false)
</script>
```

### 服务端状态

服务端数据通过 API 调用获取，存储在组件本地状态或 Pinia stores 中。项目没有使用独立的服务端状态库（如 React Query）。模式如下：

1. API 模块（`api/{module}/data.ts`）定义获取函数
2. 组件或组合式函数调用 API 并将结果存入 `ref()`
3. 对于频繁访问的数据（字典、用户信息），在 Pinia stores 中缓存

### URL 状态

通过 Vue Router 管理路由参数和查询字符串：

```typescript
const route = useRoute()
const id = route.params.id
const keyword = route.query.keyword
```

---

## 何时使用全局状态

在以下情况下将状态提升为 Pinia store：

- **多个不相关的组件**需要访问相同的数据
- **数据在路由切换后需要保留**（用户会话、权限）
- **数据需要在组件销毁后继续存在**（表单草稿、标签页状态）
- **数据只获取一次并缓存**（字典、系统配置）

以下情况**不要**使用全局状态：

- 数据仅在单个组件中使用 → 使用 `ref()` / `reactive()`
- 数据仅属于某个页面实例 → 使用页面级组合式函数
- 数据来自 URL 参数 → 使用 `useRoute()`

---

## Store 定义模式

```typescript
// packages/lib/hooks/pinia/xxx/index.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useXxxStore = defineStore('xxx', () => {
  // 状态
  const items = ref<XxxVO[]>([])

  // 获取器
  const count = computed(() => items.value.length)

  // 操作
  function setItems(data: XxxVO[]) {
    items.value = data
  }

  function reset() {
    items.value = []
  }

  return { items, count, setItems, reset }
})
```

### Store 约定

- 使用 **setup 语法**（`defineStore('id', () => { ... })`），而非 options 语法
- Store 命名：`use{Name}Store`（如 `useUserStore`、`useAppStore`）
- Pinia store ID：小写名称（如 `'user'`、`'app'`、`'dict'`）
- 暴露 `reset()` 函数用于清除状态

---

## 常见错误

1. **在 `play/src/store/` 中定义 stores**：所有 stores 应放在 `@sg/lib/hooks/pinia/` 中。`play/src/store/index.ts` 故意留空
2. **使用 Vuex**：项目统一使用 Pinia，不要引入 Vuex 模式
3. **从组件直接修改 store 状态**：始终使用 store 的 actions/methods，而非直接赋值属性
4. **过度使用全局状态**：不是所有数据都需要放在 store 中。对于页面专属数据，优先使用组件本地状态 `ref()`
5. **忘记自动导入**：Stores 是自动导入的——不要从 `@sg/lib/hooks/pinia/xxx` 手动导入
