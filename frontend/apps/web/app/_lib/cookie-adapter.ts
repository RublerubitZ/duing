'use client';

const COOKIE_NAME = 'duing_token';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 1주일

// HTTPS(운영)에서는 Secure 를 붙여 평문(HTTP) 전송을 막는다. 로컬 개발(http://localhost)에서는
// Secure 쿠키가 저장되지 않아 미들웨어 라우트 가드가 깨지므로, 프로토콜에 따라 분기한다.
function secureSuffix(): string {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
}

export const webCookieAdapter = {
  set(token: string): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secureSuffix()}`;
  },
  clear(): void {
    if (typeof document === 'undefined') return;
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secureSuffix()}`;
  },
};