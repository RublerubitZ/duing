import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { todayKstDateString } from '@duing/hooks/datetime';
import type { AdminFeeClubSummary, AdminFeeDashboard } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockClubsQuery = vi.fn();
const mockDashboardQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminFeeClubsQuery: (...args: unknown[]) => mockClubsQuery(...args),
  useAdminFeeDashboardQuery: (...args: unknown[]) => mockDashboardQuery(...args),
}));

// 검색어는 의도적으로 주소에 싣지 않는다 — replace 호출 여부로 그 약속을 지킨다.
// 기간·필터는 반대로 주소가 진실이라, replace 가 쓴 질의 문자열을 useSearchParams 가 되읽도록 이어 붙인다
// (실제 앱에서 Next 라우터가 하는 일을 흉내 낸 것 — 이 연결이 없으면 기간 변경을 화면에서 검증할 수 없다).
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
import { AdminFeesPage } from '@/app/admin/fees/_pages/AdminFeesPage';
import { addDaysKst, resolvePeriodParams } from '@/app/admin/fees/_lib/feePeriod';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeClub(overrides: Partial<AdminFeeClubSummary> = {}): AdminFeeClubSummary {
  return {
    clubId: 10,
    clubName: '두잉코드',
    clubStatus: 'ACTIVE',
    feeUsing: true,
    activePolicyCount: 1,
    memberCount: 48,
    billCount: 96,
    totalBilled: 2_880_000,
    totalPaid: 2_550_000,
    outstanding: 330_000,
    unpaidMemberCount: 11,
    lastPaidAt: '2026-08-01T02:30:00Z',
    lastTransactionAt: null,
    ...overrides,
  };
}

function makeDashboard(overrides: Partial<AdminFeeDashboard> = {}): AdminFeeDashboard {
  return {
    clubCount: 182,
    feeUsingClubCount: 64,
    totalBilled: 48_200_000,
    totalPaid: 41_350_000,
    totalOutstanding: 6_850_000,
    collectionRate: 85.8,
    openOpinionCount: 3,
    recentActivity: {
      since: '2026-08-04T15:00:00Z',
      eventCounts: { FEE_POLICY_UPDATED: 2, FEE_PAYMENT_VOIDED: 5 },
      newOpinionCount: 0,
    },
    ...overrides,
  };
}

function listSuccess(rows: AdminFeeClubSummary[]) {
  return {
    data: { content: rows, totalElements: rows.length, totalPages: 1, page: 0, size: 20 },
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  };
}

