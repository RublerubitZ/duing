'use client';

import Link from 'next/link';

import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';
import { formatSlotLabel } from '@/components/interview/_utils/localDateTime';
import {
  ROUND_STATUS_LABEL,
  ROUND_STATUS_BADGE_CLASS,
} from '@/components/interview/interviewRoundStatusLabels';

import type { ApplicationStatus, AvailabilityItem, InterviewRoundBrief } from '@duing/types';

// 운영진 지원자 상세 화면의 "면접" 카드 (BE#14 · FE#6).
// - 터미널(ACCEPTED/REJECTED) + 라운드 null → 미렌더(null)
// - 터미널 + 라운드 있음 → 정상 렌더 (면접 기록 보존 — 확정 슬롯 표시)
// - 라운드 있음 (비터미널): 라운드 제목·단계 칩·멤버 상태·[면접 관리에서 조정 →] 딥링크 + 선택 시간 목록
// - 라운드 null + INTERVIEW_PENDING: 대기열 안내 + [면접 관리] 링크
// - 라운드 null + 그 외 (비터미널): 선정 전 안내

type Props = {
  interviewRound: InterviewRoundBrief | null;
  interviewAvailabilities: AvailabilityItem[];
  assignedSlot: AvailabilityItem | null;
  clubId: number;
  recruitmentId: number;
  applicationStatus: ApplicationStatus;
};

export function ApplicantInterviewScheduleCard({
  interviewRound,
  interviewAvailabilities,
  assignedSlot,
  clubId,
  recruitmentId,
  applicationStatus,
}: Props) {
  const isTerminalStatus = applicationStatus === 'ACCEPTED' || applicationStatus === 'REJECTED';

  // ── 터미널 + 라운드 null → 면접 이력 없음, 미렌더 ──────────────────────────
  if (isTerminalStatus && interviewRound === null) {
    return null;
  }

  // ── 라운드 있음 (터미널 포함 — 기록 보존) ───────────────────────────────

  if (interviewRound !== null) {
    const { roundId, title, roundStatus, memberStatus, unresponded, alternativeAvailabilityText } =
      interviewRound;

    const roundHref = toRoute(
      `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/${roundId}`,
    );

    return (
      <section className="rounded border border-neutral-200 bg-white p-4">
        {/* 헤더 */}
        <header className="mb-3 flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                ROUND_STATUS_BADGE_CLASS[roundStatus],
              )}
            >
              {ROUND_STATUS_LABEL[roundStatus]}
            </span>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          </div>
          <Link
            href={roundHref}
            aria-label="면접 관리에서 조정"
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            면접 관리에서 조정 →
          </Link>
        </header>

        {/* 멤버 상태 행 */}
        <MemberStatusRow
          memberStatus={memberStatus}
          unresponded={unresponded}
          alternativeAvailabilityText={alternativeAvailabilityText}
          selectedCount={interviewAvailabilities.length}
        />

        {/* 현재 배정 + 선택 시간 목록 */}
        <dl className="mt-3 space-y-3">
          <div>
            <dt className="text-xs text-neutral-500">현재 배정</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {assignedSlot ? formatSlotLabel(assignedSlot) : '미배정'}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-neutral-500">
              지원자가 선택한 면접 가능 시간 ({interviewAvailabilities.length}개)
            </dt>
            <dd className="mt-1">
              {interviewAvailabilities.length === 0 ? (
                <p className="text-sm text-neutral-500">아직 선택하지 않았습니다</p>
              ) : (
                <ul
                  aria-label="지원자가 선택한 면접 가능 시간"
                  className="space-y-1"
                >
                  {interviewAvailabilities.map((item) => {
                    const isAssigned = assignedSlot?.slotId === item.slotId;
                    return (
                      <li
                        key={item.slotId}
                        className="flex items-center gap-2 text-sm text-slate-900"
                      >
                        <span>{formatSlotLabel(item)}</span>
                        {isAssigned && (
                          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                            현재 배정
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  // ── 라운드 null + INTERVIEW_PENDING ─────────────────────────────────────

  if (applicationStatus === 'INTERVIEW_PENDING') {
    const interviewHref = toRoute(
      `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview`,
    );

    return (
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-slate-900">면접 일정</h2>
        <p className="text-sm text-slate-600">
          면접 대기열에 있음 — 다음 라운드 선정을 기다립니다
        </p>
        <Link
          href={interviewHref}
          className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
        >
          면접 관리
        </Link>
      </section>
    );
  }

  // ── 라운드 null + 그 외 (UNDER_REVIEW 등) ───────────────────────────────

  return (
    <section className="rounded border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 text-base font-semibold text-slate-900">면접 일정</h2>
      <p className="text-sm text-slate-600">
        면접 대상 선정 전 — 면접 관리의 라운드 만들기에서 선정합니다
      </p>
    </section>
  );
}

// ── 멤버 상태 행 ────────────────────────────────────────────────────────────

type MemberStatusRowProps = {
  memberStatus: InterviewRoundBrief['memberStatus'];
  unresponded: boolean;
  alternativeAvailabilityText: string | null;
  selectedCount: number;
};

function MemberStatusRow({
  memberStatus,
  unresponded,
  alternativeAvailabilityText,
  selectedCount,
}: MemberStatusRowProps) {
  if (memberStatus === 'INVITED') {
    if (unresponded) {
      return (
        <p className="rounded bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          미응답
        </p>
      );
    }
    return <p className="text-sm text-slate-600">응답 대기</p>;
  }

  if (memberStatus === 'RESPONDED') {
    return (
      <p className="text-sm text-slate-600">
        응답 완료 — 선택 {selectedCount}개
      </p>
    );
  }

  if (memberStatus === 'NO_AVAILABLE_SLOT') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">가능한 시간 없음</p>
        {alternativeAvailabilityText && (
          <blockquote
            aria-label="지원자가 작성한 대체 가능 시간 설명"
            className="rounded border-l-4 border-slate-300 bg-slate-50 px-3 py-2 text-sm italic text-slate-700"
          >
            {alternativeAvailabilityText}
          </blockquote>
        )}
      </div>
    );
  }

  if (memberStatus === 'ASSIGNED') {
    return <p className="text-sm text-slate-600">면접 확정</p>;
  }

  if (memberStatus === 'EXCLUDED') {
    return (
      <p className="rounded bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">
        라운드 제외
      </p>
    );
  }

  // exhaustive check — 새 union 멤버 추가 시 컴파일 에러로 누락 감지
  ((_: never) => {})(memberStatus);
  return null;
}
