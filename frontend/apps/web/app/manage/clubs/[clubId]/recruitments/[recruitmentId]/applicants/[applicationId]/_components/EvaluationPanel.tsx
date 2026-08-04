'use client';

import type { ApplicationEvaluation } from '@duing/types';
import { MyEvaluationCard } from './MyEvaluationCard';
import { OtherEvaluationsList } from './OtherEvaluationsList';

type Props = {
  applicationId: number;
  myEvaluation: ApplicationEvaluation | null;
  otherEvaluations: ApplicationEvaluation[];
  /** 마감(raw CLOSED) 모집이면 조회 전용 — 내 평가 입력을 막는다 (스펙 §6). */
  readOnly?: boolean;
};

export function EvaluationPanel({
  applicationId,
  myEvaluation,
  otherEvaluations,
  readOnly = false,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <MyEvaluationCard
        applicationId={applicationId}
        myEvaluation={myEvaluation}
        readOnly={readOnly}
      />
      <OtherEvaluationsList evaluations={otherEvaluations} />
    </div>
  );
}
