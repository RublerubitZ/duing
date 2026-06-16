import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// PolicyList 가 `error instanceof ApiError` 로 분기하므로, 같은 모듈에서 export 되는 클래스로 모킹한다.
// vi.mock 은 파일 상단으로 호이스트되므로 클래스도 vi.hoisted 로 함께 끌어올린다.
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

const mockUseClubFeePoliciesQuery = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeePoliciesQuery: (clubId: number) => mockUseClubFeePoliciesQuery(clubId),
  useUpdateFeePolicyMutation: () => ({ mutate: mockUpdateMutate, isPending: false, error: null }),
  useDeleteFeePolicyMutation: () => ({ mutate: mockDeleteMutate, isPending: false, error: null }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { PolicyList } from '@/app/manage/clubs/[clubId]/fees/_components/PolicyList';

const buildPolicy = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1,
  name: '월 회비',
  amount: 10000,
  billingType: 'MONTHLY' as const,
  active: true,
  ...over,
});

describe('PolicyList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('정책이 없으면 빈 상태 안내를 표시한다', () => {
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [], isLoading: false });
    render(<PolicyList clubId={1} />);
    expect(screen.getByText('아직 등록된 회비 정책이 없습니다.')).toBeInTheDocument();
  });

  it('정책 행에 이름·유형·금액을 표시한다', () => {
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [buildPolicy()], isLoading: false });
    render(<PolicyList clubId={1} />);
    expect(screen.getByText('월 회비')).toBeInTheDocument();
    expect(screen.getByText(/월 회비 · 10,000원/)).toBeInTheDocument();
  });

  it('활성 토글을 누르면 active 를 반전하여 update 뮤테이션을 호출한다', () => {
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [buildPolicy({ active: true })], isLoading: false });
    render(<PolicyList clubId={1} />);
    fireEvent.click(screen.getByRole('switch', { name: /활성 상태/ }));
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { policyId: 1, payload: { active: false } },
      expect.any(Object),
    );
  });

  it('삭제가 409(DeleteForbidden)로 실패하면 청구 이력 안내 토스트를 띄운다', () => {
    mockUseClubFeePoliciesQuery.mockReturnValue({ data: [buildPolicy()], isLoading: false });
    mockDeleteMutate.mockImplementation((_policyId: number, options: { onError: (error: unknown) => void }) =>
      options.onError(new MockApiError(409)),
    );
    render(<PolicyList clubId={1} />);

    fireEvent.click(screen.getByRole('button', { name: '삭제' })); // 행의 삭제 → 확인 다이얼로그
    const confirm = screen.getByRole('alertdialog', { name: '회비 정책 삭제 확인' });
    fireEvent.click(within(confirm).getByRole('button', { name: '삭제' }));

    expect(mockDeleteMutate).toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('이미 청구 이력이 있는 정책은 삭제할 수 없습니다'),
      expect.objectContaining({ variant: 'error' }),
    );
  });
});
