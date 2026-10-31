import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import {
  APPLICATION_ENDED_BY_CLUB_DEACTIVATION_DESCRIPTION,
  APPLICATION_ENDED_BY_CLUB_DEACTIVATION_LABEL,
} from '@/app/_constants/application-status';
import { ApplicationsPage } from '@/app/me/applications/_pages/ApplicationsPage';

const mockApplicationsQuery = vi.fn();

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('@duing/hooks', async () => ({
  ...(await import('@duing/hooks/datetime')),
  useMyApplicationsQuery: () => mockApplicationsQuery(),
  useMyApplicationDetailQuery: () => ({ data: undefined }),
  useMyInterviewQuery: () => ({ data: undefined }),
  useWithdrawApplicationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/ExploreNav', () => ({ ExploreNav: () => null }));

const summary = {
  id: 42,
  recruitmentId: 7,
  recruitmentTitle: '봄 신입 모집',
  recruitmentStatus: 'CLOSED' as const,
  clubId: 3,
  clubName: '쉬는 동아리',
  category: 'HOBBY' as const,
  logoUrl: null,
  status: 'REJECTED' as const,
  interview: null,
  submittedAt: '2026-06-01T01:00:00Z',
};
const rows = [
  // 정리 전 잡혀 있던 일정이 응답에 남아 있어도(스펙 §4-1) 목록에 면접일이 보이면 안 된다(스펙 §9 #4).
  {
    ...summary,
    id: 42,
    clubName: '쉬는 동아리',
    endedByClubDeactivation: true,
    interview: { startAt: '2026-06-20T05:00:00Z', endAt: '2026-06-20T06:00:00Z', location: '302호' },
  },
  { ...summary, id: 43, clubName: '불합격 동아리', endedByClubDeactivation: false },
  { ...summary, id: 44, clubName: '합격 동아리', status: 'ACCEPTED' as const, endedByClubDeactivation: false },
];

const tree = () => (
  <ToastProvider>
    <ApplicationsPage />
  </ToastProvider>
);
const tabTexts = (root: HTMLElement) => [...root.querySelectorAll('section button')].map((tab) => tab.textContent);
const summaryText = (root: HTMLElement) => root.querySelector('aside > div')?.textContent ?? '';
const rowText = (root: HTMLElement, clubName: string) =>
  [...root.querySelectorAll('.apply-row')].find((row) => row.textContent?.includes(clubName))?.textContent ?? '';

afterEach(() => {
  mockApplicationsQuery.mockReset();
});

describe('내 지원 목록 — 운영 중단으로 끝난 지원', () => {
  it('운영 중단 정리로 끝난 지원은 "선발 종료" 알약만 보이고(안내 문장은 상세에서), 운영진 불합격은 "최종 불합격" 그대로다', () => {
    mockApplicationsQuery.mockReturnValue({ data: rows, isLoading: false, isFetching: false, isError: false });
    const { container } = render(tree());

    expect(rowText(container, '쉬는 동아리')).toContain(APPLICATION_ENDED_BY_CLUB_DEACTIVATION_LABEL);
    expect(rowText(container, '쉬는 동아리')).not.toContain(APPLICATION_ENDED_BY_CLUB_DEACTIVATION_DESCRIPTION);
    expect(rowText(container, '쉬는 동아리')).not.toContain('최종 불합격');
    expect(rowText(container, '쉬는 동아리')).not.toContain('면접일');
    expect(rowText(container, '불합격 동아리')).toContain('최종 불합격');
  });

  it('결과 미발표 탭·요약 "미발표"로 세고 "완료"에서는 뺀다 — 합불이 아니라 결과 없이 끝났다', () => {
    mockApplicationsQuery.mockReturnValue({ data: rows, isLoading: false, isFetching: false, isError: false });
    const { container } = render(tree());

    expect(tabTexts(container)).toEqual(expect.arrayContaining(['결과 미발표1', '최종 불합격1', '최종 합격1']));
    expect(summaryText(container)).toContain('완료2');
    expect(summaryText(container)).toContain('미발표1');
  });

  it('이전 백엔드(표시 칸 없음)의 불합격은 "최종 불합격"이다', () => {
    mockApplicationsQuery.mockReturnValue({
      data: [{ ...summary, id: 45, clubName: '옛 응답 동아리' }],
      isLoading: false,
      isFetching: false,
      isError: false,
    });
    const { container } = render(tree());

    expect(rowText(container, '옛 응답 동아리')).toContain('최종 불합격');
    expect(rowText(container, '옛 응답 동아리')).not.toContain(APPLICATION_ENDED_BY_CLUB_DEACTIVATION_LABEL);
  });
});
