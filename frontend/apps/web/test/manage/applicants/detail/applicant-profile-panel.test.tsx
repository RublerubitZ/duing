import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ApplicantProfilePanel } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantProfilePanel';

import type { ApplicantDetail } from '@duing/types';

const detailFixture: ApplicantDetail = {
  applicationId: 1,
  recruitmentId: 2,
  recruitmentTitle: '2026 상반기 신입 모집',
  clubId: 3,
  clubName: '두잉',
  applicant: {
    userId: 10,
    name: '김민지',
    studentId: '20231234',
    college: 'IT_ENGINEERING',
    major: '컴퓨터정보공학부',
    grade: 'SOPHOMORE',
    phone: '010-1234-5678',
  },
  answers: [],
  status: 'SUBMITTED',
  interview: null,
  submittedAt: '2026-06-01T09:05:00',
  myEvaluation: null,
  otherEvaluations: [],
  statusHistory: [],
  interviewAvailabilities: [],
  assignedSlot: null,
  interviewRound: null,
};

describe('ApplicantProfilePanel', () => {
  it('지원자 기본 정보를 렌더한다', () => {
    render(<ApplicantProfilePanel detail={detailFixture} />);

    expect(screen.getByRole('heading', { name: '지원자 정보' })).toBeInTheDocument();
    expect(screen.getByText('김민지')).toBeInTheDocument();
    expect(screen.getByText('IT·공과대학 · 컴퓨터정보공학부')).toBeInTheDocument();
  });

  /* 320px 에서 '단과대 · 전공' 결합 문자열이 고정 2열(50%)에 갇혀 넘치던 문제.
   * jsdom 은 레이아웃을 모르니 클래스로 못박는다. */
  it('프로필 dl 은 라벨 자동폭 그리드이고 값 셀은 줄바꿈된다', () => {
    const { container } = render(<ApplicantProfilePanel detail={detailFixture} />);

    const definitionList = container.querySelector('dl');
    expect(definitionList?.className).toContain('grid-cols-[auto_minmax(0,1fr)]');

    const valueCell = container.querySelector('dd');
    expect(valueCell?.className).toContain('break-words');
  });

  it('모든 값 셀에 break-words 가 걸려 긴 값도 갇히지 않는다', () => {
    const { container } = render(
      <ApplicantProfilePanel
        detail={{
          ...detailFixture,
          interview: {
            startAt: '2026-06-13T18:00:00',
            endAt: '2026-06-13T18:30:00',
            location: '공학관 401호 세미나실',
          },
        }}
      />,
    );

    const valueCells = Array.from(container.querySelectorAll('dd'));
    expect(valueCells.length).toBeGreaterThan(0);
    for (const cell of valueCells) {
      expect(cell.className).toContain('break-words');
    }
  });
});
