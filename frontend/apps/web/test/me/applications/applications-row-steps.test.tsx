import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary, AssignedInterview, MyApplicationDetail } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ApplicationsPage } from '@/app/me/applications/_pages/ApplicationsPage';

const mockApplicationsQuery = vi.fn();
let openDetail: MyApplicationDetail | undefined;

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('@duing/hooks', async () => ({
  ...(await import('@duing/hooks/datetime')),
  useMyApplicationsQuery: () => mockApplicationsQuery(),
  useMyApplicationDetailQuery: () => ({ data: openDetail }),
  useMyInterviewQuery: () => ({ data: undefined }),
  useWithdrawApplicationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/ExploreNav', () => ({ ExploreNav: () => null }));

const base: ApplicationSummary = {
  id: 1,
  recruitmentId: 7,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus: 'OPEN',
  clubId: 3,
  clubName: '행 동아리',
  category: 'HOBBY',
  logoUrl: null,
  status: 'SUBMITTED',
  interview: null,
  submittedAt: '2026-06-01T01:00:00Z',
  endedByClubDeactivation: false,
};

const ASSIGNED_INTERVIEW: AssignedInterview = {
  startAt: '2026-06-20T05:00:00Z',
  endAt: '2026-06-20T06:00:00Z',
  location: '302호',
};

function renderPage(rows: ApplicationSummary[], defaultOpenId?: string) {
  mockApplicationsQuery.mockReturnValue({ data: rows, isLoading: false, isFetching: false, isError: false });
  return render(
    <ToastProvider>
      <ApplicationsPage defaultOpenId={defaultOpenId} />
    </ToastProvider>,
  );
}

// 행 타임라인의 마디를 '이름:상태'로 읽는다 — StepNode 는 완료·실패에 svg, 진행 중에 안쪽 점(span)을 그린다.
function stepsOfRow(container: HTMLElement, clubName: string): string[] {
  const row = [...container.querySelectorAll('.apply-row')].find((candidate) => candidate.textContent?.includes(clubName));
  const timeline = row?.querySelector('.ar-timeline > div');
  return [...(timeline?.children ?? [])]
    .filter((node) => node.textContent)
    .map((node) => {
      const state = node.querySelector('svg') ? 'done' : node.querySelector('span') ? 'current' : 'pending';
      return `${node.textContent}:${state}`;
    });
}

function rowSteps(summary: ApplicationSummary): string[] {
  const { container } = renderPage([summary]);
  return stepsOfRow(container, summary.clubName);
}

afterEach(() => {
  mockApplicationsQuery.mockReset();
  openDetail = undefined;
});

describe('내 지원 목록 행 — 진행 표시는 면접을 쓰는 모집에만 면접 마디를 둔다(상세 ApplicationStepper 와 같은 규칙)', () => {
  it.each<[string, Partial<ApplicationSummary>, string[]]>([
    ['심사 중', {}, ['심사:current', '최종 결과:pending']],
    // 운영진이 면접을 끈 모집에 남은 면접 대상 — 상세처럼 심사에 머문다.
    ['면접을 끈 모집의 면접 대상', { status: 'INTERVIEW_PENDING' }, ['심사:current', '최종 결과:pending']],
    // 끄기 전에 확정된 배정이 남아 있어도(목록은 배정을 그대로 싣는다) 마디는 같다.
    ['면접을 끈 모집에 확정 배정이 남은 면접 대상', { status: 'INTERVIEW_PENDING', interview: ASSIGNED_INTERVIEW }, ['심사:current', '최종 결과:pending']],
    ['합격', { status: 'ACCEPTED' }, ['심사:done', '최종 결과:done']],
    ['불합격', { status: 'REJECTED' }, ['심사:done', '최종 결과:done']],
    // 결과가 난 지원은 모집이 마감돼도 결과 그대로다.
    ['마감 모집의 합격', { status: 'ACCEPTED', recruitmentStatus: 'CLOSED' }, ['심사:done', '최종 결과:done']],
    ['결과 없이 마감', { recruitmentStatus: 'CLOSED' }, ['심사:done', '최종 결과:pending']],
    ['운영 중단으로 선발 종료', { status: 'REJECTED', endedByClubDeactivation: true }, ['심사:done', '최종 결과:pending']],
  ])('면접을 쓰지 않는 모집 — %s — 2단이다', (_case, overrides, expected) => {
    expect(rowSteps({ ...base, ...overrides, useInterview: false })).toEqual(expected);
  });

  it.each<[string, Partial<ApplicationSummary>, string[]]>([
    ['심사 중', {}, ['심사:current', '면접:pending', '최종 결과:pending']],
    ['면접 대상', { status: 'INTERVIEW_PENDING' }, ['심사:done', '면접:current', '최종 결과:pending']],
    ['결과 없이 마감', { recruitmentStatus: 'CLOSED' }, ['심사:done', '면접:pending', '최종 결과:pending']],
  ])('면접을 쓰는 모집 — %s — 지금처럼 3단이다', (_case, overrides, expected) => {
    expect(rowSteps({ ...base, ...overrides, useInterview: true })).toEqual(expected);
  });

  it('면접 사용 여부를 싣지 않는 옛 응답은 지금처럼 3단이다(fail-open)', () => {
    expect(rowSteps(base)).toEqual(['심사:current', '면접:pending', '최종 결과:pending']);
  });

  it('한 목록에 면접 사용·미사용 모집 지원이 섞여도 행마다 자기 모집 값을 따른다', () => {
    const { container } = renderPage([
      { ...base, id: 1, clubName: '면접 없는 동아리', useInterview: false },
      { ...base, id: 2, clubName: '면접 보는 동아리', useInterview: true },
    ]);
    expect(stepsOfRow(container, '면접 없는 동아리')).toEqual(['심사:current', '최종 결과:pending']);
    expect(stepsOfRow(container, '면접 보는 동아리')).toEqual(['심사:current', '면접:pending', '최종 결과:pending']);
  });

  it('면접을 쓰지 않는 모집의 지원을 상세 창으로 열면 행과 칸 수가 같다(2·2)', () => {
    openDetail = {
      id: 1,
      recruitmentId: 7,
      recruitmentTitle: '봄 신입 모집',
      recruitmentStatus: 'OPEN',
      clubId: 3,
      clubName: '행 동아리',
      questions: [],
      answers: [],
      status: 'SUBMITTED',
      interview: null,
      submittedAt: '2026-06-01T01:00:00Z',
      interviewAvailabilityCount: 0,
      availabilityDeadline: null,
      useInterview: false,
      endedByClubDeactivation: false,
    };
    const { container } = renderPage([{ ...base, useInterview: false }], '1');
    expect(stepsOfRow(container, '행 동아리')).toHaveLength(2);
    expect(document.querySelectorAll('[aria-labelledby="application-stepper-title"] ol > li')).toHaveLength(2);
  });
});

describe('내 지원 목록 행 — 면접을 끈 모집에 남은 면접 배정은 보이지 않는다(상세와 같은 규칙)', () => {
  const rowText = (container: HTMLElement, clubName: string): string =>
    [...container.querySelectorAll('.apply-row')].find((row) => row.textContent?.includes(clubName))?.textContent ?? '';
  const tabTexts = (container: HTMLElement): string[] =>
    [...container.querySelectorAll('section button')].map((tab) => tab.textContent ?? '');
  const interviewOff: ApplicationSummary = {
    ...base, status: 'INTERVIEW_PENDING', interview: ASSIGNED_INTERVIEW, useInterview: false,
  };

  it('확정 배정이 남아 있어도 배지는 면접 대상이고 면접일·장소가 없다', () => {
    const { container } = renderPage([interviewOff]);
    const text = rowText(container, '행 동아리');
    expect(text).toContain('면접 대상');
    // '면접일 확정' 배지와 오른쪽 '면접일' 칸을 함께 막는다.
    expect(text).not.toContain('면접일');
    expect(text).not.toContain('302호');
  });

  it('면접 대상 칩에는 그대로 센다(상태가 면접 대상이다)', () => {
    const { container } = renderPage([interviewOff]);
    expect(tabTexts(container)).toContain('면접 대상1');
  });

  it('상세 창에 철회 버튼이 생기지 않는다(심사 중으로 바꾸지 않는다)', () => {
    renderPage([interviewOff], '1');
    expect(document.body.textContent).not.toContain('지원 철회');
  });

  it.each([true, undefined])('useInterview=%s 면 지금처럼 면접일 확정·장소다(fail-open)', (useInterview) => {
    const { container } = renderPage([{ ...interviewOff, useInterview }]);
    const text = rowText(container, '행 동아리');
    expect(text).toContain('면접일 확정');
    expect(text).toContain('302호');
  });
});
