# 组件规范

> 本项目中组件的构建方式。

---

## 概述

所有 Vue 组件统一使用 **`<script setup lang="ts">`**（Composition API）。项目中不存在 Options API 模式。组件通过 `unplugin-vue-components` 自动注册（Ant Design Vue 和 Vant）。

**关键约束：**
- 单文件最大行数：**600 行**
- 单函数最大行数：**100 行**
- Props 通过 TypeScript 泛型定义（`defineProps<{...}>()`）

---

## 组件结构

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
// 1. 导入（外部模块 → 内部模块 → 类型）
import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { SomeType } from './types'
import { SOME_CONSTANT } from './constant'
import ComponentChild from './components/child.vue'

// 2. Props 和 Emits
defineProps<{
  data: SomeType[]
}>()

const emits = defineEmits(['change'])

// 3. 响应式状态
const list: Ref<SomeType[]> = ref([])

// 4. 计算属性
const total = computed(() => list.value.length)

// 5. 方法
function handleChange(value: string) {
  emits('change', value)
}

// 6. 生命周期钩子
onMounted(() => {
  // 初始化逻辑
})
</script>

<style lang="scss" scoped>
.component-name {
  /* 样式 */
}
</style>
```

### 代码组织顺序

1. **导入**：外部模块 → 内部模块 → 类型导入
2. **Props 和 Emits**：`defineProps`、`defineEmits`
3. **响应式状态**：`ref`、`reactive`
4. **计算属性**：`computed`
5. **方法**：普通函数
6. **生命周期钩子**：`onMounted`、`onUnmounted` 等
7. **侦听器**：`watch`、`watchEffect`

---

## Props 约定

### TypeScript 泛型语法

始终使用 `defineProps` 的泛型形式：

```vue
<script lang="ts" setup>
import type { Product } from '../types'

defineProps<{
  list: Product[]
  loading?: boolean
}>()
</script>
```

### 带默认值

```vue
<script lang="ts" setup>
withDefaults(defineProps<{
  status?: number
  title?: string
}>(), {
  status: 0,
  title: ''
})
</script>
```

### Emits

```vue
<script lang="ts" setup>
const emits = defineEmits(['change', 'update'])
</script>
```

---

## 组件命名

- **文件名**：kebab-case（`product-list.vue`、`product-type.vue`）
- **模板引用**：PascalCase（`<ComponentProductList />`）
- **变量名**：PascalCase 加 `Component` 前缀（`ComponentProductList`、`ComponentType`）

---

## 样式模式

### 预处理器使用

| 预处理器     | 使用场景                           |
| ------------ | ---------------------------------- |
| **SCSS**     | 组件作用域样式（`<style scoped>`） |
| **Less**     | 全局样式、Ant Design 主题定制      |
| **WindiCSS** | 模板中的原子/工具类                |

### Scoped 样式

组件样式始终使用 `scoped`：

```vue
<style lang="scss" scoped>
.component-name {
  .child-element {
    /* scoped 样式 */
  }
}
</style>
```

### CSS 类名命名

- 类名使用 **kebab-case**（`.product-list`、`.product-item`）
- 全局命名空间前缀：`sg`（通过 Less 变量配置）
- 支持 BEM 风格，通过 Less mixin：`.bem(@n; @content)`

### 主题变量

- 品牌色：`#ff8d26`（橙色）
- 使用 CSS 自定义属性实现主题感知：`var(--primary-color)`
- 可用的 Less 变量：`@primary-color`、`@text-color` 等

### 响应式设计

- 设计稿宽度：**1920px**
- `px` 值通过 `postcss-px-to-viewport` 自动转换为 `vw`
- 直接按设计稿写像素值即可，构建工具会自动转换

---

## 自动导入

以下内容全局可用，无需手动导入：

- **Vue API**：`ref`、`computed`、`watch`、`onMounted`、`nextTick` 等
- **Vue Router**：`useRouter`、`useRoute`
- **@sg/lib 工具函数**：`http`、`msg`、`trs`、`cacheSrv`、`dictSrv`、`confirm`、`goto` 等

完整自动导入函数列表请参见 `play/auto-import.d.ts`。

---

## 常见错误

1. **使用 Options API**：项目标准是使用 `<script setup>` 的 Composition API。不要使用 `export default { setup() {} }` 或 Options API
2. **手动导入已自动导入的函数**：不要 `import { ref } from 'vue'`——`ref` 已经全局可用
3. **单文件超过 600 行**：将大型组件拆分为子组件
4. **不使用 `scoped` 样式**：始终为 `<style>` 块添加 `scoped` 属性以防止样式泄漏
5. **硬编码颜色**：使用主题变量（`var(--primary-color)`）而非原始十六进制值
6. **忘记 `defineEmits` 类型**：使用 TypeScript 时，优先使用类型化的 emits：`defineEmits<{ (e: 'change', value: string): void }>()`
