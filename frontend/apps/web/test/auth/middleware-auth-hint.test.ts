import { createHmac } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { middleware, verifyAuthHint } from '../../middleware';

const AUTH_HINT_SECRET = 'test-auth-hint-secret-at-least-32-bytes';
const NOW_SECONDS = 2_000_000_000;

type AuthHintPayload = {
  typ: string;
  role: string;
  exp: number;
  unexpected?: string;
};

const encodeBase64Url = (value: string) => Buffer.from(value).toString('base64url');

const createAuthHint = (
  payload: AuthHintPayload,
  secret = AUTH_HINT_SECRET,
  header: Record<string, string> = { alg: 'HS256', typ: 'JWT' },
) => {
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
};

const createRequest = (path: string, authHint?: string) =>
  new NextRequest(`https://duings.com${path}`, {
    headers: authHint ? { cookie: `auth_hint=${authHint}` } : undefined,
  });

describe('verifyAuthHint', () => {
  it.each(['STUDENT', 'ADMIN'])('유효한 %s auth_hint claims를 반환한다', async (role) => {
    const token = createAuthHint({ typ: 'AUTH_HINT', role, exp: NOW_SECONDS + 60 });

    await expect(verifyAuthHint(token, AUTH_HINT_SECRET, NOW_SECONDS)).resolves.toEqual({
      typ: 'AUTH_HINT',
      role,
      exp: NOW_SECONDS + 60,
    });
  });

  it.each([
    [
      '위조된 signature',
      () =>
        createAuthHint(
          { typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS + 60 },
          'wrong-secret-at-least-32-bytes',
        ),
    ],
    [
      '다른 typ',
      () => createAuthHint({ typ: 'ACCESS', role: 'STUDENT', exp: NOW_SECONDS + 60 }),
    ],
    [
      '알 수 없는 role',
      () => createAuthHint({ typ: 'AUTH_HINT', role: 'MANAGER', exp: NOW_SECONDS + 60 }),
    ],
    [
      '만료된 exp',
      () => createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS }),
    ],
    [
      '추가 claims',
      () =>
        createAuthHint({
          typ: 'AUTH_HINT',
          role: 'STUDENT',
          exp: NOW_SECONDS + 60,
          unexpected: 'value',
        }),
    ],
  ])('%s auth_hint를 거부한다', async (_caseName, createToken) => {
    await expect(verifyAuthHint(createToken(), AUTH_HINT_SECRET, NOW_SECONDS)).resolves.toBeNull();
  });
});

describe('middleware auth_hint UX', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_HINT_SECRET', AUTH_HINT_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hint가 없는 보호 경로를 원래 URL을 포함한 로그인으로 redirect한다', async () => {
    const response = await middleware(createRequest('/me/profile?tab=security'));

    expect(response.headers.get('location')).toBe(
      'https://duings.com/login?next=%2Fme%2Fprofile%3Ftab%3Dsecurity',
    );
  });

  it('development에서 AUTH_HINT_SECRET이 없으면 hint를 무효로 처리한다', async () => {
    vi.stubEnv('AUTH_HINT_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    const token = createAuthHint({
      typ: 'AUTH_HINT',
      role: 'STUDENT',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await middleware(createRequest('/me', token));

    expect(response.headers.get('location')).toBe('https://duings.com/login?next=%2Fme');
  });

  it('production에서 AUTH_HINT_SECRET이 없으면 오류를 던진다', async () => {
    vi.stubEnv('AUTH_HINT_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');

    await expect(middleware(createRequest('/me'))).rejects.toThrow(
      'AUTH_HINT_SECRET is required in production',
    );
  });

  it('STUDENT hint의 /admin 요청을 /403으로 rewrite한다', async () => {
    const token = createAuthHint({
      typ: 'AUTH_HINT',
      role: 'STUDENT',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await middleware(createRequest('/admin/users', token));

    expect(response.headers.get('x-middleware-rewrite')).toBe('https://duings.com/403');
  });

  // auth_hint는 라우팅 UX용 단서일 뿐이며, 유효해도 API 인증 성공을 의미하지 않는다.
  it('유효한 ADMIN hint는 /admin UX를 통과시키지만 API 인증 성공을 의미하지 않는다', async () => {
    const token = createAuthHint({
      typ: 'AUTH_HINT',
      role: 'ADMIN',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await middleware(createRequest('/admin/users', token));

    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
