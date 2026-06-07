'use client';

import type { ApplicationEvaluation } from '@duing/types';
import { MyEvaluationCard } from './MyEvaluationCard';
import { OtherEvaluationsList } from './OtherEvaluationsList';

type Props = {
  applicationId: number;
  myEvaluation: ApplicationEvaluation | null;
  otherEvaluations: ApplicationEvaluation[];
};

export function EvaluationPanel({ applicationId, myEvaluation, otherEvaluations }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <MyEvaluationCard applicationId={applicationId} myEvaluation={myEvaluation} />
      <OtherEvaluationsList evaluations={otherEvaluations} />
    </div>
  );
}
