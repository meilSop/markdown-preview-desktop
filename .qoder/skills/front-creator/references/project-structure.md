# 项目目录结构与文件组织

## 前端项目根目录

```
syfb-frontend-pc/
├── packages/                    # Git 子模块（不要直接修改）
│   ├── lib/                     # @sg/lib — 核心库（store/hooks/utils/components）
│   └── pages/                   # @sg/pages — 页面路由
├── play/                        # 主应用 (@sg/play)
│   ├── src/
│   │   ├── api/                 # API 层，按业务模块组织
│   │   │   └── <module>/
│   │   │       ├── data.ts      # API 调用函数
│   │   │       └── types.ts     # 请求/响应类型
│   │   ├── assets/
│   │   │   ├── css/             # 全局样式
│   │   │   ├── design/          # 设计系统（颜色/变量/主题）
│   │   │   ├── images/          # 图片资源
│   │   │   ├── lang/            # 国际化
│   │   │   └── svg/             # SVG 图标
│   │   ├── router/
│   │   │   ├── index.ts         # 主路由配置
│   │   │   └── sub-index.ts     # 子模块路由导入
│   │   ├── store/
│   │   │   └── index.ts         # 空文件（store 定义在 @sg/lib）
│   │   ├── view/                # 页面视图，按业务模块组织
│   │   │   └── <module>/
│   │   │       ├── index.vue    # 页面入口
│   │   │       ├── types.ts     # 业务类型
│   │   │       ├── constant.ts  # 常量配置
│   │   │       ├── conf.ts      # 表格/表单配置
│   │   │       ├── utils.ts     # 工具函数
│   │   │       └── components/  # 页面私有组件
│   │   ├── App.vue              # 根组件
│   │   ├── app.config.ts        # 应用配置
│   │   ├── main.ts              # 入口文件
│   │   └── vite-env.d.ts        # Vite 环境类型声明
│   ├── auto-import.d.ts         # 自动导入类型声明
│   ├── components.d.ts          # 组件自动注册类型声明
│   ├── index.html               # HTML 入口
│   └── vite.config.ts           # Vite 构建配置
├── .prettierrc                  # Prettier 配置
└── pnpm-workspace.yaml          # pnpm workspace 配置
```

## 新建模块时的文件放置规则

### API 模块

位置: `play/src/api/<module-name>/`

```
api/<module-name>/
├── data.ts      # API 调用函数（使用 http 客户端）
└── types.ts     # 请求/响应类型定义
```

### 页面模块

位置: `play/src/view/<module-name>/`

```
view/<module-name>/
├── index.vue        # 页面入口组件
├── types.ts         # 页面业务类型
├── constant.ts      # 页面常量
├── conf.ts          # 表格列配置、表单配置等
├── utils.ts         # 页面私有工具函数
└── components/      # 页面私有子组件
    ├── <name>-list.vue
    ├── <name>-form.vue
    └── <name>-detail.vue
```

### 路由注册

位置: `play/src/router/index.ts`

在路由配置中添加页面路由：

```typescript
{
  path: '/<module-name>',
  name: '<moduleName>',
  component: () => import('../view/<module-name>/index.vue'),
  meta: { title: '模块名称' },
}
```

## 关键约定

- **组件文件名**: kebab-case（如 `product-list.vue`）
- **目录名**: kebab-case（如 `product-detail/`）
- **类型文件**: 固定命名 `types.ts`
- **API 文件**: 固定命名 `data.ts`
- **常量文件**: 固定命名 `constant.ts`
- **配置文件**: 固定命名 `conf.ts`
- **工具文件**: 固定命名 `utils.ts`
- **页面入口**: 固定命名 `index.vue`
- **私有组件**: 放在 `components/` 子目录

## 环境变量

在代码中使用：

```typescript
import.meta.env.VITE_APP_WEB_URL     // 后端 API 地址
import.meta.env.VITE_APP_TELANT_ID   // 租户 ID
import.meta.env.DEV                   // 是否开发环境
```
