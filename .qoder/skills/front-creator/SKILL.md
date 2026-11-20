---
name: front-create
description: "创建前端代码模块。基于项目编码规范和代码模式，生成 Vue 3 组件、API 模块、页面视图、路由配置等。适用于需要新建前端业务模块、页面、组件、API 接口层的场景。"
---

# 前端代码创建

按照项目编码规范和现有代码模式，创建高质量的前端代码。

---

## 前置检查

在创建任何代码之前，确认：

1. **目标明确** — 知道要创建什么模块/页面/组件
2. **规范已加载** — 阅读 `.qoder/agents/front-creator.md` 中的编码规范
3. **参考已就位** — 找到类似的现有模块作为参考

```bash
# 查看现有页面模块
ls syfb-frontend-pc/play/src/view/

# 查看现有 API 模块
ls syfb-frontend-pc/play/src/api/
```

---

## 创建类型与对应模板

### 类型 A：完整业务模块

创建包含页面、API、类型的完整模块。

**目录结构**:
```
syfb-frontend-pc/play/src/
├── view/
│   └── <module-name>/
│       ├── index.vue          # 页面入口
│       ├── types.ts           # 业务类型
│       ├── constant.ts        # 常量配置
│       ├── conf.ts            # 表格/表单配置
│       └── components/        # 页面私有组件
│           ├── <name>-list.vue
│           └── <name>-form.vue
└── api/
    └── <module-name>/
        ├── data.ts            # API 调用
        └── types.ts           # 请求/响应类型
```

### 类型 B：单个 Vue 组件

创建独立的 Vue 组件。

**文件位置**: 放在对应页面的 `components/` 目录下。

**命名**: kebab-case（如 `product-card.vue`）。

### 类型 C：API 模块

创建 API 调用层。

**目录结构**:
```
api/
└── <module-name>/
    ├── data.ts    # API 函数
    └── types.ts   # 类型定义
```

### 类型 D：类型定义

创建 TypeScript 类型文件。

**命名约定**:
- `XxxVO` — 视图对象（响应数据）
- `XxxPageReqVO` — 分页请求参数
- `XxxExportReqVO` — 导出请求参数

---

## 编码规范速查

### 格式

| 规则           | 值                         |
| -------------- | -------------------------- |
| 分号           | 不使用                     |
| 引号           | 单引号                     |
| 行宽           | 120 字符                   |
| 缩进           | 2 空格                     |
| 尾逗号         | 不使用                     |
| 函数括号前空格 | 不使用（`function foo()`） |
| 每行一个属性   | 是（Vue 模板中）           |
| 比较运算符     | 强制 `===`，`null` 除外    |

### 命名

| 类型      | 约定                        | 示例                            |
| --------- | --------------------------- | ------------------------------- |
| 组件文件  | kebab-case                  | `product-list.vue`              |
| TS 文件   | camelCase                   | `data.ts`, `types.ts`           |
| 目录      | kebab-case                  | `product-detail/`               |
| 变量/函数 | camelCase                   | `productList`, `handleSubmit`   |
| 常量      | UPPER_SNAKE_CASE            | `MAX_PAGE_SIZE`                 |
| 接口/类型 | PascalCase + VO/ReqVO 后缀  | `ProductVO`, `ProductPageReqVO` |
| CSS 类名  | kebab-case                  | `.product-list`                 |
| 组件引用  | PascalCase + Component 前缀 | `ComponentProductList`          |
| Hook      | use + 名称                  | `useProductList`                |

### 自动导入（无需 import）

以下函数来自 `@sg/lib`，**直接使用，不要 import**：

- Vue: `ref`, `computed`, `watch`, `reactive`, `onMounted`, `onUnmounted`, `toRefs`, `nextTick`
- Router: `useRouter`, `useRoute`
- 工具: `http`, `msg`, `notify`, `trs`, `cacheSrv`, `dictSrv`, `confirm`, `goto`
- Store: `useUserStore()`, `useAppStore()`, `useDictStore()`, `usePermissionStore()`

### 导入路径别名

| 别名        | 实际路径         | 用途       |
| ----------- | ---------------- | ---------- |
| `@sg/lib`   | `packages/lib`   | 核心库     |
| `@sg/pages` | `packages/pages` | 页面路由   |
| `@/*`       | `play/src/*`     | 应用源码   |
| `~/*`       | `play/*`         | 应用根目录 |

