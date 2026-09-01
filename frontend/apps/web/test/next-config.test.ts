import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../next.config.mjs';

async function resolvePathHeaders(): Promise<Record<string, string>> {
  const headersFn = nextConfig.headers;
  if (!headersFn) throw new Error('headers() 가 정의되어야 한다');

  const rules = await headersFn();
  const rule = rules.find((entry) => entry.source === '/:path*');
  if (!rule) throw new Error('/:path* 규칙이 있어야 한다');

  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
}

describe('next.config 보안 헤더', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('환경과 무관하게 안전 보안 헤더(HSTS·X-Frame-Options·frame-ancestors·nosniff·Referrer-Policy)를 설정한다', async () => {
    const headers = await resolvePathHeaders();
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('운영(prod)에서는 전체 CSP 후보를 Report-Only 로 추가한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const headers = await resolvePathHeaders();

    const reportOnly = headers['Content-Security-Policy-Report-Only'];
    expect(reportOnly).toContain("default-src 'self'");
    expect(reportOnly).toContain("frame-ancestors 'none'");
    expect(reportOnly).toContain("object-src 'none'");
    expect(reportOnly).toContain('https://api.duings.com');
    expect(reportOnly).toContain('https://files.duings.com');
  });

  it('개발 환경에서는 Report-Only 헤더를 내보내지 않아 관찰 신호를 깨끗하게 유지한다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const headers = await resolvePathHeaders();

    // dev 의 localhost 이미지·API·HMR eval 위반 잡음을 피하려고 Report-Only 는 운영에서만 켠다.
    expect(headers['Content-Security-Policy-Report-Only']).toBeUndefined();
    // 강제 헤더는 환경과 무관하게 항상 유지된다.
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
  });
});

describe('next.config 정적 폰트 캐시', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('/fonts 자산에 1년 immutable 캐시를 내려 재방문마다의 조건부 재검증 왕복을 없앤다', async () => {
    const headersFn = nextConfig.headers;
    if (!headersFn) throw new Error('headers() 가 정의되어야 한다');
    const rules = await headersFn();

    const fontsRule = rules.find((entry) => entry.source === '/fonts/:path*');
    if (!fontsRule) throw new Error('/fonts/:path* 규칙이 있어야 한다');
    const fontsHeaders = Object.fromEntries(
      fontsRule.headers.map((header) => [header.key, header.value]),
    );

    // immutable 규약: 폰트 교체 시 파일명 변경 필수 (next.config.mjs 규칙 주석 참고).
    expect(fontsHeaders['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('정적 이미지·favicon 에도 1년 immutable 캐시를 내린다 — 새로고침마다의 이미지 재검증 왕복을 없앤다', async () => {
    const headersFn = nextConfig.headers;
    if (!headersFn) throw new Error('headers() 가 정의되어야 한다');
    const rules = await headersFn();

    const imageRule = rules.find((entry) => /\(png\|/.test(entry.source));
    if (!imageRule) throw new Error('이미지 확장자 규칙이 있어야 한다');
    const imageHeaders = Object.fromEntries(
      imageRule.headers.map((header) => [header.key, header.value]),
    );
    expect(imageHeaders['Cache-Control']).toBe('public, max-age=31536000, immutable');
    // favicon·svg 로고까지 같은 규칙에 걸려야 한다 — 확장자 목록에서 빠지면 조용히 max-age=0 으로 돌아간다.
    for (const ext of ['png', 'webp', 'svg', 'ico']) expect(imageRule.source).toContain(ext);
  });

  it('/_next/image 최적화 결과도 1년 하한으로 캐시한다 — 업로드 키가 UUID 라 교체가 곧 새 URL 이어서 원격 원본도 안전', () => {
    expect(nextConfig.images?.minimumCacheTTL).toBe(31536000);
  });

  it('원격 이미지 최적화는 운영 R2 호스트만 허용한다 — 개발용 r2.dev 와일드카드는 운영 빌드에서 빠진다', async () => {
    // 와일드카드가 운영까지 새면 남의 r2.dev 버킷 이미지를 우리 최적화기가 중계하게 된다.
    const hostnames = (nextConfig.images?.remotePatterns ?? []).map((pattern) => pattern.hostname);
    expect(hostnames).toContain('files.duings.com');

    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { default: productionConfig } = await import('../next.config.mjs');
    const productionHostnames = (productionConfig.images?.remotePatterns ?? []).map(
      (pattern) => pattern.hostname,
    );
    expect(productionHostnames).toEqual(['files.duings.com']);
  });

  it('보안 헤더 규칙(/:path*)은 폰트 규칙 추가와 무관하게 유지된다', async () => {
    const headers = await resolvePathHeaders();
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('next.config 클라이언트 라우터 캐시', () => {
  it('동적 세그먼트 staleTime 을 둬 탭 재방문(로그인·콘솔 등 동적 라우트)이 RSC 재페치·로딩 플래시 없이 복원되게 한다', () => {
    expect(nextConfig.experimental?.staleTimes).toEqual({ dynamic: 180 });
  });
});
