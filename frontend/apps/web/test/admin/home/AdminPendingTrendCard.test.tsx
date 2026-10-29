import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminPendingTrend } from '@duing/types';

const mockTrend = vi.fn();
const mockCounts = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useAdminPendingTrendQuery: () => mockTrend(),
  useAdminPendingCountsQuery: () => mockCounts(),
}));

import { AdminPendingTrendCard } from '@/app/admin/_components/home/AdminPendingTrendCard';

const DATES = Array.from({ length: 13 }, (_, index) => `2026-10-${String(17 + index).padStart(2, '0')}`);
function trendOf(totals: Array<number | null>): AdminPendingTrend {
  return {
    days: totals.map((totalPendingCount, index) => ({ date: DATES[index] ?? '', totalPendingCount })),
    recentFlow: { days: 7, receivedCount: 31, handledCount: 27 },
  };
}
const FULL = trendOf([18, 20, 19, 22, 24, 21, 23, 25, 24, 26, 27, 25, 26]);
const loaded = (data: unknown) => ({ data, isError: false });
const failed = () => ({ data: undefined, isError: true });
const loading = () => ({ data: undefined, isError: false });
const countsWithTotal = (totalPendingCount: number) => loaded({ totalPendingCount });

beforeEach(() => {
  vi.clearAllMocks();
  mockTrend.mockReturnValue(loaded(FULL));
  mockCounts.mockReturnValue(countsWithTotal(28));
});

describe('AdminPendingTrendCard', () => {
  it('제목·기간·판단 문장을 보이고, 같은 문장을 막대 묶음 이름으로 쓴다', () => {
    render(<AdminPendingTrendCard />);
    expect(screen.getByRole('heading', { name: '처리 대기 추이' })).toBeInTheDocument();
    expect(screen.getByText('최근 14일')).toBeInTheDocument();
    expect(screen.getByText('10월 17일보다 10건 늘었어요')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '10월 17일보다 10건 늘었어요' })).toBeInTheDocument();
  });

  it('todayBarReadsPendingCountsTotal — 오늘 막대·표는 머리말과 같은 pending-counts 합계를 쓴다', () => {
    mockCounts.mockReturnValue(countsWithTotal(31));
    render(<AdminPendingTrendCard />);
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(15); // 머리 1 + 막대 14
    expect(rows.at(-1)).toHaveTextContent('오늘 지금31건');
  });

  it('막대는 14개이고, 값 라벨은 기록이 있는 첫 막대와 오늘 막대에만 붙는다', () => {
    render(<AdminPendingTrendCard />);
    const figure = screen.getByRole('img');
    expect(figure.querySelectorAll('[title]')).toHaveLength(14);
    expect(within(figure).queryAllByText(/^\d+$/).map((label) => label.textContent)).toEqual(['18', '28']);
  });

  it('오늘을 못 불러오면 값 라벨은 첫 막대와 마지막 기록일에 붙고 오늘은 "—"다', () => {
    mockCounts.mockReturnValue(failed());
    render(<AdminPendingTrendCard />);
    const figure = screen.getByRole('img');
    expect(within(figure).queryAllByText(/^\d+$/).map((label) => label.textContent)).toEqual(['18', '26']);
    expect(screen.getByTitle('10월 29일 하루 끝 · 26건')).toHaveTextContent('26');
  });

  it('날짜별 표는 막대 묶음(role=img) 밖에 있어 보조기기와 키보드로 값을 확인할 수 있다', () => {
    render(<AdminPendingTrendCard />);
    const figure = screen.getByRole('img');
    const table = screen.getByRole('table');
    expect(figure.contains(table)).toBe(false);
    expect(screen.getByText('날짜별 보기').tagName).toBe('SUMMARY');
  });

  it('0건과 기록 없음을 구분한다 — 0 은 2px 토막·"0건", 기록 없음은 점선·"기록 없음"과 범례', () => {
    mockTrend.mockReturnValue(loaded(trendOf([5, 0, null, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6])));
    render(<AdminPendingTrendCard />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('10월 18일 하루 끝').closest('tr')).toHaveTextContent('0건');
    expect(within(table).getByText('10월 19일').closest('tr')).toHaveTextContent('기록 없음');
    expect(screen.getByText('점선은 기록이 없는 날이에요')).toBeInTheDocument();
    expect(screen.getByTitle('10월 18일 하루 끝 · 0건').querySelector('[data-bar]')).toHaveStyle({ height: '2px' });
    expect(screen.getByTitle('10월 19일 · 기록 없음').querySelector('[data-bar-missing]')).toBeInTheDocument();
  });

  it('기록 없는 날이 없으면 점선 범례를 붙이지 않는다', () => {
    render(<AdminPendingTrendCard />);
    expect(screen.queryByText('점선은 기록이 없는 날이에요')).toBeNull();
  });

  it('오늘 값을 못 불러오면 오늘은 "—"·"불러오지 못했어요", 문장은 마지막 기록일 하루 끝 기준이고 일부 실패 문구는 없다', () => {
    mockCounts.mockReturnValue(failed());
    render(<AdminPendingTrendCard />);
    expect(screen.getByText('10월 29일 하루 끝은 10월 17일보다 8건 늘었어요')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row').at(-1)).toHaveTextContent('오늘불러오지 못했어요');
    expect(screen.getByTitle('오늘 · 불러오지 못했어요')).toHaveTextContent('—');
    expect(screen.queryByText('일부 정보를 불러오지 못했어요.')).toBeNull();
  });

  it('오늘 값을 받는 중이면 카드 전체가 로딩이다(비교 문장이 도착 순간 바뀌지 않게)', () => {
    mockCounts.mockReturnValue(loading());
    render(<AdminPendingTrendCard />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('기록이 2개 미만이면 막대 대신 안내와 접수·처리 줄만 보인다', () => {
    mockTrend.mockReturnValue(loaded(trendOf([...Array<null>(12).fill(null), 4])));
    render(<AdminPendingTrendCard />);
    expect(screen.getByText('매일 자정에 하루 한 번 기록해요. 며칠 지나면 추이가 보여요.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('최근 7일 접수 31건 · 처리 27건')).toBeInTheDocument();
  });

  it('추이를 못 불러오면 공용 실패 문구를 띄운다', () => {
    mockTrend.mockReturnValue(failed());
    render(<AdminPendingTrendCard />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('접수·처리 줄과 기준 영역을 막대와 떼어 보인다', () => {
    render(<AdminPendingTrendCard />);
    expect(screen.getByText('최근 7일 접수 31건 · 처리 27건')).toBeInTheDocument();
    expect(screen.getByText('접수·처리는 신고·문의·시설 예약·홍보·회장 승계만 세요')).toBeInTheDocument();
  });

  it('x축은 첫 날짜(M/D)와 "오늘"이다', () => {
    render(<AdminPendingTrendCard />);
    const figure = screen.getByRole('img');
    expect(within(figure).getByText('10/17')).toBeInTheDocument();
    expect(within(figure).getByText('오늘')).toBeInTheDocument();
  });
});
