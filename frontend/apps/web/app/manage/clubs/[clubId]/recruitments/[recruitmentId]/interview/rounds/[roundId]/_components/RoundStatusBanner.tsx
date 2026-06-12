'use client';

import Link from 'next/link';
import type { InterviewRoundDetail, InterviewRoundStatus } from '@duing/types';
import { toRoute } from '@/app/_lib/route';
import { cn } from '@/app/_lib/cn';

// 상태 배너 — 상태 뱃지 + 단일 next action (DRAFT→이어서 작성 / COLLECTING·ASSIGNING→자동배정 /
// ASSIGNING→확정) + 조기 배정 UX ① 전원 응답 배너 + ASSIGNING draft 안내.

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
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium',
              STATUS_BADGE_CLASS[status],
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          <span className="text-base font-semibold text-slate-900">{detail.title}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 자동배정 — COLLECTING·ASSIGNING 모두 노출 */}
          {(status === 'COLLECTING' || status === 'ASSIGNING') && (
            <button
              type="button"
              onClick={onAutoAssign}
              disabled={autoAssignPending}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {autoAssignPending ? '처리 중…' : '자동배정 실행'}
            </button>
          )}

          {/* 확정 — ASSIGNING */}
          {status === 'ASSIGNING' && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmPending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirmPending ? '처리 중…' : '확정'}
            </button>
          )}

          {/* DRAFT → 이어서 작성 */}
          {status === 'DRAFT' && (
            <Link
              href={toRoute(
                `/manage/clubs/${clubId}/recruitments/${recruitmentId}/interview/rounds/new`,
              )}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700"
            >
              이어서 작성
            </Link>
          )}
        </div>
      </div>

      {/* 조기 배정 UX ①: COLLECTING + 전원 응답 완료 배너 */}
      {allResponded && (
        <div className="mt-3 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          전원 응답 완료 — 마감 전이지만 지금 배정할 수 있어요
        </div>
      )}

      {/* ASSIGNING — 배정안은 draft 상태임을 안내 */}
      {status === 'ASSIGNING' && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-700">
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
            draft
          </span>
          확정 전까지 지원자에게 통지되지 않습니다
        </div>
      )}

      {/* SCHEDULED — 일정 변경 가능 안내 */}
      {status === 'SCHEDULED' && (
        <div className="mt-3 rounded-md bg-sky-50 px-4 py-2 text-sm text-sky-700">
          일정 변경 가능 — 멤버 행의 [일정 변경]을 통해 배정 슬롯을 수정할 수 있습니다
        </div>
      )}
    </div>
  );
}
