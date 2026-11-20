<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import type { ThemeMode } from "@shared/types";
import { useSettingsStore } from "@/stores/settings";

// 设置对话框（工具菜单 → 切换主题入口，V2 需求 15）：
// 主题三选一 + 界面背景色自定义；遮罩样式与 ConfirmDialog 同风格，变更即时生效
const emit = defineEmits<{ close: [] }>();
const settings = useSettingsStore();

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

// 各主题默认背景色（与 variables.css 保持一致），未自定义时供 color input 显示
const DEFAULT_BG = { light: "#ffffff", dark: "#0d1117" } as const;
const colorValue = computed(
  () =>
    settings.backgroundColor ??
    (settings.resolvedTheme === "dark" ? DEFAULT_BG.dark : DEFAULT_BG.light),
);

// 单选组变更：即时生效并持久化
function onThemeChange(ev: Event): void {
  void settings.setTheme((ev.target as HTMLInputElement).value as ThemeMode);
}

// 背景色变更：仅覆盖 UI 区域的 --color-bg（预览区固定浅色不受影响）
function onColorChange(ev: Event): void {
  void settings.setBackgroundColor((ev.target as HTMLInputElement).value);
}

function resetColor(): void {
  void settings.setBackgroundColor(null);
}

// Esc 或点击遮罩关闭
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="settings-backdrop" @mousedown.self="emit('close')">
    <div class="settings-box">
      <p class="settings-title">设置</p>

      <p class="settings-label">主题</p>
      <div class="theme-group">
        <label
          v-for="opt in THEME_OPTIONS"
          :key="opt.value"
          class="theme-option"
        >
          <input
            type="radio"
            name="theme-mode"
            :value="opt.value"
            :checked="settings.theme === opt.value"
            @change="onThemeChange"
          />
          <span>{{ opt.label }}</span>
        </label>
      </div>
      <p class="settings-hint">
        深色仅作用于界面（侧边栏 / 标签栏 / 编辑器），预览区保持浅色白底
      </p>

      <p class="settings-label">界面背景色</p>
      <div class="bg-row">
        <input
          type="color"
          class="bg-color-input"
          :value="colorValue"
          @change="onColorChange"
        />
        <button class="settings-btn" @click="resetColor">恢复默认</button>
      </div>

      <div class="settings-actions">
        <button class="settings-btn primary" @click="emit('close')">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}
.settings-box {
  width: 340px;
  padding: 16px;
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: 0 4px 16px var(--color-shadow);
}
.settings-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
}
.settings-label {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.theme-group {
  display: flex;
  gap: 16px;
}
.theme-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.settings-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.bg-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bg-color-input {
  width: 42px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  cursor: pointer;
}
.settings-btn {
  padding: 4px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}
.settings-btn:hover {
  background: var(--color-bg-secondary);
}
.settings-btn.primary {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.settings-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
