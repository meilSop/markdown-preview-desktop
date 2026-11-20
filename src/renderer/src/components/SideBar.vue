<script setup lang="ts">
import FileTree from "./FileTree.vue";

// V2 需求 14：打开文件/文件夹、导出、主题入口全部移入顶部菜单栏，侧边栏只保留文件树
</script>

<template>
  <aside class="side-bar">
    <div class="side-bar-title">工作区</div>
    <FileTree />
  </aside>
</template>

<style scoped>
.side-bar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  padding: 12px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
}
.side-bar-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
</style>
