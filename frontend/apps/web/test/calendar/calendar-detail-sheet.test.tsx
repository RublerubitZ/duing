import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * 날짜 시트(모바일 바텀시트 = 데스크탑 우측 레일)의 접근성 계약 — 대화상자 역할, ESC, 눈에 보이는 닫기 버튼.
 * 비로그인 경로가 내는 요청(전역 행사·모집 캘린더)만 MSW 로 받는다 — me·managed 는 인증 전이라 나가지 않는다.
 * (use-operator-access.test 의 셋업을 따른다.)
 */
const BASE = 'http://localhost:8080/api/v1';
const server = setupServer(
  http.get(`${BASE}/global-events`, () => HttpResponse.json({ ok: true, data: [], message: null })),
  http.get(`${BASE}/recruitments`, () => HttpResponse.json({ ok: true, data: [], message: null })),
);
const apiClient = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });

/** 상세 패널이 바텀시트가 되는 뷰포트(max-width: 767px)인지. jsdom 에는 matchMedia 가 없어 직접 스텁한다. */
let sheetViewport = false;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  sheetViewport = false;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(max-width: 767px)' && sheetViewport,
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
  vi.restoreAllMocks();
  server.resetHandlers();
  act(() => useAuthStore.setState(useAuthStore.getInitialState(), true));
});
afterAll(() => server.close());

function renderCalendar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>
        <CalendarPage />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

function firstDayCell(container: HTMLElement): HTMLButtonElement {
  const cell = container.querySelector<HTMLButtonElement>('button.cal-cell');
  if (!cell) throw new Error('expected a calendar day cell');
  return cell;
}

describe('캘린더 날짜 시트 — 대화상자 역할·ESC·닫기 버튼', () => {
  it('날짜를 누르면 dialog 로 열리고 ESC 로 닫힌다', async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar();

    // 닫힌 시트는 aria-hidden 이라 hidden: true 로만 잡힌다. 이름은 accname 규칙상 숨은 노드에서 빈 문자열로
    // 계산되므로(name 옵션으로는 못 잡는다) 라벨은 속성으로 확인한다.
    const sheet = screen.getByRole('dialog', { hidden: true });
    expect(sheet).toHaveAttribute('aria-label', '선택한 날짜 일정');
    expect(sheet).toHaveAttribute('data-open', 'false');
    expect(sheet).toHaveAttribute('aria-hidden', 'true');

    await user.click(firstDayCell(container));
    expect(screen.getByRole('dialog', { name: '선택한 날짜 일정' })).toHaveAttribute('data-open', 'true');

    await user.keyboard('{Escape}');
    expect(sheet).toHaveAttribute('data-open', 'false');
    expect(sheet).toHaveAttribute('aria-hidden', 'true');
  });

  it('닫기 버튼으로도 닫힌다', async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar();
    const sheet = screen.getByRole('dialog', { hidden: true });
    expect(sheet).toHaveAttribute('aria-label', '선택한 날짜 일정');

    await user.click(firstDayCell(container));
    expect(sheet).toHaveAttribute('data-open', 'true');

    await user.click(screen.getByRole('button', { name: '일정 닫기' }));
    expect(sheet).toHaveAttribute('data-open', 'false');
    expect(sheet).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('캘린더 날짜 시트 — 백드롭이 상단바를 덮는다', () => {
  it('백드롭은 z-50 이고 패널 바로 앞 형제다(문서 순서로 상단바 위·패널 아래)', async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar();
    await user.click(firstDayCell(container));

    const sheet = screen.getByRole('dialog', { name: '선택한 날짜 일정' });
    const backdrop = sheet.previousElementSibling;
    expect(backdrop).toHaveClass('fixed', 'inset-0', 'z-50', 'md:hidden');

    // 백드롭을 누르면 닫힌다.
    if (!(backdrop instanceof HTMLElement)) throw new Error('expected a backdrop element');
    await user.click(backdrop);
    expect(sheet).toHaveAttribute('data-open', 'false');
  });
});

describe('캘린더 날짜 시트 — 아래로 스와이프해 닫기', () => {
  const SHEET_HEIGHT = 400;

  async function openSheet() {
    const user = userEvent.setup();
    const { container } = renderCalendar();
    await user.click(firstDayCell(container));
    const sheet = screen.getByRole('dialog', { name: '선택한 날짜 일정' });
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({
      width: 390, height: SHEET_HEIGHT, top: 0, left: 0, right: 390, bottom: SHEET_HEIGHT, x: 0, y: 0,
      toJSON: () => ({}),
    });
    return sheet;
  }

  /** 핸들 영역(y=10)에서 시작해 천천히 200px 내린다 — 400px 의 25% 이상이라 거리로 닫히는 제스처. */
  function dragDown(sheet: HTMLElement) {
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 30 });
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 210 });
  }

  it('모바일에서는 끌어내리는 동안 따라오고, 놓으면 닫히며 인라인 transform 을 비운다', async () => {
    sheetViewport = true;
    const sheet = await openSheet();

    dragDown(sheet);
    expect(sheet.style.transform).toBe('translateY(200px)');
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 100, clientY: 210 });

    expect(sheet).toHaveAttribute('data-open', 'false');
    // 인라인 값이 남으면 CSS 의 닫힘 위치(translateY(110%))를 덮어 시트가 중간에 멈춘다.
    expect(sheet.style.transform).toBe('');
    expect(sheet.style.transition).toBe('');
  });

  it('조금 끌다 놓은 직후(스냅백 중) 백드롭으로 닫아도 인라인 transition 이 남지 않는다', async () => {
    sheetViewport = true;
    const sheet = await openSheet();

    // 속도 판정이 플릭으로 닫지 않게 시각을 고정해 천천히(1초에 걸쳐) 끈다.
    let currentTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
    fireEvent.pointerDown(sheet, { pointerId: 1, clientX: 100, clientY: 10 });
    currentTime = 500;
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 25 });
    currentTime = 1000;
    fireEvent.pointerMove(sheet, { pointerId: 1, clientX: 100, clientY: 40 });
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 100, clientY: 40 });
    // 30px 는 25% 미만이라 스냅백 — 200ms 전이가 인라인으로 걸려 있다.
    expect(sheet.style.transition).not.toBe('');

    const backdrop = sheet.previousElementSibling;
    if (!(backdrop instanceof HTMLElement)) throw new Error('expected a backdrop element');
    // 드래그 직후 같은 태스크의 click 은 클릭 가드가 삼킨다(setTimeout(0) 에 해제) — 한 틱 흘린 뒤의 탭.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(backdrop);

    expect(sheet).toHaveAttribute('data-open', 'false');
    expect(sheet.style.transition).toBe('');
  });

  it('데스크탑 사이드 패널은 드래그해도 움직이지도 닫히지도 않는다', async () => {
    const sheet = await openSheet();

    dragDown(sheet);
    fireEvent.pointerUp(sheet, { pointerId: 1, clientX: 100, clientY: 210 });

    expect(sheet.style.transform).not.toContain('translateY');
    expect(sheet).toHaveAttribute('data-open', 'true');
  });
});
