import { reactive } from "vue";

// 模块级单例：轻量提示（导出结果等），不引组件库
const toast = reactive({ message: "", visible: false });
let timer: ReturnType<typeof setTimeout> | null = null;

export function useToast(): {
  toast: typeof toast;
  show: (message: string, duration?: number) => void;
} {
  function show(message: string, duration = 3000): void {
    toast.message = message;
    toast.visible = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toast.visible = false;
    }, duration);
  }
  return { toast, show };
}
