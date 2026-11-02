import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Applicant, DashboardTaskGroup, RecruitmentDetail, RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));

const mockTodo = vi.fn();
const mockApplicants = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    // 표현 모듈이 호출 시점에 읽는 순수 유틸은 실제 값을 남긴다(ActionItemsCard.test.tsx 와 같은 이유).
    CLOSING_SOON_DAYS: actual.CLOSING_SOON_DAYS,
    formatRelativeTime: actual.formatRelativeTime,
    useRecruitmentActionItems: (recruitment: RecruitmentSummary) => mockTodo(recruitment),
    useApplicantsQuery: (recruitmentId: number, filters: unknown) => mockApplicants(recruitmentId, filters),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import { RecruitmentTodoCard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/_components/RecruitmentTodoCard';
import { presentDashboardTask } from '@/app/manage/_components/dashboard/dashboardTaskPresentation';

const NOW = new Date('2026-11-02T03:00:00Z'); // 11/2 KST 12:00
const DAY_MS = 86_400_000;

function detail(over: Partial<RecruitmentDetail> = {}): RecruitmentDetail {
  return {
    id: 5, clubId: 10, clubName: '두잉', title: '2026 2학기 신입 부원 모집',
    startDate: '2026-10-15', endDate: '2026-11-30', capacity: 20,
    status: 'OPEN', displayStatus: 'OPEN', effectivelyOpen: true,
    applicationMode: 'SELF', externalFormUrl: null, useInterview: true, targetRole: 'MEMBER', closedAt: null,
    content: null, questions: [], interviewStartDate: null, interviewEndDate: null,
    showApplicantCount: false, applicantCount: null, ...over,
  };
}
const CLOSED = { status: 'CLOSED', displayStatus: 'CLOSED', effectivelyOpen: false } as const;

const OPEN_GROUPS: DashboardTaskGroup[] = [
  { key: 'NOW', tasks: [
    { source: 'RECRUITMENT', item: { type: 'INTERVIEW_RESULT_PENDING', recruitmentId: 5, recruitmentTitle: '2026 2학기 신입 부원 모집', roundId: 9, roundTitle: '1차 면접', count: 5 } },
    { source: 'RECRUITMENT', item: { type: 'APPLICANTS_AWAITING_REVIEW', recruitmentId: 5, recruitmentTitle: '2026 2학기 신입 부원 모집', count: 12, submitted: 9, onHold: 3, pendingDays: 9 } },
  ] },
  { key: 'WAITING', tasks: [
    { source: 'RECRUITMENT', item: { type: 'INTERVIEW_RESPONSE_UNCOLLECTED', recruitmentId: 5, recruitmentTitle: '2026 2학기 신입 부원 모집', roundId: 8, roundTitle: '2차 면접', count: 2, daysLeft: 1 } },
  ] },
];
const CLOSED_GROUPS: DashboardTaskGroup[] = [
  { key: 'NOW', tasks: [{ source: 'RECRUITMENT', item: { type: 'CLOSED_RECRUITMENT_UNDECIDED', recruitmentId: 5, recruitmentTitle: '2026 2학기 신입 부원 모집', count: 6 } }] },
];

function todo(over: Partial<{ groups: DashboardTaskGroup[]; submittedCount: number | undefined; isLoading: boolean; isError: boolean }> = {}) {
  mockTodo.mockReturnValue({ groups: [], submittedCount: undefined, isLoading: false, isError: false, ...over });
}
function applicant(applicationId: number, days: number): Applicant {
  return {
    applicationId, userId: applicationId + 100, userName: `지원자${applicationId}`, studentId: `2026${applicationId}`,
    college: 'GLOBAL_BUSINESS', major: '경영학과', grade: 'FRESHMAN', answers: [], status: 'SUBMITTED',
    submittedAt: new Date(NOW.getTime() - days * DAY_MS).toISOString(), interviewStartAt: null, myScore: null,
  };
}
const region = () => screen.queryByRole('region', { name: '이 모집에서 할 일' });
const groupHeadings = () => screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mockTodo.mockReset();
  mockApplicants.mockReset();
  mockApplicants.mockReturnValue({ data: [], isError: false, isPlaceholderData: false });
});
afterEach(() => vi.useRealTimers());

