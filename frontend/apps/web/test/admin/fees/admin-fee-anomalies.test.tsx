import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminFeeAnomaly, AdminFeeAnomalyReport } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockDetailQuery = vi.fn();
const mockPoliciesQuery = vi.fn();
const mockBillsQuery = vi.fn();
const mockPaymentsQuery = vi.fn();
const mockAccountQuery = vi.fn();
const mockAuditLogsQuery = vi.fn();
const mockAnomaliesQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminFeeClubDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useAdminFeePoliciesQuery: (...args: unknown[]) => mockPoliciesQuery(...args),
  useAdminFeeBillsQuery: (...args: unknown[]) => mockBillsQuery(...args),
  useAdminFeePaymentsQuery: (...args: unknown[]) => mockPaymentsQuery(...args),
  useAdminFeeAccountQuery: (...args: unknown[]) => mockAccountQuery(...args),
  useAdminFeeAuditLogsQuery: (...args: unknown[]) => mockAuditLogsQuery(...args),
  useAdminFeeAnomaliesQuery: (...args: unknown[]) => mockAnomaliesQuery(...args),
}));

let currentSearch = 'tab=anomalies';
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
import { formatEvidenceValue } from '@/app/admin/fees/_lib/feeAuditLabels';

const CLUB_ID = 7;

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeAnomaly(overrides: Partial<AdminFeeAnomaly> = {}): AdminFeeAnomaly {
  return {
    ruleId: 'FA-02',
    severity: 'WARNING',
    title: '납부 정정(VOID) 과다',
    description: '기간 내 납부 정정 5건 (기준 3건)',
    evidence: { voidCount: 5, threshold: 3 },
    ...overrides,
  };
}

