import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiError } from '@duing/api';
import { StatusActionBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusActionBar';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const mockMutate = vi.fn();

vi.mock('@duing/hooks', () => ({
  useUpdateApplicationStatusMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderBar(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/** mutate 를 즉시 실패시키는 스텁 — onError 콜백으로 넘긴 에러를 그대로 돌려준다. */
function failMutationWith(error: unknown) {
  mockMutate.mockImplementation((_variables, options) => {
    options?.onError?.(error);
    options?.onSettled?.();
  });
}

describe('StatusActionBar', () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it('ON_HOLD + useInterview=true 면 면접대기와 불합격 버튼이 노출되고 합격 버튼은 없다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ON_HOLD" useInterview />);
    expect(screen.getByRole('button', { name: /면접 대상/ })).toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
    expect(buttonTexts.every((text) => !text.trim().startsWith('합격'))).toBe(true);
  });

  it('ON_HOLD + useInterview=false 면 합격과 불합격 버튼이 노출된다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ON_HOLD" useInterview={false} />);
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('합격'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
  });

  it('어떤 상태/조합에서도 "면접 일정 입력" 버튼이 렌더되지 않는다 (Legacy 회귀 가드)', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="INTERVIEW_PENDING" useInterview />);
    expect(screen.queryByRole('button', { name: '면접 일정 입력' })).not.toBeInTheDocument();
  });

  it('ACCEPTED 상태에서 최종 상태 메시지가 표시된다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ACCEPTED" useInterview />);
    expect(screen.getByText(/더 이상 변경 가능한 상태가 없습니다/)).toBeInTheDocument();
  });

  it('보류 버튼은 확인 모달 없이 즉시 mutate 한다', async () => {
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(screen.getByRole('button', { name: '보류로' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 두 번째 인자는 실패 토스트 콜백 — 즉시 전이도 확인 모달 경로와 같은 실패 안내를 탄다.
    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 5, payload: { status: 'ON_HOLD' } },
      expect.anything(),
    );
  });

  it('면접 대상 버튼도 확인 모달 없이 즉시 mutate 한다', async () => {
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(screen.getByRole('button', { name: '면접 대상으로' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 5, payload: { status: 'INTERVIEW_PENDING' } },
      expect.anything(),
    );
  });

  it('합격 버튼은 확인 모달을 거쳐야 mutate 된다', async () => {
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="SUBMITTED" useInterview={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '합격으로' }));

    expect(screen.getByRole('dialog', { name: '합격 처리하시겠습니까?' })).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '합격 처리' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 7, payload: { status: 'ACCEPTED' } },
      expect.anything(),
    );
  });

  it('불합격 버튼은 확인 모달을 거쳐야 mutate 된다', async () => {
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="INTERVIEW_PENDING" useInterview />,
    );

    await userEvent.click(screen.getByRole('button', { name: '불합격으로' }));

    expect(screen.getByRole('dialog', { name: '불합격 처리하시겠습니까?' })).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '불합격 처리' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 7, payload: { status: 'REJECTED' } },
      expect.anything(),
    );
  });

  it('확인 모달에서 취소하면 mutate 되지 않고 모달이 닫힌다', async () => {
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="INTERVIEW_PENDING" useInterview />,
    );

    await userEvent.click(screen.getByRole('button', { name: '합격으로' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // 마감 모집 — 최종 결과 확정만 허용 (스펙 §1-3 개정)
  it('마감된 모집에서는 최종 결과 버튼만 남고 심사를 되돌리는 전이는 사라진다', () => {
    renderBar(
      <StatusActionBar
        applicationId={1}
        recruitmentId={1}
        currentStatus="SUBMITTED"
        useInterview
        finalizeOnly
      />,
    );

    // 면접 모집이어도 면접 단계를 거치지 않고 바로 확정할 수 있다 — 마감 후엔 라운드를 열 수 없다.
    expect(screen.getByRole('button', { name: '합격으로' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '불합격으로' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보류로' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '면접 대상으로' })).not.toBeInTheDocument();
    expect(screen.getByText(/최종 결과만 확정할 수 있습니다/)).toBeInTheDocument();
  });

  it('마감된 모집에서 이미 결과가 확정된 지원은 남은 조치가 없다고 알린다', () => {
    renderBar(
      <StatusActionBar
        applicationId={1}
        recruitmentId={1}
        currentStatus="ACCEPTED"
        useInterview
        finalizeOnly
      />,
    );

    expect(screen.getByText('마감된 모집이고 결과도 확정되어 변경할 수 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '합격으로' })).not.toBeInTheDocument();
  });

  // 기존 조용한 실패 결함 해소 — 상태 변경 실패는 반드시 안내가 뜬다.
  it('상태 변경이 RECRUITMENT_CLOSED 로 실패하면 마감 안내 토스트를 띄운다', async () => {
    failMutationWith(new ApiError(409, '마감된 모집에서는 할 수 없는 작업입니다.', undefined, 'RECRUITMENT_CLOSED'));
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(screen.getByRole('button', { name: '보류로' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('마감된 모집에서는 할 수 없는 작업입니다');
  });

  it('그 외 실패에도 일반 실패 토스트를 띄운다', async () => {
    failMutationWith(new ApiError(500, '서버 오류'));
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(screen.getByRole('button', { name: '보류로' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류');
  });

  it('확인 모달을 거치는 전이도 실패하면 토스트를 띄우고 모달을 닫는다', async () => {
    failMutationWith(new ApiError(409, '마감된 모집에서는 할 수 없는 작업입니다.', undefined, 'RECRUITMENT_CLOSED'));
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="SUBMITTED" useInterview={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '합격으로' }));
    await userEvent.click(screen.getByRole('button', { name: '합격 처리' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('마감된 모집에서는 할 수 없는 작업입니다');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
