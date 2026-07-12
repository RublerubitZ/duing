const LOCAL_API_BASE_URL = 'http://localhost:8080/api/v1';

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

const isLoopbackHostname = (hostname: string): boolean => {
  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');

  if (
    normalizedHostname === 'localhost' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname === '::1'
  ) {
    return true;
  }
  if (/^127(?:\.\d{1,3}){3}$/.test(normalizedHostname)) {
    return true;
  }

  const ipv4MappedIpv6Match = normalizedHostname.match(
    /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/,
  );
  const ipv4HighBitsHex = ipv4MappedIpv6Match?.[1];
  if (!ipv4HighBitsHex) {
    return false;
  }

  const ipv4HighBits = Number.parseInt(ipv4HighBitsHex, 16);
  return (ipv4HighBits & 0xff00) === 0x7f00;
};

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
  if (isLoopbackHostname(parsedApiBaseUrl.hostname)) {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL에는 loopback 주소를 사용할 수 없습니다.');
  }

  return trimTrailingSlashes(normalizedApiBaseUrl);
}
