const LOCAL_API_BASE_URL = 'http://localhost:8080/api/v1';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

export function resolveApiBaseUrl(
  apiBaseUrl: string | undefined,
  nodeEnvironment: string | undefined,
): string {
  const normalizedApiBaseUrl = apiBaseUrl?.trim();

  if (nodeEnvironment !== 'production') {
    return trimTrailingSlashes(normalizedApiBaseUrl || LOCAL_API_BASE_URL);
  }

  if (!normalizedApiBaseUrl) {
    throw new Error('운영 환경에는 NEXT_PUBLIC_API_BASE_URL 설정이 필요합니다.');
  }

  let parsedApiBaseUrl: URL;
  try {
    parsedApiBaseUrl = new URL(normalizedApiBaseUrl);
  } catch {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL 형식이 올바르지 않습니다.');
  }

  if (parsedApiBaseUrl.protocol !== 'https:') {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL은 HTTPS URL이어야 합니다.');
  }
  if (LOOPBACK_HOSTNAMES.has(parsedApiBaseUrl.hostname)) {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL에는 loopback 주소를 사용할 수 없습니다.');
  }

  return trimTrailingSlashes(normalizedApiBaseUrl);
}
