'use client';

const COOKIE_NAME = 'duing_token';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 1주일

export const webCookieAdapter = {
  set(token: string): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  },
  clear(): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  },
};