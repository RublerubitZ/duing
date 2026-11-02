import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminWeeklyFacilityHeatmap } from '@duing/types';

import { FacilityHeatmap } from '@/app/admin/weekly-briefing/_components/FacilityHeatmap';

const HEATMAP: AdminWeeklyFacilityHeatmap = {
  facilities: [
    { facilityId: 1, roomName: '학생회관 강당', sortOrder: 1, occupiedSlotCounts: [0, 2, 5, 0, 8, 13, 0] },
    { facilityId: 2, roomName: '세미나실', sortOrder: 2, occupiedSlotCounts: [0, 0, 0, 0, 0, 0, 0] },
    { facilityId: 3, roomName: '동아리방 A', sortOrder: 3, occupiedSlotCounts: [0, 0, 0, 0, 0, 0, 0] },
  ],
  currentMonthCrawledAt: '2026-11-05T00:00:00Z',
};
let heatmapStatus = 200;
const server = setupServer(
  http.get('*/admin/weekly-briefing/facility-heatmap', () =>
    heatmapStatus === 200
      ? HttpResponse.json({ ok: true, message: null, data: HEATMAP })
      : HttpResponse.json({ ok: false, message: '주입한 실패', data: null }, { status: heatmapStatus }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  heatmapStatus = 200;
});
afterAll(() => server.close());

function renderHeatmap(props: { weekStart: string; todayIso: string; caption: string; isThisWeek: boolean }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientProvider>
  );
  return render(<FacilityHeatmap {...props} />, { wrapper });
}

const THIS_WEEK = { weekStart: '2026-11-02', todayIso: '2026-11-05', caption: '이번 주 시설별 하루 예약 시간 (11월 2일 – 8일)', isThisWeek: true };
const LAST_WEEK = { weekStart: '2026-10-26', todayIso: '2026-11-05', caption: '지난주 시설별 하루 예약 시간 (10월 26일 – 11월 1일)', isThisWeek: false };

