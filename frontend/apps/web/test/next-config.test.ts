import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config.mjs';

describe('next.config 보안 헤더', () => {
  it('모든 경로에 안전 보안 헤더를 설정한다', async () => {
    const headersFn = nextConfig.headers;
    expect(typeof headersFn).toBe('function');
    if (!headersFn) throw new Error('headers() 가 정의되어야 한다');

    const rules = await headersFn();
    const rule = rules.find((entry) => entry.source === '/:path*');
    expect(rule).toBeDefined();
    if (!rule) throw new Error('/:path* 규칙이 있어야 한다');

    const headers = Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });
});
