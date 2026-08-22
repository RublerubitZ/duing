import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminFeeAuditComment } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockDetailQuery = vi.fn();
const mockPoliciesQuery = vi.fn();
const mockBillsQuery = vi.fn();
const mockPaymentsQuery = vi.fn();
const mockAccountQuery = vi.fn();
const mockAuditLogsQuery = vi.fn();
const mockAnomaliesQuery = vi.fn();
const mockCommentsQuery = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminFeeClubDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useAdminFeePoliciesQuery: (...args: unknown[]) => mockPoliciesQuery(...args),
  useAdminFeeBillsQuery: (...args: unknown[]) => mockBillsQuery(...args),
  useAdminFeePaymentsQuery: (...args: unknown[]) => mockPaymentsQuery(...args),
  useAdminFeeAccountQuery: (...args: unknown[]) => mockAccountQuery(...args),
  useAdminFeeAuditLogsQuery: (...args: unknown[]) => mockAuditLogsQuery(...args),
  useAdminFeeAnomaliesQuery: (...args: unknown[]) => mockAnomaliesQuery(...args),
  useAdminFeeAuditCommentsQuery: (...args: unknown[]) => mockCommentsQuery(...args),
  useCreateFeeAuditCommentMutation: () => ({ mutate: mockCreate, isPending: false }),
  useUpdateFeeAuditCommentMutation: () => ({ mutate: mockUpdate, isPending: false }),
  useDeleteFeeAuditCommentMutation: () => ({ mutate: mockDelete, isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

let currentSearch = 'tab=comments';
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  useOptionalToast: () => vi.fn(),
}));

