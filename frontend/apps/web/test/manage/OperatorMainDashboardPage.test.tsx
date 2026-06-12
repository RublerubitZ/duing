import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mutable state read by mock factories (reset in beforeEach)
let mockSearchParamsString = '';
let mockManagedClubsResult: { data: unknown; isLoading: boolean } = {
  data: [{ clubId: 10, clubName: '두잉', logoUrl: null, myRole: 'LEADER', activeRecruitmentCount: 1 }],
  isLoading: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/manage',
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@duing/hooks', () => ({
  useManagedClubsQuery: () => mockManagedClubsResult,
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

const CARD_TITLES = ['처리 필요 업무', '진행 중 모집', '지원자 현황', '오늘 일정', '공지 · 일정'] as const;

function assertCardsVisible() {
  for (const title of CARD_TITLES) {
    expect(screen.getByText(title)).toBeInTheDocument();
  }
}

function assertCardsAbsent() {
  for (const title of CARD_TITLES) {
    expect(screen.queryByText(title)).not.toBeInTheDocument();
  }
}

const defaultClub = { clubId: 10, clubName: '두잉', logoUrl: null, myRole: 'LEADER', activeRecruitmentCount: 1 };

beforeEach(() => {
  mockSearchParamsString = '';
  mockManagedClubsResult = { data: [defaultClub], isLoading: false };
});

describe('OperatorMainDashboardPage', () => {
  it('관리 동아리가 있으면 5개 카드 제목을 렌더한다 (no clubId param)', () => {
    render(<OperatorMainDashboardPage />);
    assertCardsVisible();
  });

  it('?clubId=10 — 매칭 동아리 선택 시 대시보드를 렌더한다', () => {
    mockSearchParamsString = 'clubId=10';
    render(<OperatorMainDashboardPage />);
    assertCardsVisible();
  });

  it('?clubId=99 — 비매칭 시 첫 번째 동아리로 폴백하여 대시보드를 렌더한다', () => {
    mockSearchParamsString = 'clubId=99';
    render(<OperatorMainDashboardPage />);
    assertCardsVisible();
  });

  it('?clubId=abc — NaN 값 시 첫 번째 동아리로 폴백하여 대시보드를 렌더한다', () => {
    mockSearchParamsString = 'clubId=abc';
    render(<OperatorMainDashboardPage />);
    assertCardsVisible();
  });

  it('관리 동아리가 없으면 "관리하는 동아리가 없습니다." 텍스트를 렌더하고 카드는 없다', () => {
    mockManagedClubsResult = { data: [], isLoading: false };
    render(<OperatorMainDashboardPage />);
    expect(screen.getByText('관리하는 동아리가 없습니다.')).toBeInTheDocument();
    assertCardsAbsent();
  });

  it('로딩 중이면 "불러오는 중…" 텍스트를 렌더하고 카드는 없다', () => {
    mockManagedClubsResult = { data: undefined, isLoading: true };
    render(<OperatorMainDashboardPage />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    assertCardsAbsent();
  });
});
