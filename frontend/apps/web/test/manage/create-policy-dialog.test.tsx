import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCreateFeePolicyMutation: () => ({ mutate: mockCreateMutate, isPending: false, error: null }),
  useUpdateFeePolicyMutation: () => ({ mutate: mockUpdateMutate, isPending: false, error: null }),
}));

import { CreatePolicyDialog } from '@/app/manage/clubs/[clubId]/fees/_components/CreatePolicyDialog';

const yearlyPolicy = {
  id: 5,
  name: '연 회비',
  amount: 50000,
  billingType: 'YEARLY' as const,
  active: true,
};

describe('CreatePolicyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('생성 모드에서는 회비 유형 select 를 노출한다', () => {
    render(<CreatePolicyDialog clubId={1} onClose={() => {}} />);
    expect(screen.getByRole('combobox', { name: '회비 유형' })).toBeInTheDocument();
  });

  it('수정 모드에서는 billingType 이 읽기 전용이고 금액 불변 안내를 표시한다', () => {
    render(<CreatePolicyDialog clubId={1} policy={yearlyPolicy} onClose={() => {}} />);
    expect(screen.queryByRole('combobox', { name: '회비 유형' })).not.toBeInTheDocument();
    expect(screen.getByText(/변경할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 발행 청구액은 바뀌지 않습니다.')).toBeInTheDocument();
  });

  it('이름이 비면 검증 에러를 표시하고 제출하지 않는다', async () => {
    const user = userEvent.setup();
    render(<CreatePolicyDialog clubId={1} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('정책 이름은 필수입니다.')).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('유효한 입력을 제출하면 생성 뮤테이션을 호출하고 성공 시 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockCreateMutate.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<CreatePolicyDialog clubId={1} onClose={onClose} />);

    await user.type(screen.getByLabelText(/정책 이름/), '월 회비');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('수정 모드 제출 시 billingType 없이 name·amount 만 전송한다', async () => {
    const user = userEvent.setup();
    mockUpdateMutate.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<CreatePolicyDialog clubId={1} policy={yearlyPolicy} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalled());
    const [firstArg] = mockUpdateMutate.mock.calls[0] as [
      { policyId: number; payload: Record<string, unknown> },
    ];
    expect(firstArg.policyId).toBe(5);
    expect(firstArg.payload).not.toHaveProperty('billingType');
    expect(firstArg.payload).toEqual({ name: '연 회비', amount: 50000 });
  });
});