function rowByClub(clubName: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(clubName) });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = '';
  // router.replace 가 쓴 주소를 다음 렌더의 useSearchParams 가 읽는다.
  mockReplace.mockImplementation((url: string) => {
    currentSearch = url.split('?')[1] ?? '';
  });
  mockClubsQuery.mockReturnValue(listSuccess([makeClub()]));
  mockDashboardQuery.mockReturnValue({
    data: makeDashboard(),
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('관리자 회비 감사 목록', () => {
  it('동아리별 집계를 통화 기호 없이 자릿수만 끊어 보여준다', () => {
    render(<AdminFeesPage />);

    const row = rowByClub('두잉코드');
    expect(within(row).getByText('330,000')).toBeInTheDocument();
    expect(within(row).getByText('2,880,000')).toBeInTheDocument();
    expect(screen.queryByText(/₩/)).toBeNull();
  });

  it('검색어는 주소에 싣지 않고 조회 파라미터로만 넘긴다', async () => {
    const user = userEvent.setup();
    render(<AdminFeesPage />);

    await user.type(screen.getByLabelText('동아리 검색'), '두잉코드');

    expect(mockClubsQuery).toHaveBeenLastCalledWith(expect.objectContaining({ q: '두잉코드' }));
    // 검색만으로는 주소를 건드리지 않는다.
    expect(mockReplace).not.toHaveBeenCalled();

    // 검색어를 문 채 주소가 실제로 갱신되는 경로까지 확인한다 — replace 가 아예 안 일어나는 상태만
    // 단언하면 "검색어가 주소에 실리지 않는다"는 약속을 사실상 검사하지 않는 셈이다.
    await user.selectOptions(screen.getByLabelText('기간'), 'LAST_30D');

    expect(mockReplace).toHaveBeenLastCalledWith(
      expect.not.stringContaining('두잉코드'),
      expect.anything(),
    );
    // 질의 문자열은 퍼센트 인코딩돼 실리므로 인코딩된 형태도 함께 막는다.
    expect(mockReplace).toHaveBeenLastCalledWith(
      expect.not.stringContaining(encodeURIComponent('두잉코드')),
      expect.anything(),
    );
  });

  it('기간 프리셋을 바꾸면 목록과 대시보드가 같은 from/to 로 다시 조회된다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AdminFeesPage />);

    await user.selectOptions(screen.getByLabelText('기간'), 'LAST_30D');
    // 실제 앱에서는 replace 가 새 주소로 리렌더를 일으킨다 — 그 재진입을 흉내 낸다.
    rerender(<AdminFeesPage />);

    const today = todayKstDateString(new Date());
    const expected = { from: addDaysKst(today, -30), to: today };
    expect(mockClubsQuery).toHaveBeenLastCalledWith(expect.objectContaining(expected));
    expect(mockDashboardQuery).toHaveBeenLastCalledWith(expected);
    expect(mockReplace).toHaveBeenCalledWith('/admin/fees?period=LAST_30D', { scroll: false });
  });

  it('회비를 쓰지 않는 동아리 행은 흐리게 두고 집계를 해당 없음으로 적는다', () => {
    mockClubsQuery.mockReturnValue(
      listSuccess([
        makeClub({
          clubId: 20,
          clubName: '미사용동아리',
          feeUsing: false,
          activePolicyCount: 0,
          billCount: 0,
          totalBilled: 0,
          totalPaid: 0,
          outstanding: 0,
          unpaidMemberCount: 0,
          lastPaidAt: null,
        }),
      ]),
    );

    render(<AdminFeesPage />);

    const row = rowByClub('미사용동아리');
    expect(row.className).toContain('opacity-60');
    // 0 으로 적으면 "미수금 0 원"과 구분되지 않는다.
    expect(within(row).queryByText('0')).toBeNull();
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
  });

  // PR-3 배포 전 응답에는 의견 집계 키 자체가 없다 — 그때 "undefined%"를 찍거나 터지면 안 된다.
  it('대시보드 응답에 의견·수납률 필드가 없어도 0 으로 채워 보여준다', () => {
    const legacy: Record<string, unknown> = { ...makeDashboard() };
    delete legacy.openOpinionCount;
    delete legacy.collectionRate;
    mockDashboardQuery.mockReturnValue({
      data: legacy,
      isLoading: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdminFeesPage />);

    const summary = screen.getByRole('list', { name: '회비 전체 현황' });
    expect(within(summary).getByText('0%')).toBeInTheDocument();
    expect(within(summary).getByText('0건')).toBeInTheDocument();
  });

  it('조회에 실패하면 다시 시도할 수 있게 안내한다', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockClubsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch,
    });

    render(<AdminFeesPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('동아리 회비 현황을 불러오지 못했어요.');

    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('기간 프리셋 환산', () => {
  // 학기 경계는 서버가 모르는 프론트 상수라, 경계일과 윤년을 직접 못 박아 둔다(스펙 §7.0).
  it('3~8월은 1학기(3/1~8/31)로 환산한다', () => {
    expect(resolvePeriodParams({ preset: 'SEMESTER' }, kstNoon('2026-03-01'))).toEqual({
      from: '2026-03-01',
      to: '2026-08-31',
    });
    expect(resolvePeriodParams({ preset: 'SEMESTER' }, kstNoon('2026-08-31'))).toEqual({
      from: '2026-03-01',
      to: '2026-08-31',
    });
  });

  it('9~12월은 2학기 시작 해를, 1~2월은 전년도를 시작 해로 본다', () => {
    expect(resolvePeriodParams({ preset: 'SEMESTER' }, kstNoon('2026-09-01'))).toEqual({
      from: '2026-09-01',
      to: '2027-02-28',
    });
    expect(resolvePeriodParams({ preset: 'SEMESTER' }, kstNoon('2027-01-15'))).toEqual({
      from: '2026-09-01',
      to: '2027-02-28',
    });
  });

  it('윤년의 2학기 끝은 2월 29일이다', () => {
    expect(resolvePeriodParams({ preset: 'SEMESTER' }, kstNoon('2027-09-20'))).toEqual({
      from: '2027-09-01',
      to: '2028-02-29',
    });
  });

  it('전체는 기간 파라미터를 아예 보내지 않는다', () => {
    expect(resolvePeriodParams({ preset: 'ALL' }, kstNoon('2026-08-04'))).toEqual({});
  });
});

/** KST 정오 — 자정 기준으로 잡으면 실행 환경 시간대에 따라 날짜가 하루 밀린다. */
function kstNoon(date: string): Date {
  return new Date(`${date}T12:00:00+09:00`);
}
