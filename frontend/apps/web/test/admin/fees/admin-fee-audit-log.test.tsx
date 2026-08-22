import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FEE_AUDIT_EVENT_TYPES, type AdminFeeAuditLog } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockDetailQuery = vi.fn();
const mockPoliciesQuery = vi.fn();
const mockBillsQuery = vi.fn();
const mockPaymentsQuery = vi.fn();
const mockAccountQuery = vi.fn();
const mockAuditLogsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminFeeClubDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useAdminFeePoliciesQuery: (...args: unknown[]) => mockPoliciesQuery(...args),
  useAdminFeeBillsQuery: (...args: unknown[]) => mockBillsQuery(...args),
  useAdminFeePaymentsQuery: (...args: unknown[]) => mockPaymentsQuery(...args),
  useAdminFeeAccountQuery: (...args: unknown[]) => mockAccountQuery(...args),
  useAdminFeeAuditLogsQuery: (...args: unknown[]) => mockAuditLogsQuery(...args),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

let currentSearch = 'tab=audit-logs';
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

vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
  useOptionalToast: () => vi.fn(),
}));

vi.mock('@/app/admin/_hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminFeeClubDetailPage } from '@/app/admin/fees/[clubId]/_pages/AdminFeeClubDetailPage';
import { FEE_EVENT_GROUP_TYPES } from '@/app/admin/fees/_components/FeeAuditLogList';
import { formatAuditDetail } from '@/app/admin/fees/_lib/feeAuditLabels';

const CLUB_ID = 7;

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeLog(overrides: Partial<AdminFeeAuditLog> = {}): AdminFeeAuditLog {
  return {
    eventId: 1001,
    eventType: 'FEE_POLICY_UPDATED',
    actorUserId: 31,
    actorName: '박운영',
    // 절대 날짜를 박아도 이 값은 표기 대상일 뿐 만료되지 않는다(기간 필터는 상대 계산).
    createdAt: '2026-07-20T01:00:00Z',
    reason: null,
    refs: { feePolicyId: 12, feeBillId: null, paymentId: null, bankTransactionId: null },
    detail: null,
    ...overrides,
  };
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

function renderAuditTab() {
  return render(<AdminFeeClubDetailPage clubId={CLUB_ID} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = 'tab=audit-logs';
  mockReplace.mockImplementation((url: string) => {
    currentSearch = url.split('?')[1] ?? '';
  });
  mockDetailQuery.mockReturnValue(success(undefined));
  mockPoliciesQuery.mockReturnValue(success([]));
  mockBillsQuery.mockReturnValue(pageSuccess([]));
  mockPaymentsQuery.mockReturnValue(pageSuccess([]));
  mockAccountQuery.mockReturnValue(success(undefined));
  mockAuditLogsQuery.mockReturnValue(pageSuccess([makeLog()]));
});

describe('감사 로그 detail 포매팅', () => {
  it('정책 수정의 금액 변경은 전/후를 한 줄로 잇는다', () => {
    expect(formatAuditDetail({ amount: { old: 10000, new: 30000 } })).toBe('금액 10,000 → 30,000');
  });

  it('청구 발행은 건수와 회차를 함께 적는다', () => {
    expect(formatAuditDetail({ issuedCount: 2, billingPeriod: '2026-2' })).toBe(
      '2건 발행 · 회차 2026-2',
    );
  });

  it('detail 이 없는 이벤트는 빈 문자열이다', () => {
    expect(formatAuditDetail(null)).toBe('');
  });

  it('모르는 키와 반쪽짜리 변경 쌍은 건너뛴다', () => {
    // 서버가 키를 늘리거나 형태가 어긋나도 줄이 깨지거나 [object Object] 가 새어나오면 안 된다.
    expect(formatAuditDetail({ somethingNew: { nested: true }, amount: { old: 10000 } })).toBe('');
    expect(formatAuditDetail({ issuedCount: '2' })).toBe('');
  });

  it('활성 전환과 은행·이전 상태를 아는 만큼 이어 붙인다', () => {
    expect(formatAuditDetail({ active: { old: true, new: false } })).toBe('비활성화');
    expect(formatAuditDetail({ amount: 30000, statusBefore: 'PENDING' })).toBe(
      '금액 30,000원 · 이전 상태 PENDING',
    );
    expect(formatAuditDetail({ amount: 30000, autoMatched: true })).toBe(
      '금액 30,000원 · BANK 자동매칭',
    );
    expect(formatAuditDetail({ bank: 'KB' })).toBe('은행 KB');
  });
});

describe('관리자 회비 감사 로그 탭', () => {
  it('한 행에 시각·이벤트·행위자와 변경 요약·사유를 함께 적는다', () => {
    mockAuditLogsQuery.mockReturnValue(
      pageSuccess([
        makeLog({
          detail: { amount: { old: 10000, new: 30000 } },
          reason: '학기 회비 인상',
        }),
        makeLog({ eventId: 1002, eventType: 'FEE_BILL_ISSUED', actorName: null }),
      ]),
    );

    renderAuditTab();

    const rows = within(screen.getByRole('list', { name: '회비 감사 로그' })).getAllByRole(
      'listitem',
    );
    const policyRow = rows[0]!;
    const billRow = rows[1]!;
    expect(within(policyRow).getByText('정책 수정')).toBeInTheDocument();
    expect(within(policyRow).getByText('박운영')).toBeInTheDocument();
    expect(
      within(policyRow).getByText('금액 10,000 → 30,000 · 사유: 학기 회비 인상'),
    ).toBeInTheDocument();

    // 탈퇴해도 actorUserId 는 남는다 — 사람이 한 일이므로 '시스템'으로 뭉뚱그리지 않는다.
    expect(within(billRow).getByText('탈퇴 회원')).toBeInTheDocument();
    expect(within(billRow).getByText('청구 발행')).toBeInTheDocument();
  });

  it('유형그룹을 고르면 그룹에 속한 이벤트 타입 배열로 다시 묻는다', async () => {
    const user = userEvent.setup();
    renderAuditTab();

    const filter = screen.getByRole('group', { name: '이벤트 유형 필터' });
    await user.click(within(filter).getByRole('button', { name: '정책' }));

    expect(mockAuditLogsQuery).toHaveBeenLastCalledWith(
      CLUB_ID,
      expect.objectContaining({
        types: ['FEE_POLICY_CREATED', 'FEE_POLICY_UPDATED', 'FEE_POLICY_DELETED'],
        page: 0,
      }),
    );

    // 열람은 총동연 자신의 조회 이력 두 종이다.
    await user.click(within(filter).getByRole('button', { name: '열람' }));
    expect(mockAuditLogsQuery).toHaveBeenLastCalledWith(
      CLUB_ID,
      expect.objectContaining({
        types: ['FEE_ADMIN_DETAIL_VIEWED', 'FEE_ADMIN_CSV_DOWNLOADED'],
      }),
    );

    // '전체'는 파라미터를 아예 보내지 않는다.
    await user.click(within(filter).getByRole('button', { name: '전체' }));
    expect(mockAuditLogsQuery).toHaveBeenLastCalledWith(
      CLUB_ID,
      expect.objectContaining({ types: undefined }),
    );
    // 필터는 주소에 싣지 않는다(관리자 콘솔 규약).
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('유형그룹이 이벤트 15종을 빠짐없이 나눠 담는다', () => {
    // 어느 그룹에도 없는 타입은 '전체'로만 보이게 되어 필터가 조용히 놓친다 —
    // 서버가 이벤트를 늘리면 이 단언이 먼저 깨져 그룹 매핑을 함께 고치게 한다.
    const grouped = Object.values(FEE_EVENT_GROUP_TYPES).flat();
    expect([...grouped].sort()).toEqual([...FEE_AUDIT_EVENT_TYPES].sort());
  });

  it('기록이 없으면 계측 시점부터 쌓인다는 사실을 알린다', () => {
    mockAuditLogsQuery.mockReturnValue(pageSuccess([]));

    renderAuditTab();

    expect(screen.getByText('감사 로그가 없습니다')).toBeInTheDocument();
    expect(
      screen.getByText(/감사 로그는 계측 배포 이후의 변경부터 기록됩니다\./),
    ).toBeInTheDocument();
  });

  it('조회에 실패하면 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockAuditLogsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch,
    });

    renderAuditTab();

    expect(screen.getByRole('alert')).toHaveTextContent('감사 로그를 불러오지 못했어요.');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('감사 로그 탭도 상세 열람 조회를 늘리지 않는다', () => {
    renderAuditTab();

    // 탭이 상세 훅을 또 부르면 렌더 한 번에 두 건이 찍힌다 = 열람 감사 행 증식.
    expect(mockDetailQuery).toHaveBeenCalledTimes(1);
  });
});