/** 평가 시각·구간은 표기 대상일 뿐이라 절대값을 박아도 만료되지 않는다(기간 필터는 상대 계산). */
function makeReport(anomalies: AdminFeeAnomaly[]): AdminFeeAnomalyReport {
  return {
    evaluatedAt: '2026-08-04T02:00:00Z',
    window: { from: '2026-07-05', to: '2026-08-04' },
    anomalies,
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

function renderAnomalyTab() {
  return render(<AdminFeeClubDetailPage clubId={CLUB_ID} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = 'tab=anomalies';
  mockReplace.mockImplementation((url: string) => {
    currentSearch = url.split('?')[1] ?? '';
  });
  mockDetailQuery.mockReturnValue(success(undefined));
  mockPoliciesQuery.mockReturnValue(success([]));
  mockBillsQuery.mockReturnValue(pageSuccess([]));
  mockPaymentsQuery.mockReturnValue(pageSuccess([]));
  mockAccountQuery.mockReturnValue(success(undefined));
  mockAuditLogsQuery.mockReturnValue(pageSuccess([]));
  mockAnomaliesQuery.mockReturnValue(success(makeReport([makeAnomaly()])));
});

describe('이상징후 근거 값 포매팅', () => {
  it('숫자·불리언·중첩 객체 어느 것이 와도 읽을 수 있는 문자열이 된다', () => {
    // evidence 키는 규칙마다 다르고 서버가 늘린다 — [object Object] 가 새어나오면 근거가 아니라 잡음이다.
    expect(formatEvidenceValue(83.3)).toBe('83.3');
    expect(formatEvidenceValue(true)).toBe('예');
    expect(formatEvidenceValue(false)).toBe('아니오');
    expect(formatEvidenceValue({ nested: 1 })).toBe('{"nested":1}');
    expect(formatEvidenceValue([1, 2])).toBe('[1,2]');
    expect(formatEvidenceValue(null)).toBe('—');
  });
});

describe('관리자 회비 이상징후 탭', () => {
  it('심각도가 높은 항목을 서버가 보낸 순서 그대로 맨 위에 둔다', () => {
    mockAnomaliesQuery.mockReturnValue(
      success(
        makeReport([
          makeAnomaly({
            ruleId: 'FA-08',
            severity: 'CRITICAL',
            title: '계좌 빈번 교체',
            description: '최근 90일 계좌 변경·삭제 2회 (기준 2회)',
            evidence: { accountChangeCount: 2, threshold: 2, windowDays: 90 },
          }),
          makeAnomaly(),
        ]),
      ),
    );

    renderAnomalyTab();

    const rows = within(screen.getByRole('list', { name: '이상징후 목록' })).getAllByRole(
      'listitem',
    );
    // 화면이 다시 정렬하면 서버가 매긴 우선순위와 갈린다 — 받은 순서를 그대로 그리는지 본다.
    expect(within(rows[0]!).getByText('심각')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('계좌 빈번 교체')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('주의')).toBeInTheDocument();
  });

  it('근거 보기를 열면 evidence 키·값이 한국어 라벨로 드러난다', async () => {
    const user = userEvent.setup();
    renderAnomalyTab();

    // 접힌 동안에는 화면에 없다 — 근거는 필요할 때만 펼쳐 본다.
    expect(screen.getByText('납부 정정')).not.toBeVisible();

    await user.click(screen.getByText('근거 보기'));

    expect(screen.getByText('납부 정정')).toBeVisible();
    expect(screen.getByText('기준값')).toBeVisible();
    const evidence = screen.getByText('납부 정정').closest('div');
    expect(within(evidence!).getByText('5')).toBeInTheDocument();
  });

  it('근거로 데려가는 규칙만 로그 탭으로 잇고 기간을 그대로 물려준다', () => {
    currentSearch = 'period=LAST_90D&tab=anomalies';
    mockAnomaliesQuery.mockReturnValue(
      success(
        makeReport([
          makeAnomaly({ ruleId: 'FA-08', severity: 'CRITICAL', title: '계좌 빈번 교체' }),
          makeAnomaly({ ruleId: 'FA-06', severity: 'HIGH', title: '단시간 대량 변경' }),
          makeAnomaly(),
          makeAnomaly({ ruleId: 'FA-05', severity: 'HIGH', title: '동일 운영진 반복 변경' }),
        ]),
      ),
    );

    renderAnomalyTab();

    const rows = within(screen.getByRole('list', { name: '이상징후 목록' })).getAllByRole(
      'listitem',
    );
    // FA-08 은 계좌 이벤트가 소스라 유형그룹까지 걸어서 보낸다.
    expect(within(rows[0]!).getByRole('link', { name: /관련 감사 로그 보기/ })).toHaveAttribute(
      'href',
      `/admin/fees/${CLUB_ID}?period=LAST_90D&tab=audit-logs&group=ACCOUNT`,
    );
    // FA-06 은 회비 변이 전체가 대상이라 한 그룹으로 좁히지 않는다.
    expect(within(rows[1]!).getByRole('link', { name: /관련 감사 로그 보기/ })).toHaveAttribute(
      'href',
      `/admin/fees/${CLUB_ID}?period=LAST_90D&tab=audit-logs`,
    );
    // FA-02 는 납부 테이블 집계라 대응하는 감사 이벤트가 없다 — 링크를 걸면 엉뚱한 목록으로 보낸다.
    expect(within(rows[2]!).queryByRole('link')).toBeNull();
    // FA-05 는 축이 행위자인데 감사 로그에 행위자 필터가 없다 — 근거로 데려가지 못하는 링크는 걸지 않는다.
    expect(within(rows[3]!).queryByRole('link')).toBeNull();
  });

  it('넘겨받은 유형그룹으로 감사 로그 탭이 열리고 그 파라미터는 한 번 쓰고 지워진다', () => {
    currentSearch = 'tab=audit-logs&group=ACCOUNT';

    renderAnomalyTab();

    expect(mockAuditLogsQuery).toHaveBeenLastCalledWith(
      CLUB_ID,
      expect.objectContaining({
        types: ['FEE_ACCOUNT_REGISTERED', 'FEE_ACCOUNT_UPDATED', 'FEE_ACCOUNT_DELETED'],
      }),
    );
    expect(
      within(screen.getByRole('group', { name: '이벤트 유형 필터' })).getByRole('button', {
        name: '계좌',
      }),
    ).toHaveAttribute('aria-pressed', 'true');

    // 주소에 남겨 두면 사용자가 칩을 '전체'로 되돌린 뒤 새로고침·뒤로가기에서 꺼 둔 필터가 되살아난다.
    // 지우는 것은 히스토리 API 라 라우터 이동(replace)을 일으키지 않는다.
    expect(window.location.search).toBe('?tab=audit-logs');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('고유 윈도우로 판정하는 규칙은 기간과 무관함을 항목에 적는다', () => {
    mockAnomaliesQuery.mockReturnValue(
      success(
        makeReport([
          makeAnomaly({ ruleId: 'FA-06', severity: 'HIGH', title: '단시간 대량 변경' }),
          makeAnomaly({ ruleId: 'FA-05', severity: 'HIGH', title: '동일 운영진 반복 변경' }),
        ]),
      ),
    );

    renderAnomalyTab();

    expect(screen.getByText(/최근 24시간을 봅니다/)).toBeInTheDocument();
    expect(screen.getByText(/최근 7일을 봅니다/)).toBeInTheDocument();
  });

  it('탐지된 항목이 없으면 평가 시각·구간과 함께 정상임을 알린다', () => {
    mockAnomaliesQuery.mockReturnValue(success(makeReport([])));

    renderAnomalyTab();

    expect(screen.getByText('기간 내 탐지된 이상징후가 없습니다')).toBeInTheDocument();
    // 호출 시점 평가라 지금 보는 판정이 언제 것인지 화면이 말해야 한다.
    expect(screen.getByText(/평가 시각 2026\.08\.04 11:00/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-05 ~ 2026-08-04/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '이상징후 목록' })).toBeNull();
  });

  it('평가에 실패하면 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockAnomaliesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch,
    });

    renderAnomalyTab();

    expect(screen.getByRole('alert')).toHaveTextContent('이상징후를 평가하지 못했어요.');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('이상징후 탭도 상세 열람 조회를 늘리지 않는다', () => {
    renderAnomalyTab();

    // 탭이 상세 훅을 또 부르면 렌더 한 번에 두 건이 찍힌다 = 열람 감사 행 증식.
    expect(mockDetailQuery).toHaveBeenCalledTimes(1);
  });
});
