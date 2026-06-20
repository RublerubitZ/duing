import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { BankMatchingClub, BankMatchingOverview, BankMatchingSlots } from '@duing/types';

const mockSetActive = vi.fn();

// 조회 응답을 케이스별로 갈아끼우기 위한 훅. data/상태를 한 번에 돌려준다.
const mockOverview = vi.fn<() => BankMatchingOverview>(() => ({ clubs: [], slots: null }));

vi.mock('@duing/hooks', () => ({
  useAdminBankMatchingQuery: () => ({
    data: mockOverview(),
    isLoading: false,
    isError: false,
  }),
  useSetBankMatchingMutation: () => ({ mutate: mockSetActive, isPending: false, error: null }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message = 'api error') {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
  return { MockApiError };
});
vi.mock('@duing/api', () => ({ ApiError: MockApiError }));

import { BankMatchingClubs } from '@/app/admin/bank-matching/_components/BankMatchingClubs';

function makeClub(overrides: Partial<BankMatchingClub> = {}): BankMatchingClub {
  return {
    clubId: 1,
    clubName: '두잉 동아리',
    bank: 'NH',
    accountHolder: '홍길동',
    maskedAccountNumber: '****7890',
    eligible: true,
    ineligibleReason: null,
    registered: false,
    ...overrides,
  };
}

const slots: BankMatchingSlots = { registeredCount: 1, maxAccounts: 5, remaining: 4 };

describe('BankMatchingClubs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOverview.mockReturnValue({ clubs: [], slots: null });
  });

  it('슬롯 현황과 동아리 목록을 렌더링한다', () => {
    mockOverview.mockReturnValue({
      clubs: [makeClub({ clubId: 1, clubName: '코딩 동아리' })],
      slots,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('등록 1 / 최대 5 · 남은 4')).toBeInTheDocument();
    expect(screen.getByText('코딩 동아리')).toBeInTheDocument();
  });

  it('slots 가 null 이면 충돌 없이 일시 장애 안내를 노출하고 목록은 그대로 렌더링한다', () => {
    mockOverview.mockReturnValue({
      clubs: [makeClub({ clubId: 1, clubName: '재즈 동아리' })],
      slots: null,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('등록 현황을 일시적으로 불러올 수 없어요')).toBeInTheDocument();
    expect(screen.getByText('재즈 동아리')).toBeInTheDocument();
  });

  it('적격·미등록 동아리의 [등록]은 {clubId, active:true} 로 호출한다', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue({
      clubs: [makeClub({ clubId: 7, eligible: true, registered: false })],
      slots,
    });
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalled());
    const [payload] = mockSetActive.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ clubId: 7, active: true });
  });

  it('등록된 동아리의 [해제]는 {clubId, active:false} 로 호출한다', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue({
      clubs: [makeClub({ clubId: 9, registered: true })],
      slots,
    });
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '해제' }));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalled());
    const [payload] = mockSetActive.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ clubId: 9, active: false });
  });

  it('부적격 동아리의 [등록]은 비활성이고 사유를 노출한다', () => {
    mockOverview.mockReturnValue({
      clubs: [
        makeClub({
          clubId: 3,
          eligible: false,
          ineligibleReason: '회비 계좌 미등록',
          registered: false,
        }),
      ],
      slots,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled();
    expect(screen.getByText(/회비 계좌 미등록/)).toBeInTheDocument();
  });

  it('남은 슬롯이 0 이면 적격·미등록 동아리의 [등록]도 비활성이다', () => {
    mockOverview.mockReturnValue({
      clubs: [makeClub({ clubId: 4, eligible: true, registered: false })],
      slots: { registeredCount: 5, maxAccounts: 5, remaining: 0 },
    });
    render(<BankMatchingClubs />);

    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled();
  });

  it('등록 중 ApiError(한도 초과)가 발생하면 토스트로 메시지를 노출한다', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue({
      clubs: [makeClub({ clubId: 5, eligible: true, registered: false })],
      slots,
    });
    mockSetActive.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new MockApiError(400, '등록 가능한 계좌 한도를 초과했습니다.'));
      },
    );
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith('등록 가능한 계좌 한도를 초과했습니다.', {
        variant: 'error',
      }),
    );
  });

  it('검색 입력으로 동아리 이름을 필터링한다', async () => {
    const user = userEvent.setup();
    mockOverview.mockReturnValue({
      clubs: [
        makeClub({ clubId: 1, clubName: '코딩 동아리' }),
        makeClub({ clubId: 2, clubName: '재즈 동아리' }),
      ],
      slots,
    });
    render(<BankMatchingClubs />);

    await user.type(screen.getByLabelText('동아리 이름 검색'), '재즈');

    expect(screen.getByText('재즈 동아리')).toBeInTheDocument();
    expect(screen.queryByText('코딩 동아리')).not.toBeInTheDocument();
  });

  it('등록 계좌의 은행 라벨·예금주·마스킹 번호와 자동매칭 활성 뱃지를 렌더링한다', () => {
    mockOverview.mockReturnValue({
      clubs: [
        makeClub({
          clubId: 1,
          clubName: '코딩 동아리',
          bank: 'KB',
          accountHolder: '김두잉',
          maskedAccountNumber: '****1234',
          registered: true,
        }),
      ],
      slots,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('KB국민 · 김두잉 · ****1234')).toBeInTheDocument();
    expect(screen.getByText('자동매칭 활성')).toBeInTheDocument();
  });

  it('maskedAccountNumber 가 null 이면 "계좌 확인 불가" 로 표시하고 비활성 뱃지를 노출한다', () => {
    mockOverview.mockReturnValue({
      clubs: [
        makeClub({
          clubId: 2,
          clubName: '재즈 동아리',
          bank: 'NH',
          accountHolder: '총무',
          maskedAccountNumber: null,
          registered: false,
        }),
      ],
      slots,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('NH농협 · 총무 · 계좌 확인 불가')).toBeInTheDocument();
    expect(screen.getByText('자동매칭 비활성')).toBeInTheDocument();
  });
});
