import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminApplicant, AdminApplicantList, AdminApplicationDetail } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockApplicantsQuery = vi.fn();
const mockApplicationDetailQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminApplicantsQuery: (...args: unknown[]) => mockApplicantsQuery(...args),
  useAdminApplicationDetailQuery: (...args: unknown[]) => mockApplicationDetailQuery(...args),
}));

// 디바운스는 타이밍 의존을 없애기 위해 항등 함수로 대체한다(모집 목록 테스트 전례).
vi.mock('@/app/admin/_hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

// 검색어를 주소에 싣지 않는다는 약속을 replace 호출 여부로 확인한다.
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminSelfRecruitmentPanel } from '@/app/admin/recruitments/_components/AdminSelfRecruitmentPanel';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
const RECRUITMENT_ID = 5;

function makeApplicant(overrides: Partial<AdminApplicant> = {}): AdminApplicant {
  return {
    applicationId: 31,
    userName: '정우진',
    studentId: '2023118902',
    college: 'IT_ENGINEERING',
    major: '전자공학과',
    status: 'SUBMITTED',
    submittedAt: '2026-08-01T02:30:00Z',
    ...overrides,
  };
}

function makeList(overrides: Partial<AdminApplicantList> = {}): AdminApplicantList {
  return {
    total: 12,
    statusCounts: { SUBMITTED: 7, ACCEPTED: 5 },
    applicants: [makeApplicant()],
    ...overrides,
  };
}

function listSuccess(list: AdminApplicantList) {
  return { data: list, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}

const applicationDetail: AdminApplicationDetail = {
  applicationId: 31,
  recruitmentId: RECRUITMENT_ID,
  recruitmentTitle: '2026 신입 부원 모집',
  clubId: 10,
  clubName: '두잉코드',
  applicant: {
    name: '정우진',
    studentId: '2023118902',
    college: 'IT_ENGINEERING',
    major: '전자공학과',
  },
  status: 'SUBMITTED',
  submittedAt: '2026-08-01T02:30:00Z',
  statusHistory: [],
  answers: [{ question: '지원 동기를 알려주세요', answer: '함께 만들고 싶어서요' }],
};

/**
 * 요약 칩은 라벨과 건수를 나란히 둔다. 같은 라벨이 표의 상태 뱃지·필터 칩에도 나오므로
 * 요약 영역으로 좁힌 뒤 라벨과 같은 칩 안의 건수를 읽는다.
 */
function summaryChipCount(label: string): HTMLElement {
  const summary = screen.getByRole('region', { name: '전체 지원 현황' });
  const chip = within(summary).getByText(label).parentElement;
  if (chip === null) throw new Error(`${label} 칩을 찾지 못했습니다`);
  return within(chip).getByText(/^\d+명$/);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApplicantsQuery.mockReturnValue(listSuccess(makeList()));
  mockApplicationDetailQuery.mockReturnValue({
    data: applicationDetail,
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('관리자 자체 지원 모집 패널', () => {
  it('요약은 검색·필터와 무관한 모집 전체 기준임을 라벨로 밝힌다', () => {
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(screen.getByText('전체 지원 현황')).toBeInTheDocument();
  });

  it('총 지원자와 상태별 건수를 서버 값 그대로 보여준다', () => {
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(summaryChipCount('총 지원자')).toHaveTextContent('12명');
    expect(summaryChipCount('지원 완료')).toHaveTextContent('7명');
    expect(summaryChipCount('합격')).toHaveTextContent('5명');
  });

  it('건수가 없는 상태는 키가 아예 없어도 0 으로 채운다', () => {
    mockApplicantsQuery.mockReturnValue(
      listSuccess(makeList({ total: 7, statusCounts: { SUBMITTED: 7 } })),
    );

    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(summaryChipCount('합격')).toHaveTextContent('0명');
    expect(summaryChipCount('불합격')).toHaveTextContent('0명');
  });

  it('지원자 신원 항목을 표로 보여준다', () => {
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    const row = screen.getByRole('row', { name: /정우진/ });
    expect(within(row).getByText('2023118902')).toBeInTheDocument();
    expect(within(row).getByText('IT·공과대학 · 전자공학과')).toBeInTheDocument();
    expect(within(row).getByText('지원 완료')).toBeInTheDocument();
    expect(within(row).getByText('2026.08.01 11:30')).toBeInTheDocument();
  });

  it('검색어는 주소에 싣지 않고 조회 파라미터로만 넘긴다', async () => {
    const user = userEvent.setup();
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    await user.type(screen.getByLabelText('지원자 검색'), '정우진');

    expect(mockApplicantsQuery).toHaveBeenLastCalledWith(
      RECRUITMENT_ID,
      expect.objectContaining({ q: '정우진' }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('상태 필터와 정렬을 조회 파라미터로 넘긴다', async () => {
    const user = userEvent.setup();
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    await user.click(screen.getByRole('button', { name: '합격' }));
    await user.selectOptions(screen.getByLabelText('지원자 정렬'), 'OLDEST');

    expect(mockApplicantsQuery).toHaveBeenLastCalledWith(
      RECRUITMENT_ID,
      expect.objectContaining({ status: 'ACCEPTED', sort: 'OLDEST' }),
    );
  });

  it('읽기 전용이라 선택 체크박스도 일괄 처리 버튼도 두지 않는다', () => {
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /일괄/ })).toBeNull();
  });

  it('지원자가 한 명도 없으면 검색 도구 대신 빈 상태를 안내한다', () => {
    mockApplicantsQuery.mockReturnValue(
      listSuccess(makeList({ total: 0, statusCounts: {}, applicants: [] })),
    );

    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(screen.getByText('아직 지원자가 없습니다')).toBeInTheDocument();
    expect(screen.queryByLabelText('지원자 검색')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('필터로 좁혀 결과만 비었으면 조건을 바꾸라고 안내한다', () => {
    mockApplicantsQuery.mockReturnValue(listSuccess(makeList({ applicants: [] })));

    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(screen.getByText('조회 결과가 없습니다')).toBeInTheDocument();
    // 전체 현황은 필터와 무관하므로 여전히 서버 총계를 그대로 보여준다.
    expect(summaryChipCount('총 지원자')).toHaveTextContent('12명');
    expect(screen.getByLabelText('지원자 검색')).toBeInTheDocument();
  });

  it('행을 누르기 전에는 지원서를 조회하지 않는다', () => {
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(mockApplicationDetailQuery).not.toHaveBeenCalled();
  });

  it('행을 누르면 그 지원서를 시트로 연다', async () => {
    const user = userEvent.setup();
    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    await user.click(within(screen.getByRole('row', { name: /정우진/ })).getByText('정우진'));

    expect(mockApplicationDetailQuery).toHaveBeenCalledWith(31);
    expect(within(screen.getByRole('dialog')).getByText('함께 만들고 싶어서요')).toBeInTheDocument();
  });

  it('조회에 실패하면 다시 시도할 수 있게 안내한다', () => {
    mockApplicantsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(<AdminSelfRecruitmentPanel recruitmentId={RECRUITMENT_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent('지원자를 불러오지 못했어요.');
  });
});
