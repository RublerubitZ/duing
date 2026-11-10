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

// 상태 배너 — 상태 뱃지 + 단일 next action (DRAFT→이어서 작성 / COLLECTING·ASSIGNING→자동배정 /
// ASSIGNING→확정) + 조기 배정 UX ① 전원 응답 배너 + ASSIGNING draft 안내.

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

  return (
    <div className="rounded-xl border border-line bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium',
              ROUND_STATUS_BADGE_CLASS[status],
            )}
          >
            {ROUND_STATUS_LABEL[status]}
          </span>
          <span className="text-base font-semibold text-ink-deep">{detail.title}</span>
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

          {/* DRAFT → 이어서 작성 */}
          {status === 'DRAFT' && (
            <Link
              href={toRoute(
                `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
              )}
              className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-deep"
            >
              이어서 작성
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
        <div className="mt-3 flex items-center gap-2 rounded-md bg-warm/10 px-4 py-2 text-sm text-warm-deep">
          <span className="rounded-full bg-warm/40 px-2 py-0.5 text-xs font-semibold text-warm-deep">
            draft
          </span>
          확정 전까지 지원자에게 통지되지 않습니다
        </div>
      )}

      {/* SCHEDULED — 일정 변경 가능 안내 */}
      {status === 'SCHEDULED' && (
        <div className="mt-3 rounded-md bg-sky-50 px-4 py-2 text-sm text-sky-700">
          일정 변경 가능 — 지원자 행의 [일정 변경]을 통해 배정 슬롯을 수정할 수 있습니다
        </div>
      )}
    </div>
  );
}
