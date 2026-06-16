'use client';

const COOKIE_NAME = 'duing_token';
// 쿠키 만료를 백엔드 JWT TTL(JWT_EXPIRY_MS 기본 3600000ms = 1시간)과 일치시킨다. refresh 토큰이
// 없어 토큰 만료 = 세션 종료이므로, 쿠키가 토큰보다 오래 남으면 만료 토큰으로 인증 상태가 잠시
// 복원됐다가 첫 401 로 끊기는 깜빡임이 생긴다.
const COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1시간 (백엔드 JWT TTL 과 정렬)

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