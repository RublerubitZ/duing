import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminUserDetail, AdminUserSearchResult, PageResponse } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockSearch = vi.fn();

/** 목록 조회 한 페이지 크기. KPI 카드가 같은 훅을 size 1 로 부르므로 두 호출을 가르는 기준이기도 하다. */
const LIST_PAGE_SIZE = 20;

/**
 * 목록 조회 중 마지막 호출의 인자를 돌려준다.
 *
 * <p>KPI 카드가 같은 훅을 건수 조회용(size 1)으로 두 번 더 부르기 때문에 "마지막 호출"이 곧
 * 목록 조회는 아니다. 페이지 크기로 목록 호출만 걸러야 "필터를 바꾸면 페이지가 0 으로 돌아간다" 같은
 * 단언이 KPI 호출에 가려지지 않는다.
 */
function lastListCallArgs(): unknown[] | undefined {
  const listCalls = mockSearch.mock.calls.filter((callArgs) => {
    const params = callArgs[0];
    return typeof params === 'object' && params !== null && 'size' in params
      ? params.size === LIST_PAGE_SIZE
      : false;
  });
  return listCalls.at(-1);
}
// 상태 필터·페이지는 URL 로 오간다(검색어는 의도적으로 URL 에 싣지 않는다) — 주소를 갈아끼우는
// 대신 여기서 현재 질의 문자열을 붙들고, replace 호출을 기록해 어떤 주소로 바꾸려 했는지 본다.
// (admin-bookings-page.test 의 next/navigation 모킹 패턴)
const mockReplace = vi.fn();
let mockQueryString = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockQueryString),
}));

const mockForceLogout = vi.fn();
const mockUserDetail = vi.fn();
const mockChangeStatus = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminUserSearchQuery: (...args: unknown[]) => mockSearch(...args),
  useAdminForceLogoutMutation: () => ({ mutate: mockForceLogout, isPending: false }),
  useAdminUserStatusMutation: () => ({ mutate: mockChangeStatus, isPending: false }),
  // 상세 패널이 쓰는 훅들 — 이 화면 테스트는 패널이 "열렸는지"까지만 본다(본문은 상세 시트 테스트).
  useAdminUserDetailQuery: (userId: number | undefined) => mockUserDetail(userId),
  useAdminUserPhoneMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false }),
  useAdminUserNoteMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockAddToast = vi.fn();
// useGuardedRouter 가 ToastProvider 컨텍스트를 물어 useOptionalToast 까지 스텁한다.
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  useOptionalToast: () => vi.fn(),
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
    grade: 'FRESHMAN',
    college: 'NURSING',
    major: '간호학',
    ...overrides,
  };
}

function searchSuccess(rows: AdminUserSearchResult[], totalPages = Math.max(1, Math.ceil(rows.length / 20))) {
  const page: PageResponse<AdminUserSearchResult> = {
    content: rows,
    page: 0,
    size: 20,
    totalElements: rows.length,
    totalPages,
    hasNext: totalPages > 1,
  };
  return { data: page, isLoading: false, isSuccess: true, isError: false };
}

const searchIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false };

function makeDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 42,
    name: '정상세',
    studentId: '2023118902',
    grade: 'SOPHOMORE',
    college: 'IT_ENGINEERING',
    major: '전자공학과',
    role: 'STUDENT',
    maskedPhone: '010-****-9983',
    phoneVerified: true,
    phoneVerifiedAt: null,
    status: 'ACTIVE',
    createdAt: '2024-03-04T01:00:00Z',
    lastLoginAt: null,
    adminNote: null,
    adminNoteUpdatedAt: null,
    adminNoteUpdatedBy: null,
    clubs: [],
    recentActions: [],
    ...overrides,
  };
}

/** 목록에서 상세 패널을 연 상태까지 진행한다 — 위험 작업 버튼은 상세에만 있다. */
async function openDetailSheet(detail: AdminUserDetail) {
  mockSearch.mockReturnValue(searchSuccess([makeUser({ id: detail.id, name: detail.name })]));
  mockUserDetail.mockReturnValue({ data: detail, isLoading: false, isError: false });
  render(<AdminUsersPage />);

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: `${detail.name} 상세` }));
  return user;
}

