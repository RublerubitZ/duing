import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiBaseUrl } from '../../app/_lib/apiBaseUrl';

describe('API base URL 운영 검증', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('운영에서 API base URL이 비어 있으면 모듈 초기화를 거부한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(import('../../app/providers')).rejects.toThrow('NEXT_PUBLIC_API_BASE_URL');
  });
});

describe('resolveApiBaseUrl', () => {
  it('운영에서 파싱할 수 없는 URL을 거부한다', () => {
    expect(() => resolveApiBaseUrl('not-a-url', 'production')).toThrow('형식');
  });

  it('운영에서 HTTP URL을 거부한다', () => {
    expect(() => resolveApiBaseUrl('http://api.duings.com/api/v1', 'production')).toThrow('HTTPS');
  });

  it.each(['https://localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://[::1]/api/v1'])(
    '운영에서 loopback URL %s를 거부한다',
    (apiBaseUrl) => {
      expect(() => resolveApiBaseUrl(apiBaseUrl, 'production')).toThrow('loopback');
    },
  );

  it('운영 HTTPS URL을 정규화해 반환한다', () => {
    expect(resolveApiBaseUrl(' https://api.duings.com/api/v1/ ', 'production')).toBe(
      'https://api.duings.com/api/v1',
    );
  });

  it('개발에서 누락값을 로컬 API 주소로 폴백한다', () => {
    expect(resolveApiBaseUrl(undefined, 'development')).toBe('http://localhost:8080/api/v1');
  });

  it('개발에서 명시된 URL을 정규화해 반환한다', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:8080/api/v1/', 'development')).toBe(
      'http://127.0.0.1:8080/api/v1',
    );
  });
});
