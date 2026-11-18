'use client';

import Link from 'next/link';
import type { InterviewRoundDetail } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';
import {
  ROUND_STATUS_LABEL,
  ROUND_STATUS_BADGE_CLASS,
} from '@/components/interview/interviewRoundStatusLabels';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { isDecidedApplicationResult } from './memberStatusLabels';

// 상태 배너 — 상태 뱃지 + 단일 next action (DRAFT→이어서 작성(인원 0 이면 정리하기) / COLLECTING·ASSIGNING→자동배정 /
// ASSIGNING→확정) + 조기 배정 UX ① 전원 응답 배너 + ASSIGNING draft 안내·남은 자리 안내.

/** 상태 배너의 id — 확정·라운드 취소가 성공해 누른 버튼([확정]·동작 막대)이 사라진 뒤 포커스를 받는 자리다(RoundDashboard 의 포커스 표지). */
export const ROUND_STATUS_BANNER_ID = 'round-status-banner';

type RoundStatusBannerProps = {
  detail: InterviewRoundDetail;
  clubId: number;
  recruitmentId: number;
  onAutoAssign: () => void;
  onConfirm: () => void;
  autoAssignPending: boolean;
  confirmPending: boolean;
};

export function RoundStatusBanner({
  detail,
  clubId,
  recruitmentId,
  onAutoAssign,
  onConfirm,
  autoAssignPending,
  confirmPending,
}: RoundStatusBannerProps) {
  const { status, counts } = detail;
  const allResponded =
    status === 'COLLECTING' &&
    counts.invitedCount === 0 &&
    detail.members.some((member) => member.status !== 'EXCLUDED');
  // 결과 확정·제외로 빠진 자리뿐 아니라 자동배정 뒤 미배정 응답자도 함께 알린다 — 남은 자리는 그들이 고른 시간이 아닐 수 있다(사람별 판정은 확정 창).
  // 결과를 정한 응답자는 수동 배정이 막혀 남은 자리로 살릴 수 없어 세지 않는다(결과 없음·모르는 값은 센다).
  const unassignedRespondedCount = detail.members.filter(
    (member) =>
      member.status === 'RESPONDED' &&
      member.assignedSlotId === null &&
      !isDecidedApplicationResult(member.applicationResult),
  ).length;
  const freeSeatCount = detail.slots.reduce(
    (seatSum, slot) => seatSum + Math.max(0, slot.capacity - slot.assignedCount),
    0,
  );
  const showFreedSeatNotice =
    status === 'ASSIGNING' && unassignedRespondedCount > 0 && freeSeatCount > 0;

  return (
    // 탭 순서 밖(클릭·스크립트로만 포커스를 받는다), 단계 배지 + 제목으로 읽힌다 — 포커스 표시는 멤버 행과 같은 안쪽 outline.
    // 포커스로 스크롤될 때 모바일 sticky 상단바에 가리지 않게 위 여백을 둔다(콘솔 scroll-mt 관례).
    <div
      id={ROUND_STATUS_BANNER_ID}
      role="group"
      aria-labelledby={`${ROUND_STATUS_BANNER_ID}-status ${ROUND_STATUS_BANNER_ID}-title`}
      tabIndex={-1}
      className="scroll-mt-16 rounded-xl border border-line bg-white px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink md:scroll-mt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            id={`${ROUND_STATUS_BANNER_ID}-status`}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium',
              ROUND_STATUS_BADGE_CLASS[status],
            )}
          >
            {ROUND_STATUS_LABEL[status]}
          </span>
          <span id={`${ROUND_STATUS_BANNER_ID}-title`} className="text-base font-semibold text-ink-deep">{detail.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 자동배정 — COLLECTING·ASSIGNING 모두 노출 */}
          {(status === 'COLLECTING' || status === 'ASSIGNING') && (
            <button
              type="button"
              onClick={onAutoAssign}
              disabled={autoAssignPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-warm-deep px-3 py-1.5 text-sm font-medium text-white hover:bg-warm-deep/90 disabled:opacity-50"
            >
              {autoAssignPending && <ButtonSpinner />}자동배정 실행
            </button>
          )}

          {/* 확정 — ASSIGNING */}
          {status === 'ASSIGNING' && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-deep disabled:opacity-50"
            >
              {confirmPending && <ButtonSpinner />}확정
            </button>
          )}

          {/* DRAFT → 이어서 작성 — 인원 0 이면 이어 쓸 수 없어 정리하기(같은 마법사가 폐기를 안내한다) */}
          {status === 'DRAFT' && (
            <Link
              href={toRoute(
                `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
              )}
              className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-deep"
            >
              {counts.totalMemberCount === 0 ? '정리하기' : '이어서 작성'}
            </Link>
          )}
        </div>
      </div>

      {/* 조기 배정 UX ①: COLLECTING + 전원 응답 완료 배너 */}
      {allResponded && (
        <div className="mt-3 rounded-md bg-sage-mist px-4 py-2 text-sm text-ink">
          전원 응답 완료 — 마감 전이지만 지금 배정할 수 있어요
        </div>
      )}

      {/* ASSIGNING — 배정안은 draft 상태임을 안내 */}
      {status === 'ASSIGNING' && (
        // 좁은 폭에서 글이 음절 사이에서 끊기지 않게 글만 따로 접고, 칩은 줄어들지 않은 채 첫 줄에 붙인다.
        <div className="mt-3 flex items-start gap-2 rounded-md bg-warm/10 px-4 py-2 text-sm text-warm-deep">
          <span className="shrink-0 rounded-full bg-warm/20 px-2 py-0.5 text-xs font-semibold text-warm-deep">
            draft
          </span>
          <span className="break-keep">확정 전까지 지원자에게 통지되지 않습니다</span>
        </div>
      )}

      {/* ASSIGNING — 응답했으나 배정이 없는 사람과 남은 자리가 함께 있으면 알린다(고른 시간인지는 확정 창이 본다) */}
      {showFreedSeatNotice && (
        <p className="mt-3 break-keep rounded-md border border-warm/60 bg-warm/10 px-4 py-2 text-sm text-warm-deep">
          {`응답했으나 배정받지 못한 지원자 ${unassignedRespondedCount}명 · 남은 자리 ${freeSeatCount}개 — 고른 시간이 아닐 수 있습니다`}
        </p>
      )}

      {/* SCHEDULED — 일정 변경 가능 안내 */}
      {status === 'SCHEDULED' && (
        <div className="mt-3 rounded-md bg-sky/10 px-4 py-2 text-sm text-sky-deep">
          일정 변경 가능 — 지원자 행의 [일정 변경]을 통해 배정 슬롯을 수정할 수 있습니다
        </div>
      )}
    </div>
  );
}