---

## 代码模板

### Vue 组件

```vue
<!--
 * @Desc: 组件描述
 * @Date: YYYY-MM-DD
-->
<template>
  <div class="component-name">
    <!-- 模板内容 -->
  </div>
</template>

<script lang="ts" setup>
// 1. 导入 (外部模块 → 内部模块 → 类型)
import type { Ref } from 'vue'
import { SomeType } from './types'
import ComponentChild from './components/child.vue'

// 2. Props & Emits
const props = defineProps<{
  data: SomeType[]
}>()

const emits = defineEmits(['change'])

// 3. 响应式状态
const list: Ref<SomeType[]> = ref([])
const loading = ref(false)

// 4. 计算属性
const total = computed(() => list.value.length)

// 5. 方法
function handleChange(value: string) {
  emits('change', value)
}

async function fetchData() {
  loading.value = true
  try {
    // 获取数据逻辑
  } finally {
    loading.value = false
  }
}

// 6. 生命周期
onMounted(() => {
  fetchData()
})
</script>

<style lang="scss" scoped>
.component-name {
  // 样式
}
</style>
```

### API 模块 — data.ts

```typescript
import { http } from '@sg/lib'

/**
 * 查询列表
 * @param param 查询参数
 */
export const getXxxList = (param?: any) => {
  return http.get('/module/list', param)
}

/**
 * 获取详情
 * @param id 记录 ID
 */
export const getXxxDetail = (id: number) => {
  return http.get(`/module/detail?id=${id}`)
}

/**
 * 保存
 * @param param 保存参数
 */
export const saveXxx = (param: any) => {
  return http.post('/module/save', param)
}

/**
 * 删除
 * @param id 记录 ID
 */
export const deleteXxx = (id: number) => {
  return http.delete(`/module/delete?id=${id}`)
}
```

### API 模块 — types.ts

```typescript
/** 响应 VO */
export interface XxxVO {
  id: number
  name: string
  status: number
  createTime: Date
}

/** 分页请求 */
export interface XxxPageReqVO {
  name: string
  status: number
  pageNo: number
  pageSize: number
}
```

### 常量文件 — constant.ts

```typescript
/** 状态枚举 */
export const STATUS_OPTIONS = [
  { label: '启用', value: 0 },
  { label: '禁用', value: 1 },
]

/** 最大分页数量 */
export const MAX_PAGE_SIZE = 100
```

---

## 验证清单

创建完成后，逐项检查：

- [ ] 文件命名遵循 kebab-case
- [ ] 代码无分号、无双引号
- [ ] 缩进 2 空格，行宽 ≤ 120
- [ ] 无尾逗号
- [ ] 函数括号前无空格
- [ ] 组件使用 `<script lang="ts" setup>`
- [ ] 自动导入函数没有多余 import
- [ ] 导入路径使用正确别名
- [ ] 文件头注释包含 `@Desc` 和 `@Date`
- [ ] 组件内代码顺序正确
- [ ] CSS 类名 kebab-case
- [ ] 类型命名 PascalCase + VO/ReqVO 后缀
- [ ] 单文件 ≤ 600 行，单函数 ≤ 100 行

---

## 后续步骤

根据创建的模块类型：

1. **页面模块** → 在 `play/src/router/` 中注册路由
2. **API 模块** → 确认后端接口路径匹配
3. **组件** → 在父组件中导入并引用
4. **类型定义** → 在相关模块中导入使用
5. **路由配置** → 如需权限控制，配置路由守卫

---

## 约束与限制

- **不要修改子模块**: `packages/lib` 和 `packages/pages` 是 Git 子模块，不要直接修改
- **不要使用 Options API**: 统一使用 Composition API + `<script setup>`
- **不要手动注册组件**: 组件通过 `unplugin-vue-components` 自动注册
- **不要使用 `any` 过度**: 虽然项目 `strict: false`，但应尽量明确类型
- **品牌色**: `#ff8d26`（橙色）
- **设计稿宽度**: 1920px（px 自动转 vw）
- **双 UI 库**: Ant Design Vue (PC) + Vant (移动端)
