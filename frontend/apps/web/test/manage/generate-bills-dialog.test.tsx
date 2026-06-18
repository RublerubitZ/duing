import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseClubFeePoliciesQuery = vi.fn();
const mockUseClubMembersQuery = vi.fn();
const mockGenerateMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeePoliciesQuery: (clubId: number) => mockUseClubFeePoliciesQuery(clubId),
  useClubMembersQuery: (clubId: number | undefined) => mockUseClubMembersQuery(clubId),
  useGenerateBillsMutation: () => ({
    mutate: mockGenerateMutate,
    isPending: false,
    error: null,
  }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// GenerateBillsForm 가 `error instanceof ApiError` 분기에 쓰는 클래스(실 분기엔 안 닿지만 import 해소용).
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

import { GenerateBillsDialog } from '@/app/manage/clubs/[clubId]/fees/_components/GenerateBillsDialog';

const monthlyPolicy = {
  id: 1,
  name: '월 회비',
  amount: 10000,
  billingType: 'MONTHLY' as const,
  targetType: 'ALL_MEMBERS' as const,
  active: true,
};
const semesterPolicy = {
  id: 2,
  name: '학기 회비',
  amount: 50000,
  billingType: 'SEMESTER' as const,
  targetType: 'ALL_MEMBERS' as const,
  active: true,
};
const inactivePolicy = {
  id: 3,
  name: '옛 회비',
  amount: 1000,
  billingType: 'MONTHLY' as const,
  targetType: 'ALL_MEMBERS' as const,
  active: false,
};
const selectedPolicy = {
  id: 4,
  name: '임원 회비',
  amount: 30000,
  billingType: 'MONTHLY' as const,
  targetType: 'SELECTED_MEMBERS' as const,
  active: true,
};

const members = [
  { memberId: 11, userId: 101, name: '김유신', studentId: '20230001', role: 'OFFICER' as const, joinedAt: '2026-03-01' },
  { memberId: 12, userId: 102, name: '이순신', studentId: '20230002', role: 'MEMBER' as const, joinedAt: '2026-03-02' },
];

describe('GenerateBillsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClubMembersQuery.mockReturnValue({ data: members, isLoading: false });
  });

  it('활성 정책만 선택지로 노출한다', () => {
    mockUseClubFeePoliciesQuery.mockReturnValue({
      data: [monthlyPolicy, inactivePolicy],
      isLoading: false,
    });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    const select = screen.getByRole('combobox', { name: '회비 정책 선택' });
    expect(within(select).queryByText(/옛 회비/)).not.toBeInTheDocument();
    expect(within(select).getByText(/월 회비/)).toBeInTheDocument();
  });

  it('활성 정책이 없으면 안내 문구를 표시한다', () => {
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [inactivePolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);
    expect(
      screen.getByText(/발행할 수 있는 활성 정책이 없습니다/),
    ).toBeInTheDocument();
  });

  it('MONTHLY 정책 선택 시 회차 필드만 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [monthlyPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '1');

    expect(screen.getByLabelText(/청구 회차/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/시작일/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/종료일/)).not.toBeInTheDocument();
  });

  it('SEMESTER 정책 선택 시 기간·마감·라벨 필드를 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [semesterPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '2');

    expect(screen.getByLabelText(/회차 라벨/)).toBeInTheDocument();
    expect(screen.getByLabelText(/시작일/)).toBeInTheDocument();
    expect(screen.getByLabelText(/종료일/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^마감일/)).toBeInTheDocument();
  });

  it('MONTHLY 회차가 비면 검증 에러를 띄우고 제출하지 않는다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [monthlyPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '1');
    await user.click(screen.getByRole('button', { name: '발행' }));

    expect(await screen.findByText('회차(YYYY-MM)는 필수입니다.')).toBeInTheDocument();
    expect(mockGenerateMutate).not.toHaveBeenCalled();
  });

  it('제출 시 billingType 없는 flat 페이로드로 발행 뮤테이션을 호출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [monthlyPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '1');
    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    await waitFor(() => expect(mockGenerateMutate).toHaveBeenCalled());
    const [firstArg] = mockGenerateMutate.mock.calls[0] as [
      { policyId: number; payload: Record<string, unknown> },
    ];
    expect(firstArg.policyId).toBe(1);
    expect(firstArg.payload).not.toHaveProperty('billingType');
    // 미입력 dueDate 는 와이어에서 제외되어야 한다(백엔드 LocalDate "" 역직렬화 400 방지).
    expect(firstArg.payload).not.toHaveProperty('dueDate');
    expect(firstArg.payload.billingPeriod).toBe('2026-07');
  });

  it('ALL_MEMBERS 성공 시 신규·기존(이미 발행) 건수 토스트를 띄우고 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockGenerateMutate.mockImplementation(
      (
        _vars: unknown,
        options: {
          onSuccess: (result: { created: number; skipped: number; skippedUserIds: number[] }) => void;
        },
      ) => options.onSuccess({ created: 3, skipped: 2, skippedUserIds: [] }),
    );
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [monthlyPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={onClose} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '1');
    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    await waitFor(() => expect(mockAddToast).toHaveBeenCalled());
    expect(mockAddToast).toHaveBeenCalledWith('발행 완료 (신규 3 · 기존 2)');
    expect(onClose).toHaveBeenCalled();
  });

  it('ALL_MEMBERS 성공 시 기존(skipped) 0 이면 신규 건수만 토스트한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockGenerateMutate.mockImplementation(
      (
        _vars: unknown,
        options: {
          onSuccess: (result: { created: number; skipped: number; skippedUserIds: number[] }) => void;
        },
      ) => options.onSuccess({ created: 5, skipped: 0, skippedUserIds: [] }),
    );
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [monthlyPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={onClose} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '1');
    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    await waitFor(() => expect(mockAddToast).toHaveBeenCalled());
    expect(mockAddToast).toHaveBeenCalledWith('발행 완료 (신규 5)');
    expect(onClose).toHaveBeenCalled();
  });

  it('ALL_MEMBERS 정책은 회원 선택 UI 없이 그대로 발행한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [monthlyPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '1');

    expect(screen.queryByText(/청구 대상 회원/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    await waitFor(() => expect(mockGenerateMutate).toHaveBeenCalled());
    const [firstArg] = mockGenerateMutate.mock.calls[0] as [
      { policyId: number; payload: Record<string, unknown> },
    ];
    expect(firstArg.payload).not.toHaveProperty('memberIds');
  });

  it('SELECTED_MEMBERS 정책 선택 시 회원 체크박스를 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [selectedPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '4');

    expect(screen.getByText(/청구 대상 회원/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /김유신/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /이순신/ })).toBeInTheDocument();
  });

  it('SELECTED_MEMBERS 정책에서 회원 미선택 제출은 에러를 띄우고 발행하지 않는다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [selectedPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '4');
    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    expect(await screen.findByText('청구할 회원을 1명 이상 선택해 주세요.')).toBeInTheDocument();
    expect(mockGenerateMutate).not.toHaveBeenCalled();
  });

  it('SELECTED_MEMBERS 정책에서 선택한 회원의 userId 배열을 payload.memberIds 로 발행한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [selectedPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={() => {}} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '4');
    await user.click(screen.getByRole('checkbox', { name: /김유신/ }));
    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    await waitFor(() => expect(mockGenerateMutate).toHaveBeenCalled());
    const [firstArg] = mockGenerateMutate.mock.calls[0] as [
      { policyId: number; payload: Record<string, unknown> },
    ];
    expect(firstArg.policyId).toBe(4);
    expect(firstArg.payload.memberIds).toEqual([101]);
  });

  it('skippedUserIds 가 있으면 토스트에 제외 건수를 함께 표시한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockGenerateMutate.mockImplementation(
      (
        _vars: unknown,
        options: {
          onSuccess: (result: { created: number; skipped: number; skippedUserIds: number[] }) => void;
        },
      ) => options.onSuccess({ created: 1, skipped: 0, skippedUserIds: [102] }),
    );
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [selectedPolicy], isLoading: false });
    render(<GenerateBillsDialog clubId={1} onClose={onClose} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '회비 정책 선택' }), '4');
    await user.click(screen.getByRole('checkbox', { name: /김유신/ }));
    await user.type(screen.getByLabelText(/청구 회차/), '2026-07');
    await user.click(screen.getByRole('button', { name: '발행' }));

    await waitFor(() => expect(mockAddToast).toHaveBeenCalled());
    expect(mockAddToast).toHaveBeenCalledWith('발행 완료 (신규 1 · 제외 1)');
    expect(onClose).toHaveBeenCalled();
  });
});
