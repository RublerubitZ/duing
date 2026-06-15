'use client';

import Link from 'next/link';
import type { InterviewRoundSummary, InterviewRoundStatus } from '@duing/types';
import { useInterviewRoundsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';

// 면접 진행 단계 칩 — §10.5 가드레일 1:1.
// 최신 비CANCELLED 라운드(생성 최신순 첫 항목)의 상태를 라벨로 변환.
// BE#6 이 생성 최신순(createdAtDesc)으로 반환 — 계약 확정.
// 라운드 없음·최신이 CANCELLED 이면 "면접 대상 선정 전" 취급.
// useInterview=false 모집은 부모에서 미렌더링.

type StageLabel =
  | '면접 대상 선정 전'
  | '라운드 작성 중'
  | `응답 대기 ${number}/${number}`
  | '배정 검토 중'
  | '면접 확정';

const STAGE_CHIP_CLASS: Record<string, string> = {
  '면접 대상 선정 전': 'bg-slate-100 text-slate-500',
  '라운드 작성 중': 'bg-slate-100 text-slate-700',
  '배정 검토 중': 'bg-amber-100 text-amber-700',
  '면접 확정': 'bg-emerald-100 text-emerald-700',
};

/** 라운드 목록 → 단계 라벨 (§10.5) */
function resolveStageLabel(rounds: InterviewRoundSummary[]): StageLabel {
  // 비CANCELLED 최신 라운드를 탐색 (목록은 BE#6 최신순 정렬)
  const activeRound = rounds.find(
    (round) => (round.status satisfies InterviewRoundStatus) !== 'CANCELLED',
  );

  if (!activeRound) return '면접 대상 선정 전';

  switch (activeRound.status) {
    case 'DRAFT':
      return '라운드 작성 중';
    case 'COLLECTING':
      return `응답 대기 ${activeRound.respondedMemberCount}/${activeRound.totalMemberCount}`;
    case 'ASSIGNING':
      return '배정 검토 중';
    case 'SCHEDULED':
      return '면접 확정';
    default:
      return '면접 대상 선정 전';
  }
}

type InterviewStageChipProps = {
  clubId: number;
  recruitmentId: number;
};

/** 모집 상세 페이지에 삽입하는 면접 진행 단계 칩 + [면접 관리] next action 링크. */
export function InterviewStageChip({ clubId, recruitmentId }: InterviewStageChipProps) {
  const roundsQuery = useInterviewRoundsQuery(recruitmentId);

  if (roundsQuery.isLoading) {
    return <p className="text-xs text-slate-400">불러오는 중…</p>;
  }

  if (roundsQuery.isError) {
    return null;
  }

  const rounds = roundsQuery.data ?? [];
  const stageLabel = resolveStageLabel(rounds);

  // COLLECTING 라운드에는 "응답 대기" 칩을 파란 톤으로
  const isCollecting = stageLabel.startsWith('응답 대기');
  const chipClass = isCollecting
    ? 'bg-blue-100 text-blue-700'
    : (STAGE_CHIP_CLASS[stageLabel] ?? 'bg-slate-100 text-slate-500');

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', chipClass)}
      >
        {stageLabel}
      </span>
      <Link
        href={toRoute(
          `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`,
        )}
        className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        면접 관리
      </Link>
    </div>
  );
}
