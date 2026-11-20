<script setup lang="ts">
import { useToast } from "@/composables/useToast";

// 全局轻量提示条，挂 App.vue；消息经 useToast 单例写入
const { toast } = useToast();
</script>

<template>
  <Transition name="toast">
    <div v-if="toast.visible" class="toast">{{ toast.message }}</div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  max-width: 70vw;
  padding: 8px 16px;
  border-radius: 6px;
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 13px;
  box-shadow: 0 4px 12px var(--color-shadow);
  z-index: 1000;
  word-break: break-all;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}
</style>
