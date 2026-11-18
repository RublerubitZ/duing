import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AdminClosingRecruitments, GlobalEventCard } from '@duing/types';

import { ThisWeekSection } from '@/app/admin/weekly-briefing/_components/ThisWeekSection';

import { NOW_ISO } from './weeklyBriefing.data';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const CLOSING: AdminClosingRecruitments = {
  weekStart: '2026-11-02',
  recruitments: [
    { recruitmentId: 41, title: '2학기 신입 모집', clubId: 7, clubName: '두잉밴드', endDate: '2026-11-03', status: 'OPEN', displayStatus: 'CLOSED', applicationMode: 'SELF', undecidedApplicationCount: 3 },
    { recruitmentId: 42, title: '운영진 모집', clubId: 8, clubName: '사진부', endDate: '2026-11-06', status: 'OPEN', displayStatus: 'OPEN', applicationMode: 'SELF', undecidedApplicationCount: 0 },
    { recruitmentId: 43, title: '외부 폼 모집', clubId: 9, clubName: '연극부', endDate: '2026-11-08', status: 'OPEN', displayStatus: 'OPEN', applicationMode: 'EXTERNAL', undecidedApplicationCount: null },
  ],
};
const EVENTS: GlobalEventCard[] = [
  { id: 1, title: '총동연 정기 총회', startAt: '2026-11-05T10:00:00', endAt: '2026-11-07T18:00:00', location: null, category: 'FESTIVAL' },
];

let closing: AdminClosingRecruitments = CLOSING;
let closingStatus = 200;
let events: GlobalEventCard[] = EVENTS;
const heatmapWeeks: string[] = [];
const eventParams: string[] = [];
let closingRequests = 0;

const server = setupServer(
  http.get('*/admin/weekly-briefing/closing-recruitments', () => {
    closingRequests += 1;
    return closingStatus === 200
      ? HttpResponse.json({ ok: true, message: null, data: closing })
      : HttpResponse.json({ ok: false, message: '주입한 실패', data: null }, { status: closingStatus });
  }),
  http.get('*/admin/weekly-briefing/facility-heatmap', ({ request }) => {
    heatmapWeeks.push(new URL(request.url).searchParams.get('weekStart') ?? '');
    // 예약이 있는 시설이 하나는 있어야 표를 그린다(0개면 "등록된 시설이 없어요", 모두 0 이면 "이 주에는 예약이 없어요" 한 줄).
    return HttpResponse.json({
      ok: true,
      message: null,
      data: { facilities: [{ facilityId: 1, roomName: '학생회관 강당', sortOrder: 1, occupiedSlotCounts: [0, 2, 0, 0, 0, 0, 0] }], currentMonthCrawledAt: null },
    });
  }),
  http.get('*/global-events', ({ request }) => {
    const url = new URL(request.url);
    eventParams.push(`${url.searchParams.get('from')}~${url.searchParams.get('to')}`);
    return HttpResponse.json({ ok: true, message: null, data: events });
  }),
  http.get('*/admin/facility-bookings/summary', () =>
    HttpResponse.json({ ok: true, message: null, data: { approvedWaitingCount: 2, oldestApprovedWaitingDays: 3 } }),
  ),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_ISO));
  closing = CLOSING;
  closingStatus = 200;
  events = EVENTS;
  heatmapWeeks.length = 0;
  eventParams.length = 0;
  closingRequests = 0;
});
afterEach(() => {
  vi.useRealTimers();
  server.resetHandlers();
});
afterAll(() => server.close());

