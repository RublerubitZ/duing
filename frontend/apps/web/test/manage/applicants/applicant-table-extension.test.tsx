import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { toRoute } from '@/app/_lib/route';
import { ApplicantTable } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable';
import type { Applicant } from '@duing/types';

const baseApplicant: Applicant = {
  applicationId: 1,
  userId: 1,
  userName: '홍길동',
  studentId: '20200001',
  college: 'IT_ENGINEERING',
  major: '컴퓨터공학과',
  grade: 'JUNIOR',
  answers: [],
  status: 'SUBMITTED',
  submittedAt: '2026-05-01T10:00:00',
  interviewStartAt: null,
  myScore: null,
};

const emptySet = new Set<number>();
const noop = () => {};

function renderTable(applicant: Applicant, useInterview = true) {
  render(
    <ApplicantTable
      applicants={[applicant]}
      selectedSet={emptySet}
      onToggleSelect={noop}
      onOpenDetail={noop}
      detailHref={(applicationId) =>
        toRoute(`/manage/clubs/1/recruitments/1/applicants/${applicationId}`)
      }
      useInterview={useInterview}
    />,
  );
}

describe('ApplicantTable 확장', () => {
  it('myScore null 이면 "—" 를 표시한다', () => {
    // 면접일정 열도 비어 있으면 "—" 라, 내 평가 칸만 좁혀서 본다.
    renderTable(baseApplicant, false);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('myScore 가 숫자이면 뱃지를 표시한다', () => {
    renderTable({ ...baseApplicant, applicationId: 2, myScore: 4 });
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('ACCEPTED 행 체크박스는 disabled 이고 tooltip 이 있다', () => {
    renderTable({ ...baseApplicant, status: 'ACCEPTED' });
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).toBeDisabled();
    // 툴팁은 시각 요소(래퍼)가 갖는다 — sr-only input 에 있으면 hit chain 밖이라 hover 로 안 뜬다.
    expect(checkbox.parentElement).toHaveAttribute(
      'title',
      expect.stringContaining('최종 상태'),
    );
  });

  it('REJECTED 행 체크박스는 disabled 이고 tooltip 이 있다', () => {
    renderTable({ ...baseApplicant, status: 'REJECTED' });
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).toBeDisabled();
    // 툴팁은 시각 요소(래퍼)가 갖는다 — sr-only input 에 있으면 hit chain 밖이라 hover 로 안 뜬다.
    expect(checkbox.parentElement).toHaveAttribute(
      'title',
      expect.stringContaining('최종 상태'),
    );
  });

  it('SUBMITTED 행 체크박스는 disabled 가 아니다', () => {
    renderTable(baseApplicant);
    expect(screen.getByRole('checkbox', { name: '홍길동 선택' })).not.toBeDisabled();
  });

  it('useInterview=false 면 면접일정 컬럼 헤더가 렌더되지 않는다', () => {
    renderTable(baseApplicant, false);
    expect(screen.queryByText('면접일정')).not.toBeInTheDocument();
  });

  it('useInterview=true 면 면접일정 컬럼 헤더가 렌더된다', () => {
    renderTable(baseApplicant);
    expect(screen.getByText('면접일정')).toBeInTheDocument();
  });

  it('myScore 색상 — 4 이상이면 브랜드 톤 뱃지', () => {
    renderTable({ ...baseApplicant, myScore: 5 });
    expect(screen.getByText('5 / 5').className).toContain('pill');
  });

  it('myScore 색상 — 2 이하이면 코랄 톤 뱃지', () => {
    renderTable({ ...baseApplicant, myScore: 2 });
    expect(screen.getByText('2 / 5').className).toContain('pill-coral');
  });
});
