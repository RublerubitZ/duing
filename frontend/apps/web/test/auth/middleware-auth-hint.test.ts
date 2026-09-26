import { createHmac } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyAuthHint as verifyAuthHintForApp } from '../../app/_lib/auth-hint';
import { parsePositiveIdParam } from '../../app/_lib/idParam';
import { config, middleware, verifyAuthHint } from '../../middleware';

const AUTH_HINT_SECRET = 'test-auth-hint-secret-at-least-32-bytes';
const NOW_SECONDS = 2_000_000_000;

type AuthHintPayload = {
  typ: string;
  role: string;
  exp?: number;
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

// 미들웨어(Edge 자기완결)와 앱(RSC 레이아웃)이 같은 검증을 따로 들고 있다 — 한쪽만 고치면
// 라우팅 가드와 SSR 헤더 판정이 갈라지므로, 전 케이스에서 두 구현의 결과 일치를 강제한다.
describe('verifyAuthHint 이중 구현 드리프트 가드', () => {
  it.each([
    ['유효한 STUDENT', () => createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS + 60 })],
    ['유효한 ADMIN', () => createAuthHint({ typ: 'AUTH_HINT', role: 'ADMIN', exp: NOW_SECONDS + 60 })],
    [
      '위조된 signature',
      () =>
        createAuthHint(
          { typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS + 60 },
          'wrong-secret-at-least-32-bytes',
        ),
    ],
    ['다른 typ', () => createAuthHint({ typ: 'ACCESS', role: 'STUDENT', exp: NOW_SECONDS + 60 })],
    ['알 수 없는 role', () => createAuthHint({ typ: 'AUTH_HINT', role: 'MANAGER', exp: NOW_SECONDS + 60 })],
    ['만료된 exp', () => createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS })],
    [
      '추가 claims',
      () =>
        createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS + 60, unexpected: 'value' }),
    ],
    ['segment 부족', () => 'a.b'],
    [
      'segment 초과',
      () => `${createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS + 60 })}.extra`,
    ],
    [
      'alg 변조(none)',
      () =>
        createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT', exp: NOW_SECONDS + 60 }, AUTH_HINT_SECRET, {
          alg: 'none',
          typ: 'JWT',
        }),
    ],
    ['결측 claims(exp 없음)', () => createAuthHint({ typ: 'AUTH_HINT', role: 'STUDENT' })],
    ['비어 있는 토큰', () => ''],
  ])('%s 토큰에서 두 구현의 결과가 일치한다', async (_caseName, createToken) => {
    const token = createToken();

    const middlewareResult = await verifyAuthHint(token, AUTH_HINT_SECRET, NOW_SECONDS);
    const appResult = await verifyAuthHintForApp(token, AUTH_HINT_SECRET, NOW_SECONDS);

    expect(appResult).toEqual(middlewareResult);
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

  // 세션이 죽어도 auth_hint는 남을 수 있다 — 잔존 hint가 재로그인 진입을 막으면
  // 쿠키를 수동 삭제하기 전까지 로그인 자체가 불가능해진다.
  it('유효한 hint가 있어도 로그인 페이지 진입을 /me로 되돌리지 않는다', async () => {
    const token = createAuthHint({
      typ: 'AUTH_HINT',
      role: 'STUDENT',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const response = await middleware(createRequest('/login', token));

    expect(response.headers.get('location')).toBeNull();
  });

  // loading 경계 안에서 페이지가 notFound() 를 부르면 이미 200 이 나간 뒤라 소프트 404 가 된다 —
  // 형식이 틀린 ID 는 미들웨어가 인증·권한 판정 뒤에 not-found 라우트로 넘겨 실제 404 를 낸다.
  describe('형식이 틀린 ID 주소는 not-found 로 넘긴다', () => {
    const createRoleHint = (role: 'STUDENT' | 'ADMIN') =>
      createAuthHint({ typ: 'AUTH_HINT', role, exp: Math.floor(Date.now() / 1000) + 60 });

    it.each([
      '/me/applications/abc',
      '/me/applications/0',
      '/me/applications/012',
      '/me/applications/%31%32',
      '/manage/clubs/abc',
      '/manage/clubs/abc/fees',
      '/manage/clubs/-1/info',
      '/manage/clubs/1.5/members/requests',
      '/admin/facility-bookings/submission/abc',
      '/admin/facility-bookings/submission/0/transcribe',
      '/admin/facility-bookings/submission/9007199254740993',
      '/me/applications/abc?tab=x',
      // 전송 접미(.segments·.prefetch·.json)가 붙은 세그먼트는 페이지가 원문 그대로 받아 notFound() 한다 — 판정을
      // 맞춰 404. Next 16 은 동적 라우트에 경로형 프리페치를 만들지 않는다.
      '/manage/clubs/12.prefetch',
      '/me/applications/12.json',
      '/me/applications/12.segments/_tree.segment',
      '/manage/clubs/12.segments/fees',
      // 보호 경로의 다른 id 자리(중첩 포함)도 같은 기준이다. 정적 `new` 와 비슷하기만 한 값은 id 로 판정한다.
      '/apply/abc',
      '/me/fees/abc/receipt',
      '/me/inquiries/1e1',
      '/admin/clubs/abc/activity-log',
      '/admin/clubs/newfoo',
      '/admin/clubs/new.foo',
      '/admin/faqs/0/edit',
      '/admin/reports/-1',
      '/manage/clubs/12/fees/abc/receipt',
      '/manage/clubs/12/recruitments/abc/stats',
      '/manage/clubs/12/recruitments/12/applicants/abc',
      '/manage/clubs/12/recruitments/12/interview/rounds/abc',
    ])('ADMIN hint의 %s 를 not-found 로 rewrite한다', async (path) => {
      const response = await middleware(createRequest(path, createRoleHint('ADMIN')));

      expect(response.headers.get('x-middleware-rewrite')).toBe('https://duings.com/_not-found');
    });

    it.each([
      '/me/applications/12',
      '/me/applications/12/',
      '/me/applications',
      '/me/applications/',
      '/manage/clubs/12/fees',
      '/manage/clubs/12/',
      '/manage',
      '/admin/facility-bookings/submission/3/transcribe',
      '/admin/facility-bookings',
      '/me/applications/12?tab=x',
      '/apply/5',
      // 같은 자리의 정적 페이지와 그 세그먼트 전송 형태는 id 판정에서 뺀다.
      '/me/inquiries/new',
      '/admin/clubs/new',
      '/admin/clubs/new/',
      '/admin/clubs/new.segments/_tree.segment',
      '/admin/clubs/12/join-codes',
      '/manage/clubs/12/recruitments/new',
      '/manage/clubs/12/recruitments/12/interview/rounds/new',
    ])('ADMIN hint의 %s 는 그대로 통과시킨다', async (path) => {
      const response = await middleware(createRequest(path, createRoleHint('ADMIN')));

      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('hint가 없으면 형식과 무관하게 원래 주소를 담아 로그인으로 redirect한다', async () => {
      const response = await middleware(createRequest('/me/applications/abc'));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'https://duings.com/login?next=%2Fme%2Fapplications%2Fabc',
      );
    });

    it('STUDENT hint의 관리자 경로는 형식이 틀려도 404 가 아니라 /403 으로 rewrite한다', async () => {
      const response = await middleware(
        createRequest('/admin/facility-bookings/submission/abc', createRoleHint('STUDENT')),
      );

      expect(response.headers.get('x-middleware-rewrite')).toBe('https://duings.com/403');
    });

    it.each(['/me/applications/abc', '/manage/clubs/abc', '/apply/abc', '/me/inquiries/abc'])(
      'STUDENT hint의 %s 는 형식이 틀리면 not-found 로 rewrite한다',
      async (path) => {
        const response = await middleware(createRequest(path, createRoleHint('STUDENT')));

        expect(response.headers.get('x-middleware-rewrite')).toBe('https://duings.com/_not-found');
      },
    );

    // 미들웨어는 앱 코드를 import 못 해 판정 정규식을 따로 든다 — 페이지 방어선(parsePositiveIdParam)과
    // 기준이 갈라지면 한쪽은 404, 다른 쪽은 통과가 되므로 같은 입력 표로 두 판정의 일치를 강제한다.
    // 빈 값은 경로 모양이 목록 주소로 바뀌어 대조에서 뺀다(목록 통과 케이스가 따로 있다).
    const ID_SAMPLES = [
      '1',
      '12',
      '9007199254740991',
      '0',
      '012',
      '-1',
      '1.5',
      '1e1',
      '0x1f',
      '+12',
      ' 12',
      '12 ',
      '%31%32',
      'abc',
      '9007199254740992',
      '12.prefetch',
      '12.segments',
    ];

    // id 를 경로 끝에 두면 URL 파서가 문자열 끝 공백을 잘라 '12 ' 가 '12' 로 도착한다 — 모든 모양이 id 뒤에
    // 세그먼트나 끝 슬래시를 둬서 공백이 %20 으로 인코딩된 채 미들웨어에 닿게 한다. nextUrl.clone() 은 원 주소의 끝 슬래시를
    // 물려받으므로(skipTrailingSlashRedirect 라 이런 요청도 미들웨어에 온다) rewrite 대상의 끝 슬래시는 판정에서 무시한다.
    it.each([
      (id: string) => `/me/applications/${id}/`,
      (id: string) => `/manage/clubs/${id}/fees`,
      (id: string) => `/admin/facility-bookings/submission/${id}/transcribe`,
      (id: string) => `/apply/${id}/`,
      (id: string) => `/admin/clubs/${id}/activity-log`,
      (id: string) => `/manage/clubs/1/recruitments/${id}/applicants`,
      (id: string) => `/manage/clubs/1/recruitments/1/interview/rounds/${id}/`,
    ])('미들웨어와 parsePositiveIdParam 의 판정이 일치한다 (%#)', async (toPath) => {
      const middlewareVerdicts = await Promise.all(
        ID_SAMPLES.map(async (id) => {
          const response = await middleware(createRequest(toPath(id), createRoleHint('ADMIN')));
          const sentToNotFound = /^https:\/\/duings\.com\/_not-found\/?$/.test(
            response.headers.get('x-middleware-rewrite') ?? '',
          );
          return [id, sentToNotFound];
        }),
      );
      const helperVerdicts = ID_SAMPLES.map((id) => [id, parsePositiveIdParam(id) === null]);

      expect(middlewareVerdicts).toEqual(helperVerdicts);
    });

    // 라우트 가드 두 개가 쓰는 수집기 — app 전체의 페이지·route 핸들러마다 URL 세그먼트 목록을 낸다. 그룹 (x)·슬롯 @x 는
    // URL 에서 빠지고, 비공개 _x 는 라우트가 아니며, 가로채기 폴더 (.)x·(..)x·(...)x 는 가로채는 대상 URL 이 된다.
    // 동적 세그먼트는 폴더 이름 그대로(`[x]`) 남기고 각 가드가 채울 값을 정한다.
    const INTERCEPT_FOLDER = /^(\(\.\.\.\)|(?:\(\.\.\))+|\(\.\))(.+)$/;
    const isDynamicSegment = (segment: string) => segment.startsWith('[');

    const collectRouteSegments = (dir: string, urlSegments: string[]): string[][] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory()) {
          return /^(?:page|route)\.[jt]sx?$/.test(entry.name) ? [urlSegments] : [];
        }
        const childDir = join(dir, entry.name);
        const intercept = INTERCEPT_FOLDER.exec(entry.name);
        if (intercept) {
          const [, marker = '', target = ''] = intercept;
          const baseSegments =
            marker === '(...)'
              ? []
              : marker === '(.)'
                ? urlSegments
                : urlSegments.slice(0, urlSegments.length - marker.length / 4); // '(..)' 한 개(4글자)당 한 단계 위
          return collectRouteSegments(childDir, [...baseSegments, target]);
        }
        if (entry.name.startsWith('_')) return [];
        if (/^[(@]/.test(entry.name)) return collectRouteSegments(childDir, urlSegments);
        return collectRouteSegments(childDir, [...urlSegments, entry.name]);
      });

    const collectAppRoutes = () => collectRouteSegments(resolve(__dirname, '../../app'), []);
    const toUrl = (segments: string[], fill: (segment: string, index: number) => string) =>
      `/${segments.map(fill).join('/')}`;
    const isSentToNotFound = async (url: string, authHint: string) => {
      const response = await middleware(createRequest(url, authHint));
      return /\/_not-found\/?$/.test(response.headers.get('x-middleware-rewrite') ?? '');
    };
    // 미들웨어가 id 를 판정하는 보호 접두사 — matcher(`/apply/:path*` 등)에서 파생해 새 접두사가 조용히 빠지지 않게 한다.
    const PROTECTED_ROOTS = config.matcher.map((pattern) => pattern.split('/')[1]);

    it('app 의 어떤 페이지·route 핸들러도 미들웨어 ID 판정에 404 로 가려지지 않는다', async () => {
      const routeUrls = collectAppRoutes().map((segments) =>
        toUrl(segments, (segment) => (isDynamicSegment(segment) ? '1' : segment)),
      );
      // 걷기가 틀려 목록이 비면 아무것도 검사하지 않고 통과하므로, id 경로와 같은 자리의 정적 `new` 가 실제로 걷혔는지 먼저 본다.
      expect(routeUrls).toEqual(
        expect.arrayContaining([
          '/me/applications/1',
          '/manage/clubs/1/fees',
          '/admin/facility-bookings/submission/1/transcribe',
          '/admin/clubs/new',
          '/manage/clubs/1/recruitments/1/interview/rounds/new',
        ]),
      );

      const adminHint = createRoleHint('ADMIN');
      const hiddenUrls = (
        await Promise.all(
          routeUrls.map(async (url) => ((await isSentToNotFound(url, adminHint)) ? [url] : [])),
        )
      ).flat();

      expect(
        hiddenUrls,
        '미들웨어 ID_ROUTE_PATTERNS 가 이 정적 라우트를 404 로 가립니다 — middleware.ts 정규식을 먼저 고치세요',
      ).toEqual([]);
    });

    it('보호 경로의 모든 동적 세그먼트는 형식이 틀리면 not-found 로 rewrite한다', async () => {
      const probeUrls = collectAppRoutes()
        .filter(([root = '']) => PROTECTED_ROOTS.includes(root))
        .flatMap((segments) =>
          segments.flatMap((segment, index) =>
            isDynamicSegment(segment)
              ? [
                  toUrl(segments, (other, otherIndex) =>
                    otherIndex === index ? 'abc' : isDynamicSegment(other) ? '1' : other,
                  ),
                ]
              : [],
          ),
        );
      // 수집이 비어 통과하는 일이 없게 네 접두사의 대표 자리가 실제로 만들어졌는지 먼저 본다.
      expect(probeUrls).toEqual(
        expect.arrayContaining([
          '/apply/abc',
          '/me/inquiries/abc',
          '/admin/clubs/abc/activity-log',
          '/manage/clubs/1/recruitments/1/interview/rounds/abc',
        ]),
      );

      const adminHint = createRoleHint('ADMIN');
      const passedUrls = (
        await Promise.all(
          probeUrls.map(async (url) => ((await isSentToNotFound(url, adminHint)) ? [] : [url])),
        )
      ).flat();

      expect(
        passedUrls,
        '보호 접두사 아래 동적 세그먼트는 양의 정수 id 만 허용합니다 — 새 id 라우트면 middleware.ts ID_ROUTE_PATTERNS 에 자리를 더하고, 숫자가 아닌 값이 필요하면 보호 접두사 밖이나 쿼리로 옮기세요',
      ).toEqual([]);
    });
  });
});

describe('middleware matcher 정책', () => {
  it('로그인·가입·비밀번호 재설정 경로는 미들웨어 대상에서 제외된다', () => {
    expect(config.matcher).not.toContain('/login');
    expect(config.matcher).not.toContain('/signup');
    expect(config.matcher).not.toContain('/forgot-password');
  });

  it('보호 경로 가드는 그대로 유지된다', () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(['/apply/:path*', '/me/:path*', '/manage/:path*', '/admin/:path*']),
    );
  });
});
