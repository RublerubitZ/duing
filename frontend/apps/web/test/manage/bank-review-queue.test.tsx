import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { BankTransaction } from '@duing/types';

const mockApproveMutate = vi.fn();
const mockIgnoreMutate = vi.fn();
const mockUnmatchMutate = vi.fn();

// status 필터별로 다른 페이지를 돌려준다
// (PENDING=검토 큐, AUTO_MATCHED=자동 매칭, MANUAL_MATCHED=수동 매칭 — 둘은 '매칭 내역'으로 합쳐 노출).
const mockPendingContent = vi.fn<() => BankTransaction[]>(() => []);
const mockAutoMatchedContent = vi.fn<() => BankTransaction[]>(() => []);
const mockManualMatchedContent = vi.fn<() => BankTransaction[]>(() => []);

// PENDING 조회를 에러 상태로 강제하기 위한 훅. null 이면 정상 데이터 응답.
const mockPendingError = vi.fn<() => unknown | null>(() => null);

function matchedContentFor(status?: string): BankTransaction[] {
  if (status === 'AUTO_MATCHED') return mockAutoMatchedContent();
  if (status === 'MANUAL_MATCHED') return mockManualMatchedContent();
  return mockPendingContent();
}

vi.mock('@duing/hooks', () => ({
  useBankTransactionsQuery: (clubId: number, params: { status?: string }) => {
    void clubId;
    const isMatchedQuery =
      params.status === 'AUTO_MATCHED' || params.status === 'MANUAL_MATCHED';
    const pendingError = isMatchedQuery ? null : mockPendingError();
    if (pendingError !== null) {
      return { data: undefined, isLoading: false, isError: true, error: pendingError };
    }
    const content = matchedContentFor(params.status);
    return {
      data: { content, page: 0, size: 20, totalElements: content.length, totalPages: 1, hasNext: false },
      isLoading: false,
      isError: false,
      error: null,
    };
  },
  useApproveMatchMutation: () => ({ mutate: mockApproveMutate, isPending: false, error: null }),
  useIgnoreTransactionMutation: () => ({ mutate: mockIgnoreMutate, isPending: false, error: null }),
  useUnmatchTransactionMutation: () => ({ mutate: mockUnmatchMutate, isPending: false, error: null }),
}));

// 무시 뮤테이션이 특정 에러로 실패하도록 강제하기 위한 헬퍼.
// .mutate(txId, { onSuccess, onError }) 호출부의 onError 콜백을 주어진 에러로 호출한다.
function makeIgnoreRejectWith(error: unknown): void {
  mockIgnoreMutate.mockImplementation(
    (_txId: number, options?: { onError?: (error: unknown) => void }) => {
      options?.onError?.(error);
    },
  );
}

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

import { BankReviewQueue } from '@/app/manage/clubs/[clubId]/fees/_components/BankReviewQueue';

const pendingWithCandidate: BankTransaction = {
  id: 501,
  transactionAt: '2026-06-15T09:30:00',
  amount: 30000,
  counterparty: '김민지',
  transactionType: 'DEPOSIT',
  matchStatus: 'PENDING',
  matchedFeeBillId: null,
  candidates: [
    {
      feeBillId: 901,
      userId: 42,
      memberName: '김민지',
      billingPeriod: '2026-06',
      dueDate: '2026-06-30',
      remaining: 30000,
    },
  ],
};

const pendingNoCandidate: BankTransaction = {
  id: 502,
  transactionAt: '2026-06-16T10:00:00',
  amount: 5000,
  counterparty: null,
  transactionType: 'DEPOSIT',
  matchStatus: 'PENDING',
  matchedFeeBillId: null,
  candidates: [],
};

