// @vitest-environment node
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';
import * as Sentry from '@sentry/nextjs';
import { describe, expect, it, vi } from 'vitest';

import { scrubBreadcrumb, scrubEvent } from '@/sentry-scrub';

// 서버 설정 배선 확인용 — 실제 초기화·전송이 붙지 않게 init 을 막는다(sentry-scrub 은 @sentry/nextjs 에서 타입만 가져와 영향 없음).
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

describe('scrubBreadcrumb', () => {
  it('외부 호출(http) 브레드크럼의 http.query·http.fragment 를 지운다 — SDK 는 민감 키 이름만 가려 q 같은 값이 그대로 남으므로', () => {
    // 서버 SDK 가 외부 호출마다 남기는 모양(node:http·fetch 공통) — url 은 SDK 가 이미 쿼리를 떼고 http.query 는 '?' 를
    // 붙여 따로 남긴다. 값은 테스트 전용 더미다.
    const breadcrumb: Breadcrumb = {
      category: 'http',
      type: 'http',
      data: {
        url: 'https://api.duings.com/api/v1/clubs',
        'http.method': 'GET',
        'http.query': '?q=20261234',
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

  it.each(['fetch', 'xhr', 'http'])('%s 브레드크럼 URL 의 쿼리스트링을 지운다(http 는 SDK 가 이미 뗀 경우의 방어)', (category) => {
    const scrubbed = scrubBreadcrumb({ category, data: { url: '/api/v1/users?studentId=20261234' } });

    expect(scrubbed.data?.url).toBe('/api/v1/users');
  });

  it('navigation 브레드크럼의 이전·다음 주소에서 쿼리스트링을 지운다', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'navigation',
      data: { from: '/admin/users?q=20261234', to: '/clubs?keyword=20261234' },
    });

    expect(scrubbed.data).toEqual({ from: '/admin/users', to: '/clubs' });
  });

  it('데이터 없는 http 브레드크럼도 예외 없이 지나간다', () => {
    expect(scrubBreadcrumb({ category: 'http' })).toEqual({ category: 'http' });
  });

  // 클릭·입력 브레드크럼의 문구는 SDK(@sentry/browser-utils 의 htmlTreeAsString)가 만든 요소 셀렉터다 —
  // 태그·id·클래스 뒤에 aria-label·type·name·title·alt 값을 `[이름="값"]` 으로 붙이고(따옴표 이스케이프 없음)
  // 조상은 ' > ' 로 잇는다. 아래 문구는 그 형식을 그대로 따른 테스트용 더미다.
  it('클릭 브레드크럼 셀렉터의 속성 값을 전부 가린다 — 접근성 이름에 담긴 사람 이름이 실리지 않게', () => {
    // SDK 기본 모양은 data 가 없다 — data 조기 반환보다 먼저 처리돼야 한다.
    const scrubbed = scrubBreadcrumb({
      category: 'ui.click',
      message: 'div.flex > label.inline-flex > input.peer[aria-label="홍길동 선택"][type="checkbox"]',
    });

    expect(scrubbed).toEqual({
      category: 'ui.click',
      message: 'div.flex > label.inline-flex > input.peer[aria-label="[Filtered]"][type="[Filtered]"]',
    });
  });

  it('입력·클릭 브레드크럼은 조상과 대상의 name·title·alt 값까지 모두 가린다', () => {
    const inputBreadcrumb = scrubBreadcrumb({
      category: 'ui.input',
      message: 'section[aria-label="이영희 지원서"] > div.row > input.w-full[name="memo"][title="박민수 님 메모"]',
    });
    const imageBreadcrumb = scrubBreadcrumb({
      category: 'ui.click',
      message: 'button.avatar[title="김철수 님 상세"] > img.rounded-full[alt="김철수 프로필"]',
    });

    expect(inputBreadcrumb.message).toBe(
      'section[aria-label="[Filtered]"] > div.row > input.w-full[name="[Filtered]"][title="[Filtered]"]',
    );
    expect(imageBreadcrumb.message).toBe('button.avatar[title="[Filtered]"] > img.rounded-full[alt="[Filtered]"]');
  });

  it('값 안의 꺾쇠·닫는 대괄호·줄바꿈은 그 블록만 가린다 — 문구 전체를 버리지 않는다', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'ui.click',
      message: 'button.btn[aria-label="다음 > 홍길동]"][title="첫 줄\n둘째 줄"]',
    });

    expect(scrubbed.message).toBe('button.btn[aria-label="[Filtered]"][title="[Filtered]"]');
  });

  it.each([
    ['값 안의 큰따옴표', 'button.btn[aria-label="홍"길동 상세"]'],
    ['값 안의 따옴표와 닫는 대괄호', 'button.btn[aria-label="홍"]길동 상세"][type="button"]'],
    ['작은따옴표로 바뀐 형식', "button.btn[aria-label='홍길동 상세']"],
    ['따옴표가 없어진 형식', 'button.btn[aria-label=홍길동]'],
  ])(
    '값 경계를 못 찾는 문구(%s)는 전체를 가린다 — SDK 가 따옴표를 이스케이프하지 않고, 형식이 바뀌어도 새지 않게',
    (_unmatchedShape, message) => {
      expect(scrubBreadcrumb({ category: 'ui.click', message }).message).toBe('[Filtered]');
    },
  );

  it('속성이 없는 셀렉터는 그대로 둔다', () => {
    expect(scrubBreadcrumb({ category: 'ui.click', message: 'div.card > button.btn-primary' }).message).toBe(
      'div.card > button.btn-primary',
    );
  });

  it('따옴표 없는 대괄호 클래스(Tailwind 임의값)는 속성으로 보지 않는다 — 과잉 가림 없이 속성 값만 가린다', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'ui.click',
      message: "div.data-[state=open]:bg-cream > span.before:content-[''] > button.w-[120px][type=\"button\"]",
    });

    expect(scrubbed.message).toBe(
      "div.data-[state=open]:bg-cream > span.before:content-[''] > button.w-[120px][type=\"[Filtered]\"]",
    );
  });

  it('클릭 브레드크럼의 data 는 그대로 두고, 문구 없는 ui 브레드크럼도 예외 없이 지나간다', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'ui.click',
      message: 'button.btn[aria-label="홍길동 상세"]',
      data: { 'ui.component_name': 'MemberTable' },
    });

    expect(scrubbed).toEqual({
      category: 'ui.click',
      message: 'button.btn[aria-label="[Filtered]"]',
      data: { 'ui.component_name': 'MemberTable' },
    });
    expect(scrubBreadcrumb({ category: 'ui.click' })).toEqual({ category: 'ui.click' });
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
