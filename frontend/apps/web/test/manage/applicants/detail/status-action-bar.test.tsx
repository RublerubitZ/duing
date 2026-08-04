import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusActionBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusActionBar';

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

describe('StatusActionBar', () => {
  beforeEach(() => {
    mockMutate.mockClear();
  });

  it('ON_HOLD + useInterview=true 면 면접대기와 불합격 버튼이 노출되고 합격 버튼은 없다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ON_HOLD" useInterview />);
    expect(screen.getByRole('button', { name: /면접 대상/ })).toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
    expect(buttonTexts.every((text) => !text.trim().startsWith('합격'))).toBe(true);
  });

  it('ON_HOLD + useInterview=false 면 합격과 불합격 버튼이 노출된다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ON_HOLD" useInterview={false} />);
    expect(screen.queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
    const buttonTexts = screen.getAllByRole('button').map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('합격'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
  });

  it('어떤 상태/조합에서도 "면접 일정 입력" 버튼이 렌더되지 않는다 (Legacy 회귀 가드)', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="INTERVIEW_PENDING" useInterview />);
    expect(screen.queryByRole('button', { name: '면접 일정 입력' })).not.toBeInTheDocument();
  });

  it('ACCEPTED 상태에서 최종 상태 메시지가 표시된다', () => {
    render(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ACCEPTED" useInterview />);
    expect(screen.getByText(/더 이상 변경 가능한 상태가 없습니다/)).toBeInTheDocument();
  });

  it('보류 버튼은 확인 모달 없이 즉시 mutate 한다', async () => {
    render(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(screen.getByRole('button', { name: '보류로' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledWith({ applicationId: 5, payload: { status: 'ON_HOLD' } });
  });

  it('면접 대상 버튼도 확인 모달 없이 즉시 mutate 한다', async () => {
    render(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(screen.getByRole('button', { name: '면접 대상으로' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledWith({
      applicationId: 5,
      payload: { status: 'INTERVIEW_PENDING' },
    });
  });

  it('합격 버튼은 확인 모달을 거쳐야 mutate 된다', async () => {
    render(
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
    render(
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
    render(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="INTERVIEW_PENDING" useInterview />,
    );

    await userEvent.click(screen.getByRole('button', { name: '합격으로' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
