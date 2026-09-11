import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
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
