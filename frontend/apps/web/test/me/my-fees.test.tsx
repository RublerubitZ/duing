import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApiError } from '@duing/api';
import type { FeeAccount, MyFee } from '@duing/types';

const mockUseMyFeesQuery = vi.fn();
const mockUseMyClubsQuery = vi.fn();
const mockUseMemberFeeAccountQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useMyFeesQuery: (params: unknown) => mockUseMyFeesQuery(params),
  useMyClubsQuery: () => mockUseMyClubsQuery(),
  useMemberFeeAccountQuery: (clubId: number) => mockUseMemberFeeAccountQuery(clubId),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
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
  paidAmount: 0,
  remainingAmount: 10000,
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

const buildAccount = (over: Partial<FeeAccount> = {}): FeeAccount => ({
  bank: 'SHINHAN',
  accountNumber: '110-123-456789',
  accountHolder: '홍길동',
  ...over,
});

// 미등록(404) 기본 상태 — 대부분의 기존 테스트는 계좌 안내를 검증하지 않으므로 빈 상태로 둔다.
const notFoundAccount = {
  data: undefined,
  isLoading: false,
  error: new ApiError(404, '회비 계좌가 없습니다.'),
};

describe('MyFeeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyClubsQuery.mockReturnValue({ data: [] });
    mockUseMemberFeeAccountQuery.mockReturnValue(notFoundAccount);
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

  it('동아리별로 납부 계좌(은행 라벨·계좌번호·예금주)를 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: [buildFee({ clubId: 10 })], isLoading: false });
    mockUseMyClubsQuery.mockReturnValue({ data: [buildClub(10, '두잉 코딩')] });
    mockUseMemberFeeAccountQuery.mockReturnValue({
      data: buildAccount(),
      isLoading: false,
      error: null,
    });
    render(<MyFeeList />);

    expect(
      screen.getByText('신한 110-123-456789 · 예금주 홍길동', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계좌번호 복사' })).toBeInTheDocument();
  });

  it('계좌가 미등록(404)이면 에러 없이 옅은 안내만 표시한다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: [buildFee({ clubId: 10 })], isLoading: false });
    mockUseMyClubsQuery.mockReturnValue({ data: [buildClub(10, '두잉 코딩')] });
    mockUseMemberFeeAccountQuery.mockReturnValue(notFoundAccount);
    render(<MyFeeList />);

    expect(screen.getByText('납부 계좌가 등록되지 않았어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계좌번호 복사' })).not.toBeInTheDocument();
  });

  it('계좌 로딩 중에는 청구 목록을 막지 않고 계좌 블록을 그리지 않는다', () => {
    mockUseMyFeesQuery.mockReturnValue({ data: [buildFee({ clubId: 10 })], isLoading: false });
    mockUseMyClubsQuery.mockReturnValue({ data: [buildClub(10, '두잉 코딩')] });
    mockUseMemberFeeAccountQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    render(<MyFeeList />);

    expect(screen.getByRole('listitem')).toBeInTheDocument();
    expect(screen.queryByText('납부 계좌가 등록되지 않았어요.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계좌번호 복사' })).not.toBeInTheDocument();
  });

  it('복사 버튼은 계좌번호를 클립보드에 복사하고 성공 토스트를 띄운다', async () => {
    // navigator 전체를 stub 하면 userEvent 내부가 깨지므로 clipboard 만 정의한다.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    mockUseMyFeesQuery.mockReturnValue({ data: [buildFee({ clubId: 10 })], isLoading: false });
    mockUseMyClubsQuery.mockReturnValue({ data: [buildClub(10, '두잉 코딩')] });
    mockUseMemberFeeAccountQuery.mockReturnValue({
      data: buildAccount({ accountNumber: '110-123-456789' }),
      isLoading: false,
      error: null,
    });
    render(<MyFeeList />);

    await userEvent.click(screen.getByRole('button', { name: '계좌번호 복사' }));

    expect(writeText).toHaveBeenCalledWith('110-123-456789');
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('계좌번호를 복사했어요'));
  });
});
