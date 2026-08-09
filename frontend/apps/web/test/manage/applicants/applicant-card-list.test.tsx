import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Applicant } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { ApplicantCardList } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantCardList';

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
  interviewStartAt: '2026-05-10T14:00:00',
  myScore: null,
};

function requireLabel(node: Element | null): HTMLLabelElement {
  if (!(node instanceof HTMLLabelElement)) throw new Error('히트 영역 라벨을 찾지 못했습니다');
  return node;
}

function renderList(applicants: Applicant[], selected: number[] = []) {
  const onToggleSelect = vi.fn();
  const onOpenDetail = vi.fn();
  render(
    <ApplicantCardList
      applicants={applicants}
      selectedSet={new Set(selected)}
      onToggleSelect={onToggleSelect}
      onOpenDetail={onOpenDetail}
      detailHref={(applicationId) =>
        toRoute(`/manage/clubs/1/recruitments/1/applicants/${applicationId}`)
      }
    />,
  );
  return { onToggleSelect, onOpenDetail };
}

describe('모바일 지원자 카드 리스트', () => {
  it('1행에 이름·학년·상태, 2행에 학과·학번·지원일을 보여준다', () => {
    renderList([baseApplicant]);
    expect(screen.getByRole('link', { name: '홍길동' })).toBeInTheDocument();
    expect(screen.getByText('3학년')).toBeInTheDocument();
    expect(screen.getByText('지원 완료')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터공학과')).toBeInTheDocument();
    expect(screen.getByText('20200001')).toBeInTheDocument();
    expect(screen.getByText('05.01')).toBeInTheDocument();
  });

  it('단과대·면접 일정·평가 점수는 목록에 넣지 않는다', () => {
    renderList([{ ...baseApplicant, myScore: 4 }]);
    expect(screen.queryByText(/공과대학/)).not.toBeInTheDocument();
    expect(screen.queryByText(/05\.10/)).not.toBeInTheDocument();
    expect(screen.queryByText('4 / 5')).not.toBeInTheDocument();
  });

  it('내 평가가 있으면 표식과 접근성 라벨이 붙는다', () => {
    renderList([{ ...baseApplicant, myScore: 4 }]);
    expect(screen.getByLabelText('내 평가 작성됨')).toBeInTheDocument();
  });

  it('내 평가가 없으면 표식이 없다', () => {
    renderList([baseApplicant]);
    expect(screen.queryByLabelText('내 평가 작성됨')).not.toBeInTheDocument();
  });

  it('이름 링크가 상세 경로를 가리켜 키보드로 도달할 수 있다', () => {
    renderList([baseApplicant]);
    expect(screen.getByRole('link', { name: '홍길동' })).toHaveAttribute(
      'href',
      '/manage/clubs/1/recruitments/1/applicants/1',
    );
  });

  it('이름 링크 클릭은 카드 onClick 을 이중 발화시키지 않는다', () => {
    const { onOpenDetail } = renderList([baseApplicant]);
    fireEvent.click(screen.getByRole('link', { name: '홍길동' }));
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('상태 띠는 상태별 색이고 4px 이다', () => {
    renderList([baseApplicant]);
    const card = screen.getByText('컴퓨터공학과').closest('[data-applicant-card]');
    expect(card?.className).toContain('border-l-sky-400');
    expect(card?.className).toContain('border-l-4');
  });

  it('체크박스 히트 영역은 44px 이고 테두리만큼 왼쪽으로 보정된다', () => {
    renderList([baseApplicant]);
    const label = screen.getByRole('checkbox', { name: '홍길동 선택' }).closest('label');
    expect(label).toHaveClass('h-11', 'w-11', '-my-3', '-ml-4');
  });

  it('체크박스를 누르면 선택만 되고 상세로 가지 않는다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant]);
    fireEvent.click(screen.getByRole('checkbox', { name: '홍길동 선택' }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('히트 영역(라벨) 을 눌러도 선택만 된다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant]);
    const label = screen.getByRole('checkbox', { name: '홍길동 선택' }).closest('label');
    fireEvent.click(requireLabel(label));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('카드 본문을 누르면 상세로 간다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant]);
    fireEvent.click(screen.getByText('컴퓨터공학과'));
    expect(onOpenDetail).toHaveBeenCalledWith(1);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  /* 삭제된 applicant-card-touch.test.tsx 에서 이관 — 토글 의미가 페이지로 내려가도 카드 층에서 지킨다. */
  it('선택된 상태에서 히트 영역을 누르면 해제 방향으로 토글된다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant], [1]);
    const label = requireLabel(
      screen.getByRole('checkbox', { name: '홍길동 선택' }).closest('label'),
    );
    expect(screen.getByRole('checkbox', { name: '홍길동 선택' })).toBeChecked();

    fireEvent.click(label);

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('여러 지원자를 연속으로 눌러도 각각 한 번씩만 토글된다', () => {
    const second = { ...baseApplicant, applicationId: 2, userName: '김두잉' };
    const { onToggleSelect, onOpenDetail } = renderList([baseApplicant, second]);

    fireEvent.click(screen.getByRole('checkbox', { name: '홍길동 선택' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '김두잉 선택' }));

    expect(onToggleSelect.mock.calls).toEqual([[1], [2]]);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('선택된 카드는 배경으로 표시하되 상태 띠 색을 덮지 않는다', () => {
    renderList([baseApplicant], [1]);
    const card = screen.getByText('컴퓨터공학과').closest('[data-applicant-card]');
    expect(card?.className).toContain('bg-sage-tint');
    expect(card?.className).toContain('border-l-sky-400');
    expect(card?.className).not.toContain('border-sage');
  });

  it('최종 상태 카드는 체크박스가 비활성이고 히트 영역이 탭을 삼키지 않는다', () => {
    const { onToggleSelect, onOpenDetail } = renderList([{ ...baseApplicant, status: 'ACCEPTED' }]);
    const checkbox = screen.getByRole('checkbox', { name: '홍길동 선택' });
    expect(checkbox).toBeDisabled();
    // 커스텀 외형은 형제 span 이라, 탭이 카드까지 내려가려면 래퍼 전체가 포인터를 받지 않아야 한다.
    expect(checkbox.parentElement?.className).toContain('pointer-events-none');
    fireEvent.click(requireLabel(checkbox.closest('label')));
    expect(onToggleSelect).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });
});
