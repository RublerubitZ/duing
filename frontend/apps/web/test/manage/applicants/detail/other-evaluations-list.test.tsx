import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OtherEvaluationsList } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/OtherEvaluationsList';
import type { ApplicationEvaluation } from '@duing/types';

const evaluationFixture: ApplicationEvaluation = {
  evaluatorId: 2,
  evaluatorName: '김민지',
  score: 4,
  memo: '강점 있음',
  createdAt: '2026-06-01T09:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

describe('OtherEvaluationsList', () => {
  it('평가가 없을 때 빈 상태 메시지를 표시한다', () => {
    render(<OtherEvaluationsList evaluations={[]} />);
    expect(screen.getByText(/다른 운영진의 평가가 아직 없어요/)).toBeInTheDocument();
  });

  it('평가가 있을 때 평가자 이름과 점수 뱃지를 표시한다', () => {
    render(<OtherEvaluationsList evaluations={[evaluationFixture]} />);
    expect(screen.getByText('김민지')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('평가가 있을 때 메모를 표시한다', () => {
    render(<OtherEvaluationsList evaluations={[evaluationFixture]} />);
    expect(screen.getByText('강점 있음')).toBeInTheDocument();
  });

  it('여러 평가자 카드를 모두 표시한다', () => {
    const evaluations: ApplicationEvaluation[] = [
      evaluationFixture,
      {
        evaluatorId: 3,
        evaluatorName: '박지호',
        score: 3,
        memo: null,
        createdAt: '2026-06-02T09:00:00',
        updatedAt: '2026-06-02T09:00:00',
      },
    ];
    render(<OtherEvaluationsList evaluations={evaluations} />);
    expect(screen.getByText('김민지')).toBeInTheDocument();
    expect(screen.getByText('박지호')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('메모가 null 이면 메모 영역을 렌더하지 않는다', () => {
    render(
      <OtherEvaluationsList
        evaluations={[{ ...evaluationFixture, memo: null }]}
      />,
    );
    expect(screen.queryByText('강점 있음')).not.toBeInTheDocument();
  });
});
