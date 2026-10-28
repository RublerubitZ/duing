import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const emptyTotals = { total: 0, submitted: 0, onHold: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 0 };
vi.mock('@duing/hooks', () => ({
  CLOSING_SOON_DAYS: 3,
  formatRelativeTime: () => '',
  useDashboardTaskQueue: () => ({ groups: [], totalCount: 0, isLoading: false, isError: false }),
  useActiveRecruitments: () => ({ data: [], isLoading: false }),
  useApplicantSummary: () => ({ totals: emptyTotals, isLoading: false, isError: false }),
  useTodaySchedule: () => ({ items: [], isLoading: false, isError: false }),
  useClubFeedCounts: () => ({ noticeCount: 0, eventCount: 0, isLoading: false, isError: false }),
  useClubFeeSummaryQuery: () => ({ data: undefined, isLoading: false, isError: false }),
  useCashbookSummaryQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { DashboardCardGrid } from '@/app/manage/_components/dashboard/DashboardCardGrid';

// DOM 순서 = xl 미만(한 칸)에서 쌓이는 순서: 왼쪽 칸(큐 → 지원자 현황) → 오른쪽 칸.
const CARD_TITLES_IN_ORDER = ['처리 필요 업무', '지원자 현황', '오늘 일정', '진행 중 모집', '회비 · 장부', '공지 · 일정'] as const;

describe('DashboardCardGrid', () => {
  it('카드 6개를 정해진 순서로 그린다', () => {
    render(<DashboardCardGrid clubId={10} />);
    const headings = CARD_TITLES_IN_ORDER.map((title) => screen.getByText(title));
    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1]!;
      const current = headings[index]!;
      expect(previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // 보류·지원 완료는 지원자 현황 띠의 보조 줄에만 있다 — 예전 단독 칸으로 돌아오지 않는다.
    expect(screen.queryByText('보류')).not.toBeInTheDocument();
    expect(screen.queryByText('지원 완료')).not.toBeInTheDocument();
  });

  it('xl 부터 오른쪽 칸 320px 두 칸, 각 칸은 min-w-0', () => {
    const { container } = render(<DashboardCardGrid clubId={10} />);
    const grid = container.firstElementChild;
    expect(grid).toHaveClass('grid', 'gap-4', 'xl:grid-cols-[minmax(0,1fr)_320px]');
    for (const column of Array.from(grid?.children ?? [])) {
      expect(column).toHaveClass('min-w-0');
    }
  });
});
