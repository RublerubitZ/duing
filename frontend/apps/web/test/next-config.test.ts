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

describe('next.config 클라이언트 라우터 캐시', () => {
  it('동적 세그먼트 staleTime 을 둬 탭 재방문(로그인·콘솔 등 동적 라우트)이 RSC 재페치·로딩 플래시 없이 복원되게 한다', () => {
    expect(nextConfig.experimental?.staleTimes).toEqual({ dynamic: 180 });
  });
});
