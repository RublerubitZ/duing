import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSyncMutate = vi.fn();
let mockSyncError: unknown = null;
let mockSyncPending = false;
vi.mock('@duing/hooks', () => ({
  useBankSyncMutation: (clubId: number) => {
    void clubId;
    return { mutate: mockSyncMutate, isPending: mockSyncPending, error: mockSyncError };
  },
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// BankSyncDialog 의 `error instanceof ApiError` 분기에 쓰는 클래스(import 해소 + 배너 검증용).
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

import { BankSyncDialog } from '@/app/manage/clubs/[clubId]/fees/_components/BankSyncDialog';

describe('BankSyncDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncError = null;
    mockSyncPending = false;
  });

  it('전달받은 은행 라벨을 읽기 전용으로 노출한다', () => {
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);
    expect(screen.getByText('신한')).toBeInTheDocument();
    expect(
      screen.getByText('입력한 인증정보는 거래 조회에만 쓰이며 저장되지 않습니다.'),
    ).toBeInTheDocument();
  });

  it('주민등록번호가 6자리 숫자가 아니면 검증에서 막히고 동기화하지 않는다', async () => {
    const user = userEvent.setup();
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);

    await user.type(screen.getByLabelText(/계좌 비밀번호/), '1234');
    await user.type(screen.getByLabelText(/주민등록번호 앞 6자리/), '123');
    await user.click(screen.getByRole('button', { name: '동기화' }));

    expect(await screen.findByText('주민등록번호 앞 6자리를 입력해 주세요.')).toBeInTheDocument();
    expect(mockSyncMutate).not.toHaveBeenCalled();
  });

  it('성공 시 적재·자동매칭·검토 건수를 담은 토스트를 띄우고 폼을 비운 뒤 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockSyncMutate.mockImplementation(
      (_payload: unknown, options: { onSuccess: (result: unknown) => void }) =>
        options.onSuccess({ fetched: 10, newlyStored: 4, autoMatched: 2, pendingReview: 1 }),
    );
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={onClose} />);

    const passwordInput = screen.getByLabelText(/계좌 비밀번호/);
    await user.type(passwordInput, 'secret-pw');
    await user.type(screen.getByLabelText(/주민등록번호 앞 6자리/), '900101');
    await user.click(screen.getByRole('button', { name: '동기화' }));

    await waitFor(() => expect(mockSyncMutate).toHaveBeenCalled());

    // 페이로드가 입력값 그대로 전달된다.
    const [payload] = mockSyncMutate.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ accountPassword: 'secret-pw', residentNumber: '900101' });

    // 결과 건수 토스트.
    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        '동기화 완료 — 4건 적재 · 2건 자동매칭 · 1건 검토 필요',
      ),
    );
    expect(onClose).toHaveBeenCalled();

    // SECURITY: 성공 후 폼(특히 비밀번호)이 비워진다 — 자격증명을 상태에 남기지 않는다.
    expect(passwordInput).toHaveValue('');
  });

  it('429(요청 한도) ApiError 면 한도 안내 메시지를 노출한다', () => {
    mockSyncError = new MockApiError(429, 'too many requests');
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);
    expect(screen.getByText('잠시 후 다시 시도해 주세요(요청 한도)')).toBeInTheDocument();
  });

  it('502(은행 연동 장애) ApiError 면 연동 실패 안내 메시지를 노출한다', () => {
    mockSyncError = new MockApiError(502, 'bad gateway');
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);
    expect(screen.getByText('은행 연동에 일시적으로 실패했습니다')).toBeInTheDocument();
  });
});
