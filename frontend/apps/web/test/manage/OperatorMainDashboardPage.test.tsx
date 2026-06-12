import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/manage',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const managed = [
  { clubId: 10, clubName: '두잉', logoUrl: null, myRole: 'LEADER', activeRecruitmentCount: 1 },
];
vi.mock('@duing/hooks', () => ({
  useManagedClubsQuery: () => ({ data: managed, isLoading: false }),
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
      underReview: 0,
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
}));

import { OperatorMainDashboardPage } from '@/app/manage/_pages/OperatorMainDashboardPage';

describe('OperatorMainDashboardPage', () => {
  it('관리 동아리가 있으면 5개 카드 제목을 렌더한다', () => {
    render(<OperatorMainDashboardPage />);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('진행 중 모집')).toBeInTheDocument();
    expect(screen.getByText('지원자 현황')).toBeInTheDocument();
    expect(screen.getByText('오늘 일정')).toBeInTheDocument();
    expect(screen.getByText('공지 · 일정')).toBeInTheDocument();
  });
});
