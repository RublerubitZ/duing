import type { Storage } from './index';

// 브라우저(localStorage) 구현. SSR/Next.js 서버 컴포넌트에서는 호출 금지 — 'use client' 컴포넌트에서만.
export const webStorage: Storage = {
  async getItem(key) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};
