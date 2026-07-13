const LEGACY_TOKEN_KEY = 'duing.accessToken';
const LEGACY_COOKIE_NAME = 'duing_token';

const bestEffort = (cleanup: () => void): void => {
  try {
    cleanup();
  } catch {
    // 브라우저 개인정보 보호 정책이 한 저장소를 막아도 나머지 마이그레이션은 계속한다.
  }
};

export function clearLegacyWebAuthArtifacts(): void {
  if (typeof window !== 'undefined') {
    bestEffort(() => window.localStorage.removeItem(LEGACY_TOKEN_KEY));
    bestEffort(() => window.sessionStorage.removeItem(LEGACY_TOKEN_KEY));
  }
  if (typeof document !== 'undefined') {
    bestEffort(() => {
      document.cookie = `${LEGACY_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    });
    bestEffort(() => {
      document.cookie = `${LEGACY_COOKIE_NAME}=; Domain=.duings.com; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    });
  }
}
