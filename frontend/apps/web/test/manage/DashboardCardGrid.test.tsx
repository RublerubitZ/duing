import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@duing/hooks', () => ({
  useClubActionItems: () => ({
    items: [],
    preview: [],
    totalCount: 0,
    isLoading: false,
    isError: false,
  }),
  useActiveRecruitments: () => ({ data: [], isLoading: false }),
  useApplicantSummary: () => ({
    totals: {
      total: 0,
      submitted: 0,
      onHold: 0,
      interviewPending: 0,
      accepted: 0,
      rejected: 0,
      capacity: 0,
    },
    isLoading: false,
    isError: false,
  }),
  useTodaySchedule: () => ({ items: [], isLoading: false, isError: false }),
  useClubFeedCounts: () => ({ noticeCount: 0, eventCount: 0, isLoading: false, isError: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { DashboardCardGrid } from '@/app/manage/_components/dashboard/DashboardCardGrid';

const CARD_TITLES = ['처리 필요 업무', '진행 중 모집', '지원자 현황', '오늘 일정', '공지 · 일정'] as const;

describe('DashboardCardGrid', () => {
  it('clubId 를 받아 5개 카드 제목을 모두 렌더한다', () => {
    render(<DashboardCardGrid clubId={10} />);

    for (const title of CARD_TITLES) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});