async function searchFor(keyword: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('회원 검색'), keyword);
  return user;
}

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryString = '';
    mockSearch.mockReturnValue(searchIdle);
    mockUserDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
  });

  it('행의 상세 버튼을 누르면 그 회원 id 로 상세 패널을 연다', async () => {
    mockSearch.mockReturnValue(searchSuccess([makeUser({ id: 42, name: '정상세' })]));
    render(<AdminUsersPage />);
    const user = await searchFor('정');

    await user.click(screen.getByRole('button', { name: '정상세 상세' }));

    expect(mockUserDetail).toHaveBeenCalledWith(42);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('검색 결과의 이름·역할과 식별 정보(학번·학과·학년)를 각 열에 렌더링한다', async () => {
    mockSearch.mockReturnValue(
      searchSuccess([
        makeUser({ id: 1, studentId: '20250001', name: '김두잉', role: 'STUDENT' }),
        makeUser({ id: 2, studentId: '20240002', name: '이관리', role: 'ADMIN' }),
      ]),
    );
    render(<AdminUsersPage />);
    await searchFor('20');

    expect(screen.getByText('김두잉')).toBeInTheDocument();
    // 학번·학과·학년은 각각의 열로 나뉜다 — 세로로 훑으며 비교하는 화면이라 같은 종류가 같은 자리에 있어야 한다.
    expect(screen.getByText('20250001')).toBeInTheDocument();
    expect(screen.getAllByText('간호대학').length).toBeGreaterThan(0);
    expect(screen.getAllByText('간호학').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1학년').length).toBeGreaterThan(0);
    expect(screen.getByText('학생')).toBeInTheDocument();
    expect(screen.getByText('이관리')).toBeInTheDocument();
    expect(screen.getByText('관리자')).toBeInTheDocument();
  });

  it('강제 로그아웃 클릭 → 확인 다이얼로그 확정 시 대상 userId 로 mutate 하고 성공 토스트를 띄운다', async () => {
    mockForceLogout.mockImplementation(
      (_userId: number, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
    );
    // 운영 조치는 상세 패널에서만 시작된다 — 목록에는 진입 버튼뿐이다.
    const user = await openDetailSheet(makeDetail({ id: 77, name: '박강퇴' }));

    const sheet = screen.getByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: '로그아웃' }));

    const dialog = screen.getByRole('dialog', { name: '강제 로그아웃' });
    await user.click(within(dialog).getByRole('button', { name: '강제 로그아웃' }));

    await waitFor(() => expect(mockForceLogout).toHaveBeenCalled());
    expect(mockForceLogout.mock.calls[0]?.[0]).toBe(77);
    expect(mockAddToast).toHaveBeenCalledWith(
      '강제 로그아웃 처리했어요. 대상 회원의 모든 기기가 로그아웃됩니다.',
    );
  });

  it('다이얼로그를 취소하면 mutate 를 호출하지 않는다', async () => {
    const user = await openDetailSheet(makeDetail({ id: 88, name: '최취소' }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '로그아웃' }));
    const dialog = screen.getByRole('dialog', { name: '강제 로그아웃' });
    await user.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(mockForceLogout).not.toHaveBeenCalled();
  });

  it('검색 결과가 없으면 안내 문구를 보여준다', async () => {
    mockSearch.mockReturnValue(searchSuccess([]));
    render(<AdminUsersPage />);
    await searchFor('없는사람');

    expect(screen.getByText('조회 결과가 없습니다')).toBeInTheDocument();
  });

  // KPI 는 집계 API 가 없어 목록 조회의 전체 건수로 낸다 — 전체와 정지를 각각 한 번씩 센다.
  // 없는 지표(오늘 활성·최근 7일 신규)는 빈 카드로 자리를 잡지 않는다. 0 인지 데이터가 없는지
  // 화면에서 구분되지 않기 때문이다.
  it('KPI 는 전체와 이용 정지 두 건수만 각각 세어 보여준다', () => {
    mockSearch.mockReturnValue(searchSuccess([makeUser()]));
    render(<AdminUsersPage />);

    // "이용 정지"는 상태 필터 칩에도 있으므로 KPI 목록 안으로 좁혀서 본다.
    const kpis = within(screen.getByRole('list', { name: '회원 현황 요약' }));
    expect(kpis.getByText('전체 회원')).toBeInTheDocument();
    expect(kpis.getByText('이용 정지')).toBeInTheDocument();
    expect(kpis.queryByText('오늘 활성')).not.toBeInTheDocument();
    expect(kpis.queryByText('신규 가입')).not.toBeInTheDocument();

    // 건수만 필요하므로 행은 최소로 받는다 — 목록 조회(size 20)와 캐시 키가 갈린다.
    expect(mockSearch).toHaveBeenCalledWith({ page: 0, size: 1 }, { allowEmptyQuery: true });
    expect(mockSearch).toHaveBeenCalledWith(
      { page: 0, size: 1, status: 'SUSPENDED' },
      { allowEmptyQuery: true },
    );
  });

  it('검색어 없이 들어와도 목록을 조회한다 — 정지 회원을 다시 찾을 경로가 여기뿐이다', () => {
    mockSearch.mockReturnValue(searchSuccess([makeUser({ name: '무검색' })]));
    render(<AdminUsersPage />);

    expect(lastListCallArgs()).toEqual([
      { q: '', status: undefined, page: 0, size: 20 },
      { allowEmptyQuery: true },
    ]);
    expect(screen.getByText('무검색')).toBeInTheDocument();
  });

  // 상태·페이지는 주소가 들고 있으므로, 조작의 결과는 조회 인자가 아니라 어느 주소로 옮겨가는지로 드러난다.
  it('상태 필터와 페이지 이동을 주소에 반영한다 — 필터를 바꾸면 첫 페이지로 돌아간다', async () => {
    mockSearch.mockReturnValue(searchSuccess([makeUser()], 3));
    render(<AdminUsersPage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/users?page=2', { scroll: false });

    await user.click(screen.getByRole('button', { name: '이용 정지' }));
    // page 가 빠져 있는 것이 곧 "첫 페이지로 되돌렸다" 다 — 기본값은 주소에 남기지 않는다.
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/users?status=SUSPENDED', {
      scroll: false,
    });
  });

  it('주소에 실린 상태·페이지를 그대로 읽어 조회한다 — 새로고침·뒤로가기로 되돌아온다', () => {
    mockQueryString = 'status=SUSPENDED&page=3';
    mockSearch.mockReturnValue(searchSuccess([makeUser()], 5));
    render(<AdminUsersPage />);

    expect(lastListCallArgs()).toEqual([
      { q: '', status: 'SUSPENDED', page: 2, size: 20 },
      { allowEmptyQuery: true },
    ]);
  });

  // 상세의 위험 작업 버튼이 소비처 없이 무동작으로 남는 회귀가 두 번 있었다 — 여기서 끝까지 이어졌는지 본다.
  it('상세에서 계정 정지를 확정하면 대상 id·사유와 함께 상태를 바꾸고 정지 토스트를 띄운다', async () => {
    mockChangeStatus.mockImplementation(
      (_variables: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
    );
    const user = await openDetailSheet(makeDetail({ status: 'ACTIVE' }));

    await user.click(screen.getByRole('button', { name: '계정 정지' }));

    const dialog = screen.getByRole('dialog', { name: '계정을 정지할까요?' });
    await user.type(within(dialog).getByLabelText('정지 사유'), '신고 3건 누적');
    await user.click(within(dialog).getByRole('button', { name: '계정 정지' }));

    expect(mockChangeStatus.mock.calls[0]?.[0]).toEqual({
      userId: 42,
      status: 'SUSPENDED',
      reason: '신고 3건 누적',
    });
    expect(mockAddToast).toHaveBeenCalledWith(
      '계정을 정지했어요. 대상 회원의 모든 기기가 로그아웃됩니다.',
    );
  });

  it('상세에서 정지를 해제하면 ACTIVE 로 바꾸고 해제 토스트를 띄운다', async () => {
    mockChangeStatus.mockImplementation(
      (_variables: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
    );
    const user = await openDetailSheet(makeDetail({ id: 55, name: '한해제', status: 'SUSPENDED' }));

    await user.click(screen.getByRole('button', { name: '정지 해제' }));

    const dialog = screen.getByRole('dialog', { name: '정지를 해제할까요?' });
    await user.type(within(dialog).getByLabelText('정지 해제 사유'), '본인 확인 완료');
    await user.click(within(dialog).getByRole('button', { name: '정지 해제' }));

    expect(mockChangeStatus.mock.calls[0]?.[0]).toEqual({
      userId: 55,
      status: 'ACTIVE',
      reason: '본인 확인 완료',
    });
    expect(mockAddToast).toHaveBeenCalledWith('계정 정지를 해제했어요. 다시 로그인할 수 있습니다.');
  });

  it('상태 변경이 실패하면 서버 문구를 그대로 보여주고 다이얼로그를 닫지 않는다', async () => {
    mockChangeStatus.mockImplementation(
      (_variables: unknown, options?: { onError?: (error: unknown) => void }) =>
        options?.onError?.(new MockApiError(400, '관리자 계정은 정지할 수 없습니다.')),
    );
    const user = await openDetailSheet(makeDetail({ status: 'ACTIVE' }));

    await user.click(screen.getByRole('button', { name: '계정 정지' }));
    const dialog = screen.getByRole('dialog', { name: '계정을 정지할까요?' });
    await user.type(within(dialog).getByLabelText('정지 사유'), '오조작');
    await user.click(within(dialog).getByRole('button', { name: '계정 정지' }));

    expect(mockAddToast).toHaveBeenCalledWith('관리자 계정은 정지할 수 없습니다.', {
      variant: 'error',
    });
    expect(screen.getByRole('dialog', { name: '계정을 정지할까요?' })).toBeInTheDocument();
  });

  it('상세의 강제 로그아웃도 목록과 같은 확인 다이얼로그로 이어진다', async () => {
    mockForceLogout.mockImplementation(
      (_userId: number, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
    );
    const user = await openDetailSheet(makeDetail({ id: 61, name: '오강퇴' }));

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    const dialog = screen.getByRole('dialog', { name: '강제 로그아웃' });
    await user.click(within(dialog).getByRole('button', { name: '강제 로그아웃' }));

    expect(mockForceLogout.mock.calls[0]?.[0]).toBe(61);
  });

  it('검색어를 바꾸면 해당 검색어로 조회하고 페이지를 처음으로 되돌린다', async () => {
    // 2페이지에서 시작한다 — 검색어를 친 뒤에도 그 페이지를 물고 가면 대개 빈 목록이 나온다.
    mockQueryString = 'page=2';
    mockSearch.mockReturnValue(searchSuccess([makeUser()], 3));
    render(<AdminUsersPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('회원 검색'), '김');

    expect(lastListCallArgs()).toEqual([
      { q: '김', status: undefined, page: 1, size: 20 },
      { allowEmptyQuery: true },
    ]);
    // 페이지 되돌리기는 주소로 나간다 — page 가 빠진 주소가 곧 첫 페이지다.
    expect(mockReplace).toHaveBeenLastCalledWith('/admin/users', { scroll: false });
  });

  // 검색어가 주소에 실리면 방문 기록·referrer·페이지뷰 이벤트로 이름·학번이 새어나간다.
  it('검색어는 주소에 싣지 않는다', async () => {
    mockSearch.mockReturnValue(searchSuccess([makeUser()]));
    render(<AdminUsersPage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('회원 검색'), '김두잉');

    for (const call of mockReplace.mock.calls) {
      expect(String(call[0])).not.toContain('김두잉');
      expect(String(call[0])).not.toContain('q=');
    }
  });
});
