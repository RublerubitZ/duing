import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseClubFeePoliciesQuery = vi.fn();
const mockGenerateMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeePoliciesQuery: (clubId: number) => mockUseClubFeePoliciesQuery(clubId),
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
  active: true,
};
const semesterPolicy = {
  id: 2,
  name: '학기 회비',
  amount: 50000,
  billingType: 'SEMESTER' as const,
  active: true,
};
const inactivePolicy = {
  id: 3,
  name: '옛 회비',
  amount: 1000,
  billingType: 'MONTHLY' as const,
  active: false,
};

describe('GenerateBillsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('성공 시 신규·기존 건수 토스트를 띄우고 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockGenerateMutate.mockImplementation(
      (
        _vars: unknown,
        options: { onSuccess: (result: { created: number; skipped: number }) => void },
      ) => options.onSuccess({ created: 3, skipped: 2 }),
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
});
