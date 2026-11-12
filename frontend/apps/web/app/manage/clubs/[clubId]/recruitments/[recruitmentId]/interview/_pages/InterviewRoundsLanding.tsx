'use client';

import Link from 'next/link';
import { ApiError } from '@duing/api';
import type { InterviewRoundSummary } from '@duing/types';
import {
  formatDateTimeKst,
  useInterviewRoundsQuery,
  useInterviewRoundCandidatesQuery,
} from '@duing/hooks';
import { toRoute } from '../../../../../../../_lib/route';
import { cn } from '@/app/_lib/cn';
import { ROUND_STATUS_BADGE_CLASS, ROUND_STATUS_LABEL } from '@/components/interview/interviewRoundStatusLabels';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { Spinner } from '@/components/loading/Spinner';
import { ArrowLeft } from '@/components/duing/Icon';

type Props = {
  clubId: number;
  recruitmentId: number;
};

type RoundCardProps = {
  round: InterviewRoundSummary;
  clubId: number;
  recruitmentId: number;
};

function RoundCard({ round, clubId, recruitmentId }: RoundCardProps) {
  const isDraft = round.status === 'DRAFT';

  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                ROUND_STATUS_BADGE_CLASS[round.status],
              )}
            >
              {ROUND_STATUS_LABEL[round.status]}
            </span>
          </div>
          <p className="text-sm font-semibold text-ink-deep">{round.title}</p>
          <p className="text-xs text-charcoal-3">
            응답 {round.respondedMemberCount} / {round.totalMemberCount}명
          </p>
          {round.availabilityDeadline && (
            <p className="text-xs text-charcoal-3">
              마감: {formatDateTimeKst(round.availabilityDeadline)}
            </p>
          )}
        </div>

        {isDraft ? (
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
            )}
            className="btn btn-primary btn-sm min-h-11 shrink-0"
          >
            {/* 인원 0 초안은 이어 쓸 수 없다 — 같은 마법사가 폐기를 안내한다 */}
            {round.totalMemberCount === 0 ? '정리하기' : '이어서 작성'}
          </Link>
        ) : (
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/${round.roundId}`,
            )}
            className="btn btn-secondary btn-sm min-h-11 shrink-0"
          >
            현황 보기
          </Link>
        )}
      </div>
    </div>
  );
}

// ── 대기열 섹션 ─────────────────────────────────────────────────────────────

type CandidateQueueSectionProps = {
  clubId: number;
  recruitmentId: number;
};

/** 대기열 섹션 — includeUndecided=false (§10.3 기본값). 상시 노출. */
function CandidateQueueSection({ clubId, recruitmentId }: CandidateQueueSectionProps) {
  // §10.3: 대기열 진입 기본값 false — 미결정 지원자 제외
  const candidatesQuery = useInterviewRoundCandidatesQuery(recruitmentId, false);

  if (candidatesQuery.isLoading) {
    return (
      <div className="rounded-xl border border-line bg-white px-5 py-4">
        <div role="status" aria-label="대기열 불러오는 중" className="delayed-show">
          <Spinner size={16} className="text-charcoal-3" />
        </div>
      </div>
    );
  }

  if (candidatesQuery.isError) {
    return (
      <div className="rounded-xl border border-line bg-white px-5 py-4">
        <p className="text-sm text-coral-deep">대기열을 불러오지 못했습니다.</p>
      </div>
    );
  }

  const candidates = candidatesQuery.data ?? [];
  const previewCandidates = candidates.slice(0, 5);

  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-charcoal">
          면접 대기열
          {candidates.length > 0 && (
            <span className="ml-2 rounded-full bg-sage-mist px-2 py-0.5 text-xs font-semibold text-ink">
              {candidates.length}명
            </span>
          )}
        </h2>
        <Link
          href={toRoute(
            `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
          )}
          className="rounded-md border border-line px-2 py-1 text-xs font-medium text-charcoal hover:bg-cream"
        >
          라운드 생성
        </Link>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-charcoal-3">대기 중인 지원자가 없습니다</p>
      ) : (
        <div className="space-y-1">
          {previewCandidates.map((candidate) => (
            <div
              key={candidate.applicationId}
              className="flex items-center gap-2 rounded-md bg-cream px-3 py-1.5 text-sm"
            >
              <span className="font-medium text-charcoal">{candidate.userName}</span>
              <span className="text-xs text-charcoal-3">{candidate.studentId}</span>
            </div>
          ))}
          {candidates.length > 5 && (
            <p className="pt-1 text-xs text-charcoal-3">외 {candidates.length - 5}명…</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 면접 관리 랜딩 — 라운드 목록 기반. */
export function InterviewRoundsLanding({ clubId, recruitmentId }: Props) {
  const roundsQuery = useInterviewRoundsQuery(recruitmentId);

  if (roundsQuery.isLoading) {
    return <LoadingGate label="면접 라운드 불러오는 중" />;
  }

  if (roundsQuery.isError) {
    const message =
      roundsQuery.error instanceof ApiError
        ? roundsQuery.error.message
        : '면접 라운드 목록을 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-coral-deep">{message}</p>;
  }

  const rounds = roundsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="inline-flex items-center gap-1 text-sm text-charcoal-3 hover:text-charcoal"
        >
          <ArrowLeft size={14} aria-hidden />
          모집 상세로 돌아가기
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-ink-deep">면접 관리</h1>
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
            )}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-deep"
          >
            새 면접 라운드 만들기
          </Link>
        </div>
      </div>

      {/* 대기열 섹션 — 상시 노출 */}
      <div className="mb-6">
        <CandidateQueueSection clubId={clubId} recruitmentId={recruitmentId} />
      </div>

      {/* 목록 / 빈 상태 */}
      {rounds.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-paper px-6 py-12 text-center">
          <p className="text-sm text-charcoal-3">아직 면접 라운드가 없습니다</p>
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
            )}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink-deep"
          >
            새 면접 라운드 만들기
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <RoundCard
              key={round.roundId}
              round={round}
              clubId={clubId}
              recruitmentId={recruitmentId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
