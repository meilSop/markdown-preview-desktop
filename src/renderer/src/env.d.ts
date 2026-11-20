/// <reference types="vite/client" />

// window.api 类型声明：指向 preload 暴露的对象结构（契约见 @shared/types）
interface Window {
  api: import("@shared/types").WindowApi;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<
    Record<string, never>,
    Record<string, never>,
    unknown
  >;
  export default component;
}

// markdown-it-task-lists 为无类型 CJS 包，补环境声明
declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  const taskLists: (
    md: MarkdownIt,
    options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean },
  ) => void;
  export default taskLists;
}
