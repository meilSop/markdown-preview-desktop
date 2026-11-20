# 自动导入函数参考

以下函数来自 `@sg/lib`，通过 `unplugin-auto-import` 实现全局自动导入。在任何 Vue/TS 文件中可直接使用，**无需手动 import**。

## Vue 响应式

| 函数       | 用途           |
| ---------- | -------------- |
| `ref`      | 创建响应式引用 |
| `computed` | 计算属性       |
| `watch`    | 侦听器         |
| `reactive` | 响应式对象     |
| `toRefs`   | 解构响应式对象 |
| `toRef`    | 提取单个引用   |
| `unref`    | 解引用         |
| `isRef`    | 判断是否引用   |

## Vue 生命周期

| 函数              | 用途            |
| ----------------- | --------------- |
| `onMounted`       | 挂载后          |
| `onUnmounted`     | 卸载后          |
| `onUpdated`       | 更新后          |
| `onBeforeMount`   | 挂载前          |
| `onBeforeUnmount` | 卸载前          |
| `onBeforeUpdate`  | 更新前          |
| `nextTick`        | 下一个 DOM 更新 |

## Vue Router

| 函数        | 用途         |
| ----------- | ------------ |
| `useRouter` | 获取路由实例 |
| `useRoute`  | 获取当前路由 |

## 工具函数

| 函数       | 用途            |
| ---------- | --------------- |
| `http`     | HTTP 请求客户端 |
| `msg`      | 消息提示        |
| `notify`   | 通知（通用）    |
| `notifyPC` | 通知（PC 端）   |
| `trs(key)` | 国际化翻译      |
| `cacheSrv` | 缓存服务        |
| `dictSrv`  | 字典服务        |
| `confirm`  | 确认对话框      |
| `goto`     | 路由跳转        |

## Store

| Store                   | 用途                  |
| ----------------------- | --------------------- |
| `useUserStore()`        | 用户信息、Token、租户 |
| `useAppStore()`         | 应用配置              |
| `useDictStore()`        | 字典数据              |
| `usePermissionStore()`  | 权限                  |
| `useMultipleTabStore()` | 多标签页              |
| `usePluginStore()`      | 插件                  |

## 注意事项

- 这些函数由 `unplugin-auto-import` 自动注入，不需要 `import { ref } from 'vue'`
- 但如果你需要 TypeScript 类型（如 `Ref`, `ComputedRef`），仍需手动导入：`import type { Ref } from 'vue'`
- 完整的自动导入列表见 `play/auto-import.d.ts`
