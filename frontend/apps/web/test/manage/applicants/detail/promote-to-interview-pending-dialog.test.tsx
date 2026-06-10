import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@duing/api';

import { PromoteToInterviewPendingDialog } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/PromoteToInterviewPendingDialog';

const mutateMock = vi.fn();
let mutationStateOverride: { isPending: boolean } = { isPending: false };

vi.mock('@duing/hooks', () => ({
  useUpdateApplicationStatusMutation: () => ({
    mutate: mutateMock,
    isPending: mutationStateOverride.isPending,
  }),
}));

describe('PromoteToInterviewPendingDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    mutationStateOverride = { isPending: false };
  });

  it('지원자 이름과 안내 문구, 확정 버튼이 렌더된다', () => {
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={() => {}}
        onPromoted={() => {}}
      />,
    );

    expect(screen.getByText(/이 지원자는 아직 면접 대상이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/지원자: 홍길동/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '면접 대상으로 변경 후 배정' }),
    ).toBeInTheDocument();
  });

  it('확정 버튼 클릭 시 INTERVIEW_PENDING 으로 status mutation 이 호출된다', async () => {
    render(
      <PromoteToInterviewPendingDialog
        applicationId={42}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={() => {}}
        onPromoted={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '면접 대상으로 변경 후 배정' }),
    );

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0]?.[0]).toEqual({
      applicationId: 42,
      payload: { status: 'INTERVIEW_PENDING' },
    });
  });

  it('mutation onSuccess 시 onPromoted 가 호출된다', async () => {
    const onPromoted = vi.fn();
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={() => {}}
        onPromoted={onPromoted}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '면접 대상으로 변경 후 배정' }),
    );

    const callOptions = mutateMock.mock.calls[0]?.[1];
    callOptions?.onSuccess();

    expect(onPromoted).toHaveBeenCalledTimes(1);
  });

  it('mutation onError 시 에러 메시지가 표시되고 onPromoted 는 호출되지 않는다', async () => {
    const onPromoted = vi.fn();
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={() => {}}
        onPromoted={onPromoted}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '면접 대상으로 변경 후 배정' }),
    );

    const callOptions = mutateMock.mock.calls[0]?.[1];
    callOptions?.onError(new Error('서버 오류'));

    expect(onPromoted).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/상태 변경에 실패했습니다/),
    ).toBeInTheDocument();
  });

  it('취소 버튼 클릭 시 onCancel 이 호출된다', async () => {
    const onCancel = vi.fn();
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={onCancel}
        onPromoted={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('mutation onError 시 ApiError 메시지는 그대로 노출된다', async () => {
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={() => {}}
        onPromoted={() => {}}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '면접 대상으로 변경 후 배정' }),
    );

    const callOptions = mutateMock.mock.calls[0]?.[1];
    callOptions?.onError(new ApiError(400, '이미 면접 대상 상태입니다.'));

    expect(
      await screen.findByText('이미 면접 대상 상태입니다.'),
    ).toBeInTheDocument();
  });

  it('mutation isPending 동안 확정 버튼이 비활성화되고 로딩 라벨로 바뀐다', () => {
    mutationStateOverride = { isPending: true };
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={() => {}}
        onPromoted={() => {}}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: '변경 중…' });
    expect(confirmButton).toBeDisabled();
  });

  it('mutation isPending 동안 Escape 와 backdrop 클릭이 onCancel 을 호출하지 않는다', () => {
    mutationStateOverride = { isPending: true };
    const onCancel = vi.fn();
    render(
      <PromoteToInterviewPendingDialog
        applicationId={1}
        recruitmentId={10}
        applicantName="홍길동"
        onCancel={onCancel}
        onPromoted={() => {}}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog');
    const backdrop = dialog.parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(onCancel).not.toHaveBeenCalled();
  });
});
