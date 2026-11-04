import { act, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/calendar',
  useSearchParams: () => new URLSearchParams(),
  useSelectedLayoutSegment: () => null,
}));
// jsdom 에는 ResizeObserver 가 없다 — 캘린더 카드 높이 관측만 무력화한다.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { CalendarPage } from '@/app/calendar/_pages/CalendarPage';

/**
 * 보는 달은 고르기 전까지 오늘(한국 시간)을 따라간다 — 그래서 월말에 열어 둔 화면이 한국 시간 자정을 넘기면 다음 렌더에서 이번 달로 바뀐다.
 * 날짜를 고른 뒤에는 그 달에 머물러야 한다. 아니면 그리드가 다음 달로 넘어가 고른 날의 일정이 월 조회 범위에서 빠지고
 * 패널이 "이 날엔 등록된 일정이 없어요" 가 된다. 하이드레이션이 아니라 클라이언트 렌더다(일정 데이터는 MSW).
 */
const BASE = 'http://localhost:8080/api/v1';
const GLOBAL_EVENTS = [
  { id: 1, title: 'OCT15-EVENT', startAt: '2026-10-15T10:00:00', endAt: '2026-10-15T12:00:00', location: 'A', category: 'FAIR' },
  { id: 2, title: 'OCT30-EVENT', startAt: '2026-10-30T18:00:00', endAt: '2026-10-30T20:00:00', location: 'B', category: 'FAIR' },
  { id: 3, title: 'NOV05-EVENT', startAt: '2026-11-05T10:00:00', endAt: '2026-11-05T12:00:00', location: 'C', category: 'FAIR' },
];
const server = setupServer(
  http.get(`${BASE}/global-events`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    const data = GLOBAL_EVENTS.filter((event) => event.startAt.slice(0, 10) >= from && event.startAt.slice(0, 10) <= to);
    return HttpResponse.json({ ok: true, data, message: null });
  }),
  http.get(`${BASE}/recruitments`, () => HttpResponse.json({ ok: true, data: [], message: null })),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  server.resetHandlers();
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => server.close());

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

// 한국 시간 10/31 23:50 → 11/01 00:10 — 캘린더의 오늘은 기기 시간대와 무관하게 한국 시간 날짜다(#1502).
const BEFORE_MIDNIGHT = new Date('2026-10-31T23:50:00+09:00');
const AFTER_MIDNIGHT = new Date('2026-11-01T00:10:00+09:00');

