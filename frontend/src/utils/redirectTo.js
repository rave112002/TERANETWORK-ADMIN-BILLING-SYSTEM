// utils/redirect-to.js
const KEY = "auth:redirect-to";

export const redirectTo = {
  set(path) {
    if (!path || path.startsWith("/login")) return;
    try {
      sessionStorage.setItem(KEY, path);
    } catch {
      /* private mode / disabled storage */
    }
  },
  get() {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  },
  consume() {
    const v = this.get();
    this.clear();
    return v;
  },
};