describe('FacilityHeatmap', () => {
  it('표는 caption·열/행 머리를 갖고, 좁은 폭 스크롤 상자는 이름 있는 포커스 가능한 영역이며 범례·출처를 보이는 글로 쓴다', async () => {
    renderHeatmap(LAST_WEEK);

    const region = await screen.findByRole('region', { name: LAST_WEEK.caption });
    expect(region).toHaveAttribute('tabindex', '0');
    // 제목은 같은 구역의 형제 블록('한 주 요약' 등)과 같은 h3 — 제목으로 건너 다닐 때 히트맵도 잡힌다.
    expect(screen.getByRole('heading', { level: 3, name: LAST_WEEK.caption })).toBeInTheDocument();
    const table = within(region).getByRole('table', { name: LAST_WEEK.caption });
    // 지난주 표는 오늘·지난 날 구분이 없다 — 머리는 모두 머리 행 기본색이다.
    expect(within(table).getByRole('columnheader', { name: '10월 26일 월요일' })).not.toHaveClass('text-charcoal');
    expect(within(table).getByRole('rowheader', { name: '학생회관 강당' })).toHaveClass('sticky');
    expect(within(table).getByText('13')).toHaveClass('bg-ink-soft');
    expect(screen.getByText('숫자는 그날 예약이 걸친 시간 칸 수(9시~22시, 1시간 칸), 색이 진할수록 많음')).toBeInTheDocument();
    expect(screen.getByText('두잉에서 승인·확정한 예약 + 학교 시설 일정(같은 시간은 한 번만). 검토 중인 신청은 빼요.')).toBeInTheDocument();
    expect(table.querySelectorAll('[title]')).toHaveLength(0);
  });

  it('그 주 내내 0 인 시설은 접고 "예약 없는 시설 N곳은 뺐어요" 를 쓰며, 인쇄에서 숨는 모두 보기를 누르면 펼친다', async () => {
    const user = userEvent.setup();
    renderHeatmap(LAST_WEEK);

    await screen.findByRole('region', { name: LAST_WEEK.caption });
    expect(screen.queryByRole('rowheader', { name: '세미나실' })).toBeNull();
    expect(screen.getByText(/예약 없는 시설 2곳은 뺐어요/)).toBeInTheDocument();
    const showAll = screen.getByRole('button', { name: '모두 보기' });
    expect(showAll).toHaveClass('no-print');
    await user.click(showAll);
    expect(screen.getByRole('rowheader', { name: '세미나실' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '동아리방 A' })).toBeInTheDocument();
  });

  it('지난주가 지난달에 걸치면 지난달 일정 안내를 쓰고 수집 시각은 쓰지 않는다', async () => {
    renderHeatmap(LAST_WEEK);

    await screen.findByRole('region', { name: LAST_WEEK.caption });
    expect(screen.getByText('지난달 학교 일정은 그 뒤 바뀐 내용이 반영되지 않았을 수 있어요. 보관한 시설은 빠져요.')).toBeInTheDocument();
    expect(screen.queryByText(/학교 일정 .* 기준/)).toBeNull();
  });

  it('이번 주 표는 오늘 열에 "오늘"을 쓰고 지난 날을 흐리게 하며 이번 달 수집 시각을 함께 쓴다', async () => {
    renderHeatmap(THIS_WEEK);

    const table = within(await screen.findByRole('table', { name: THIS_WEEK.caption }));
    const todayHeader = table.getByRole('columnheader', { name: '11월 5일 목요일 오늘' });
    expect(todayHeader).toHaveTextContent('오늘');
    // 흐림은 대비 차로 — 오늘·남은 날 머리만 진하게(charcoal 12.65:1), 지난 날은 머리 행 기본색(charcoal-3 6.10:1). 둘 다 AA.
    expect(table.getByRole('columnheader', { name: '11월 2일 월요일' })).not.toHaveClass('text-charcoal');
    expect(todayHeader).toHaveClass('text-charcoal');
    expect(table.getByRole('columnheader', { name: '11월 8일 일요일' })).toHaveClass('text-charcoal');
    expect(screen.getByText('학교 일정 11월 5일 오전 9:00 기준')).toBeInTheDocument();
    expect(screen.queryByText(/지난달 학교 일정/)).toBeNull();
  });

  it('히트맵 조회가 실패하면(옛 백엔드 404) 그 자리만 실패 문장과 다시 시도를 보인다', async () => {
    heatmapStatus = 404;
    renderHeatmap(LAST_WEEK);

    expect(await screen.findByText('시설 예약 시간을 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: LAST_WEEK.caption })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('스크롤 상자는 relative 다 — 열 머리 sr-only(절대 위치)가 상자 밖 조상을 기준으로 그려져 768·390 폭 문서가 가로로 넘치던 것을 막는다(jsdom 은 배치를 못 재 클래스로 고정)', async () => {
    renderHeatmap(LAST_WEEK);

    expect(await screen.findByRole('region', { name: LAST_WEEK.caption })).toHaveClass('relative', 'overflow-x-auto');
  });

  it('첫 열(머리·행 머리)은 좁은 폭에서 폭을 7.5rem 으로 묶고 줄을 바꾼다 — 긴 시설 이름이 sticky 첫 열로 390 폭 스크롤 상자를 다 덮어 숫자 칸이 안 보이던 것을 막는다. lg·인쇄는 auto 그대로', async () => {
    renderHeatmap(LAST_WEEK);

    const table = within(await screen.findByRole('table', { name: LAST_WEEK.caption }));
    const firstColumnCells = [table.getByRole('columnheader', { name: '시설' }), table.getByRole('rowheader', { name: '학생회관 강당' })];
    for (const cell of firstColumnCells) {
      expect(cell).toHaveClass('sticky', 'w-[7.5rem]', 'max-w-[7.5rem]', '[overflow-wrap:anywhere]', 'lg:w-auto', 'lg:max-w-none', 'print:w-auto');
    }
    expect(firstColumnCells[1]).toHaveClass('break-keep');
  });
});
