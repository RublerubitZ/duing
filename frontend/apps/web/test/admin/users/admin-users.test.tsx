import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminUserSearchResult, PageResponse } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockSearch = vi.fn();
const mockForceLogout = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminUserSearchQuery: (...args: unknown[]) => mockSearch(...args),
  useAdminForceLogoutMutation: () => ({ mutate: mockForceLogout, isPending: false }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

// 디바운스는 타이밍 의존을 없애기 위해 항등 함수로 대체한다.
vi.mock('@/app/admin/_hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

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

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminUsersPage } from '@/app/admin/users/_pages/AdminUsersPage';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeUser(overrides: Partial<AdminUserSearchResult> = {}): AdminUserSearchResult {
  return {
    id: 1,
    studentId: '20250001',
    name: '김두잉',
    role: 'STUDENT',
    ...overrides,
  };
}

function searchSuccess(rows: AdminUserSearchResult[]) {
  const page: PageResponse<AdminUserSearchResult> = {
    content: rows,
    page: 0,
    size: 20,
    totalElements: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / 20)),
    hasNext: false,
  };
  return { data: page, isLoading: false, isSuccess: true, isError: false };
}

const searchIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false };

async function searchFor(keyword: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('회원 검색'), keyword);
  return user;
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockReturnValue(searchIdle);
  });

  it('검색 결과의 학번·이름·역할 한글 라벨을 렌더링한다', async () => {
    mockSearch.mockReturnValue(
      searchSuccess([
        makeUser({ id: 1, studentId: '20250001', name: '김두잉', role: 'STUDENT' }),
        makeUser({ id: 2, studentId: '20240002', name: '이관리', role: 'ADMIN' }),
      ]),
    );
    render(<AdminUsersPage />);
    await searchFor('20');

    expect(screen.getByText('20250001')).toBeInTheDocument();
    expect(screen.getByText('김두잉')).toBeInTheDocument();
    expect(screen.getByText('학생')).toBeInTheDocument();
    expect(screen.getByText('이관리')).toBeInTheDocument();
    expect(screen.getByText('관리자')).toBeInTheDocument();
  });

  it('강제 로그아웃 클릭 → 확인 다이얼로그 확정 시 대상 userId 로 mutate 하고 성공 토스트를 띄운다', async () => {
    mockForceLogout.mockImplementation(
      (_userId: number, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
    );
    mockSearch.mockReturnValue(searchSuccess([makeUser({ id: 77, name: '박강퇴' })]));
    render(<AdminUsersPage />);
    const user = await searchFor('박');

    await user.click(screen.getByRole('button', { name: '강제 로그아웃' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '강제 로그아웃' }));

    await waitFor(() => expect(mockForceLogout).toHaveBeenCalled());
    expect(mockForceLogout.mock.calls[0]?.[0]).toBe(77);
    expect(mockAddToast).toHaveBeenCalledWith(
      '강제 로그아웃 처리했어요. 대상 회원의 모든 기기가 로그아웃됩니다.',
    );
  });

  it('다이얼로그를 취소하면 mutate 를 호출하지 않는다', async () => {
    mockSearch.mockReturnValue(searchSuccess([makeUser({ id: 88, name: '최취소' })]));
    render(<AdminUsersPage />);
    const user = await searchFor('최');

    await user.click(screen.getByRole('button', { name: '강제 로그아웃' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(mockForceLogout).not.toHaveBeenCalled();
  });

  it('검색 결과가 없으면 안내 문구를 보여준다', async () => {
    mockSearch.mockReturnValue(searchSuccess([]));
    render(<AdminUsersPage />);
    await searchFor('없는사람');

    expect(screen.getByText('검색 결과가 없습니다')).toBeInTheDocument();
  });
});
