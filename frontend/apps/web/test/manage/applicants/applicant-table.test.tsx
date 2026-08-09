import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Applicant } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { ApplicantTable } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable';

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
  myScore: 4,
};

function renderTable(applicants: Applicant[], selected: number[] = []) {
  const onToggleSelect = vi.fn();
  const onOpenDetail = vi.fn();
  render(
    <ApplicantTable
      applicants={applicants}
      selectedSet={new Set(selected)}
      onToggleSelect={onToggleSelect}
      onOpenDetail={onOpenDetail}
      detailHref={(applicationId) =>
        toRoute(`/manage/clubs/1/recruitments/1/applicants/${applicationId}`)
      }
      useInterview={false}
    />,
  );
  return { onToggleSelect, onOpenDetail };
}

// 전체 선택은 카드 안 상단 툴바(ApplicantListToolbar)로 옮겼다 — 해당 케이스는 그쪽 테스트에 있다.
describe('데스크탑 지원자 표', () => {
  it('내 평가는 표에서 점수로 유지한다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('지원일 열은 날짜+시각을 유지한다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByText('2026.05.01 10:00')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '지원일시' })).toBeInTheDocument();
  });

  it('단과대·학번 열은 1024~1279px 에서 숨기는 클래스를 갖는다', () => {
    renderTable([baseApplicant]);
    for (const cell of [screen.getByText('IT·공과대학'), screen.getByText('20200001')]) {
      const className = cell.closest('td')?.className ?? '';
      // hidden 이 빠지면 좁은 폭에서 그대로 노출된다 — 쌍으로 확인한다.
      expect(className).toContain('hidden');
      expect(className).toContain('xl:table-cell');
    }
  });

  it('이름은 상세 링크라 키보드로 도달할 수 있다', () => {
    renderTable([baseApplicant]);
    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/1/applicants/1',
    );
  });




  it('행 체크박스는 전파를 끊어 상세로 가지 않는다', () => {
    const { onToggleSelect, onOpenDetail } = renderTable([baseApplicant]);
    fireEvent.click(screen.getByRole('checkbox', { name: '홍길동 선택' }));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('행 본문(이름 링크 밖)을 누르면 상세로 간다', () => {
    const { onOpenDetail } = renderTable([baseApplicant]);
    fireEvent.click(screen.getByText('컴퓨터공학과 · 3학년'));
    expect(onOpenDetail).toHaveBeenCalledWith(1);
  });
});
