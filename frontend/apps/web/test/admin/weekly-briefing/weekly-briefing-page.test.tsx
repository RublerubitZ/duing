import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, adminQueryKeys } from '@duing/hooks';
import type { AdminWeeklyBriefing } from '@duing/types';

import { AdminWeeklyBriefingPage } from '@/app/admin/weekly-briefing/_pages/AdminWeeklyBriefingPage';

import { NOW_ISO, OCTOBER_19, OCTOBER_26, weeklyBriefingOf } from './weeklyBriefing.data';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
let currentSearch = '';
/** Next 는 내비게이션마다 라우터 트리를 새로 만들어 params 객체도 새것이 된다 — 같은 주소로 다시 들어온 것을 흉내 낼 때 바꾼다. */
let navigationParams = {};
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  useParams: () => navigationParams,
  usePathname: () => '/admin/weekly-briefing',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/* ── 주입 서버 ─────────────────────────────────────────────── */
type Gate = { week: string; promise: Promise<void>; release: () => void };
function gateFor(week: string): Gate {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { week, promise, release };
}

const briefings = new Map<string, AdminWeeklyBriefing>();
const failures = new Map<string, { status: number; code?: string }>();
let gates: Gate[] = [];
const requestedWeeks: string[] = [];
let heatmapGates: Gate[] = [];
const heatmapWeeks: string[] = [];

const server = setupServer(
  http.get('*/admin/weekly-briefing', async ({ request }) => {
    const weekStart = new URL(request.url).searchParams.get('weekStart') ?? '';
    requestedWeeks.push(weekStart);
    const gate = gates.find((candidate) => candidate.week === weekStart);
    if (gate) await gate.promise;
    const failure = failures.get(weekStart);
    if (failure) {
      return HttpResponse.json(
        { ok: false, message: '주입한 실패', data: null, ...(failure.code ? { code: failure.code } : {}) },
        { status: failure.status },
      );
    }
    return HttpResponse.json({ ok: true, message: null, data: briefings.get(weekStart) ?? weeklyBriefingOf() });
  }),
  http.get('*/admin/weekly-briefing/facility-heatmap', async ({ request }) => {
    const weekStart = new URL(request.url).searchParams.get('weekStart') ?? '';
    heatmapWeeks.push(weekStart);
    const heatmapGate = heatmapGates.find((candidate) => candidate.week === weekStart);
    if (heatmapGate) await heatmapGate.promise;
    return HttpResponse.json({
      ok: true,
      message: null,
      data: { facilities: [{ facilityId: 1, roomName: '학생회관 강당', sortOrder: 1, occupiedSlotCounts: [0, 2, 0, 0, 0, 0, 0] }], currentMonthCrawledAt: null },
    });
  }),
);
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const spyOnReplaceState = () => vi.spyOn(window.history, 'replaceState');
let replaceStateSpy: ReturnType<typeof spyOnReplaceState>;
const spyOnPrint = () => vi.spyOn(window, 'print').mockImplementation(() => {});
let printSpy: ReturnType<typeof spyOnPrint>;
const replacedUrls = () => replaceStateSpy.mock.calls.map((call) => String(call[2]));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_ISO));
  window.history.replaceState(null, '', '/admin/weekly-briefing');
  replaceStateSpy = spyOnReplaceState();
  printSpy = spyOnPrint();
  mockReplace.mockReset();
  currentSearch = '';
  navigationParams = {};
  briefings.clear();
  failures.clear();
  gates = [];
  requestedWeeks.length = 0;
  heatmapGates = [];
  heatmapWeeks.length = 0;
  briefings.set('2026-10-26', OCTOBER_26);
  briefings.set('2026-10-19', OCTOBER_19);
});
afterEach(() => {
  vi.useRealTimers();
  replaceStateSpy.mockRestore();
  printSpy.mockRestore();
  server.resetHandlers();
});
afterAll(() => server.close());

function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiClientProvider>
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const view = render(
    <Providers client={queryClient}>
      <AdminWeeklyBriefingPage />
    </Providers>,
  );
  const rerenderPage = () =>
    view.rerender(
      <Providers client={queryClient}>
        <AdminWeeklyBriefingPage />
      </Providers>,
    );
  return { ...view, rerenderPage, queryClient };
}