describe('BankReviewQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPendingContent.mockReturnValue([]);
    mockAutoMatchedContent.mockReturnValue([]);
    mockManualMatchedContent.mockReturnValue([]);
    mockPendingError.mockReturnValue(null);
  });

  it('검토 대기 입금과 후보 청구 행을 렌더링한다', () => {
    mockPendingContent.mockReturnValue([pendingWithCandidate]);
    render(<BankReviewQueue clubId={1} />);

    expect(screen.getByText('30,000원')).toBeInTheDocument();
    expect(screen.getByText(/입금시각 2026-06-15 09:30 · 김민지/)).toBeInTheDocument();
    expect(screen.getByText('김민지 · 2026-06')).toBeInTheDocument();
    expect(screen.getByText('잔액 30,000원')).toBeInTheDocument();
  });

  it('[승인] 클릭 시 {txId, feeBillId} 로 승인 뮤테이션을 호출한다', async () => {
    const user = userEvent.setup();
    mockPendingContent.mockReturnValue([pendingWithCandidate]);
    render(<BankReviewQueue clubId={1} />);

    await user.click(screen.getByRole('button', { name: '승인' }));

    await waitFor(() => expect(mockApproveMutate).toHaveBeenCalled());
    const [payload] = mockApproveMutate.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ txId: 501, feeBillId: 901 });
  });

  it('[무시] 확인 시 거래 id 로 무시 뮤테이션을 호출한다', async () => {
    const user = userEvent.setup();
    mockPendingContent.mockReturnValue([pendingWithCandidate]);
    render(<BankReviewQueue clubId={1} />);

    await user.click(screen.getByRole('button', { name: '무시' }));
    const dialog = await screen.findByRole('alertdialog', { name: '거래 무시 확인' });
    await user.click(within(dialog).getByRole('button', { name: '무시' }));

    await waitFor(() => expect(mockIgnoreMutate).toHaveBeenCalled());
    const [txId] = mockIgnoreMutate.mock.calls[0] as [number];
    expect(txId).toBe(501);
  });

  it('후보가 없는 입금은 안내 문구와 [무시]만 노출한다(승인 버튼 없음)', () => {
    mockPendingContent.mockReturnValue([pendingNoCandidate]);
    render(<BankReviewQueue clubId={1} />);

    expect(screen.getByText('일치하는 청구가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '승인' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '무시' })).toBeInTheDocument();
  });

  it('검토 대기가 없으면 빈 상태 안내를 노출한다', () => {
    render(<BankReviewQueue clubId={1} />);
    expect(screen.getByText('검토할 입금 거래가 없습니다.')).toBeInTheDocument();
  });

  it('검토 대기 조회가 실패하면 빈 상태 대신 오류 안내를 노출한다', () => {
    mockPendingError.mockReturnValue(new MockApiError(500, 'internal'));
    render(<BankReviewQueue clubId={1} />);

    expect(
      screen.getByText('거래를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('검토할 입금 거래가 없습니다.')).not.toBeInTheDocument();
  });

  it('매칭 내역(자동매칭)의 [매칭취소] 확인 시 거래 id 로 해제 뮤테이션을 호출한다', async () => {
    const user = userEvent.setup();
    mockAutoMatchedContent.mockReturnValue([
      {
        id: 777,
        transactionAt: '2026-06-10T08:00:00',
        amount: 12000,
        counterparty: '박두잉',
        transactionType: 'DEPOSIT',
        matchStatus: 'AUTO_MATCHED',
        matchedFeeBillId: 1001,
        candidates: [],
      },
    ]);
    render(<BankReviewQueue clubId={1} />);

    await user.click(screen.getByRole('button', { name: '매칭취소' }));
    const dialog = await screen.findByRole('alertdialog', { name: '매칭 취소 확인' });
    await user.click(within(dialog).getByRole('button', { name: '매칭 취소' }));

    await waitFor(() => expect(mockUnmatchMutate).toHaveBeenCalled());
    const [txId] = mockUnmatchMutate.mock.calls[0] as [number];
    expect(txId).toBe(777);
  });

  it('수동 매칭(MANUAL_MATCHED) 거래도 매칭 내역에 노출되어 [매칭취소]로 해제할 수 있다', async () => {
    const user = userEvent.setup();
    mockManualMatchedContent.mockReturnValue([
      {
        id: 888,
        transactionAt: '2026-06-12T07:00:00',
        amount: 25000,
        counterparty: '이수동',
        transactionType: 'DEPOSIT',
        matchStatus: 'MANUAL_MATCHED',
        matchedFeeBillId: 2002,
        candidates: [],
      },
    ]);
    render(<BankReviewQueue clubId={1} />);

    expect(screen.getByText('25,000원')).toBeInTheDocument();
    expect(screen.getByText(/입금시각 2026-06-12 07:00 · 이수동/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '매칭취소' }));
    const dialog = await screen.findByRole('alertdialog', { name: '매칭 취소 확인' });
    await user.click(within(dialog).getByRole('button', { name: '매칭 취소' }));

    await waitFor(() => expect(mockUnmatchMutate).toHaveBeenCalled());
    const [txId] = mockUnmatchMutate.mock.calls[0] as [number];
    expect(txId).toBe(888);
  });

  it('자동·수동 매칭이 모두 있으면 한 매칭 내역에 합쳐 노출한다', () => {
    mockAutoMatchedContent.mockReturnValue([
      {
        id: 777,
        transactionAt: '2026-06-10T08:00:00',
        amount: 12000,
        counterparty: '박두잉',
        transactionType: 'DEPOSIT',
        matchStatus: 'AUTO_MATCHED',
        matchedFeeBillId: 1001,
        candidates: [],
      },
    ]);
    mockManualMatchedContent.mockReturnValue([
      {
        id: 888,
        transactionAt: '2026-06-12T07:00:00',
        amount: 25000,
        counterparty: '이수동',
        transactionType: 'DEPOSIT',
        matchStatus: 'MANUAL_MATCHED',
        matchedFeeBillId: 2002,
        candidates: [],
      },
    ]);
    render(<BankReviewQueue clubId={1} />);

    expect(screen.getByText('12,000원')).toBeInTheDocument();
    expect(screen.getByText('25,000원')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '매칭취소' })).toHaveLength(2);
    expect(screen.queryByText('매칭된 거래가 없습니다.')).not.toBeInTheDocument();
  });

  it('[무시]가 409(이미 처리됨)로 실패하면 친절한 안내 토스트를 노출한다', async () => {
    const user = userEvent.setup();
    mockPendingContent.mockReturnValue([pendingWithCandidate]);
    makeIgnoreRejectWith(new MockApiError(409, '이미 매칭된 거래입니다'));
    render(<BankReviewQueue clubId={1} />);

    await user.click(screen.getByRole('button', { name: '무시' }));
    const dialog = await screen.findByRole('alertdialog', { name: '거래 무시 확인' });
    await user.click(within(dialog).getByRole('button', { name: '무시' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        '이미 처리된 거래예요. 목록을 새로고침했어요.',
        { variant: 'error' },
      ),
    );
  });
});