vi.mock('@/app/admin/_hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminFeeClubDetailPage } from '@/app/admin/fees/[clubId]/_pages/AdminFeeClubDetailPage';

const CLUB_ID = 7;

/* ── 테스트 데이터 ───────────────────────────────────────────── */
/** 작성 시각은 표기 대상일 뿐이라 흐르는 시간과 무관하다(기간 필터를 타지 않는 탭). */
const WRITTEN_AT = '2026-08-04T02:10:00Z';

function makeOpinion(overrides: Partial<AdminFeeAuditComment> = {}): AdminFeeAuditComment {
  return {
    commentId: 11,
    kind: 'AUDIT_OPINION',
    status: 'OPEN',
    content: '3월 납부 취소 5건 사유 확인 필요.',
    authorName: '총동연 관리자',
    createdAt: WRITTEN_AT,
    updatedAt: WRITTEN_AT,
    ...overrides,
  };
}

function makeMemo(overrides: Partial<AdminFeeAuditComment> = {}): AdminFeeAuditComment {
  return makeOpinion({
    commentId: 12,
    kind: 'OPERATION_MEMO',
    status: null,
    content: '작년에도 유사 민원 1건 있었음',
    ...overrides,
  });
}

function pageSuccess<T>(rows: T[]) {
  return {
    data: { content: rows, totalElements: rows.length, totalPages: 1, page: 0, size: 20 },
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  };
}

function success<T>(payload: T) {
  return { data: payload, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}

function renderCommentTab() {
  return render(<AdminFeeClubDetailPage clubId={CLUB_ID} />);
}

/** 지금 화면에 보이는 기록 행들. 등록 폼과 목록을 섞어 잡지 않도록 목록에서만 고른다. */
function commentRows() {
  return within(screen.getByRole('list', { name: '감사 의견·운영 메모 목록' })).getAllByRole(
    'listitem',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = 'tab=comments';
  mockReplace.mockImplementation((url: string) => {
    currentSearch = url.split('?')[1] ?? '';
  });
  mockDetailQuery.mockReturnValue(success(undefined));
  mockPoliciesQuery.mockReturnValue(success([]));
  mockBillsQuery.mockReturnValue(pageSuccess([]));
  mockPaymentsQuery.mockReturnValue(pageSuccess([]));
  mockAccountQuery.mockReturnValue(success(undefined));
  mockAuditLogsQuery.mockReturnValue(pageSuccess([]));
  mockAnomaliesQuery.mockReturnValue(success(undefined));
  mockCommentsQuery.mockReturnValue(success([makeOpinion()]));
  // 뮤테이션은 성공 콜백까지 흉내 낸다 — 폼 초기화·확인 UI 되돌리기가 콜백에 달려 있다.
  mockCreate.mockImplementation((_payload, options) => options?.onSuccess?.(99));
  mockUpdate.mockImplementation((_variables, options) => options?.onSuccess?.());
  mockDelete.mockImplementation((_commentId, options) => options?.onSuccess?.());
});

describe('관리자 회비 의견·메모 탭', () => {
  it('의견을 등록할 때 상태를 실어 보내지 않는다 — 서버가 OPEN 으로 시작시킨다', async () => {
    const user = userEvent.setup();
    renderCommentTab();

    await user.type(screen.getByRole('textbox'), '  계좌 변경 사유 확인 필요  ');
    await user.click(screen.getByRole('button', { name: '등록' }));

    // status 를 실으면 메모에서는 400 이고, 의견에서도 서버 기본값 계약을 화면이 앞질러 정한다.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreate.mock.calls[0]!;
    expect(payload).toEqual({ kind: 'AUDIT_OPINION', content: '계좌 변경 사유 확인 필요' });
    expect(payload).not.toHaveProperty('status');
    // 등록에 성공하면 입력란을 비운다 — 남아 있으면 같은 내용을 두 번 올리기 쉽다.
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('공백만 입력하면 등록 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderCommentTab();

    await user.type(screen.getByRole('textbox'), '   ');

    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '등록' }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('의견 행의 상태를 바꾸면 그 항목만 부분 수정한다', async () => {
    const user = userEvent.setup();
    renderCommentTab();

    const row = commentRows()[0]!;
    // 배지와 셀렉트 옵션이 같은 낱말을 쓰므로 배지(span)만 집어서 본다.
    expect(within(row).getByText('진행중', { selector: 'span' })).toBeInTheDocument();
    expect(within(row).getByRole('combobox')).toHaveValue('OPEN');

    await user.selectOptions(within(row).getByRole('combobox'), '완료');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![0]).toEqual({
      commentId: 11,
      payload: { status: 'RESOLVED' },
    });
  });

  it('운영 메모에는 상태 배지도 상태 셀렉트도 두지 않는다', async () => {
    const user = userEvent.setup();
    mockCommentsQuery.mockReturnValue(success([makeMemo()]));
    renderCommentTab();

    await user.click(screen.getByRole('button', { name: '운영 메모' }));

    // 메모는 상태를 가질 수 없다 — 서버에 status 를 보낼 수 있는 입구 자체를 만들지 않는다.
    expect(mockCommentsQuery).toHaveBeenLastCalledWith(CLUB_ID, 'OPERATION_MEMO');
    const row = commentRows()[0]!;
    expect(within(row).getByText('작년에도 유사 민원 1건 있었음')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).toBeNull();
    expect(within(row).queryByText('진행중')).toBeNull();

    await user.type(screen.getByRole('textbox'), '메모 한 줄');
    await user.click(screen.getByRole('button', { name: '등록' }));
    expect(mockCreate.mock.calls[0]![0]).toEqual({
      kind: 'OPERATION_MEMO',
      content: '메모 한 줄',
    });
  });

  it('삭제는 같은 자리에서 한 번 더 확인받고, 취소하면 원래 버튼으로 되돌아간다', async () => {
    const user = userEvent.setup();
    renderCommentTab();

    // 1단계: 누른 것만으로는 아무것도 지우지 않는다(네이티브 confirm 없이 인라인으로 되묻는다).
    await user.click(within(commentRows()[0]!).getByRole('button', { name: '삭제' }));
    expect(mockDelete).not.toHaveBeenCalled();
    expect(within(commentRows()[0]!).queryByRole('button', { name: '삭제' })).toBeNull();

    // 취소하면 확인 UI 가 사라지고 원래 삭제 버튼이 돌아온다.
    await user.click(within(commentRows()[0]!).getByRole('button', { name: '취소' }));
    expect(within(commentRows()[0]!).getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();

    // 2단계: 다시 눌러 확인해야 비로소 지운다.
    await user.click(within(commentRows()[0]!).getByRole('button', { name: '삭제' }));
    await user.click(within(commentRows()[0]!).getByRole('button', { name: '정말 삭제' }));
    expect(mockDelete).toHaveBeenCalledWith(11, expect.anything());
    // 성공하면 확인 UI 를 접는다 — 지운 행이 사라지기 전까지 "정말 삭제"가 남아 있으면 다시 부른다.
    expect(within(commentRows()[0]!).getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('등록에 실패하면 입력을 지우지 않고 오류를 알린다', async () => {
    const user = userEvent.setup();
    mockCreate.mockImplementation((_payload, options) =>
      options?.onError?.({ message: '내용은 2000자를 넘을 수 없습니다.' }),
    );
    renderCommentTab();

    await user.type(screen.getByRole('textbox'), '등록 실패 예정');
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(mockAddToast).toHaveBeenCalledWith('내용은 2000자를 넘을 수 없습니다.', {
      variant: 'error',
    });
    expect(screen.getByRole('textbox')).toHaveValue('등록 실패 예정');
  });

  it('아직 기록이 없으면 종류에 맞는 빈 상태로 안내한다', () => {
    mockCommentsQuery.mockReturnValue(success([]));
    renderCommentTab();

    expect(screen.getByText('작성된 감사 의견이 없습니다')).toBeInTheDocument();
    // 목록이 비어도 작성은 할 수 있어야 한다.
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('목록 조회에 실패하면 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockCommentsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch,
    });

    renderCommentTab();

    expect(screen.getByRole('alert')).toHaveTextContent('의견·메모를 불러오지 못했어요.');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('총동연 내부 기록임을 상단에 알린다', () => {
    renderCommentTab();

    // 동아리에 전달된다고 오해한 채 쓰면 감사 기록의 성격 자체가 달라진다(§14 비공개 확정).
    expect(screen.getByText(/동아리에는 표시되지 않습니다/)).toBeInTheDocument();
  });

  it('의견·메모 탭도 상세 열람 조회를 늘리지 않는다', () => {
    renderCommentTab();

    // 탭이 상세 훅을 또 부르면 렌더 한 번에 두 건이 찍힌다 = 열람 감사 행 증식.
    expect(mockDetailQuery).toHaveBeenCalledTimes(1);
  });
});
