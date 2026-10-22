import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { todayKstDateString } from '@duing/hooks/datetime';
import type { AdminRecruitmentListItem } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockRecruitmentsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminRecruitmentsQuery: (...args: unknown[]) => mockRecruitmentsQuery(...args),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

// 검색어는 의도적으로 주소에 싣지 않는다 — replace 호출 여부로 그 약속을 지킨다.
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
import { AdminRecruitmentsPage } from '@/app/admin/recruitments/_pages/AdminRecruitmentsPage';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
// 하드코딩한 절대 날짜는 그 날이 지나면 테스트를 깨뜨린다 — 오늘 기준 상대 날짜로 만든다.
const DAY_MS = 86_400_000;
const YESTERDAY = todayKstDateString(new Date(Date.now() - DAY_MS));
const TOMORROW = todayKstDateString(new Date(Date.now() + DAY_MS));

// 일수 경계 테스트가 고정하는 현재 시각 — KST 정오라 픽스처와 렌더 사이에 자정을 넘길 일이 없다.
const FIXED_NOW = new Date('2026-10-13T12:00:00+09:00');

/** 현재 시각(고정했다면 그 시각) 기준 n일 전 같은 시각 — KST 날짜 차이가 정확히 n일이 된다. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function makeRecruitment(
  overrides: Partial<AdminRecruitmentListItem> = {},
): AdminRecruitmentListItem {
  return {
    recruitmentId: 1,
    clubId: 10,
    clubName: '두잉코드',
    title: '2026 신입 부원 모집',
    applicationMode: 'SELF',
    status: 'OPEN',
    displayStatus: 'OPEN',
    applicantCount: 12,
    startDate: '2026-03-02',
    endDate: TOMORROW,
    closedAt: null,
    updatedAt: '2026-08-01T02:30:00Z',
    pendingApplicationCount: 0,
    oldestPendingSubmittedAt: null,
    operatorsLastActiveAt: daysAgoIso(0),
    ...overrides,
  };
}

function listSuccess(rows: AdminRecruitmentListItem[]) {
  return { data: rows, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}

function rowByTitle(title: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(title) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecruitmentsQuery.mockReturnValue(listSuccess([makeRecruitment()]));
});

describe('관리자 모집 목록', () => {
  it('전 동아리 모집을 동아리명·제목과 함께 보여준다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ recruitmentId: 1, clubName: '두잉코드', title: '2026 신입 부원 모집' }),
        makeRecruitment({ recruitmentId: 2, clubName: '두잉밴드', title: '보컬 추가 모집' }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    expect(screen.getByText('두잉코드')).toBeInTheDocument();
    expect(screen.getByText('2026 신입 부원 모집')).toBeInTheDocument();
    expect(screen.getByText('두잉밴드')).toBeInTheDocument();
    expect(screen.getByText('보컬 추가 모집')).toBeInTheDocument();
  });

  it('미처리 열이 무엇을 세는지 보이는 한 줄로 안내한다', () => {
    // 툴팁은 터치 기기에서 열 수 없다 — 운영진 대시보드 "검토 대기"(보류 포함)와 정의가 달라 화면에 적어 둔다.
    render(<AdminRecruitmentsPage />);

    expect(
      screen.getByText(
        "미처리는 아직 '지원 완료' 그대로인 지원서 수입니다. '보류'로 옮긴 지원서는 처리한 것으로 보며, 가장 오래 기다린 지원서가 7일째가 되면 강조합니다.",
      ),
    ).toBeInTheDocument();
  });

  it('외부 폼 모집의 지원자 수는 0 이 아니라 해당 없음(—)으로 읽힌다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ title: '외부 폼 모집', applicationMode: 'EXTERNAL', applicantCount: null }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    expect(within(rowByTitle('외부 폼 모집')).getByText('—')).toBeInTheDocument();
  });

  it('마감일 없는 모집은 기간 대신 상시모집으로 표기한다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ title: '기간 없는 공고', displayStatus: 'ALWAYS_OPEN', endDate: null }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    // 상태 칩과 기간 칸 양쪽에 나타난다 — 서버가 표시 상태를 ALWAYS_OPEN 으로 내려주기 때문이다.
    expect(within(rowByTitle('기간 없는 공고')).getAllByText('상시모집')).toHaveLength(2);
  });

  it('기간이 끝났는데 아직 열려 있는 모집은 모집중이 아니라 기간 종료로 적는다', () => {
    // 같은 모집이 총동연 "모집중" / 학생 "모집마감"으로 갈리던 것을 없앤다 — 강제 마감 대상을
    // 고르는 화면이라 표기가 실제와 다르면 판단 근거가 무너진다.
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ title: '기간 끝난 모집', status: 'OPEN', displayStatus: 'CLOSED',
          endDate: YESTERDAY }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    const row = rowByTitle('기간 끝난 모집');
    expect(within(row).getByText('기간 종료')).toBeInTheDocument();
    expect(within(row).queryByText('모집중')).toBeNull();
  });

  it('기간이 지났는데 아직 열려 있는 모집에만 운영 개입 배지를 단다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ recruitmentId: 1, title: '기간 지난 열린 모집', status: 'OPEN',
          displayStatus: 'CLOSED', endDate: YESTERDAY }),
        makeRecruitment({ recruitmentId: 2, title: '기간 지난 마감 모집', status: 'CLOSED',
          displayStatus: 'CLOSED', endDate: YESTERDAY }),
        makeRecruitment({ recruitmentId: 3, title: '진행 중 모집', status: 'OPEN',
          displayStatus: 'OPEN', endDate: TOMORROW }),
        makeRecruitment({ recruitmentId: 4, title: '상시 열린 모집', status: 'OPEN',
          displayStatus: 'ALWAYS_OPEN', endDate: null }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    expect(within(rowByTitle('기간 지난 열린 모집')).getByText('운영 개입 필요')).toBeInTheDocument();
    expect(within(rowByTitle('기간 지난 마감 모집')).queryByText('운영 개입 필요')).toBeNull();
    expect(within(rowByTitle('진행 중 모집')).queryByText('운영 개입 필요')).toBeNull();
    expect(within(rowByTitle('상시 열린 모집')).queryByText('운영 개입 필요')).toBeNull();
  });

  describe('일수 경계', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(FIXED_NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('미처리 열은 건수와 가장 오래된 지원서가 며칠째인지 적고 7일째부터 주의 색으로 강조한다', () => {
      mockRecruitmentsQuery.mockReturnValue(
        listSuccess([
          makeRecruitment({ recruitmentId: 1, title: '일주일 방치 모집', pendingApplicationCount: 3,
            oldestPendingSubmittedAt: daysAgoIso(7) }),
          makeRecruitment({ recruitmentId: 2, title: '엿새째 모집', pendingApplicationCount: 2,
            oldestPendingSubmittedAt: daysAgoIso(6) }),
          makeRecruitment({ recruitmentId: 3, title: '오늘 접수 모집', pendingApplicationCount: 1,
            oldestPendingSubmittedAt: daysAgoIso(0) }),
          makeRecruitment({ recruitmentId: 4, title: '처리 끝난 모집', pendingApplicationCount: 0,
            oldestPendingSubmittedAt: null }),
        ]),
      );

      render(<AdminRecruitmentsPage />);

      expect(screen.getByRole('columnheader', { name: '미처리' })).toBeInTheDocument();
      expect(within(rowByTitle('일주일 방치 모집')).getByText('3건 · 7일째')).toHaveClass('text-coral-deep');
      expect(within(rowByTitle('엿새째 모집')).getByText('2건 · 6일째')).not.toHaveClass('text-coral-deep');
      // 오늘 들어온 지원서는 "0일째" 가 아니라 오늘로 읽힌다.
      expect(within(rowByTitle('오늘 접수 모집')).getByText('1건 · 오늘')).not.toHaveClass('text-coral-deep');
      expect(within(rowByTitle('처리 끝난 모집')).getByText('0건')).not.toHaveClass('text-coral-deep');
    });

    it('운영진 접속은 며칠 전인지 적고 30일을 넘기거나 기록이 없으면 주의 색으로 강조한다', () => {
      mockRecruitmentsQuery.mockReturnValue(
        listSuccess([
          makeRecruitment({ recruitmentId: 1, title: '오늘 접속 모집', operatorsLastActiveAt: daysAgoIso(0) }),
          makeRecruitment({ recruitmentId: 2, title: '한 달째 모집', operatorsLastActiveAt: daysAgoIso(30) }),
          makeRecruitment({ recruitmentId: 3, title: '한 달 넘은 모집', operatorsLastActiveAt: daysAgoIso(31) }),
          makeRecruitment({ recruitmentId: 4, title: '기록 없는 모집', operatorsLastActiveAt: null }),
        ]),
      );

      render(<AdminRecruitmentsPage />);

      expect(screen.getByRole('columnheader', { name: '운영진 접속' })).toBeInTheDocument();
      expect(within(rowByTitle('오늘 접속 모집')).getByText('오늘')).not.toHaveClass('text-coral-deep');
      expect(within(rowByTitle('한 달째 모집')).getByText('30일 전')).not.toHaveClass('text-coral-deep');
      expect(within(rowByTitle('한 달 넘은 모집')).getByText('31일 전')).toHaveClass('text-coral-deep');
      // 세션·로그인 기록이 모두 없으면 가장 오래 방치된 경우다 — 정보 없음이 아니라 주의 대상이다.
      expect(within(rowByTitle('기록 없는 모집')).getByText('기록 없음')).toHaveClass('text-coral-deep');
    });
  });

  it('외부 폼 모집은 미처리도 지원자 수처럼 해당 없음(—)으로 적는다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ title: '외부 폼 모집', applicationMode: 'EXTERNAL', applicantCount: null,
          pendingApplicationCount: null, oldestPendingSubmittedAt: null }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    // 지원자 칸과 미처리 칸 두 곳 — 0건으로 적으면 "다 처리했다"로 읽힌다.
    expect(within(rowByTitle('외부 폼 모집')).getAllByText('—')).toHaveLength(2);
  });

  it('세 필드가 없는 구 응답 행도 깨지지 않고 미처리 —·운영진 접속 기록 없음으로 그린다', () => {
    // 배포 전환기에 프론트가 먼저 뜨면 백엔드 응답에 세 필드가 아예 없다 — 표가 통째로 오류 화면으로 가면 안 된다.
    const {
      pendingApplicationCount: _pendingApplicationCount,
      oldestPendingSubmittedAt: _oldestPendingSubmittedAt,
      operatorsLastActiveAt: _operatorsLastActiveAt,
      ...legacyRow
    } = makeRecruitment({ title: '구 응답 모집' });
    // 목록 타입으로는 만들 수 없는 행이라 listSuccess 를 거치지 않고 그대로 넘긴다(단언 없이).
    mockRecruitmentsQuery.mockReturnValue({
      data: [legacyRow],
      isLoading: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<AdminRecruitmentsPage />);

    const row = rowByTitle('구 응답 모집');
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).getByText('기록 없음')).toBeInTheDocument();
  });

  it('정렬에서 오래 방치된 순을 고르면 STALE 로 조회한다', async () => {
    const user = userEvent.setup();
    render(<AdminRecruitmentsPage />);

    await user.selectOptions(screen.getByLabelText('정렬'), '오래 방치된 순');

    expect(mockRecruitmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'STALE' }),
    );
  });

  it('지원 방식은 자체 지원과 외부 폼으로 구분해 읽힌다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ recruitmentId: 1, title: '자체 폼 모집', applicationMode: 'SELF' }),
        makeRecruitment({
          recruitmentId: 2,
          title: '외부 폼 모집',
          applicationMode: 'EXTERNAL',
          applicantCount: null,
        }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    expect(within(rowByTitle('자체 폼 모집')).getByText('자체 지원')).toBeInTheDocument();
    // 목록 응답에는 외부 폼 URL 이 없다 — 플랫폼을 알 수 없으므로 일반 라벨로 떨어진다.
    expect(within(rowByTitle('외부 폼 모집')).getByText('외부 폼')).toBeInTheDocument();
  });

  it('행을 누르면 상세로 이동한다', async () => {
    const user = userEvent.setup();
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([makeRecruitment({ recruitmentId: 77, title: '이동 대상 모집' })]),
    );

    render(<AdminRecruitmentsPage />);
    await user.click(within(rowByTitle('이동 대상 모집')).getByText('두잉코드'));

    expect(mockPush).toHaveBeenCalledWith('/admin/recruitments/77');
  });

  it('검색어는 주소에 싣지 않고 조회 파라미터로만 넘긴다', async () => {
    const user = userEvent.setup();
    render(<AdminRecruitmentsPage />);

    await user.type(screen.getByLabelText('모집 검색'), '두잉코드');

    expect(mockRecruitmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: '두잉코드' }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('상태·방식 필터와 정렬을 조회 파라미터로 넘긴다', async () => {
    const user = userEvent.setup();
    render(<AdminRecruitmentsPage />);

    await user.click(screen.getByRole('button', { name: '마감 전' }));
    await user.click(screen.getByRole('button', { name: '외부 폼' }));
    await user.selectOptions(screen.getByLabelText('정렬'), 'DEADLINE');

    expect(mockRecruitmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'OPEN', mode: 'EXTERNAL', sort: 'DEADLINE' }),
    );
  });

  it('조회 결과가 없으면 빈 상태를 안내한다', () => {
    mockRecruitmentsQuery.mockReturnValue(listSuccess([]));

    render(<AdminRecruitmentsPage />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('조회 결과가 없습니다')).toBeInTheDocument();
  });

  it('조회에 실패하면 다시 시도할 수 있게 안내한다', () => {
    const refetch = vi.fn();
    mockRecruitmentsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch,
    });

    render(<AdminRecruitmentsPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('모집을 불러오지 못했어요.');
  });
});
