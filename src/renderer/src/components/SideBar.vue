<script setup lang="ts">
import { ref } from "vue";
import ActivityBar from "./ActivityBar.vue";
import FileTree from "./FileTree.vue";
import SearchPanel from "./SearchPanel.vue";

// V7 需求 24：水平 flex 布局 [活动条 | 内容区]，内容区按 activeView 切换；
// V8 需求 29：v-if 改 v-show 两视图常驻（树展开/焦点、检索输入与结果等内部
// 状态在切换后天然保留；隐藏视图不渲染不触发防抖搜索，无需额外处理）；
// V8 需求 27：侧栏总宽（48px 活动条 + 内容区）由 App.vue 内联样式驱动；
// FileTree 透传 visible 供隐藏期间的 reveal 补滚（V8 需求 31，check 轮补充）
const activeView = ref<"explorer" | "search">("explorer");
</script>

<template>
  <aside class="side-bar">
    <ActivityBar :active="activeView" @select="activeView = $event" />
    <div class="side-content">
      <div v-show="activeView === 'explorer'" class="explorer-view">
        <div class="side-bar-title">工作区</div>
        <FileTree :visible="activeView === 'explorer'" />
      </div>
      <SearchPanel v-show="activeView === 'search'" />
    </div>
  </aside>
</template>

<style scoped>
.side-bar {
  display: flex;
  background: var(--color-bg-secondary);
  /* 宽度由 App.vue 内联样式驱动（V8 需求 27），不再依赖 --sidebar-width；
     右侧边界视觉由 .sidebar-divider 承担，原 border-right 移除 */
}
/* 活动条右侧的内容区：explorer 保持原有「标题 + 文件树」结构 */
.side-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding: 12px;
}
/* explorer 视图常驻包裹层（V8 需求 29，v-show）：承接原 template v-if 的纵向布局 */
.explorer-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.side-bar-title {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
</style>
