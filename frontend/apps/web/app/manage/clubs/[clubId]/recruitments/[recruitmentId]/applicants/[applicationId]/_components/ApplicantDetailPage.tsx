'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useApplicantDetailQuery, useRecruitmentDetailQuery } from '@duing/hooks';
import { isApplicationStatus, isCollege } from '@duing/types';
import type { ApplicantsFilters, ApplicationStatus } from '@duing/types';

const PROMOTABLE_STATUS: ApplicationStatus = 'UNDER_REVIEW';

import { ApplicantAnswersPanel } from './ApplicantAnswersPanel';
import { ApplicantInterviewScheduleCard } from './ApplicantInterviewScheduleCard';
import { ApplicantNavBar } from './ApplicantNavBar';
import { ApplicantProfilePanel } from './ApplicantProfilePanel';
import { EvaluationPanel } from './EvaluationPanel';
import { PromoteToInterviewPendingDialog } from './PromoteToInterviewPendingDialog';
import { StatusActionBar } from './StatusActionBar';
import { StatusTimeline } from './StatusTimeline';

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

  const [showPromoteDialog, setShowPromoteDialog] = useState(false);

  if (isLoading || !detail) {
    return <p className="p-4 text-sm text-slate-500">불러오는 중…</p>;
  }

  const useInterview = recruitment?.useInterview ?? false;

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
          <EvaluationPanel
            applicationId={applicationId}
            myEvaluation={detail.myEvaluation}
            otherEvaluations={detail.otherEvaluations}
          />
          {useInterview && (
            <ApplicantInterviewScheduleCard
              interviewAvailabilities={detail.interviewAvailabilities}
              assignedSlot={detail.assignedSlot}
              onOpenManualAssign={() => {
                if (detail.status === PROMOTABLE_STATUS) {
                  setShowPromoteDialog(true);
                }
              }}
            />
          )}
          {useInterview && showPromoteDialog && (
            <PromoteToInterviewPendingDialog
              applicationId={applicationId}
              recruitmentId={recruitmentId}
              applicantName={detail.applicant.name}
              onCancel={() => setShowPromoteDialog(false)}
              onPromoted={() => {
                setShowPromoteDialog(false);
              }}
            />
          )}
          <StatusActionBar
            applicationId={applicationId}
            recruitmentId={recruitmentId}
            currentStatus={detail.status}
            useInterview={useInterview}
          />
        </div>
      </div>
    </main>
  );
}