describe('RecruitmentTodoCard — 진행 중 모집 상태표', () => {
  it('로딩 — 카드와 스켈레톤, 묶음·오류 문구 없음', () => {
    todo({ isLoading: true });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    expect(region()).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.queryByText(/불러오지 못했어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('실패·항목 0 — "할 일을 불러오지 못했어요."', () => {
    todo({ isError: true });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    expect(within(region()!).getByText('할 일을 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('일부 실패 — 묶음은 그리되 건수를 숨기고 한 줄 안내', () => {
    todo({ groups: OPEN_GROUPS, isError: true });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    expect(groupHeadings()).toEqual(['지금 처리', '처리 대기']);
    expect(screen.getByText('일부 할 일을 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('성공·항목 0 — 빈 문구 한 줄', () => {
    todo({ submittedCount: 0 });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    expect(within(region()!).getByText('지금 처리할 일이 없어요.')).toBeInTheDocument();
  });

  it('기간이 지난 접수 중이어도 빈 문구는 한 줄 — 마감 권고는 위 배너가 말한다', () => {
    todo({ submittedCount: 0 });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail({ displayStatus: 'CLOSED', effectivelyOpen: false, endDate: '2026-10-31' })} />);
    expect(screen.getByText('지금 처리할 일이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText(/마감해 주세요/)).not.toBeInTheDocument();
  });

  it('성공·항목 있음 — 묶음 건수, 줄 문구·목적지는 홈 표현(variant recruitment)과 같다', () => {
    todo({ groups: OPEN_GROUPS, submittedCount: 9 });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    expect(groupHeadings()).toContain('지금 처리 2');
    expect(groupHeadings()).toContain('처리 대기 1');
    const expectedHrefs = OPEN_GROUPS.flatMap((group) => group.tasks).map((task) => presentDashboardTask(10, task, NOW, { variant: 'recruitment' }).href);
    const todoLinks = within(region()!).getAllByRole('link').slice(0, 3);
    expect(todoLinks.map((link) => link.getAttribute('href'))).toEqual(expectedHrefs);
    expect(screen.getByText('검토 대기 지원자 12명')).toBeInTheDocument();
    expect(screen.getByText('지원 완료 9명 · 보류 3명')).toBeInTheDocument();
    expect(screen.queryByText(/2026 2학기 신입 부원 모집/)).not.toBeInTheDocument();
  });

  it('둘째 줄이 없는 줄은 둘째 줄 칸을 그리지 않는다', () => {
    todo({
      groups: [{ key: 'WAITING', tasks: [
        { source: 'RECRUITMENT', item: { type: 'INTERVIEW_ROUND_NEEDED', recruitmentId: 5, recruitmentTitle: '2026 2학기 신입 부원 모집', count: 2 } },
      ] }],
      submittedCount: 0,
    });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    const label = screen.getByText('면접 라운드 생성 필요 2명');
    const labelBlock = label.parentElement!;
    expect(label.closest('a')!.querySelector('span')).toBe(labelBlock);
    expect(labelBlock.children).toHaveLength(1);
  });
});

describe('RecruitmentTodoCard — 마감 모집 상태표', () => {
  it('로딩 — 아무것도 그리지 않는다', () => {
    todo({ isLoading: true });
    const { container } = render(<RecruitmentTodoCard clubId={10} recruitment={detail(CLOSED)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('실패·항목 0 — 카드와 오류 문구', () => {
    todo({ isError: true });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail(CLOSED)} />);
    expect(within(region()!).getByText('할 일을 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('성공·항목 0 — 카드 없음', () => {
    todo({ submittedCount: 0 });
    const { container } = render(<RecruitmentTodoCard clubId={10} recruitment={detail(CLOSED)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('성공·항목 있음 — 결과 미확정 줄, 미리보기는 지원 완료가 있어도 없다', () => {
    todo({ groups: CLOSED_GROUPS, submittedCount: 2 });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail(CLOSED)} />);
    expect(screen.getByText('마감 모집 결과 미확정 6명')).toBeInTheDocument();
    expect(screen.getByText('마감 뒤에도 최종 결과를 확정할 수 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '먼저 볼 지원서' })).not.toBeInTheDocument();
    expect(mockApplicants).not.toHaveBeenCalled();
  });
});

describe('RecruitmentTodoCard — 먼저 볼 지원서 마운트', () => {
  it.each([
    ['통계를 받지 못함', undefined],
    ['지원 완료 0(보류만)', 0],
  ])('%s — 미리보기를 마운트하지 않는다', (_name, submittedCount) => {
    todo({ groups: OPEN_GROUPS, submittedCount });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    expect(mockApplicants).not.toHaveBeenCalled();
  });

  it('기간이 지난 접수 중도 진행 중 규칙 — 지원 완료가 있으면 미리보기를 붙인다', () => {
    todo({ groups: OPEN_GROUPS, submittedCount: 9 });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail({ displayStatus: 'CLOSED', effectivelyOpen: false, endDate: '2026-10-31' })} />);
    expect(mockApplicants).toHaveBeenCalledWith(5, { status: 'SUBMITTED' });
  });

  it('진행 중 + 지원 완료 > 0 — 맨 위 지원서 칩 일수 = 검토 대기 줄 "미처리 N일"', () => {
    todo({ groups: OPEN_GROUPS, submittedCount: 9 });
    mockApplicants.mockReturnValue({ data: [applicant(12, 4), applicant(11, 9)], isError: false, isPlaceholderData: false });
    render(<RecruitmentTodoCard clubId={10} recruitment={detail()} />);
    const preview = screen.getByRole('region', { name: '먼저 볼 지원서' });
    const firstRowChip = within(within(preview).getAllByRole('listitem')[0]!).getByText(/^미처리/);
    const awaitingRow = screen.getByText('검토 대기 지원자 12명').closest('a')!;
    expect(firstRowChip.textContent).toBe(within(awaitingRow).getByText(/^미처리/).textContent);
    expect(firstRowChip).toHaveTextContent('미처리 9일');
  });
});
