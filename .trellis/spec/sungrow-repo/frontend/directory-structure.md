# 目录结构

> 本项目前端代码的组织方式。

---

## 概述

前端是一个基于 **pnpm workspace** 和 **Git 子模块** 管理的 **Vue 3 + TypeScript** monorepo。主应用（`play/`）包含业务视图和 API 集成，而共享库（`packages/lib`、`packages/pages`）是提供核心组件、hooks、stores 和工具函数的 Git 子模块。

**关键架构决策：**
- 核心库（`@sg/lib`）和页面路由（`@sg/pages`）存放在独立的 Git 子模块中
- `play/` 应用从 `@sg/lib` 和 `@sg/pages` 导入——不重复共享逻辑
- `@sg/lib` 中的 100+ 个函数通过 `unplugin-auto-import` 自动导入（无需手动 import）

---

## 目录布局

```
syfb-frontend-pc/                          # 根目录（monorepo）
├── packages/                              # Git 子模块目录
│   ├── lib/                               # @sg/lib — 共享库（git 子模块）
│   │   ├── components/                    # 共享组件（sg-layout、SgTable 等）
│   │   ├── hooks/                         # 组合式函数（useSgTable、useWatermark 等）
│   │   │   └── pinia/                     # Pinia stores（useUserStore、useAppStore 等）
│   │   ├── utils/                         # 工具函数
│   │   └── ...                            # HTTP 客户端、i18n、路由守卫
│   ├── pages/                             # @sg/pages — 共享页面路由（git 子模块）
│   └── reame.md
├── play/                                  # 主应用（@sg/play）
│   ├── src/
│   │   ├── api/                           # API 层，按业务模块组织
│   │   │   └── {module}/
│   │   │       ├── data.ts                # API 调用函数
│   │   │       └── types.ts               # 请求/响应类型定义
│   │   ├── assets/
│   │   │   ├── css/                       # 全局样式（reset.less、cover-ant.less、mixin.less/scss）
│   │   │   ├── design/                    # 设计系统
│   │   │   │   ├── color.less             # 颜色变量（@primary-color: #FF8D26）
│   │   │   │   ├── config.less            # Less 导入入口
│   │   │   │   ├── theme.less             # CSS 自定义属性（亮色/暗色主题）
│   │   │   │   ├── public.less            # 全局工具样式
│   │   │   │   ├── fonts/                 # 字体文件
│   │   │   │   ├── transition/            # 过渡动画
│   │   │   │   └── var/                   # Less 变量（布局、断点、缓动函数）
│   │   │   ├── images/                    # 图片资源
│   │   │   ├── lang/                      # 国际化（en.json、zh.json、index.ts）
│   │   │   └── svg/                       # SVG 图标
│   │   ├── router/
│   │   │   ├── index.ts                   # 主路由配置
│   │   │   └── sub-index.ts               # 子模块路由导入
│   │   ├── store/
│   │   │   └── index.ts                   # 空文件（stores 定义在 @sg/lib 中）
│   │   ├── view/                          # 页面视图，按业务模块组织
│   │   │   ├── home/                      # 首页
│   │   │   │   ├── index.vue
│   │   │   │   └── test.ts
│   │   │   └── {module}/
│   │   │       ├── index.vue              # 页面入口
│   │   │       ├── types.ts               # 业务类型
│   │   │       ├── constant.ts            # 常量
│   │   │       ├── utils.ts               # 工具函数
│   │   │       └── components/            # 页面私有组件
│   │   ├── App.vue                        # 根组件
│   │   ├── app.config.ts                  # 应用配置（通知、水印等）
│   │   ├── main.ts                        # 入口文件
│   │   ├── index.d.ts                     # 全局类型声明
│   │   └── vite-env.d.ts                  # Vite 环境类型
│   ├── .env.development                   # 开发环境变量
│   ├── .env.production                    # 生产环境变量
│   ├── auto-import.d.ts                   # 自动导入类型声明（自动生成）
│   ├── components.d.ts                    # 组件自动注册类型（自动生成）
│   ├── generateModifyVars.ts              # Ant Design Less 主题变量生成器
│   ├── vite.config.ts                     # Vite 构建配置
│   └── yapi-config.ts                     # YAPI mock 代理配置
├── .prettierrc                            # Prettier 配置
├── _git.js                                # Git 子模块管理脚本
├── package.json                           # 根 package.json
└── pnpm-workspace.yaml                    # pnpm workspace 配置
```

---

## 模块组织

### 新增页面/功能模块

1. 在 `play/src/view/{module-name}/` 下创建新目录
2. 遵循标准结构：
   - `index.vue` — 页面入口
   - `types.ts` — 业务类型定义
   - `constant.ts` — 业务常量
   - `components/` — 页面私有组件（kebab-case 文件名）
3. 在 `play/src/api/{module-name}/` 下新增 API 模块：
   - `data.ts` — API 调用函数
   - `types.ts` — 请求/响应类型
4. 在相应的路由配置中注册路由

### 新增共享组件/Hook

- 放置在 `@sg/lib` 子模块中（需要提交子模块）
- 共享组件放到 `packages/lib/components/`
- 共享 hooks 放到 `packages/lib/hooks/`
- 必须更新自动导入声明以实现全局可用

---

## 命名规范

| 类型            | 约定       | 示例                             |
| --------------- | ---------- | -------------------------------- |
| Vue 组件文件    | kebab-case | `product-list.vue`               |
| TypeScript 文件 | camelCase  | `data.ts`、`types.ts`            |
| 目录            | kebab-case | `product-price-calculate/`       |
| 样式文件        | kebab-case | `reset.less`、`cover-ant.less`   |
| CSS 类名        | kebab-case | `.product-list`、`.product-item` |

---

## 导入别名

| 别名        | 解析路径         | 用途         |
| ----------- | ---------------- | ------------ |
| `@sg/lib`   | `packages/lib`   | 核心共享库   |
| `@sg/pages` | `packages/pages` | 共享页面路由 |
| `@/*`       | `play/src/*`     | 应用源代码   |
| `~/*`       | `play/*`         | 应用根目录   |

---

## 示例

参考实现：
- **简单页面**：`play/src/view/home/index.vue`
- **API 模块**：`play/src/api/dict/data.ts` + `types.ts`
- **含组件的复杂页面**：`play/src/view/sample/product-price-calculate/`
