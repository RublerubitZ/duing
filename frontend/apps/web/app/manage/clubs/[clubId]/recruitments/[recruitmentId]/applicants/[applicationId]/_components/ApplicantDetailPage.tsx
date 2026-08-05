'use client';

import { useSearchParams } from 'next/navigation';

import { useApplicantDetailQuery, useRecruitmentDetailQuery } from '@duing/hooks';
import { isApplicationStatus, isCollege } from '@duing/types';
import type { ApplicantsFilters } from '@duing/types';

import { ApplicantAnswersPanel } from './ApplicantAnswersPanel';
import { ApplicantInterviewScheduleCard } from './ApplicantInterviewScheduleCard';
import { ApplicantNavBar } from './ApplicantNavBar';
import { ApplicantProfilePanel } from './ApplicantProfilePanel';
import { EvaluationPanel } from './EvaluationPanel';
import { StatusActionBar } from './StatusActionBar';
import { StatusTimeline } from './StatusTimeline';
import { LoadingGate } from '@/components/loading/LoadingGate';

type Props = {
  clubId: number;
  recruitmentId: number;
  applicationId: number;
};

export function ApplicantDetailPage({ clubId, recruitmentId, applicationId }: Props) {
  const searchParams = useSearchParams();

  const statusRaw = searchParams.get('status');
  const collegeRaw = searchParams.get('college');
  const filters: ApplicantsFilters = {
    status: statusRaw !== null && isApplicationStatus(statusRaw) ? statusRaw : undefined,
    college: collegeRaw !== null && isCollege(collegeRaw) ? collegeRaw : undefined,
    q: searchParams.get('q') ?? undefined,
    submittedFrom: searchParams.get('submittedFrom') ?? undefined,
    submittedTo: searchParams.get('submittedTo') ?? undefined,
  };

  const { data: recruitment } = useRecruitmentDetailQuery(recruitmentId);
  const { data: detail, isLoading } = useApplicantDetailQuery(applicationId);

  if (isLoading || !detail) {
    return <LoadingGate label="지원자 정보 불러오는 중" />;
  }

  const useInterview = recruitment?.useInterview ?? false;
  // 마감(raw CLOSED) 모집은 남은 지원서의 최종 결과 확정만 허용 (스펙 §1-3 개정). status 를 아직 못 받았으면 차단하지 않는다(fail-open) —
  // 그 창에서 실행된 쓰기는 BE 409(RECRUITMENT_CLOSED)가 막고, 화면은 실패 토스트로 안내한다.
  const isFinalizeOnly = recruitment?.status === 'CLOSED';

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <ApplicantNavBar
        clubId={clubId}
        recruitmentId={recruitmentId}
        applicationId={applicationId}
        filters={filters}
        currentStatus={detail.status}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ApplicantProfilePanel detail={detail} />
          <ApplicantAnswersPanel answers={detail.answers} />
          <StatusTimeline history={detail.statusHistory} submittedAt={detail.submittedAt} />
        </div>
        <div className="flex flex-col gap-4">
          {/* 평가는 마감 후 허용 범위에 없다 — 이쪽은 여전히 진짜 읽기 전용이다. */}
          <EvaluationPanel
            applicationId={applicationId}
            myEvaluation={detail.myEvaluation}
            otherEvaluations={detail.otherEvaluations}
            readOnly={isFinalizeOnly}
          />
          {useInterview && (
            <ApplicantInterviewScheduleCard
              interviewRound={detail.interviewRound}
              interviewAvailabilities={detail.interviewAvailabilities}
              assignedSlot={detail.assignedSlot}
              clubId={clubId}
              recruitmentId={recruitmentId}
              applicationStatus={detail.status}
            />
          )}
          <StatusActionBar
            applicationId={applicationId}
            recruitmentId={recruitmentId}
            currentStatus={detail.status}
            useInterview={useInterview}
            finalizeOnly={isFinalizeOnly}
          />
        </div>
      </div>
    </main>
  );
}
