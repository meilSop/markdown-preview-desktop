<script setup lang="ts">
// 活动条（V7 需求 24）：侧栏左侧窄列视图入口——资源管理器 / 全局检索；
// 选中态左侧 accent 边条 + 图标着色，切换由 SideBar 的 activeView 接管
defineProps<{ active: "explorer" | "search" }>();
const emit = defineEmits<{ select: [view: "explorer" | "search"] }>();
</script>

<template>
  <nav class="activity-bar">
    <button
      class="act-btn"
      :class="{ active: active === 'explorer' }"
      title="资源管理器"
      @click="emit('select', 'explorer')"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        />
      </svg>
    </button>
    <button
      class="act-btn"
      :class="{ active: active === 'search' }"
      title="全局检索"
      @click="emit('select', 'search')"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    </button>
  </nav>
</template>

<style scoped>
.activity-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 48px;
  padding-top: 4px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
}
.act-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.act-btn:hover {
  background: var(--color-accent-soft);
}
.act-btn.active {
  color: var(--color-accent);
}
/* 选中态左侧 2px accent 边条 */
.act-btn.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--color-accent);
}
.act-btn svg {
  display: block;
}
</style>
