const LEGACY_TOKEN_KEY = 'duing.accessToken';
const LEGACY_COOKIE_NAME = 'duing_token';

export function clearLegacyWebAuthArtifacts(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${LEGACY_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    document.cookie = `${LEGACY_COOKIE_NAME}=; Domain=.duings.com; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  }
}
