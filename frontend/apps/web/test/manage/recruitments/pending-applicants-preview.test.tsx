import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Applicant } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));

const mockApplicants = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    CLOSING_SOON_DAYS: actual.CLOSING_SOON_DAYS,
    formatRelativeTime: actual.formatRelativeTime,
    useApplicantsQuery: (recruitmentId: number, filters: unknown) => mockApplicants(recruitmentId, filters),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import {
  oldestSubmittedFirst,
  PendingApplicantsPreview,
} from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/_components/PendingApplicantsPreview';

const NOW = new Date('2026-11-02T03:00:00Z'); // 11/2 KST 12:00
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

function applicant(applicationId: number, submittedAt: string, over: Partial<Applicant> = {}): Applicant {
  return {
    applicationId, userId: applicationId + 100, userName: `지원자${applicationId}`, studentId: `2026${applicationId}`,
    college: 'GLOBAL_BUSINESS', major: '경영학과', grade: 'FRESHMAN', answers: [], status: 'SUBMITTED',
    submittedAt, interviewStartAt: null, myScore: null, ...over,
  };
}
const loaded = (applicants: Applicant[]) => ({ data: applicants, isError: false, isPlaceholderData: false });

function renderPreview(submittedCount: number, now: Date = NOW) {
  return render(<PendingApplicantsPreview clubId={10} recruitmentId={5} submittedCount={submittedCount} now={now} />);
}
const base = '/manage/clubs/10/recruitments/5/applicants';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mockApplicants.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('oldestSubmittedFirst', () => {
  it('제출이 오래된 순, 같은 시각이면 지원 번호 순 — 시각 문자열이 아니라 Date.parse 로 비교한다', () => {
    const sorted = oldestSubmittedFirst([
      applicant(3, '2026-10-30T01:00:00Z'),
      applicant(2, '2026-10-29T10:00:00+09:00'), // = 10/29 01:00Z
      applicant(1, '2026-10-29T01:00:00Z'),
      applicant(4, '2026-10-28T23:00:00Z'),
      applicant(5, '2026-10-29T05:00:00+09:00'), // = 10/28 20:00Z — 문자열로는 4·1 뒤, 시각으로는 맨 앞
    ]);
    expect(sorted.map((row) => row.applicationId)).toEqual([5, 4, 1, 2, 3]);
  });
});

describe('PendingApplicantsPreview', () => {
  it('지원 완료 상태로 조회하고, 서버 최근 순 목록을 오래된 순 3명으로 보여 준다', () => {
    mockApplicants.mockReturnValue(loaded([applicant(14, daysAgo(1)), applicant(13, daysAgo(4)), applicant(12, daysAgo(8)), applicant(11, daysAgo(9))]));
    renderPreview(9);
    expect(mockApplicants).toHaveBeenCalledWith(5, { status: 'SUBMITTED' });
    const section = screen.getByRole('region', { name: '먼저 볼 지원서' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByRole('link').getAttribute('href'))).toEqual([
      `${base}/11?status=SUBMITTED`, `${base}/12?status=SUBMITTED`, `${base}/13?status=SUBMITTED`,
    ]);
    expect(within(section).getByRole('link', { name: /^지원자11.*미처리 9일.*지원서 보기$/ })).toBeInTheDocument();
  });

  it('행은 이름 · 학과 · 학년, 학과가 비면 학년만', () => {
    mockApplicants.mockReturnValue(loaded([applicant(11, daysAgo(2)), applicant(12, daysAgo(1), { major: '', grade: 'JUNIOR' })]));
    renderPreview(2);
    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent('경영학과 · 1학년');
    expect(second).toHaveTextContent('3학년');
    expect(second).not.toHaveTextContent('·');
  });

  it('"모두 보기"는 통계 지원 완료 수가 보여 준 행보다 많을 때만 — 수는 통계 값', () => {
    mockApplicants.mockReturnValue(loaded([applicant(11, daysAgo(3)), applicant(12, daysAgo(2)), applicant(13, daysAgo(1)), applicant(14, daysAgo(0))]));
    renderPreview(9);
    const more = screen.getByRole('link', { name: '지원 완료 9명 모두 보기' });
    expect(more).toHaveAttribute('href', `${base}?status=SUBMITTED`);
  });

  it.each([
    ['3명이고 통계도 3', 3, 3],
    ['통계가 목록보다 작음(무효화 사이)', 4, 2],
  ])('%s — "모두 보기" 없음', (_name, listLength, submittedCount) => {
    mockApplicants.mockReturnValue(loaded(Array.from({ length: listLength }, (_, index) => applicant(11 + index, daysAgo(index)))));
    renderPreview(submittedCount);
    expect(screen.getAllByRole('listitem')).toHaveLength(Math.min(3, listLength));
    expect(screen.queryByRole('link', { name: /모두 보기/ })).not.toBeInTheDocument();
  });

  it('KST 자정 경계 — 11/1 23:59 제출을 11/2 00:01 에 보면 "미처리 1일"', () => {
    const justAfterMidnight = new Date('2026-11-01T15:01:00Z');
    vi.setSystemTime(justAfterMidnight);
    mockApplicants.mockReturnValue(loaded([applicant(11, '2026-11-01T14:59:00Z')]));
    renderPreview(1, justAfterMidnight);
    expect(screen.getByText('미처리 1일')).toBeInTheDocument();
  });

  it('이전 조회의 목록(placeholder)은 쓰지 않고 스켈레톤을 그린다', () => {
    mockApplicants.mockReturnValue({ data: [applicant(99, daysAgo(5), { userName: '다른모집지원자' })], isError: false, isPlaceholderData: true });
    renderPreview(2);
    expect(screen.queryByText('다른모집지원자')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('region', { name: '먼저 볼 지원서' })).toBeInTheDocument();
  });

  it('조회 결과 0명이면 블록을 그리지 않는다', () => {
    mockApplicants.mockReturnValue(loaded([]));
    const { container } = renderPreview(2);
    expect(container).toBeEmptyDOMElement();
  });

  it('조회 실패는 한 줄', () => {
    mockApplicants.mockReturnValue({ data: undefined, isError: true, isPlaceholderData: false });
    renderPreview(2);
    expect(screen.getByText('지원서를 불러오지 못했어요.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