type SectionProps = Parameters<typeof ThisWeekSection>[0];
function renderSection(overrides: Partial<SectionProps> = {}) {
  const props: SectionProps = {
    isLatestWeek: true,
    latestWeek: '2026-10-26',
    currentMonday: '2026-11-02',
    todayIso: '2026-11-05',
    onBackToLatest: vi.fn(),
    ...overrides,
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ThisWeekSection {...props} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
  return props;
}

describe('ThisWeekSection', () => {
  it('Review Focus 2 — 기기 날짜가 다음 주여도 구역 머리 기간과 이번 주 히트맵은 서버가 정한 주를 따른다', async () => {
    renderSection({ currentMonday: '2026-11-09', todayIso: '2026-11-09' });

    expect(await screen.findByText('11월 2일(월) – 8일(일) · 지금 기준 11월 5일 오후 2:05')).toBeInTheDocument();
    // 표는 응답을 받은 뒤에만 그려진다 — 요청 주를 단정하기 전에 표를 기다린다.
    expect(await screen.findByRole('table', { name: '이번 주 시설별 하루 예약 시간 (11월 2일 – 8일)' })).toBeInTheDocument();
    expect(heatmapWeeks).toEqual(['2026-11-02']);
  });

  it('m2 — 서버의 이번 주가 화면이 아는 이번 주(지난주 + 7일)와 다르면(열어 둔 탭이 월요일 0시를 넘김·기기 시계가 늦음) 구역 머리 아래 안내를 두고, 같으면 두지 않는다', async () => {
    renderSection();
    expect(await screen.findByText('11월 2일(월) – 8일(일) · 지금 기준 11월 5일 오후 2:05')).toBeInTheDocument();
    expect(screen.queryByText('위 한 주 돌아보기와 기준 날짜가 달라요. 새로 고침하거나 기기 날짜를 확인해 주세요.')).toBeNull();
    cleanup();

    closing = { ...CLOSING, weekStart: '2026-11-09' };
    renderSection();
    expect(await screen.findByText('11월 9일(월) – 15일(일) · 지금 기준 11월 5일 오후 2:05')).toBeInTheDocument();
    const notice = screen.getByText('위 한 주 돌아보기와 기준 날짜가 달라요. 새로 고침하거나 기기 날짜를 확인해 주세요.');
    // 인쇄물에서도 두 구역의 기간이 어긋난 이유가 되도록 인쇄에서 숨기지 않는다.
    expect(notice.closest('.no-print')).toBeNull();
  });

  it('기간 끝나는 모집 — 행 전체가 모집 상세 링크이고, 기간이 지난 모집(서버 displayStatus CLOSED)은 "기간 종료" 칩, 외부 폼은 "외부 폼"으로 쓴다', async () => {
    renderSection();

    const list = within(await screen.findByRole('region', { name: '이번 주 모집 기간이 끝나는 모집' }));
    const ended = list.getByRole('link', { name: /두잉밴드 · 2학기 신입 모집/ });
    expect(ended).toHaveAttribute('href', '/admin/recruitments/41');
    expect(within(ended).getByText('기간 종료')).toBeInTheDocument();
    expect(within(ended).getByText('11월 3일 종료')).toBeInTheDocument();
    expect(within(ended).getByText('결과 안 정한 지원 3건')).toBeInTheDocument();
    const upcoming = list.getByRole('link', { name: /사진부 · 운영진 모집/ });
    expect(within(upcoming).queryByText('기간 종료')).toBeNull();
    expect(within(upcoming).getByText('11월 6일(금) 종료')).toBeInTheDocument();
    expect(within(list.getByRole('link', { name: /연극부 · 외부 폼 모집/ })).getByText('외부 폼')).toBeInTheDocument();
  });

  it('Review Focus 2 — "기간 종료" 칩과 종료일 문구는 기기 날짜가 아니라 서버 displayStatus 를 따른다', async () => {
    closing = {
      weekStart: '2026-11-02',
      recruitments: [
        // 기기 날짜(11/5)로는 지났지만 서버는 아직 기간 안이라고 본다 — 칩 없음, 요일까지
        { recruitmentId: 51, title: '기기로는 지난 모집', clubId: 7, clubName: '두잉밴드', endDate: '2026-11-03', status: 'OPEN', displayStatus: 'OPEN', applicationMode: 'SELF', undecidedApplicationCount: 1 },
        // 기기 날짜로는 남았지만 서버는 기간이 지났다고 본다 — 칩, 날짜만
        { recruitmentId: 52, title: '기기로는 남은 모집', clubId: 8, clubName: '사진부', endDate: '2026-11-06', status: 'OPEN', displayStatus: 'CLOSED', applicationMode: 'SELF', undecidedApplicationCount: 2 },
      ],
    };
    renderSection();

    const list = within(await screen.findByRole('region', { name: '이번 주 모집 기간이 끝나는 모집' }));
    const serverOpen = list.getByRole('link', { name: /두잉밴드 · 기기로는 지난 모집/ });
    expect(within(serverOpen).queryByText('기간 종료')).toBeNull();
    expect(within(serverOpen).getByText('11월 3일(화) 종료')).toBeInTheDocument();
    const serverExpired = list.getByRole('link', { name: /사진부 · 기기로는 남은 모집/ });
    expect(within(serverExpired).getByText('기간 종료')).toBeInTheDocument();
    expect(within(serverExpired).getByText('11월 6일 종료')).toBeInTheDocument();
  });

  it('이번 주에 기간이 끝나는 모집이 없으면 빈 상태 한 줄을 쓴다', async () => {
    closing = { weekStart: '2026-11-02', recruitments: [] };
    renderSection();

    expect(await screen.findByText('이번 주에 모집 기간이 끝나는 모집이 없어요')).toBeInTheDocument();
  });

  it('다가오는 행사는 오늘 ~ 다음 주 일요일을 부르고, 여러 날 행사는 끝 날짜까지 쓰며, 관리 링크를 둔다', async () => {
    renderSection();

    const card = within(await screen.findByRole('region', { name: '다가오는 행사' }));
    expect(card.getByText('11월 5일 – 15일')).toBeInTheDocument();
    expect(await card.findByText('총동연 정기 총회')).toBeInTheDocument();
    expect(card.getByText('11월 5일(목) – 7일(토)')).toBeInTheDocument();
    expect(card.getByRole('link', { name: '글로벌 이벤트에서 관리' })).toHaveAttribute('href', '/admin/global-events');
    expect(eventParams).toEqual(['2026-11-05~2026-11-15']);
  });

  it('화면 이동 링크(행사 관리·시설 예약 관리)는 인쇄에서 숨는다', async () => {
    renderSection();

    expect(await screen.findByRole('link', { name: '글로벌 이벤트에서 관리' })).toHaveClass('no-print');
    expect(await screen.findByRole('link', { name: '시설 예약 관리' })).toHaveClass('no-print');
  });

  it('다음 주까지 행사가 없으면 빈 상태와 인쇄에서 숨는 행사 추가 링크를 둔다', async () => {
    events = [];
    renderSection();

    expect(await screen.findByText(/다음 주까지 잡힌 행사가 없어요/)).toBeInTheDocument();
    const addLink = screen.getByRole('link', { name: '행사 추가' });
    expect(addLink).toHaveAttribute('href', '/admin/global-events/new');
    expect(addLink).toHaveClass('no-print');
  });

  it('이번 주 모집 조회가 실패해도(옛 백엔드 404) 행사·학교 반영 대기 카드는 그대로 그린다', async () => {
    closingStatus = 404;
    renderSection();

    expect(await screen.findByText('이번 주 일정을 불러오지 못했어요')).toBeInTheDocument();
    expect(await screen.findByText('총동연 정기 총회')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '학교 반영 대기' })).toBeInTheDocument();
    expect(heatmapWeeks).toEqual([]);
  });

  it('가장 최근 주가 아니면 안내와 지난주로 돌아가기만 두고(인쇄에서 숨김) 이번 주 조회를 하지 않는다', async () => {
    const user = userEvent.setup();
    const props = renderSection({ isLatestWeek: false });

    const placeholder = screen.getByRole('region', { name: '이번 주 챙길 것' });
    expect(placeholder).toHaveClass('no-print');
    // 바로가기 대상 — 모바일 상단 고정 바를 비킨다(jsdom 은 레이아웃이 없어 클래스로 고정).
    expect(placeholder).toHaveClass('scroll-mt-16', 'md:scroll-mt-6');
    expect(within(placeholder).getByText('이번 주 일정은 지난주(10월 26일 – 11월 1일)를 볼 때 함께 보여요.')).toBeInTheDocument();
    await user.click(within(placeholder).getByRole('button', { name: '지난주로 돌아가기' }));
    expect(props.onBackToLatest).toHaveBeenCalledTimes(1);
    expect(closingRequests).toBe(0);
  });

  it('실제로 그린 둘째 구역만 인쇄에서 새 쪽으로 시작한다', async () => {
    renderSection();

    const section = await screen.findByRole('region', { name: '이번 주 챙길 것' });
    expect(section).toHaveClass('print:break-before-page');
    expect(section).not.toHaveClass('no-print');
    expect(section).toHaveClass('scroll-mt-16', 'md:scroll-mt-6');
  });

  it('둘째 구역의 두 카드는 인쇄에서 쪽 경계에 잘리지 않는다', async () => {
    renderSection();

    expect(await screen.findByRole('region', { name: '다가오는 행사' })).toHaveClass('print:break-inside-avoid');
    expect(screen.getByRole('heading', { name: '학교 반영 대기' }).closest('.print\\:break-inside-avoid')).not.toBeNull();
  });
});
