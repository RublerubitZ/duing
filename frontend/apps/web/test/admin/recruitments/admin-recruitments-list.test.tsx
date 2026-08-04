import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { todayKstDateString } from '@duing/hooks/datetime';
import type { AdminRecruitmentSummary } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockRecruitmentsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminRecruitmentsQuery: (...args: unknown[]) => mockRecruitmentsQuery(...args),
}));

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

function makeRecruitment(
  overrides: Partial<AdminRecruitmentSummary> = {},
): AdminRecruitmentSummary {
  return {
    recruitmentId: 1,
    clubId: 10,
    clubName: '두잉코드',
    title: '2026 신입 부원 모집',
    applicationMode: 'SELF',
    status: 'OPEN',
    applicantCount: 12,
    startDate: '2026-03-02',
    endDate: TOMORROW,
    updatedAt: '2026-08-01T02:30:00Z',
    ...overrides,
  };
}

function listSuccess(rows: AdminRecruitmentSummary[]) {
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
      listSuccess([makeRecruitment({ title: '기간 없는 공고', endDate: null })]),
    );

    render(<AdminRecruitmentsPage />);

    expect(within(rowByTitle('기간 없는 공고')).getByText('상시모집')).toBeInTheDocument();
  });

  it('기간이 지났는데 아직 열려 있는 모집에만 운영 개입 배지를 단다', () => {
    mockRecruitmentsQuery.mockReturnValue(
      listSuccess([
        makeRecruitment({ recruitmentId: 1, title: '기간 지난 열린 모집', status: 'OPEN', endDate: YESTERDAY }),
        makeRecruitment({ recruitmentId: 2, title: '기간 지난 마감 모집', status: 'CLOSED', endDate: YESTERDAY }),
        makeRecruitment({ recruitmentId: 3, title: '진행 중 모집', status: 'OPEN', endDate: TOMORROW }),
        makeRecruitment({ recruitmentId: 4, title: '상시 열린 모집', status: 'OPEN', endDate: null }),
      ]),
    );

    render(<AdminRecruitmentsPage />);

    expect(within(rowByTitle('기간 지난 열린 모집')).getByText('운영 개입 필요')).toBeInTheDocument();
    expect(within(rowByTitle('기간 지난 마감 모집')).queryByText('운영 개입 필요')).toBeNull();
    expect(within(rowByTitle('진행 중 모집')).queryByText('운영 개입 필요')).toBeNull();
    expect(within(rowByTitle('상시 열린 모집')).queryByText('운영 개입 필요')).toBeNull();
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

    await user.click(screen.getByRole('button', { name: '모집중' }));
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
