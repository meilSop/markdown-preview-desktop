import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { applyHljsTheme } from "@/composables/useTheme";
import "./styles/variables.css";
import "./styles/base.css";
import "./styles/preview.css"; // markdown 排版（预览与导出共用，已锚定浅色）
import "katex/dist/katex.min.css"; // 公式样式常规引入
// 代码高亮主题固定 github.css（V2 需求 15：预览区恒为浅色，不随应用主题切换）
applyHljsTheme();

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