function renderAt(instant: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <CalendarPage renderedTodayIso="2026-10-31" />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

// 기기 시간대를 바꿔 렌더한다 — process.env.TZ 는 런타임에 바꿔도 Date 의 로컬 게터에 반영된다.
// 원래 값이 없으면 delete 로 되돌린다(undefined 를 대입하면 문자열 "undefined" 가 들어가 UTC 로 동작한다).
const originalTz = process.env.TZ;
function setDeviceTimeZone(timeZone: string) {
  process.env.TZ = timeZone;
}
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

/** 오늘로 강조된 칸 — 정확히 한 칸이어야 하고, 이번 달 칸이어야 한다. */
function todayMarkedDay(container: HTMLElement): string | undefined {
  const marked = [...container.querySelectorAll<HTMLElement>('button.cal-cell[aria-current="date"]')];
  if (marked.length !== 1) throw new Error(`오늘 강조 칸이 ${marked.length}개다`);
  const [cell] = marked;
  if (cell?.style.opacity !== '1') throw new Error('오늘 강조 칸이 이번 달 칸이 아니다');
  return cell.querySelector('.cal-daynum')?.textContent ?? undefined;
}

/** 필터 칩을 껐다 켜 다시 그린다(화면 회전·재조회 등도 같은 계기다). */
function rerenderByFilterChip(container: HTMLElement) {
  const filterChip = [...container.querySelectorAll<HTMLElement>('button')].find((button) => button.textContent?.includes('모집 마감'));
  if (!filterChip) throw new Error('모집 마감 필터 칩이 없다');
  fireEvent.click(filterChip);
  fireEvent.click(filterChip);
}

function monthHeading(container: HTMLElement): string | undefined {
  return container.querySelector('button[aria-label="이전 달"] + h2')?.textContent ?? undefined;
}

function panelEventTitles(container: HTMLElement): (string | undefined)[] {
  const panel = container.querySelector('aside.cal-detail');
  return [...(panel?.querySelectorAll('[role="button"]') ?? [])].map((row) => row.textContent?.match(/[A-Z0-9]+-EVENT/)?.[0]);
}

/** 이번 달 칸(앞뒤 달 칸은 흐리게 그린다) 중 날짜 숫자가 day 인 칸. */
function inMonthCell(container: HTMLElement, day: string): HTMLElement {
  const cell = [...container.querySelectorAll<HTMLElement>('button.cal-cell')].find(
    (candidate) => candidate.querySelector('.cal-daynum')?.textContent === day && candidate.style.opacity === '1',
  );
  if (!cell) throw new Error(`이번 달 ${day}일 칸이 없다`);
  return cell;
}

describe('캘린더 — 달을 넘겨 열어 둔 화면에서 고른 날짜는 그 달 그리드에서 열린다', () => {
  it('자정을 넘긴 뒤 누른 날짜는 누른 그 달 그리드에서 열리고 그날 일정을 보인다', async () => {
    const { container } = renderAt(BEFORE_MIDNIGHT);
    await settle();
    vi.setSystemTime(AFTER_MIDNIGHT);

    fireEvent.click(inMonthCell(container, '15'));
    await settle();

    expect(monthHeading(container)).toBe('2026·10월');
    expect(container.querySelector('aside.cal-detail')?.textContent).toContain('2026-10-15');
    expect(panelEventTitles(container)).toEqual(['OCT15-EVENT']);
  });

  it('패널을 연 채 자정을 넘겨 다시 그려져도 그리드가 패널의 달에서 벗어나지 않는다', async () => {
    const { container } = renderAt(BEFORE_MIDNIGHT);
    await settle();
    fireEvent.click(inMonthCell(container, '30'));
    await settle();
    vi.setSystemTime(AFTER_MIDNIGHT);

    rerenderByFilterChip(container);
    await settle();

    expect(monthHeading(container)).toBe('2026·10월');
    expect(panelEventTitles(container)).toEqual(['OCT30-EVENT']);
  });
});

describe('캘린더 — 오늘은 기기 시간대와 무관하게 한국 시간 날짜다(#1502)', () => {
  it('뉴욕 기기(아직 10/31)에서 한국 11/01 00:10 이면 보는 달은 11월, 오늘은 1일', async () => {
    setDeviceTimeZone('America/New_York');
    const { container } = renderAt(AFTER_MIDNIGHT);
    await settle();

    expect(monthHeading(container)).toBe('2026·11월');
    expect(todayMarkedDay(container)).toBe('1');
  });

  it('키리티마티 기기(벌써 11/01)에서 한국 10/31 23:50 이면 보는 달은 10월, 오늘은 31일', async () => {
    setDeviceTimeZone('Pacific/Kiritimati');
    const { container } = renderAt(BEFORE_MIDNIGHT);
    await settle();

    expect(monthHeading(container)).toBe('2026·10월');
    expect(todayMarkedDay(container)).toBe('31');
  });

  it('아무것도 고르지 않았으면 한국 시간 자정을 넘긴 뒤 다음 렌더에서 보는 달이 새 오늘의 달로 옮겨간다', async () => {
    // 뉴욕 기기에서는 두 시각 모두 10/31 이다 — 기기 자정이 아니라 한국 자정에 넘어가는지를 본다.
    setDeviceTimeZone('America/New_York');
    const { container } = renderAt(BEFORE_MIDNIGHT);
    await settle();
    expect(monthHeading(container)).toBe('2026·10월');

    vi.setSystemTime(AFTER_MIDNIGHT);
    rerenderByFilterChip(container);
    await settle();

    expect(monthHeading(container)).toBe('2026·11월');
    expect(todayMarkedDay(container)).toBe('1');
  });
});
