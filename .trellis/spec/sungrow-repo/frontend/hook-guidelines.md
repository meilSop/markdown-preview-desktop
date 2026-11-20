# Hook 规范

> 本项目中 hooks（组合式函数）的使用方式。

---

## 概述

项目使用 Vue 3 **Composition API 组合式函数**（称为"hooks"）在组件间共享有状态逻辑。核心 hooks 定义在 `@sg/lib` 子模块中，并且**自动导入**——全局可用，无需手动编写 import 语句。

---

## 自定义 Hook 模式

### 结构

```typescript
// hooks/useXxx.ts
import { ref, computed, onMounted } from 'vue'

export function useXxx() {
  // 响应式状态
  const data = ref(null)
  const loading = ref(false)

  // 计算属性
  const isEmpty = computed(() => !data.value)

  // 方法
  async function fetchData() {
    loading.value = true
    try {
      data.value = await http.get('/api/xxx')
    } finally {
      loading.value = false
    }
  }

  // 生命周期
  onMounted(() => {
    fetchData()
  })

  // 返回公开 API
  return {
    data,
    loading,
    isEmpty,
    fetchData
  }
}
```

### 命名规范

- 始终以 `use` 开头：`useXxx`、`useSgTable`、`useWatermark`
- 文件名与函数名一致：`useXxx.ts` → `useXxx()`

---

## 内置 Hooks（来自 @sg/lib）

以下 hooks 自动导入，全局可用：

### 数据与状态

| Hook                    | 用途                          |
| ----------------------- | ----------------------------- |
| `useUserStore()`        | 获取用户信息、token、租户数据 |
| `useAppStore()`         | 获取应用配置                  |
| `useDictStore()`        | 获取字典数据                  |
| `usePermissionStore()`  | 获取权限/角色数据             |
| `useMultipleTabStore()` | 管理浏览器标签页              |

### UI 与工具

| Hook             | 用途                                   |
| ---------------- | -------------------------------------- |
| `useSgTable()`   | 表格组件，内置分页、搜索和数据获取功能 |
| `useWatermark()` | 水印覆盖层管理                         |
| `useRouter()`    | Vue Router 实例                        |
| `useRoute()`     | 当前路由信息                           |

---

## 数据获取

### 模式：API 模块 + 组合式函数

数据获取分为两层：

1. **API 模块**（`api/{module}/data.ts`）：原始 HTTP 调用
```typescript
import { http } from '@sg/lib'

export const getXxxList = (param?: any) => {
  return http.get('/module/list', param)
}
```

2. **页面组合式函数**（可选，用于复杂页面）：封装 API 调用并管理状态
```typescript
// 在视图模块中
export function useXxxPage() {
  const list = ref([])
  const loading = ref(false)

  async function fetchList(params: XxxPageReqVO) {
    loading.value = true
    try {
      const res = await getXxxList(params)
      list.value = res.data
    } finally {
      loading.value = false
    }
  }

  return { list, loading, fetchList }
}
```

### 简单场景

在 `<script setup>` 中直接调用 API，无需单独的组合式函数：

```vue
<script lang="ts" setup>
const list = ref([])

onMounted(async () => {
  list.value = await getXxxList()
})
</script>
```

---

## Hook 存放位置

| 作用域     | 位置                                         |
| ---------- | -------------------------------------------- |
| 共享 hooks | `packages/lib/hooks/`（在 @sg/lib 子模块中） |
| 页面 hooks | `play/src/view/{module}/`（与页面同级目录）  |
| 自动导入   | 在 `vite.config.ts` 的 AutoImport 配置中声明 |

---

## 常见错误

1. **未返回响应式引用**：始终返回 `ref`/`computed` 对象，而非普通值——否则会丢失响应性
2. **命名未使用 `use` 前缀**：所有组合式函数必须以 `use` 开头，便于识别和遵循约定
3. **重复导入已自动导入的函数**：手动导入前先检查 `auto-import.d.ts`，确认该函数是否已自动导入
4. **在组合式函数顶层执行副作用**：将副作用放在生命周期钩子（`onMounted`）中，而非组合式函数的顶层作用域
5. **页面 hooks 放错位置**：页面专属的组合式函数应放在页面的 view 目录中，而非 `@sg/lib`
