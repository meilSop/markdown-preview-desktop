<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

// 轻量确认弹层（删除确认用）：点背景或 Esc 取消，按钮确认
defineProps<{
  message: string;
  confirmText?: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === "Escape") emit("cancel");
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="confirm-backdrop" @mousedown.self="emit('cancel')">
    <div class="confirm-box">
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button class="confirm-btn" @click="emit('cancel')">取消</button>
        <button class="confirm-btn danger" @click="emit('confirm')">
          {{ confirmText ?? "确认" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}
.confirm-box {
  width: 320px;
  padding: 16px;
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: 0 4px 16px var(--color-shadow);
}
.confirm-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.confirm-btn {
  padding: 4px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}
.confirm-btn:hover {
  background: var(--color-bg-secondary);
}
.confirm-btn.danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.confirm-btn.danger:hover {
  background: var(--color-danger);
  color: #fff;
}
</style>
