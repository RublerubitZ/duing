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
import { StatusActionBar, statusTransitionsFor } from './StatusActionBar';
import { StatusTimeline } from './StatusTimeline';
import { useApplicantSearch } from '../../_lib/applicantSearch';
import { cn } from '@/app/_lib/cn';
import { LoadingGate } from '@/components/loading/LoadingGate';

type Props = {
  clubId: number;
  recruitmentId: number;
  applicationId: number;
};

export function ApplicantDetailPage({ clubId, recruitmentId, applicationId }: Props) {
  const searchParams = useSearchParams();
  // 검색어는 주소가 아니라 applicants 세그먼트 상태에서 온다(개인정보라 주소에 싣지 않는다).
  // 상세 URL 로 곧장 들어오면 비어 있고, 그때는 검색 없이 필터만으로 이웃을 계산한다.
  const [searchTerm] = useApplicantSearch();

  const statusRaw = searchParams.get('status');
  const collegeRaw = searchParams.get('college');
  const filters: ApplicantsFilters = {
    status: statusRaw !== null && isApplicationStatus(statusRaw) ? statusRaw : undefined,
    college: collegeRaw !== null && isCollege(collegeRaw) ? collegeRaw : undefined,
    q: searchTerm || undefined,
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
  // 전이가 없으면 StatusActionBar 가 모바일 하단 고정 바를 렌더하지 않는다 — 판정을 여기서 다시
  // 계산하면 둘이 어긋나므로 바와 같은 함수를 쓴다.
  const hasBottomActionBar =
    statusTransitionsFor(detail.status, useInterview, isFinalizeOnly).length > 0;

  return (
    // ManageShell 이 이미 <main> 을 렌더한다 — 목록 페이지(page.tsx:274)와 같은 이유로 div.
    <div
      className={cn(
        'mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4 sm:px-6',
        hasBottomActionBar
          // 하단 고정 바가 콘텐츠를 가리지 않게 비운 자리. 320px 에서 전이 3개면 바가 2줄(실측 121px)이
          // 되고 마감 안내 문단까지 붙으면 더 커진다 — 목록 page.tsx:277 과 같은 10rem.
          // 데스크탑은 바가 없으니 lg:pb-4 로 원복한다.
          ? 'pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-4'
          // 바가 없는 경우(터미널 상태·마감 후 확정 완료)까지 예약하면 모바일에 죽은 여백만 남는다.
          : 'pb-4',
      )}
    >
      <ApplicantNavBar
        clubId={clubId}
        recruitmentId={recruitmentId}
        applicationId={applicationId}
        filters={filters}
        currentStatus={detail.status}
      />

      {/* 두 컬럼의 min-w-0 은 필수다 — grid item 의 기본 min-width:auto 가 자손의 min-content 까지
          트랙을 늘려, 답변에 든 무공백 긴 URL 하나가 컬럼째 뷰포트를 밀어낸다(320px 에서 650px 오버플로 실측).
          답변의 break-words 는 조상이 폭을 제약해야만 동작한다. ApplicantCardList 의 min-w-0 과 같은 원리. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <ApplicantProfilePanel detail={detail} />
          <ApplicantAnswersPanel answers={detail.answers} />
          <StatusTimeline history={detail.statusHistory} submittedAt={detail.submittedAt} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
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
    </div>
  );
}
