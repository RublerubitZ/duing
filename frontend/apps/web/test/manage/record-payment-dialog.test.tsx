import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRecordMutate = vi.fn();
let mockRecordError: unknown = null;
let mockRecordPending = false;
vi.mock('@duing/hooks', () => ({
  useRecordPaymentMutation: (clubId: number, billId: number) => {
    void clubId;
    void billId;
    return { mutate: mockRecordMutate, isPending: mockRecordPending, error: mockRecordError };
  },
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// RecordPaymentDialog 의 `error instanceof ApiError` 분기에 쓰는 클래스(import 해소 + 배너 검증용).
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

import { RecordPaymentDialog } from '@/app/manage/clubs/[clubId]/fees/_components/RecordPaymentDialog';

const buildBill = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 100,
  clubId: 1,
  userId: 42,
  feePolicyId: 7,
  amount: 10000,
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  status: 'PARTIAL_PAID' as const,
  displayStatus: 'PARTIAL_PAID' as const,
  paidAmount: 4000,
  remainingAmount: 6000,
  ...over,
});

describe('RecordPaymentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordError = null;
    mockRecordPending = false;
  });

  it('기본 납부 금액은 남은 미납액으로 채워지고 설명에 회원 이름이 보인다', () => {
    render(<RecordPaymentDialog clubId={1} bill={buildBill()} memberName="김민지" onClose={() => {}} />);
    const amountInput = screen.getByLabelText(/납부 금액/);
    expect(amountInput).toHaveValue(6000);
    expect(screen.getByText(/남은 미납액 6,000원/)).toBeInTheDocument();
    // 설명에 `회원 #id` 대신 전달받은 이름이 노출된다.
    expect(screen.getByText(/김민지 · 2026-07 청구에 납부 내역을 기록합니다\./)).toBeInTheDocument();
  });

  it('납부 수단을 선택하고 제출하면 폼 페이로드로 기록 뮤테이션을 호출한다', async () => {
    const user = userEvent.setup();
    render(<RecordPaymentDialog clubId={1} bill={buildBill()} memberName="김민지" onClose={() => {}} />);

    await user.selectOptions(screen.getByLabelText(/납부 수단/), 'TRANSFER');
    await user.click(screen.getByRole('button', { name: '기록' }));

    await waitFor(() => expect(mockRecordMutate).toHaveBeenCalled());
    const [payload] = mockRecordMutate.mock.calls[0] as [Record<string, unknown>];
    expect(payload.amount).toBe(6000);
    expect(payload.method).toBe('TRANSFER');
    expect(payload.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('성공 시 토스트를 띄우고 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockRecordMutate.mockImplementation(
      (_payload: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    render(<RecordPaymentDialog clubId={1} bill={buildBill()} memberName="김민지" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '기록' }));

    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith('납부를 기록했습니다.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('ApiError(400) 메시지를 에러 배너로 노출한다', () => {
    mockRecordError = new MockApiError(400, '납부 금액이 남은 미납액을 초과합니다.');
    render(<RecordPaymentDialog clubId={1} bill={buildBill()} memberName="김민지" onClose={() => {}} />);
    expect(screen.getByText('납부 금액이 남은 미납액을 초과합니다.')).toBeInTheDocument();
  });

  it('금액이 0/음수면 검증에서 막히고 뮤테이션을 호출하지 않는다', async () => {
    const user = userEvent.setup();
    render(<RecordPaymentDialog clubId={1} bill={buildBill()} memberName="김민지" onClose={() => {}} />);

    const amountInput = screen.getByLabelText(/납부 금액/);
    await user.clear(amountInput);
    await user.type(amountInput, '0');
    await user.click(screen.getByRole('button', { name: '기록' }));

    expect(await screen.findByText('납부 금액은 1원 이상이어야 합니다.')).toBeInTheDocument();
    expect(mockRecordMutate).not.toHaveBeenCalled();

    await user.clear(amountInput);
    await user.type(amountInput, '-100');
    await user.click(screen.getByRole('button', { name: '기록' }));

    expect(mockRecordMutate).not.toHaveBeenCalled();
  });
});
