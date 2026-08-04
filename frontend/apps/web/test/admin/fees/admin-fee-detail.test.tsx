import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type {
  AdminFeeAccount,
  AdminFeeBillRow,
  AdminFeeClubDetail,
  AdminFeePaymentRow,
} from '@duing/types';

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
}));

// 기간·탭은 주소가 진실이라, replace 가 쓴 질의 문자열을 다음 렌더의 useSearchParams 가 되읽도록 잇는다
// (실제 앱에서 Next 라우터가 하는 일을 흉내 낸 것 — 이 연결이 없으면 탭 전환을 화면에서 검증할 수 없다).
let currentSearch = '';
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

// 디바운스는 타이밍 의존을 없애기 위해 항등 함수로 대체한다.
vi.mock('@/app/admin/_hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminFeeClubDetailPage } from '@/app/admin/fees/[clubId]/_pages/AdminFeeClubDetailPage';
import { resolvePeriodParams } from '@/app/admin/fees/_lib/feePeriod';

const CLUB_ID = 7;
/** 상세의 기본 기간은 최근 30일이다. 절대 날짜를 박으면 그날이 오는 순간 테스트가 깨진다. */
const DEFAULT_PERIOD = resolvePeriodParams({ preset: 'LAST_30D' });

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeDetail(overrides: Partial<AdminFeeClubDetail> = {}): AdminFeeClubDetail {
  return {
    clubId: CLUB_ID,
    clubName: '멋쟁이사자처럼',
    clubStatus: 'ACTIVE',
    memberCount: 48,
    activePolicyCount: 1,
    billCount: 96,
    paidCount: 80,
    unpaidCount: 11,
    overdueCount: 4,
    cancelledCount: 1,
    totalBilled: 2_880_000,
    totalPaid: 2_550_000,
    outstanding: 330_000,
    collectionRate: 88.5,
    bankMatchingActive: true,
    ...overrides,
  };
}

function makeBill(overrides: Partial<AdminFeeBillRow> = {}): AdminFeeBillRow {
  return {
    billId: 512,
    userId: 31,
    userName: '김회원',
    studentId: '20231234',
    generation: 12,
    policyName: '2026-1학기 회비',
    billingPeriod: '2026-08',
    amount: 30_000,
    paidAmount: 0,
    status: 'PENDING',
    overdue: false,
    createdAt: '2026-07-01T01:00:00Z',
    dueDate: '2026-07-31',
    lastPaidAt: null,
    ...overrides,
  };
}

function makePayment(overrides: Partial<AdminFeePaymentRow> = {}): AdminFeePaymentRow {
  return {
    paymentId: 900,
    billId: 512,
    userName: '김회원',
    amount: 30_000,
    method: 'TRANSFER',
    paidAt: '2026-07-20T01:00:00Z',
    matchType: 'AUTO',
    counterparty: '김회원',
    recordedByName: '박운영',
    status: 'ACTIVE',
    voidedByName: null,
    voidedAt: null,
    voidReason: null,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<AdminFeeAccount> = {}): AdminFeeAccount {
  return {
    registered: true,
    bank: 'KB',
    maskedAccountNumber: '****7890',
    accountHolder: '멋쟁이사자처럼 김대표',
    bankMatchingActive: true,
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

function renderDetail() {
  return render(<AdminFeeClubDetailPage clubId={CLUB_ID} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = '';
  mockReplace.mockImplementation((url: string) => {
    currentSearch = url.split('?')[1] ?? '';
  });
  mockDetailQuery.mockReturnValue(success(makeDetail()));
  mockPoliciesQuery.mockReturnValue(success([]));
  mockBillsQuery.mockReturnValue(pageSuccess([makeBill()]));
  mockPaymentsQuery.mockReturnValue(pageSuccess([makePayment()]));
  mockAccountQuery.mockReturnValue(success(makeAccount()));
  mockAuditLogsQuery.mockReturnValue(pageSuccess([]));
});

describe('관리자 회비 감사 상세', () => {
  it('탭을 다 돌아도 상세 열람 조회는 렌더당 한 번뿐이다', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDetail();

    expect(mockDetailQuery).toHaveBeenCalledTimes(1);
    expect(mockDetailQuery).toHaveBeenCalledWith(CLUB_ID, DEFAULT_PERIOD);

    for (const tabLabel of ['정책', '청구', '납부', '계좌', '감사 로그', '개요']) {
      await user.click(screen.getByRole('tab', { name: tabLabel }));
      mockDetailQuery.mockClear();
      rerender(<AdminFeeClubDetailPage clubId={CLUB_ID} />);

      // 탭 컴포넌트가 같은 훅을 또 부르면 렌더 한 번에 두 건이 찍힌다 = 열람 감사 행 증식.
      expect(mockDetailQuery).toHaveBeenCalledTimes(1);
      // 인자가 그대로여야 React Query 키가 유지돼 staleTime 이 재조회를 막는다.
      expect(mockDetailQuery).toHaveBeenCalledWith(CLUB_ID, DEFAULT_PERIOD);
    }
  });

  it('마감이 지난 미납 청구는 저장된 상태보다 연체를 앞세워 보여준다', () => {
    currentSearch = 'tab=bills';
    mockBillsQuery.mockReturnValue(
      // 연체 전이 배치가 늦으면 status 는 아직 PENDING 인 채로 overdue 만 참이 된다.
      pageSuccess([makeBill({ status: 'PENDING', overdue: true })]),
    );

    renderDetail();

    const row = screen.getByRole('row', { name: /김회원/ });
    expect(within(row).getByText('연체')).toBeInTheDocument();
    expect(within(row).queryByText('납부대기')).toBeNull();
  });

  it('완납 청구에는 연체 배지를 씌우지 않는다', () => {
    currentSearch = 'tab=bills';
    mockBillsQuery.mockReturnValue(
      pageSuccess([makeBill({ status: 'PAID', paidAmount: 30_000, overdue: true })]),
    );

    renderDetail();

    const row = screen.getByRole('row', { name: /김회원/ });
    expect(within(row).getByText('납부완료')).toBeInTheDocument();
    expect(within(row).queryByText('연체')).toBeNull();
  });

  it('연체 필터칩을 누르면 서버에 OVERDUE 필터로 다시 묻는다', async () => {
    const user = userEvent.setup();
    currentSearch = 'tab=bills';
    renderDetail();

    await user.click(
      within(screen.getByRole('group', { name: '청구 상태 필터' })).getByRole('button', {
        name: '연체',
      }),
    );

    expect(mockBillsQuery).toHaveBeenLastCalledWith(
      CLUB_ID,
      expect.objectContaining({ filter: 'OVERDUE' }),
    );
    // 청구 검색·필터는 주소에 싣지 않는다(관리자 콘솔 규약).
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('정정된 납부는 취소선과 함께 사유·정정자를 같은 행에 적는다', () => {
    currentSearch = 'tab=payments';
    mockPaymentsQuery.mockReturnValue(
      pageSuccess([
        makePayment({
          status: 'VOIDED',
          voidReason: '금액 오기입',
          voidedByName: '박운영',
          voidedAt: '2026-07-25T02:00:00Z',
        }),
      ]),
    );

    renderDetail();

    const row = screen.getByRole('row', { name: /김회원/ });
    expect(within(row).getByText('정정됨')).toBeInTheDocument();
    // 툴팁이 아니라 눈에 보이는 텍스트 줄이어야 한다 — 터치 기기에서는 툴팁을 열 방법이 없다.
    expect(within(row).getByText(/금액 오기입 · 박운영/)).toBeInTheDocument();
    expect(within(row).getByText('30,000').className).toContain('line-through');
  });

  it('계좌 탭은 마스킹된 번호만 보여주고 고칠 수 있는 요소를 하나도 두지 않는다', () => {
    currentSearch = 'tab=account';
    renderDetail();

    const account = screen.getByRole('region', { name: '회비 계좌 정보' });
    expect(within(account).getByText('****7890')).toBeInTheDocument();
    expect(within(account).getByText(/KB국민/)).toBeInTheDocument();
    expect(within(account).getByText(/계좌 정보는 조회만 가능합니다/)).toBeInTheDocument();

    // 이 콘솔에서 계좌를 바꿀 방법이 없어야 한다 — 버튼·입력 어느 것도 두지 않는다.
    expect(within(account).queryAllByRole('button')).toHaveLength(0);
    expect(within(account).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(account).queryAllByRole('combobox')).toHaveLength(0);
    // 매칭 허용 설정은 별도 콘솔로 보낸다.
    expect(within(account).getByRole('link', { name: /BANK 자동매칭 콘솔/ })).toHaveAttribute(
      'href',
      '/admin/bank-matching',
    );
  });

  it('계좌를 등록하지 않은 동아리는 빈 상태로 안내한다', () => {
    currentSearch = 'tab=account';
    mockAccountQuery.mockReturnValue(
      success(
        makeAccount({
          registered: false,
          bank: null,
          maskedAccountNumber: null,
          accountHolder: null,
          bankMatchingActive: false,
        }),
      ),
    );

    renderDetail();

    expect(screen.getByText('등록된 회비 계좌가 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('****7890')).toBeNull();
  });

  it('헤더에 읽기 전용임을 상시 표시한다', () => {
    renderDetail();

    expect(screen.getByText('읽기 전용')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '멋쟁이사자처럼' })).toBeInTheDocument();
  });

  it('KPI 조회가 실패해도 탭은 그대로 열람할 수 있다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch,
    });

    renderDetail();

    expect(screen.getByRole('alert')).toHaveTextContent('동아리 회비 현황을 불러오지 못했어요.');
    expect(screen.getByRole('tab', { name: '청구' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('탭을 바꾸면 기간을 유지한 채 주소에 탭만 얹는다', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('tab', { name: '납부' }));

    expect(mockReplace).toHaveBeenLastCalledWith(`/admin/fees/${CLUB_ID}?period=LAST_30D&tab=payments`, {
      scroll: false,
    });
  });
});
