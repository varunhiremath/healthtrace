import { create } from 'zustand';

// Toasts and dialogs, so no screen has to build its own. `confirm` and `prompt`
// return promises, which keeps call sites readable:
//   if (await confirm({ ... })) await deleteReport(id);

let idSeq = 0;

const useUIStore = create((set, get) => ({
  toasts: [],
  confirmState: null,
  promptState: null,

  showToast(message, opts = {}) {
    const id = ++idSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type: opts.type ?? 'info' }] }));
    setTimeout(() => get().dismissToast(id), opts.duration ?? 3200);
    return id;
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  confirm(options) {
    return new Promise((resolve) => set({ confirmState: { ...options, resolve } }));
  },
  resolveConfirm(result) {
    const state = get().confirmState;
    set({ confirmState: null });
    state?.resolve(result);
  },

  prompt(options) {
    return new Promise((resolve) => set({ promptState: { ...options, resolve } }));
  },
  resolvePrompt(value) {
    const state = get().promptState;
    set({ promptState: null });
    state?.resolve(value);
  },
}));

export default useUIStore;
