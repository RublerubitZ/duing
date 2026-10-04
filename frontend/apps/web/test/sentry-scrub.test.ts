// @vitest-environment node
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';
import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';

import { scrubBreadcrumb, scrubEvent } from '@/sentry-scrub';

// 서버 설정 배선 확인용 — 실제 초기화·전송이 붙지 않게 init 을 막는다(scrubEvent 는 타입만 가져와 영향 없음).
vi.mock('@sentry/nextjs', () => ({ init: vi.fn() }));

// 서버 오류 이벤트(onRequestError)가 beforeSend 에 도착하는 모양 — 값은 전부 테스트 전용 더미다.
function serverErrorEvent(headers?: Record<string, string>): ErrorEvent {
  return {
    type: undefined,
    request: {
      url: 'https://duings.com/admin/users?q=20261234',
      method: 'POST',
      headers,
      cookies: { '__Host-duing_access_token': 'test-only-jwt', theme: 'dark' },
      data: '{"studentId":"20261234"}',
    },
    contexts: { nextjs: { request_path: '/admin/users?q=20261234', router_kind: 'App Router' } },
  };
}

describe('scrubEvent', () => {
  it('요청 헤더 중 자격 증명 값을 이름 대소문자와 무관하게 가린다', () => {
    const scrubbed = scrubEvent(
      serverErrorEvent({
        authorization: 'Bearer test-only-secret',
        Authorization: 'Bearer test-only-other',
        'proxy-authorization': 'Basic test-only-proxy',
        cookie: '__Host-duing_access_token=test-only-jwt; theme=dark',
        'x-vercel-oidc-token': 'test-only-oidc',
        'x-vercel-proxy-signature': 'test-only-signature',
        'x-vercel-protection-bypass': 'test-only-bypass',
        'x-prerender-revalidate': 'test-only-preview-id',
        'x-vercel-sc-headers': '{"Authorization":"Bearer test-only-sc"}',
        'x-vercel-ip-country': 'KR',
        'x-vercel-ip-city': 'Daegu',
        'x-vercel-ip-latitude': '35.8',
      }),
    );

    expect(scrubbed.request?.headers).toEqual({
      authorization: '[Filtered]',
      Authorization: '[Filtered]',
      'proxy-authorization': '[Filtered]',
      cookie: '[Filtered]',
      'x-vercel-oidc-token': '[Filtered]',
      'x-vercel-proxy-signature': '[Filtered]',
      'x-vercel-protection-bypass': '[Filtered]',
      'x-prerender-revalidate': '[Filtered]',
      'x-vercel-sc-headers': '[Filtered]',
      'x-vercel-ip-country': '[Filtered]',
      'x-vercel-ip-city': '[Filtered]',
      'x-vercel-ip-latitude': '[Filtered]',
    });
  });

  it('referer 헤더는 이전 주소의 쿼리스트링만 지운다(대소문자 무관)', () => {
    const scrubbed = scrubEvent(
      serverErrorEvent({
        referer: 'https://duings.com/manage/clubs/1/applicants?q=20261234',
        Referer: 'https://duings.com/admin/users?q=홍길동',
      }),
    );

    expect(scrubbed.request?.headers).toEqual({
      referer: 'https://duings.com/manage/clubs/1/applicants',
      Referer: 'https://duings.com/admin/users',
    });
  });

  it('자격 증명이 아닌 진단 헤더는 그대로 둔다', () => {
    const diagnosticHeaders = {
      'user-agent': 'probe',
      accept: 'text/html',
      host: 'duings.com',
      'content-type': 'application/json',
      'x-vercel-id': 'icn1::test-only',
      'x-matched-path': '/admin/users',
      'x-forwarded-host': 'duings.com',
      'x-middleware-prefetch': '1',
      'next-router-state-tree': '%5B%22%22%5D',
      rsc: '1',
      'sentry-trace': 'test-only-trace',
      baggage: 'sentry-environment=test',
      'sec-fetch-site': 'same-origin',
    };

    expect(scrubEvent(serverErrorEvent({ ...diagnosticHeaders })).request?.headers).toEqual(diagnosticHeaders);
  });

  it('파싱된 쿠키·요청 본문을 지우고 URL·요청 경로의 쿼리스트링도 지운다', () => {
    const scrubbed = scrubEvent(serverErrorEvent({ 'user-agent': 'probe' }));

    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.url).toBe('https://duings.com/admin/users');
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.contexts?.nextjs).toEqual({ request_path: '/admin/users', router_kind: 'App Router' });
  });

  it('헤더 없는 요청·요청 없는 이벤트도 예외 없이 지나간다', () => {
    expect(scrubEvent(serverErrorEvent()).request?.headers).toBeUndefined();
    expect(scrubEvent({ type: undefined, message: 'client error' })).toEqual({
      type: undefined,
      message: 'client error',
    });
  });
});

describe('scrubBreadcrumb — 서버 http 브레드크럼', () => {
  it('외부 호출 브레드크럼의 쿼리·프래그먼트를 지운다 — 키 필터만 거친 http.query 가 값을 그대로 남기므로', () => {
    // 서버 SDK 가 외부 fetch 마다 남기는 모양(@sentry/node-core outgoingFetchRequest) — 값은 테스트 전용 더미다.
    const breadcrumb: Breadcrumb = {
      category: 'http',
      type: 'http',
      data: {
        url: 'https://api.duings.com/api/v1/clubs?keyword=20261234',
        'http.method': 'GET',
        'http.query': 'keyword=20261234',
        'http.fragment': '#section',
        status_code: 200,
      },
    };

    const scrubbed = scrubBreadcrumb(breadcrumb);

    expect(scrubbed.data).toEqual({
      url: 'https://api.duings.com/api/v1/clubs',
      'http.method': 'GET',
      status_code: 200,
    });
  });

  it('데이터 없는 http 브레드크럼도 예외 없이 지나간다', () => {
    expect(scrubBreadcrumb({ category: 'http' })).toEqual({ category: 'http' });
  });
});

describe('sentry.server.config', () => {
  it('서버 Sentry 를 scrubEvent·scrubBreadcrumb·sendDefaultPii:false 로 초기화한다 — 가림 배선이 빠지면 실패한다', async () => {
    await import('@/sentry.server.config');

    expect(vi.mocked(Sentry.init)).toHaveBeenCalledWith(
      expect.objectContaining({ beforeSend: scrubEvent, beforeBreadcrumb: scrubBreadcrumb, sendDefaultPii: false }),
    );
  });
});
