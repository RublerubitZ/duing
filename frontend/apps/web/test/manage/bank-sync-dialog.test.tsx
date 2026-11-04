import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByLabelText(/주민등록번호 앞 6자리/)).toHaveAccessibleDescription('주민등록번호 앞 6자리를 입력해 주세요.');
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
    // 옛 백엔드 응답(missedFrom·missedTo 없음)이면 경고 토스트를 띄우지 않는다.
    expect(mockAddToast).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();

    // SECURITY: 성공 후 폼(특히 비밀번호)이 비워진다 — 자격증명을 상태에 남기지 않는다.
    expect(passwordInput).toHaveValue('');
  });

  it('조회 상한에 잘린 기간이 있으면 그 기간을 닫을 때까지 남는 경고 토스트로 알린다', async () => {
    const user = userEvent.setup();
    mockSyncMutate.mockImplementation(
      (_payload: unknown, options: { onSuccess: (result: unknown) => void }) =>
        options.onSuccess({
          fetched: 10,
          newlyStored: 4,
          autoMatched: 2,
          pendingReview: 1,
          missedFrom: '2026-09-01',
          missedTo: '2026-09-13',
        }),
    );
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);

    await user.type(screen.getByLabelText(/계좌 비밀번호/), 'secret-pw');
    await user.type(screen.getByLabelText(/주민등록번호 앞 6자리/), '900101');
    await user.click(screen.getByRole('button', { name: '동기화' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        '2026-09-01 ~ 2026-09-13 구간은 한 번에 조회할 수 있는 기간을 넘어 이번 동기화에서 확인하지 못했습니다. 그 사이 입금이 있었다면 통장 내역과 대조해 직접 처리해 주세요.',
        { variant: 'error', durationMs: 0 },
      ),
    );
    // 성공 토스트도 그대로 뜬다.
    expect(mockAddToast).toHaveBeenCalledWith('동기화 완료 — 4건 적재 · 2건 자동매칭 · 1건 검토 필요');
    expect(mockAddToast).toHaveBeenCalledTimes(2);
  });

  it('버튼을 거치지 않은 제출이 두 번 들어와도 요청은 한 번이다', async () => {
    mockSyncMutate.mockImplementation(() => {}); // 앞 테스트의 onSuccess 구현을 지운다(clearAllMocks 는 구현을 남김)
    const user = userEvent.setup();
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);
    await user.type(screen.getByLabelText(/계좌 비밀번호/), 'secret-pw');
    await user.type(screen.getByLabelText(/주민등록번호 앞 6자리/), '900101');

    const form = screen.getByRole('button', { name: '동기화' }).closest('form')!;
    // 같은 태스크의 두 번째 제출 — 버튼을 거치지 않아 disabled 로는 못 막는다
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mockSyncMutate).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0)); // 두 handleSubmit 의 비동기 검증이 모두 끝나게
    expect(mockSyncMutate).toHaveBeenCalledTimes(1);
  });

  it('요청이 끝나면(onSettled) 다시 제출할 수 있다', async () => {
    mockSyncMutate.mockImplementation(() => {}); // 앞 테스트의 onSuccess 구현을 지운다(clearAllMocks 는 구현을 남김)
    const user = userEvent.setup();
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);
    await user.type(screen.getByLabelText(/계좌 비밀번호/), 'secret-pw');
    await user.type(screen.getByLabelText(/주민등록번호 앞 6자리/), '900101');

    await user.click(screen.getByRole('button', { name: '동기화' }));
    await waitFor(() => expect(mockSyncMutate).toHaveBeenCalledTimes(1));
    const [, callOptions] = mockSyncMutate.mock.calls[0] as [unknown, { onSettled?: () => void }];
    act(() => callOptions.onSettled?.());
    await user.click(screen.getByRole('button', { name: '동기화' }));
    await waitFor(() => expect(mockSyncMutate).toHaveBeenCalledTimes(2));
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
    expect(screen.getByRole('alert')).toHaveTextContent('은행 연동에 일시적으로 실패했습니다');
  });

  // 스피너 svg 는 aria-hidden 이라, 전송 중 통지는 버튼 밖 sr-only role="status" 리전이 맡는다(#914).
  it('동기화 요청이 진행 중이면 보조기술에 "거래내역 동기화 중" 상태를 알린다', () => {
    mockSyncPending = true;
    render(<BankSyncDialog clubId={1} bankLabel="신한" onClose={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('거래내역 동기화 중');
  });
});
