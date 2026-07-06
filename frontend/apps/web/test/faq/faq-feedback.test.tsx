import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockMutateAsync = vi.fn();
let mockIsPending = false;

vi.mock('@duing/hooks', () => ({
  useSubmitFaqFeedbackMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: mockIsPending,
  }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

/* ── 테스트 대상 ───────────────────────────────────────────── */
import { FaqFeedback } from '@/app/faq/_components/FaqFeedback';
// 세션 키 모킹 없이 실제 유틸을 그대로 써서, 컴포넌트가 생성·저장한 값과 mutateAsync 로 넘어간
// 값이 일치하는지(= 매 클릭마다 새로 만들지 않고 저장된 키를 재사용하는지)까지 함께 검증한다.
import { getFaqFeedbackSessionKey } from '@/app/faq/_lib/faqFeedbackSession';

const CHOICES_STORAGE_KEY = 'duing:faq-feedback-choices';

describe('FaqFeedback', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMutateAsync.mockReset();
    mockAddToast.mockReset();
    mockIsPending = false;
  });

  it('도움됐어요 버튼 클릭 시 helpful:true 와 세션 키를 담아 mutateAsync 를 호출하고 완료 문구를 보여준다', async () => {
    mockMutateAsync.mockResolvedValue(undefined);

    render(<FaqFeedback faqId={7} />);
    fireEvent.click(screen.getByRole('button', { name: '👍 도움됐어요' }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    // 컴포넌트가 생성해 localStorage 에 저장한 세션 키와 동일한 값이 페이로드에 실렸는지 확인한다.
    const sessionKey = getFaqFeedbackSessionKey();
    expect(sessionKey).not.toBeNull();
    expect(mockMutateAsync).toHaveBeenCalledWith({
      faqId: 7,
      payload: { helpful: true, sessionKey: sessionKey ?? undefined },
    });

    await waitFor(() =>
      expect(screen.getByText('의견이 반영되었어요')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: '👍 도움됐어요' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('localStorage 에 기록된 이전 선택을 마운트 시 복원해 버튼을 하이라이트한다', () => {
    window.localStorage.setItem(CHOICES_STORAGE_KEY, JSON.stringify({ '9': false }));

    render(<FaqFeedback faqId={9} />);

    expect(screen.getByText('의견이 반영되었어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👎 아쉬워요' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '👍 도움됐어요' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // 복원은 로컬 기록만으로 이뤄진다 — 서버 재조회가 없어야 한다.
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('이전에 선택한 것과 반대 버튼을 클릭하면 값을 바꿔 재제출하고 기록도 갱신된다', async () => {
    window.localStorage.setItem(CHOICES_STORAGE_KEY, JSON.stringify({ '3': true }));
    mockMutateAsync.mockResolvedValue(undefined);

    render(<FaqFeedback faqId={3} />);
    expect(screen.getByRole('button', { name: '👍 도움됐어요' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: '👎 아쉬워요' }));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          faqId: 3,
          payload: expect.objectContaining({ helpful: false }),
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '👎 아쉬워요' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByRole('button', { name: '👍 도움됐어요' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const storedChoices = JSON.parse(window.localStorage.getItem(CHOICES_STORAGE_KEY) ?? '{}');
    expect(storedChoices).toEqual({ '3': false });
  });

  it('제출이 실패하면 에러 토스트를 띄우고 선택 상태를 반영하지 않는다', async () => {
    mockMutateAsync.mockRejectedValue({ message: '서버 오류입니다' });

    render(<FaqFeedback faqId={11} />);
    fireEvent.click(screen.getByRole('button', { name: '👍 도움됐어요' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith('서버 오류입니다', { variant: 'error' }),
    );
    expect(screen.queryByText('의견이 반영되었어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👍 도움됐어요' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(window.localStorage.getItem(CHOICES_STORAGE_KEY)).toBeNull();
  });
});
