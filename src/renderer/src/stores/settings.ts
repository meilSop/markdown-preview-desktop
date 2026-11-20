import { acceptHMRUpdate, defineStore } from "pinia";
import type { LayoutMode, SettingsData, ThemeMode } from "@shared/types";
import { useToast } from "@/composables/useToast";

// matchMedia 查询对象模块级持有，system 模式监听只注册一次
const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");

export const useSettingsStore = defineStore("settings", {
  state: () => ({
    // theme 为用户偏好；实际生效主题由 resolvedTheme 派生（system 跟随系统）
    theme: "system" as ThemeMode,
    // 界面背景色覆盖（#rrggbb）：null = 用主题默认（预览区固定浅色，不受影响）
    backgroundColor: null as string | null,
    // 项目根路径列表（持久化镜像，实际工作区状态在 workspaceStore）
    roots: [] as string[],
    // 布局模式（编辑 / 预览 / 分屏，V3 需求 19）：纯布局状态，不改 CSS 变量
    layoutMode: "split" as LayoutMode,
    // 侧栏内容区宽度 px（48px 活动条之外，V8 需求 27）：null = 默认 288。
    // 拖拽中的实时宽度由 App.vue 本地 ref 驱动渲染，松手才经 setSidebarWidth 落盘
    sidebarWidth: null as number | null,
    systemDark: darkMedia.matches,
  }),
  getters: {
    resolvedTheme(state): "light" | "dark" {
      return state.theme === "system"
        ? state.systemDark
          ? "dark"
          : "light"
        : state.theme;
    },
  },
  actions: {
    // 应用生效主题：根节点 data-theme 驱动 CSS 变量；背景色覆盖写在 :root 内联样式
    // （内联优先级最高，暗色变量同样被覆盖；预览区已锚定浅色，不消费 --color-bg）
    apply(): void {
      document.documentElement.dataset.theme = this.resolvedTheme;
      const style = document.documentElement.style;
      if (this.backgroundColor) {
        style.setProperty("--color-bg", this.backgroundColor);
      } else {
        style.removeProperty("--color-bg");
      }
    },
    // 启动时读 userData/settings.v2.json（失败/缺省走默认），并挂 system 模式监听
    async init(): Promise<void> {
      const ret = await window.api.settings.read();
      if (ret.ok) {
        this.theme = ret.data.theme;
        this.backgroundColor = ret.data.backgroundColor;
        this.roots = ret.data.roots;
        this.layoutMode = ret.data.layoutMode;
        this.sidebarWidth = ret.data.sidebarWidth;
      } else {
        console.error("[settings] 读取失败:", ret.error);
      }
      darkMedia.addEventListener("change", (e) => {
        this.systemDark = e.matches;
        this.apply();
      });
      this.apply();
    },
    // 主题设置（设置对话框单选组）：即时生效 + 持久化
    async setTheme(theme: ThemeMode): Promise<void> {
      this.theme = theme;
      this.apply();
      await this.persist();
    },
    // 界面背景色设置：color 为 null 时恢复主题默认
    async setBackgroundColor(color: string | null): Promise<void> {
      this.backgroundColor = color;
      this.apply();
      await this.persist();
    },
    // 布局模式切换（工具菜单 → 模式切换二级菜单）：即时生效 + 持久化
    async setLayoutMode(mode: LayoutMode): Promise<void> {
      this.layoutMode = mode;
      await this.persist();
    },
    // 侧栏宽度（V8 需求 27）：App.vue 拖拽结束时（mouseup）持久化一次，
    // 拖拽过程不经此 action（避免每次 mousemove 都写盘，松手才写）
    async setSidebarWidth(width: number | null): Promise<void> {
      this.sidebarWidth = width;
      await this.persist();
    },
    // 根列表镜像更新（workspaceStore 增删根后调用）
    async setRoots(paths: string[]): Promise<void> {
      this.roots = paths;
      await this.persist();
    },
    // 整体持久化到 userData/settings.v2.json（写失败 toast 提示用户，不影响
    // 本地生效；V6 需求 23 失败可见性：不再只记日志静默吞掉）
    async persist(): Promise<void> {
      const data: SettingsData = {
        theme: this.theme,
        backgroundColor: this.backgroundColor,
        // 展开为普通数组再过 IPC：Pinia state 是 reactive Proxy，structured
        // clone 对 Proxy 抛 DataCloneError，写入从未到达主进程（V2 起持久化
        // 失效的真因）；其余字段是原始值，Proxy 上取值即得原始值，无此问题
        roots: [...this.roots],
        layoutMode: this.layoutMode,
        sidebarWidth: this.sidebarWidth,
      };
      try {
        const ret = await window.api.settings.write(data);
        // 业务失败已由 IPC wrap 收敛为 {ok:false}；throw 进 catch 统一处理，
        // 同时兜住 preload 层异常 reject 的可能
        if (!ret.ok) throw new Error(ret.error);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[settings] 持久化失败:", message);
        useToast().show("设置保存失败：" + message);
      }
    },
  },
});

// dev HMR：store 定义变更时替换注册表实例，避免组件已热更而 store 仍是旧实例的撕裂状态
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
