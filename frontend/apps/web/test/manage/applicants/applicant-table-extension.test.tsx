import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApplicantTable } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable';
import type { Applicant } from '@duing/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const baseApplicant: Applicant = {
  applicationId: 1,
  userId: 1,
  userName: '홍길동',
  studentId: '20200001',
  email: 'hong@example.com',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학과',
  grade: 'JUNIOR',
  answers: [],
  status: 'SUBMITTED',
  submittedAt: '2026-05-01T10:00:00',
  interviewAt: null,
  myScore: null,
};

const emptySet = new Set<number>();

describe('ApplicantTable 확장', () => {
  it('myScore null 이면 "—" 를 표시한다', () => {
    render(
      <ApplicantTable
        applicants={[baseApplicant]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('myScore 가 숫자이면 뱃지를 표시한다', () => {
    render(
      <ApplicantTable
        applicants={[{ ...baseApplicant, applicationId: 2, myScore: 4 }]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('ACCEPTED 행 체크박스는 disabled 이고 tooltip 이 있다', () => {
    render(
      <ApplicantTable
        applicants={[{ ...baseApplicant, status: 'ACCEPTED' }]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('title', expect.stringContaining('최종 상태'));
  });

  it('REJECTED 행 체크박스는 disabled 이고 tooltip 이 있다', () => {
    render(
      <ApplicantTable
        applicants={[{ ...baseApplicant, status: 'REJECTED' }]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute('title', expect.stringContaining('최종 상태'));
  });

  it('SUBMITTED 행 체크박스는 disabled 가 아니다', () => {
    render(
      <ApplicantTable
        applicants={[baseApplicant]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).not.toBeDisabled();
  });

  it('useInterview=false 면 면접일정 컬럼 헤더가 렌더되지 않는다', () => {
    render(
      <ApplicantTable
        applicants={[baseApplicant]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview={false}
        clubId={1}
        recruitmentId={1}
      />,
    );
    expect(screen.queryByText('면접일정')).not.toBeInTheDocument();
  });

  it('useInterview=true 면 면접일정 컬럼 헤더가 렌더된다', () => {
    render(
      <ApplicantTable
        applicants={[baseApplicant]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    expect(screen.getByText('면접일정')).toBeInTheDocument();
  });

  it('myScore 색상 — 4 이상이면 초록 뱃지', () => {
    render(
      <ApplicantTable
        applicants={[{ ...baseApplicant, myScore: 5 }]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    const badge = screen.getByText('5 / 5');
    expect(badge.className).toContain('emerald');
  });

  it('myScore 색상 — 2 이하이면 빨강 뱃지', () => {
    render(
      <ApplicantTable
        applicants={[{ ...baseApplicant, myScore: 2 }]}
        selectedIds={[]}
        selectedSet={emptySet}
        onSelect={() => {}}
        useInterview
        clubId={1}
        recruitmentId={1}
      />,
    );
    const badge = screen.getByText('2 / 5');
    expect(badge.className).toContain('rose');
  });
});
