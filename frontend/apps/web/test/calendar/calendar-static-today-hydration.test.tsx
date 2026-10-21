import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
  useSelectedLayoutSegment: () => null,
}));

import CalendarRoute from '@/app/calendar/page';

/**
 * /calendar 는 정적 프리렌더라 서버 HTML 은 빌드한 날을 "오늘"로 그린다. 운영 HTML 이 며칠 묵은 채 서빙돼도
 * (10/21 운영 응답에 10/18 이 박혀 있었다) 하이드레이션이 서버 HTML 과 어긋나지 않아야 하고, 그 뒤에는 보는 날이 오늘이어야 한다.
 * 비로그인 경로가 내는 요청(전역 행사·모집 캘린더)만 MSW 로 받는다 — calendar-detail-sheet.test 의 셋업을 따른다.
 */
const BASE = 'http://localhost:8080/api/v1';
const server = setupServer(
  http.get(`${BASE}/global-events`, () => HttpResponse.json({ ok: true, data: [], message: null })),
  http.get(`${BASE}/recruitments`, () => HttpResponse.json({ ok: true, data: [], message: null })),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  server.resetHandlers();
  document.body.innerHTML = '';
});
afterAll(() => server.close());

function withProviders(tree: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>{tree}</ApiClientProvider>
    </QueryClientProvider>
  );
}

// jsdom 에는 ResizeObserver·matchMedia 가 없다 — 카드 높이 관측과 시트 뷰포트 판정만 무력화한다.
function stubBrowserOnlyApis() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

/** 서버가 serverNow 에 페이지를 그리고, 브라우저가 clientNow 에 그 HTML·RSC(같은 페이지 요소)로 하이드레이션한다. */
async function hydrateStaticHtml(serverNow: string, clientNow: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(serverNow));
  // 운영처럼 서버가 한 번 만든 페이지 요소(props 포함)를 브라우저가 그대로 받는다 — 하이드레이션 때 다시 만들지 않는다.
  const routeTree = CalendarRoute();
  // jsdom 의 window·document 를 지워야 typeof window 분기가 서버 렌더에서 브라우저 쪽을 타지 않는다.
  vi.stubGlobal('window', undefined);
  vi.stubGlobal('document', undefined);
  let serverHtml: string;
  try {
    serverHtml = renderToString(withProviders(routeTree));
  } finally {
    vi.unstubAllGlobals();
  }

  vi.setSystemTime(new Date(clientNow));
  stubBrowserOnlyApis();
  const container = document.createElement('div');
  // jsdom 29 는 한 인라인 style 에 background 와 background-color 가 함께 있으면 파싱하다 죽는다(날짜 칸이 그렇다) —
  // background-color 선언만 이름을 바꿔 넣는다. 하이드레이션의 텍스트·구조 대조에는 영향이 없다.
  container.innerHTML = serverHtml.replace(/background-color:/g, '--jsdom-background-color:');
  document.body.appendChild(container);
  // 텍스트·구조 불일치(운영의 #418)는 onRecoverableError 로 온다. 개발 빌드의 속성 차이 경고는 console 로만 와서 따로 막는다.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, withProviders(routeTree), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
  });
  return { serverHtml, container, recoverableErrors };
}

function monthHeading(container: HTMLElement): string | undefined {
  return container.querySelector('button[aria-label="이전 달"] + h2')?.textContent ?? undefined;
}

function todayMarkedDay(container: HTMLElement): string | undefined {
  return container.querySelector('button.cal-cell[aria-current="date"] .cal-daynum')?.textContent ?? undefined;
}

describe('캘린더 — 며칠 묵은 정적 HTML 로도 불일치 없이 하이드레이션하고 그 뒤 실제 오늘을 보인다', () => {
  it('빌드 다음 날 연 경우: 서버 HTML 그대로 하이드레이션하고, 오늘 표시·날짜 패널을 그날로 옮긴다', async () => {
    const result = await hydrateStaticHtml('2026-10-20T03:00:00Z', '2026-10-21T03:00:00Z');

    expect(result.recoverableErrors).toEqual([]);
    // 서버 HTML 에는 오늘 표시가 없다 — 빌드한 날을 오늘로 강조하면 하이드레이션 전까지 틀린 날이 보인다.
    expect(result.serverHtml).not.toContain('aria-current="date"');
    expect(todayMarkedDay(result.container)).toBe('21');
    expect(monthHeading(result.container)).toBe('2026·10월');
    expect(result.container.querySelector('aside.cal-detail')?.textContent).toContain('2026-10-21');
  });

  it('빌드 뒤 달이 바뀐 경우: 빌드한 달로 하이드레이션하고, 그 뒤 이번 달·오늘로 옮긴다', async () => {
    const result = await hydrateStaticHtml('2026-10-31T03:00:00Z', '2026-11-02T03:00:00Z');

    expect(result.recoverableErrors).toEqual([]);
    expect(result.serverHtml).toContain('10월</h2>');
    expect(todayMarkedDay(result.container)).toBe('2');
    expect(monthHeading(result.container)).toBe('2026·11월');
    expect(result.container.querySelector('aside.cal-detail')?.textContent).toContain('2026-11-02');
  });
});
