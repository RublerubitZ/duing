import { act, startTransition, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
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
const requestedUrls: string[] = [];
const server = setupServer(
  http.get(`${BASE}/global-events`, ({ request }) => {
    requestedUrls.push(request.url);
    return HttpResponse.json({ ok: true, data: [], message: null });
  }),
  http.get(`${BASE}/recruitments`, ({ request }) => {
    requestedUrls.push(request.url);
    return HttpResponse.json({ ok: true, data: [], message: null });
  }),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

// RTL 을 거치지 않고 hydrateRoot 를 직접 쓰므로 act 환경 플래그를 직접 켠다(없으면 act 경고가 stderr 로 샌다).
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let liveRoot: Root | null = null;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  if (liveRoot !== null) {
    const root = liveRoot;
    act(() => root.unmount());
    liveRoot = null;
  }
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  server.resetHandlers();
  requestedUrls.length = 0;
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type InputDuringHydration = {
  target: (container: HTMLElement) => Element | undefined;
  /** true 면 터치·마우스처럼 mousedown 이 먼저 하이드레이션을 끝내고 click 이 30ms 뒤에 온다. false 면 키보드·보조기술처럼 click 하나뿐이다. */
  pointer: boolean;
};

/** 서버가 serverNow 에 페이지를 그리고, 브라우저가 clientNow 에 그 HTML·RSC(같은 페이지 요소)로 하이드레이션한다. */
async function hydrateStaticHtml(serverNow: string, clientNow: string, input?: InputDuringHydration) {
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
  // jsdom 29 는 한 인라인 style 에서 background 와 background-color 사이에 다른 선언이 끼면 파싱하다 죽는다(날짜 칸이 그렇다) —
  // background-color 선언만 이름을 바꿔 넣는다. 하이드레이션의 텍스트·구조 대조에는 영향이 없다.
  container.innerHTML = serverHtml.replace(/background-color:/g, '--jsdom-background-color:');
  document.body.appendChild(container);
  // 텍스트·구조 불일치(운영의 #418)는 onRecoverableError 로 온다. 개발 빌드의 속성 차이 경고(jsdom 의 CSS 정규화)는
  // console 로만 와서 단언하지 않되, MSW 가 console 로 알리는 미처리 요청은 따로 걸러 본다.
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  const hydrate = () => {
    liveRoot = hydrateRoot(container, withProviders(routeTree), {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
  };

  if (input === undefined) {
    await act(async () => hydrate());
  } else {
    // 하이드레이션을 전환으로 미뤄 루트가 탈수 상태일 때 입력을 넣는다 — React 는 그 입력을 처리하려고 동기로 하이드레이션한 뒤 디스패치한다.
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
    startTransition(hydrate);
    const target = input.target(container);
    if (target === undefined) throw new Error('하이드레이션 전 입력 대상이 서버 HTML 에 없다');
    if (input.pointer) {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await wait(30);
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    }
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(300);
  }

  const unhandledRequests = consoleErrorSpy.mock.calls.filter((args) =>
    /matching request handler/.test(args.map(String).join(' ')),
  );
  return { serverHtml, container, recoverableErrors, unhandledRequests };
}

function monthHeading(container: HTMLElement): string | undefined {
  return container.querySelector('button[aria-label="이전 달"] + h2')?.textContent ?? undefined;
}

function todayMarkedDay(container: HTMLElement): string | undefined {
  return container.querySelector('button.cal-cell[aria-current="date"] .cal-daynum')?.textContent ?? undefined;
}

/** 날짜 패널이 열렸으면 그 날짜, 닫혀 있으면 'closed'. */
function openedPanel(container: HTMLElement): string {
  const panel = container.querySelector('aside.cal-detail');
  if (panel?.getAttribute('data-open') !== 'true') return 'closed';
  return panel.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? 'open-without-date';
}

/** 날짜 숫자가 day 인 칸 중 마지막(앞뒤 달 칸과 숫자가 겹치면 이번 달 쪽). */
function lastCellOfDay(day: string) {
  return (container: HTMLElement) =>
    [...container.querySelectorAll('button.cal-cell')].filter((cell) => cell.querySelector('.cal-daynum')?.textContent === day).at(-1);
}

const monthNavButton = (label: '이전 달' | '다음 달') => (container: HTMLElement) =>
  container.querySelector(`button[aria-label="${label}"]`) ?? undefined;

/** 조회 파라미터의 달이 1~12 이고 날짜가 숫자인지 — 범위 밖 달(13월·0월)이나 NaN 이면 서버가 400 을 낸다. */
function invalidCalendarRequests(): string[] {
  return requestedUrls.filter((url) => {
    const params = new URL(url).searchParams;
    const yearMonth = params.get('yearMonth');
    if (yearMonth !== null) return !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth);
    return [params.get('from'), params.get('to')].some((day) => day === null || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(day));
  });
}

describe('캘린더 — 며칠 묵은 정적 HTML 로도 불일치 없이 하이드레이션하고 그 뒤 실제 오늘을 보인다', () => {
  it('빌드 다음 날 연 경우: 서버 HTML 그대로 하이드레이션하고, 오늘 표시·날짜 패널을 그날로 옮긴다', async () => {
    const result = await hydrateStaticHtml('2026-10-20T12:00:00Z', '2026-10-21T12:00:00Z');

    expect(result.recoverableErrors).toEqual([]);
    // 서버 HTML 에는 오늘 표시가 없다 — 빌드한 날을 오늘로 강조하면 하이드레이션 전까지 틀린 날이 보인다.
    expect(result.serverHtml).not.toContain('aria-current="date"');
    expect(todayMarkedDay(result.container)).toBe('21');
    expect(monthHeading(result.container)).toBe('2026·10월');
    expect(result.container.querySelector('aside.cal-detail')?.textContent).toContain('2026-10-21');
    expect(result.unhandledRequests).toEqual([]);
  });

  it('빌드 뒤 달이 바뀐 경우: 빌드한 달로 하이드레이션하고, 그 뒤 이번 달·오늘로 옮긴다', async () => {
    const result = await hydrateStaticHtml('2026-10-31T12:00:00Z', '2026-11-02T12:00:00Z');

    expect(result.recoverableErrors).toEqual([]);
    expect(result.serverHtml).toContain('10월</h2>');
    expect(todayMarkedDay(result.container)).toBe('2');
    expect(monthHeading(result.container)).toBe('2026·11월');
    expect(result.container.querySelector('aside.cal-detail')?.textContent).toContain('2026-11-02');
    expect(result.unhandledRequests).toEqual([]);
  });
});

describe('캘린더 — 묵은 HTML 위에서 하이드레이션 중에 누른 입력도 엉뚱한 화면으로 보내지 않는다', () => {
  it('지난달 HTML 에서 누른 날짜 칸은 다른 날짜를 열지 않는다(누른 날이 화면에서 사라졌으면 열지 않는다)', async () => {
    const result = await hydrateStaticHtml('2026-10-31T12:00:00Z', '2026-11-02T12:00:00Z', {
      target: lastCellOfDay('28'),
      pointer: true,
    });

    expect(['closed', '2026-10-28']).toContain(openedPanel(result.container));
    expect(result.unhandledRequests).toEqual([]);
  });

  it('달이 바뀐 HTML 에서 누른 "다음 달"은 본 달이나 옮겨진 달에서 한 달만 간다(13월로 가지 않는다)', async () => {
    const result = await hydrateStaticHtml('2026-11-28T12:00:00Z', '2026-12-03T12:00:00Z', {
      target: monthNavButton('다음 달'),
      pointer: false,
    });

    // 본 달 11월 → 12월, 옮겨진 달 12월 → 2027년 1월
    expect(['2026·12월', '2027·1월']).toContain(monthHeading(result.container));
    expect(invalidCalendarRequests()).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });

  it('해가 바뀐 HTML 에서 누른 "이전 달"은 본 달이나 옮겨진 달에서 한 달만 간다(0월로 가지 않는다)', async () => {
    const result = await hydrateStaticHtml('2026-12-28T12:00:00Z', '2027-01-03T12:00:00Z', {
      target: monthNavButton('이전 달'),
      pointer: false,
    });

    // 본 달 2026년 12월 → 11월, 옮겨진 달 2027년 1월 → 2026년 12월
    expect(['2026·11월', '2026·12월']).toContain(monthHeading(result.container));
    expect(invalidCalendarRequests()).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });

  it('해가 바뀐 HTML 에서 누른 "다음 달"은 연도를 건너뛰지 않는다', async () => {
    const result = await hydrateStaticHtml('2026-12-28T12:00:00Z', '2027-01-03T12:00:00Z', {
      target: monthNavButton('다음 달'),
      pointer: false,
    });

    // 본 달 2026년 12월 → 2027년 1월, 옮겨진 달 2027년 1월 → 2월
    expect(['2027·1월', '2027·2월']).toContain(monthHeading(result.container));
    expect(invalidCalendarRequests()).toEqual([]);
    expect(result.unhandledRequests).toEqual([]);
  });
});
