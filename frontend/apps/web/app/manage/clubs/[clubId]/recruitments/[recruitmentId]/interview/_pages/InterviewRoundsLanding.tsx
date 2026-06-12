'use client';

import Link from 'next/link';
import { ApiError } from '@duing/api';
import type { InterviewRoundSummary, InterviewRoundStatus } from '@duing/types';
import { useInterviewRoundsQuery } from '@duing/hooks';
import { toRoute } from '../../../../../../../_lib/route';
import { cn } from '@/app/_lib/cn';

type Props = {
  clubId: number;
  recruitmentId: number;
};

// 상태 뱃지 — manage 톤 (운영진 화면 기준)
const STATUS_LABEL: Record<InterviewRoundStatus, string> = {
  DRAFT: '작성 중',
  COLLECTING: '응답 수집 중',
  ASSIGNING: '배정 검토 중',
  SCHEDULED: '확정',
  CANCELLED: '취소',
};

const STATUS_BADGE_CLASS: Record<InterviewRoundStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  COLLECTING: 'bg-blue-100 text-blue-700',
  ASSIGNING: 'bg-amber-100 text-amber-700',
  SCHEDULED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-600',
};

type RoundCardProps = {
  round: InterviewRoundSummary;
  clubId: number;
  recruitmentId: number;
};

function RoundCard({ round, clubId, recruitmentId }: RoundCardProps) {
  const isDraft = round.status === 'DRAFT';

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_BADGE_CLASS[round.status],
              )}
            >
              {STATUS_LABEL[round.status]}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-900">{round.title}</p>
          <p className="text-xs text-slate-500">
            응답 {round.respondedMemberCount} / {round.totalMemberCount}명
          </p>
          {round.availabilityDeadline && (
            <p className="text-xs text-slate-400">
              마감:{' '}
              {new Date(round.availabilityDeadline).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* DRAFT 카드만 [이어서 작성] 링크 제공. 비DRAFT 상세 페이지는 FE#3 예정. */}
        {isDraft && (
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
            )}
            className="shrink-0 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            이어서 작성
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * 면접 관리 랜딩 — 신규 라운드 목록 기반.
 * 구 InterviewManagementPage(dead API)를 대체한다. FE#3/4 에서 구 페이지·컴포넌트 철거 예정.
 */
export function InterviewRoundsLanding({ clubId, recruitmentId }: Props) {
  const roundsQuery = useInterviewRoundsQuery(recruitmentId);

  if (roundsQuery.isLoading) {
    return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  }

  if (roundsQuery.isError) {
    const message =
      roundsQuery.error instanceof ApiError
        ? roundsQuery.error.message
        : '면접 라운드 목록을 불러오지 못했습니다.';
    return <p className="p-6 text-sm text-rose-600">{message}</p>;
  }

  const rounds = roundsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* 헤더 */}
      <div className="mb-6 flex flex-col gap-1">
        <Link
          href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}`)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 모집 상세로 돌아가기
        </Link>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-slate-900">면접 관리</h1>
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
            )}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            새 면접 라운드 만들기
          </Link>
        </div>
      </div>

      {/* 목록 / 빈 상태 */}
      {rounds.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm text-slate-500">아직 면접 라운드가 없습니다</p>
          <Link
            href={toRoute(
              `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
            )}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
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
