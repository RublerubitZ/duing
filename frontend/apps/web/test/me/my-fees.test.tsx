import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { MyFee } from '@duing/types';

const mockUseMyFeesQuery = vi.fn();
const mockUseMyClubsQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useMyFeesQuery: (params: unknown) => mockUseMyFeesQuery(params),
  useMyClubsQuery: () => mockUseMyClubsQuery(),
}));

import { MyFeeList } from '@/app/me/_components/MyFeeList';

const buildFee = (over: Partial<MyFee> = {}): MyFee => ({
  id: 100,
  clubId: 1,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PENDING',
  ...over,
});

const buildClub = (clubId: number, clubName: string) => ({
  clubId,
  clubName,
  logoUrl: null,
  myRole: 'MEMBER' as const,
  activeRecruitmentCount: 0,
  joinedAt: '2026-01-01T00:00:00Z',
});

describe('MyFeeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyClubsQuery.mockReturnValue({ data: [] });
  });

  it('불러오는 중에는 로딩 안내를 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<MyFeeList />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('청구가 없으면 빈 상태 안내를 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: [], isLoading: false });
    render(<MyFeeList />);
    expect(screen.getByText('청구된 회비가 없습니다.')).toBeInTheDocument();
  });

  it('청구 행에 회차·금액·마감일과 상태 뱃지를 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: [buildFee()], isLoading: false });
    render(<MyFeeList />);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('2026-07')).toBeInTheDocument();
    expect(within(row).getByText('10,000원 · 마감 2026-07-31')).toBeInTheDocument();
    expect(within(row).getByText('납부대기')).toBeInTheDocument();
  });

  it('가입한 동아리명으로 청구를 그룹화한다', () => {
    mockUseMyFeesQuery.mockReturnValue({
      data: [
        buildFee({ id: 1, clubId: 10 }),
        buildFee({ id: 2, clubId: 20, billingPeriod: '2026-08' }),
      ],
      isLoading: false,
    });
    mockUseMyClubsQuery.mockReturnValue({
      data: [buildClub(10, '두잉 코딩'), buildClub(20, '두잉 밴드')],
    });
    render(<MyFeeList />);

    expect(screen.getByRole('heading', { name: '두잉 코딩' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '두잉 밴드' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('동아리명 매핑이 없으면 clubId 로 그룹 제목을 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({
      data: [buildFee({ clubId: 99 })],
      isLoading: false,
    });
    mockUseMyClubsQuery.mockReturnValue({ data: [] });
    render(<MyFeeList />);

    expect(screen.getByRole('heading', { name: '동아리 #99' })).toBeInTheDocument();
  });

  it('취소된 청구도 상태 뱃지를 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({
      data: [buildFee({ status: 'CANCELLED' })],
      isLoading: false,
    });
    render(<MyFeeList />);

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('취소됨')).toBeInTheDocument();
  });

  it('동아리명이 로딩 중이면(청구가 먼저 도착해도) 로딩을 유지하고 #id 폴백을 깜빡이지 않는다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: [buildFee({ clubId: 10 })], isLoading: false });
    mockUseMyClubsQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<MyFeeList />);

    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '동아리 #10' })).not.toBeInTheDocument();
  });
});
