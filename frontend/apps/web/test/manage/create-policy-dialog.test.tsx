import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCreateFeePolicyMutation: () => ({ mutate: mockCreateMutate, isPending: false, error: null }),
  useUpdateFeePolicyMutation: () => ({ mutate: mockUpdateMutate, isPending: false, error: null }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { CreatePolicyDialog } from '@/app/manage/clubs/[clubId]/fees/_components/CreatePolicyDialog';

const yearlyPolicy = {
  id: 5,
  name: '연 회비',
  amount: 50000,
  billingType: 'YEARLY' as const,
  targetType: 'ALL_MEMBERS' as const,
  active: true,
  autoIssue: false,
  issueDay: null,
  dueDay: null,
};

const selectedMembersPolicy = {
  id: 9,
  name: 'MT 참가비',
  amount: 30000,
  billingType: 'ONE_TIME' as const,
  targetType: 'SELECTED_MEMBERS' as const,
  active: true,
  autoIssue: false,
  issueDay: null,
  dueDay: null,
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
    expect(screen.getByText(/유형은 변경할 수 없습니다/)).toBeInTheDocument();
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
    // autoIssue=false 이므로 issueDay/dueDay 는 동봉하지 않는다.
    expect(firstArg.payload).toEqual({ name: '연 회비', amount: 50000, autoIssue: false });
  });

  it('MONTHLY 자동발행을 켜고 발행일·마감일을 입력하면 페이로드에 실려 생성된다', async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<CreatePolicyDialog clubId={1} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/정책 이름/), '월 회비');
    await user.click(screen.getByLabelText('매월 자동 발행'));
    await user.type(screen.getByLabelText('발행일(1~28)'), '5');
    await user.type(screen.getByLabelText('마감일(1~28)'), '20');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    expect(mockCreateMutate.mock.calls[0]?.[0]).toMatchObject({
      autoIssue: true,
      issueDay: 5,
      dueDay: 20,
    });
  });

  it('자동발행을 켠 뒤 회비 유형을 비-MONTHLY로 바꾸면 막힘 없이 autoIssue=false 로 제출된다', async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<CreatePolicyDialog clubId={1} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/정책 이름/), '회비');
    await user.click(screen.getByLabelText('매월 자동 발행'));
    await user.type(screen.getByLabelText('발행일(1~28)'), '5');
    await user.type(screen.getByLabelText('마감일(1~28)'), '20');
    // 유형을 YEARLY로 변경 → 자동발행 필드 리셋되어야 함
    await user.selectOptions(screen.getByLabelText('회비 유형'), 'YEARLY');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    const submitted = mockCreateMutate.mock.calls[0]?.[0];
    expect(submitted).toMatchObject({ billingType: 'YEARLY', autoIssue: false });
    expect(submitted).not.toHaveProperty('issueDay');
    expect(submitted).not.toHaveProperty('dueDay');
  });

  it('마감일이 발행일보다 앞서면 검증 에러를 보여준다', async () => {
    const user = userEvent.setup();
    render(<CreatePolicyDialog clubId={1} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/정책 이름/), '월 회비');
    await user.click(screen.getByLabelText('매월 자동 발행'));
    await user.type(screen.getByLabelText('발행일(1~28)'), '20');
    await user.type(screen.getByLabelText('마감일(1~28)'), '5');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('마감일은 발행일과 같거나 이후여야 합니다.')).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('생성 모드에서 전체 회원·특정 회원 청구 대상 라디오를 노출한다', () => {
    render(<CreatePolicyDialog clubId={1} onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: '전체 회원' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '특정 회원' })).toBeInTheDocument();
  });

  it('특정 회원을 선택하면 자동발행 토글이 사라진다', async () => {
    const user = userEvent.setup();
    render(<CreatePolicyDialog clubId={1} onClose={() => {}} />);

    // MONTHLY·전체 회원 기본값이라 자동발행 토글이 보인다.
    expect(screen.getByLabelText('매월 자동 발행')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: '특정 회원' }));

    expect(screen.queryByLabelText('매월 자동 발행')).not.toBeInTheDocument();
  });

  it('특정 회원 정책을 생성하면 payload 에 targetType=SELECTED_MEMBERS 가 실린다', async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation((_payload: unknown, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    render(<CreatePolicyDialog clubId={1} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/정책 이름/), 'MT 참가비');
    await user.click(screen.getByRole('radio', { name: '특정 회원' }));
    await user.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    expect(mockCreateMutate.mock.calls[0]?.[0]).toMatchObject({
      name: 'MT 참가비',
      targetType: 'SELECTED_MEMBERS',
      autoIssue: false,
    });
  });

  it('수정 모드에서 특정 회원 정책은 청구 대상이 읽기 전용으로 표시된다', () => {
    render(<CreatePolicyDialog clubId={1} policy={selectedMembersPolicy} onClose={() => {}} />);
    expect(screen.queryByRole('radio', { name: '전체 회원' })).not.toBeInTheDocument();
    expect(screen.getByText('특정 회원')).toBeInTheDocument();
  });
});
