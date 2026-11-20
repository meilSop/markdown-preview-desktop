<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { basename, dirname, invalidNameReason, joinName } from "@/utils/path";

// 内联名称输入：新建（create）与重命名（rename）共用；Enter 提交 / Esc 与失焦取消
const props = defineProps<{
  mode: "create" | "rename";
  /** create 模式：目标父目录 */
  parentPath?: string;
  /** create 模式：新建类型 */
  type?: "file" | "dir";
  /** rename 模式：被重命名的节点路径 */
  targetPath?: string;
}>();

const workspace = useWorkspaceStore();
const draft = ref(
  props.mode === "rename" ? basename(props.targetPath ?? "") : "",
);
const error = ref<string | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
let busy = false; // 提交进行中标记，防 Enter/blur 竞态重复提交

onMounted(() => {
  inputEl.value?.focus();
  inputEl.value?.select();
});

function cancel(): void {
  workspace.clearPending();
}

async function commit(): Promise<void> {
  if (busy) return;
  const name = draft.value.trim();
  const invalid = invalidNameReason(name);
  if (invalid) {
    error.value = invalid;
    return;
  }
  busy = true;
  let ret;
  if (props.mode === "create") {
    ret = await workspace.createNode(
      props.parentPath ?? "",
      name,
      props.type ?? "file",
    );
  } else {
    const oldPath = props.targetPath ?? "";
    const newPath = joinName(dirname(oldPath), name);
    if (newPath === oldPath) {
      busy = false;
      cancel();
      return;
    }
    ret = await workspace.renameNode(oldPath, newPath);
  }
  busy = false;
  if (!ret.ok) {
    error.value = ret.error; // 冲突等错误就地显示，输入框保持打开
    return;
  }
  cancel();
}

// 提交进行中不失焦取消，避免输入行在 IPC 完成前消失
function onBlur(): void {
  if (!busy) cancel();
}
</script>

<template>
  <div class="inline-edit" @mousedown.stop @click.stop>
    <input
      ref="inputEl"
      v-model="draft"
      class="inline-input"
      :placeholder="
        mode === 'create' ? (type === 'dir' ? '文件夹名称' : '文件名称') : ''
      "
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="cancel"
      @blur="onBlur"
    />
    <p v-if="error" class="inline-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.inline-edit {
  min-width: 0;
}
.inline-input {
  width: 100%;
  padding: 2px 6px;
  font-size: 13px;
  border: 1px solid var(--color-accent);
  border-radius: 4px;
  outline: none;
  background: var(--color-bg);
  color: var(--color-text);
}
.inline-error {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-danger);
}
</style>
