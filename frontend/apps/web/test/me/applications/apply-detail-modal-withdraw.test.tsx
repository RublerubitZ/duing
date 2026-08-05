import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ApplyDetailModal } from '@/app/me/applications/_components/ApplyDetailModal';
import type { App, AppStatus } from '@/app/me/applications/_constants/data';

const withdrawMutate = vi.fn(
  (_applicationId: number, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
);

vi.mock('@duing/hooks', () => ({
  useMyInterviewQuery: () => ({ data: undefined }),
  useWithdrawApplicationMutation: () => ({ mutate: withdrawMutate, isPending: false }),
}));

const makeApp = (status: AppStatus): App => ({
  id: '42',
  name: '두잉',
  cat: '취미',
  tag: '봄 신입 모집',
  appliedDate: '2026.06.01',
  appliedAt: '2026.06.01 (월) 10:00',
  division: '-',
  department: '-',
  files: [],
  memo: '',
  steps: [],
  status,
  right: null,
  logo: { kind: 'wordmark', text: '두', bg: '#2A3828', fg: '#E8EEE8' },
});

function renderModal(status: AppStatus, onClose = vi.fn()) {
  render(
    <ToastProvider>
      <ApplyDetailModal app={makeApp(status)} detail={null} onClose={onClose} />
    </ToastProvider>,
  );
  return { onClose };
}

describe('ApplyDetailModal — 지원 철회', () => {
  beforeEach(() => {
    withdrawMutate.mockClear();
  });

  it('모집이 마감돼 결과가 없는 지원(closed-unresolved)에는 철회 버튼이 없다 — 누르면 BE 가 409 를 준다', () => {
    renderModal('closed-unresolved');

    expect(screen.queryByRole('button', { name: '지원 철회' })).toBeNull();
  });

  it('SUBMITTED(applied) 지원에는 "지원 철회" 버튼을 노출한다', () => {
    renderModal('applied');
    expect(screen.getByRole('button', { name: '지원 철회' })).toBeInTheDocument();
  });

  it('면접 대상으로 전이된 지원에는 "지원 철회" 버튼을 노출하지 않는다', () => {
    renderModal('interview-pending');
    expect(screen.queryByRole('button', { name: '지원 철회' })).not.toBeInTheDocument();
  });

  it('철회 → 확인 → 철회하기를 누르면 해당 지원 id로 철회하고 모달을 닫는다', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal('applied');

    await user.click(screen.getByRole('button', { name: '지원 철회' }));
    // 확인 단계 노출
    const confirmButton = screen.getByRole('button', { name: '철회하기' });
    expect(confirmButton).toBeInTheDocument();

    await user.click(confirmButton);

    expect(withdrawMutate).toHaveBeenCalledWith(42, expect.anything());
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText('지원을 철회했어요.')).toBeInTheDocument();
  });

  it('확인 단계에서 취소를 누르면 철회하지 않는다', async () => {
    const user = userEvent.setup();
    renderModal('applied');

    await user.click(screen.getByRole('button', { name: '지원 철회' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '지원 철회' })).toBeInTheDocument();
    expect(withdrawMutate).not.toHaveBeenCalled();
  });
});