const findFlowTable = () => screen.findByRole('table', { name: '업무 접수·처리' });
/** 행 머리가 든 행 — as 단언 대신 없으면 바로 실패시킨다. */
const rowOf = (rowHeader: HTMLElement) => {
  const row = rowHeader.closest('tr');
  if (!row) throw new Error('행 머리가 표 행 안에 없다');
  return within(row);
};

describe('AdminWeeklyBriefingPage — 주 넘기기', () => {
  it('week 없이 들어오면 가장 최근에 끝난 주로 주소를 정리하고(기록을 쌓지 않음) 기간과 "지난주" 꼬리표를 보인다', async () => {
    renderPage();

    expect(await screen.findByText('10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
    expect(screen.getByText('지난주')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-10-26']);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('정리한 뒤 같은 메뉴(week 없는 주소)로 다시 들어와 Next 가 주소에서 week 를 빼면, 검색 파라미터가 그대로여도 다시 정리한다', async () => {
    const view = renderPage();
    expect(await screen.findByText('10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-10-26']);

    // 사이드바 '주간 브리핑' 재클릭 — Next 는 자기가 아는 주소(week 없음)를 기록에 쓰고 새 트리로 다시 그린다. useSearchParams 는 그대로 비어 있다.
    window.history.pushState(null, '', '/admin/weekly-briefing');
    navigationParams = {};
    view.rerenderPage();

    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-10-26', '/admin/weekly-briefing?week=2026-10-26']);
    expect(window.location.search).toBe('?week=2026-10-26');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('월요일이 아닌 날은 그 주 월요일로 맞추고 알림을 주지 않는다', async () => {
    currentSearch = 'week=2026-10-28';
    renderPage();

    expect(await screen.findByText('10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-10-26']);
    expect(screen.queryByText(/아직 끝나지 않아/)).toBeNull();
  });

  it('진행 중인 주 주소(일요일 밤에 복사한 주소를 월요일에 연 경우)는 지난주로 바꾸고 한 줄 알림을 준다', async () => {
    currentSearch = 'week=2026-11-04';
    renderPage();

    expect(await screen.findByText('11월 2일 주는 아직 끝나지 않아 지난주를 보여 드려요.')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-10-26']);
  });

  it('1년보다 이른 주는 지난주로 바꾸고 알리고, 날짜로 읽히지 않는 값은 알림 없이 지난주다', async () => {
    currentSearch = 'week=2025-10-27';
    const tooOld = renderPage();
    expect(await screen.findByText('1년 전까지만 볼 수 있어요.')).toBeInTheDocument();
    tooOld.unmount();

    currentSearch = 'week=2026-02-30';
    renderPage();
    expect(await screen.findByText('10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
    expect(screen.queryByText('1년 전까지만 볼 수 있어요.')).toBeNull();
  });

  it('가장 최근 주에서 다음 주 버튼은 aria-disabled 라 눌러도 움직이지 않고 포커스를 지키며, 이전 주 버튼은 갈 기간을 이름에 담아 기록 없이 이동한다', async () => {
    const user = userEvent.setup();
    currentSearch = 'week=2026-10-26';
    renderPage();

    const nextButton = await screen.findByRole('button', { name: '다음 주 보기, 11월 2일 – 8일' });
    expect(nextButton).toHaveAttribute('aria-disabled', 'true');
    expect(nextButton).not.toBeDisabled();
    await user.click(nextButton);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(nextButton).toHaveFocus();
    expect(screen.getByText('이번 주는 11월 9일(월)부터 볼 수 있어요')).toBeInTheDocument();
    expect(nextButton).toHaveAccessibleDescription('이번 주는 11월 9일(월)부터 볼 수 있어요');
    expect(screen.getByRole('button', { name: /^이전 주 보기/ })).not.toHaveAttribute('aria-describedby');

    await user.click(screen.getByRole('button', { name: '이전 주 보기, 10월 19일 – 25일' }));
    expect(mockReplace).toHaveBeenCalledWith('/admin/weekly-briefing?week=2026-10-19', { scroll: false });
  });

  it('가장 이른 주(52주 전)에서는 이전 주 버튼이 aria-disabled 이고 전 주를 부르지 않으며 비교 없이 요약한다', async () => {
    currentSearch = 'week=2025-11-03';
    renderPage();

    await findFlowTable();
    expect(screen.getByText('2025년 11월 3일(월) – 9일(일)')).toBeInTheDocument();
    const previousButton = screen.getByRole('button', { name: '이전 주 보기, 2025년 10월 27일 – 11월 2일' });
    expect(previousButton).toHaveAttribute('aria-disabled', 'true');
    expect(previousButton).toHaveAccessibleDescription('1년 전까지만 볼 수 있어요');
    expect(requestedWeeks).not.toContain('2025-10-27');
    expect(screen.getByText('11월 9일(일) 밤 남은 처리 대기는 28건이에요.')).toBeInTheDocument();
  });

  it('주를 바꾸면 새 기간 제목 아래 이전 주 숫자를 남기지 않고 불러오는 중을 그린다(placeholder 없음)', async () => {
    currentSearch = 'week=2026-10-26';
    const view = renderPage();
    await findFlowTable();

    const gate = gateFor('2026-10-12');
    gates = [gate];
    currentSearch = 'week=2026-10-12';
    view.rerenderPage();

    expect(screen.getByText('10월 12일(월) – 18일(일)')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '업무 접수·처리' })).toBeNull();
    expect(screen.getByRole('status', { name: '이 주 지표 불러오는 중' })).toBeInTheDocument();
    gate.release();
    expect(await findFlowTable()).toBeInTheDocument();
  });

  it('Review Focus 5 — 주 버튼을 연타해 앞 주 응답이 늦게 와도 마지막으로 고른 주의 숫자만 보인다', async () => {
    const user = userEvent.setup();
    briefings.set('2026-10-12', weeklyBriefingOf({ federationNoticeCount: 5 }));
    currentSearch = 'week=2026-10-12';
    const view = renderPage();
    await findFlowTable();

    const gate = gateFor('2026-10-19');
    gates = [gate];
    await user.click(screen.getByRole('button', { name: /^다음 주 보기/ }));
    currentSearch = 'week=2026-10-19';
    view.rerenderPage();
    await user.click(screen.getByRole('button', { name: /^다음 주 보기/ }));
    currentSearch = 'week=2026-10-26';
    view.rerenderPage();
    expect(mockReplace.mock.calls.map((call) => call[0])).toEqual([
      '/admin/weekly-briefing?week=2026-10-19',
      '/admin/weekly-briefing?week=2026-10-26',
    ]);

    gate.release();
    const noticeCard = within(await screen.findByRole('region', { name: '공지·정보 확인' }));
    expect(noticeCard.getByText('1건')).toBeInTheDocument();
    expect(noticeCard.queryByText('9건')).toBeNull();
    expect(screen.getByText('10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
  });

  it('Review Focus 1 — 기기 시계가 한 주 앞서 서버가 WEEK_NOT_ENDED 를 주면 한 주 물러서 그 주를 지난주로 보인다', async () => {
    vi.setSystemTime(new Date('2026-11-09T05:05:00Z')); // 기기: 11/9(월) — 서버는 아직 11/2 주가 진행 중
    failures.set('2026-11-02', { status: 400, code: 'WEEK_NOT_ENDED' });
    renderPage();

    expect(await findFlowTable()).toBeInTheDocument();
    expect(screen.getByText('10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
    expect(screen.getByText('지난주')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-11-02', '/admin/weekly-briefing?week=2026-10-26']);
  });

  it('Review Focus 1 — 물러선 주도 WEEK_NOT_ENDED 면 다시 물러서지 않고 구역 실패로 멈춘다', async () => {
    vi.setSystemTime(new Date('2026-11-09T05:05:00Z'));
    failures.set('2026-11-02', { status: 400, code: 'WEEK_NOT_ENDED' });
    failures.set('2026-10-26', { status: 400, code: 'WEEK_NOT_ENDED' });
    renderPage();

    expect(await screen.findByText('이 주 지표를 불러오지 못했어요')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-11-02', '/admin/weekly-briefing?week=2026-10-26']);
  });

  it.each(['WEEK_NOT_MONDAY', 'WEEK_IN_FUTURE', 'WEEK_TOO_OLD'])('WEEK_NOT_ENDED 가 아닌 400(%s)은 물러서지 않고 구역 실패로 보인다', async (code) => {
    vi.setSystemTime(new Date('2026-11-09T05:05:00Z'));
    failures.set('2026-11-02', { status: 400, code });
    renderPage();

    expect(await screen.findByText('이 주 지표를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByText('11월 2일(월) – 8일(일)')).toBeInTheDocument();
    expect(replacedUrls()).toEqual(['/admin/weekly-briefing?week=2026-11-02']);
  });
});

describe('AdminWeeklyBriefingPage — 한 주 돌아보기', () => {
  it('한 주 요약은 네 문장을 순서대로 보인다', async () => {
    currentSearch = 'week=2026-10-26';
    renderPage();

    const summary = within(await screen.findByRole('region', { name: '한 주 요약' }));
    expect(summary.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '11월 1일(일) 밤 남은 처리 대기는 28건으로, 전 주보다 6건 늘었어요.',
      '시설 예약이 14건으로 가장 많이 접수됐어요.',
      '모집 3건이 새로 등록되고 2건의 모집 기간이 끝났어요. 지원서는 142건이에요(전 주보다 20건 늘었어요).',
      '1:1 문의는 9건 접수, 4건 처리했어요. 첫 답변까지 평균 43시간이에요.',
    ]);
  });

  it('업무 표 — 8줄 이름은 홈 라벨, 합계는 기록 합계, 증감은 중립 표기와 스크린리더 문장, 그 밖의 대기는 접수·처리를 세지 않는다', async () => {
    currentSearch = 'week=2026-10-26';
    renderPage();

    const table = within(await findFlowTable());
    for (const name of ['신고', '1:1 문의', '시설 예약', '홍보 요청', '회장 승계', '동아리 승인', '미처리 지원 모집', '운영 중단 미결', '합계']) {
      expect(table.getByRole('rowheader', { name })).toBeInTheDocument();
    }
    const totalRow = rowOf(table.getByRole('rowheader', { name: '합계' }));
    expect(totalRow.getByText('28')).toBeInTheDocument();
    expect(totalRow.getByText('+6')).toBeInTheDocument();
    expect(totalRow.getByText('전 주보다 6건 많음')).toBeInTheDocument();
    const reportRow = rowOf(table.getByRole('rowheader', { name: '신고' }));
    expect(reportRow.getAllByText('+1')).toHaveLength(2); // 접수 4 vs 3, 남은 대기 3 vs 2
    expect(reportRow.getByText('−1')).toBeInTheDocument(); // 처리 2 vs 3
    const clubApprovalRow = rowOf(table.getByRole('rowheader', { name: '동아리 승인' }));
    expect(clubApprovalRow.getAllByText('세지 않음')).toHaveLength(2);
    expect(screen.getByText('첫 답변까지 평균 43시간 (답변 4건 기준)')).toBeInTheDocument();
    expect(screen.getByText("접수·처리는 월요일 0시~일요일 24시에 일어난 건만 세요(홈 '최근 7일'과 다를 수 있어요).")).toBeInTheDocument();
  });

  it('업무 다섯 줄의 주 끝 남은 대기 칸은 각자 응답의 해당 키 값을 보인다(값을 서로 다르게 주어 연결을 단정)', async () => {
    briefings.set(
      '2026-10-26',
      weeklyBriefingOf({
        endPending: {
          clubApproval: 3,
          facilityBooking: 53,
          inquiryUnanswered: 52,
          promotionRequest: 54,
          reportUnresolved: 51,
          leaderSuccession: 55,
          stalePendingRecruitment: 2,
          inactiveClubPending: 1,
          totalPendingCount: 271,
        },
      }),
    );
    currentSearch = 'week=2026-10-26';
    renderPage();

    const table = within(await findFlowTable());
    for (const [name, value] of [['신고', 51], ['1:1 문의', 52], ['시설 예약', 53], ['홍보 요청', 54], ['회장 승계', 55]] as const) {
      const endPendingCell = rowOf(table.getByRole('rowheader', { name })).getAllByRole('cell').at(-1);
      expect(endPendingCell).toHaveTextContent(new RegExp(`^${value}(?!\\d)`));
    }
  });

  it('일요일 기록이 없으면 남은 대기 열·그 밖의 대기·합계를 빼고 이유 한 줄을 쓴다', async () => {
    briefings.set('2026-10-26', weeklyBriefingOf({ endPending: null, pendingRecordStartedOn: null }));
    currentSearch = 'week=2026-10-26';
    renderPage();

    const table = within(await findFlowTable());
    expect(table.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['업무', '접수', '처리']);
    expect(table.queryByRole('rowheader', { name: '합계' })).toBeNull();
    expect(table.queryByRole('rowheader', { name: '동아리 승인' })).toBeNull();
    expect(screen.getByText('주 끝 남은 대기는 아직 기록이 없어요.')).toBeInTheDocument();
  });

  it('정보 확인 기능이 생기기 전 주는 숫자 대신 "—" 를 쓰고 이유를 스크린리더에 남긴다', async () => {
    currentSearch = 'week=2026-10-12';
    renderPage();

    const card = within(await screen.findByRole('region', { name: '공지·정보 확인' }));
    expect(card.getByText('이 기능이 생기기 전이에요')).toBeInTheDocument();
    expect(card.queryByText('37명')).toBeNull();
    const profileCheckLink = card.getByRole('link', { name: '정보 확인 팝업' });
    expect(profileCheckLink).toHaveAttribute('href', '/admin/profile-check');
    expect(profileCheckLink.closest('.no-print')).not.toBeNull();
  });

  it('전 주 조회가 실패하면 요약 위에 한 줄 알림과 다시 시도를 두고 비교를 뺀다', async () => {
    failures.set('2026-10-19', { status: 500 });
    currentSearch = 'week=2026-10-26';
    renderPage();

    // 500 은 전역 정책대로 한 번 다시 받는다(약 1초)
    expect(await screen.findByText('전 주 숫자를 불러오지 못해 비교를 뺐어요.', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('11월 1일(일) 밤 남은 처리 대기는 28건이에요.')).toBeInTheDocument();
    expect(screen.queryByText(/전 주보다/)).toBeNull();
  });

  it('받아 둔 전 주를 다시 받다 실패하면 갖고 있던 비교를 그대로 쓰고 "비교를 뺐어요" 알림을 내지 않는다', async () => {
    currentSearch = 'week=2026-10-26';
    const { queryClient } = renderPage();
    const comparedSentence = '11월 1일(일) 밤 남은 처리 대기는 28건으로, 전 주보다 6건 늘었어요.';
    expect(await screen.findByText(comparedSentence)).toBeInTheDocument();

    failures.set('2026-10-19', { status: 500 });
    // 500 은 전역 정책대로 한 번 다시 받는다(약 1초) — 끝나면 오류 상태지만 받아 둔 전 주 데이터는 남는다
    await act(() => queryClient.refetchQueries({ queryKey: adminQueryKeys.weeklyBriefing('2026-10-19') }));
    expect(queryClient.getQueryState(adminQueryKeys.weeklyBriefing('2026-10-19'))).toMatchObject({ status: 'error' });
    // TanStack 은 옵저버 알림을 setTimeout(0) 으로 모아 보낸다 — 그 알림이 화면에 닿은 뒤에 본다
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    expect(screen.queryByText('전 주 숫자를 불러오지 못해 비교를 뺐어요.')).toBeNull();
    expect(screen.getByText(comparedSentence)).toBeInTheDocument();
  });

  it('이 주 조회가 실패하면(옛 백엔드 404 포함) 구역 실패 문장과 인쇄에서 숨는 다시 시도를 보이고 페이지 머리는 남는다', async () => {
    failures.set('2026-10-26', { status: 404 });
    renderPage();

    expect(await screen.findByText('이 주 지표를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '주간 브리핑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toHaveClass('no-print');
  });

  it('한 주 돌아보기 히트맵은 고른 주로 부르고, 가장 최근 주만 caption 앞에 "지난주"를 붙인다', async () => {
    currentSearch = 'week=2026-10-26';
    const view = renderPage();
    expect(await screen.findByRole('table', { name: '지난주 시설별 하루 예약 시간 (10월 26일 – 11월 1일)' })).toBeInTheDocument();
    expect(heatmapWeeks).toContain('2026-10-26');

    currentSearch = 'week=2026-10-19';
    view.rerenderPage();
    expect(await screen.findByRole('table', { name: '시설별 하루 예약 시간 (10월 19일 – 25일)' })).toBeInTheDocument();
  });
});

describe('AdminWeeklyBriefingPage — 인쇄·탭 제목', () => {
  it('인쇄 버튼은 첫 구역을 불러오는 동안 aria-disabled 이고 눌러도 인쇄하지 않으며, 다 받으면 인쇄 창을 연다', async () => {
    const user = userEvent.setup();
    const gate = gateFor('2026-10-26');
    gates = [gate];
    currentSearch = 'week=2026-10-26';
    renderPage();

    const loadingButton = await screen.findByRole('button', { name: '불러오는 중' });
    expect(loadingButton).toHaveAttribute('aria-disabled', 'true');
    await user.click(loadingButton);
    expect(printSpy).not.toHaveBeenCalled();
    gate.release();
    await user.click(await screen.findByRole('button', { name: '인쇄' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('이전 주로 넘겨 이 주는 캐시로 바로 있어도 새 전 주를 받는 동안(본문 스켈레톤) 인쇄 버튼은 aria-disabled 이고, 전 주가 오면 켜진다', async () => {
    const user = userEvent.setup();
    currentSearch = 'week=2026-10-26';
    const view = renderPage();
    await findFlowTable();

    const gate = gateFor('2026-10-12');
    gates = [gate];
    await user.click(screen.getByRole('button', { name: /^이전 주 보기/ }));
    currentSearch = 'week=2026-10-19';
    view.rerenderPage();

    expect(screen.queryByRole('table', { name: '업무 접수·처리' })).toBeNull();
    const pendingButton = screen.getByRole('button', { name: '불러오는 중' });
    expect(pendingButton).toHaveAttribute('aria-disabled', 'true');
    await user.click(pendingButton);
    expect(printSpy).not.toHaveBeenCalled();

    gate.release();
    await findFlowTable();
    await user.click(await screen.findByRole('button', { name: '인쇄' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('지표·전 주가 와도 한 주 돌아보기 히트맵을 받는 동안(히트맵 스켈레톤)은 인쇄 버튼이 aria-disabled 이고, 히트맵이 오면 켜진다', async () => {
    const user = userEvent.setup();
    const heatmapGate = gateFor('2026-10-26');
    heatmapGates = [heatmapGate];
    currentSearch = 'week=2026-10-26';
    renderPage();

    await findFlowTable();
    // 첫 구역 안으로 좁힌다 — Task 19 뒤에는 둘째 구역의 이번 주 히트맵 스켈레톤도 같은 이름으로 잠깐 있을 수 있다.
    const review = within(screen.getByRole('region', { name: '한 주 돌아보기' }));
    expect(review.getByRole('status', { name: '시설 예약 시간 불러오는 중' })).toBeInTheDocument();
    const pendingButton = screen.getByRole('button', { name: '불러오는 중' });
    expect(pendingButton).toHaveAttribute('aria-disabled', 'true');
    await user.click(pendingButton);
    expect(printSpy).not.toHaveBeenCalled();

    heatmapGate.release();
    await user.click(await screen.findByRole('button', { name: '인쇄' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('인쇄 직전(beforeprint)에 탭 제목을 다시 세운다 — 주를 넘긴 뒤 레이아웃 제목이 덮어도 PDF 기본 파일 이름은 "주간 브리핑 {주} | 두잉"', async () => {
    currentSearch = 'week=2026-10-26';
    renderPage();
    await findFlowTable();
    await waitFor(() => expect(document.title).toBe('주간 브리핑 2026-10-26 | 두잉'));

    document.title = '총동연 콘솔 | 두잉'; // Next 16.4 가 주 넘기기 뒤 레이아웃 <title> 을 다시 커밋한 상태
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(document.title).toBe('주간 브리핑 2026-10-26 | 두잉');
  });

  it('탭 제목은 "주간 브리핑 {주}", 인쇄 머리는 늘 연도를 쓰고, 주 넘기기는 인쇄에서 숨긴다', async () => {
    currentSearch = 'week=2026-10-26';
    renderPage();

    await findFlowTable();
    await waitFor(() => expect(document.title).toBe('주간 브리핑 2026-10-26 | 두잉'));
    expect(screen.getByText('총동연 주간 브리핑 · 2026년 10월 26일(월) – 11월 1일(일)')).toBeInTheDocument();
    expect(screen.getByText('출력 2026년 11월 5일 오후 2:05')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^이전 주 보기/ }).closest('.no-print')).not.toBeNull();
  });
});
