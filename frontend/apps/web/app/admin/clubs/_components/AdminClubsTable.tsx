'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '../../../_lib/cn';
import { toRoute } from '../../../_lib/route';
import { formatDateKst } from '@duing/hooks';
import type { AdminClubSignal, AdminClubSignalDetail, AdminClubSummary } from '@duing/types';
import { clubCategoryLabel } from '../../../clubs/[clubId]/_lib/clubCategoryLabel';
import {
  PENDING_CLEANUP_ACTION_LABEL,
  STATUS_ACTIONS,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  type StatusAction,
} from '../_lib/clubStatus';
import { signalWatchPoints } from '../_lib/clubSignals';
import { pendingCleanupCounts, pendingCleanupRowText, type PendingCleanupCounts } from '../_lib/pendingCleanup';

type Props = {
  clubs: ReadonlyArray<AdminClubSummary>;
  /** 신호 화면이면 그 신호 — 분류·상태·최근 변경·액션 열을 숨기고 이름 칸에 살펴볼 점을 붙인다(동아리 신호 스펙 §8-3). */
  signal?: AdminClubSignal;
  onActionClick: (club: AdminClubSummary, action: StatusAction) => void;
  onCentralClubToggleClick: (club: AdminClubSummary) => void;
  onSecuredTargetToggleClick: (club: AdminClubSummary) => void;
  onCloseClick: (club: AdminClubSummary) => void;
  onPendingCleanupClick: (club: AdminClubSummary, counts: PendingCleanupCounts) => void;
};

export function AdminClubsTable({
  clubs,
  signal,
  onActionClick,
  onCentralClubToggleClick,
  onSecuredTargetToggleClick,
  onCloseClick,
  onPendingCleanupClick,
}: Props) {
  if (clubs.length === 0) {
    return (
      <p className="border-line text-charcoal-3 rounded-md border bg-white py-10 text-center text-sm">
        조건에 맞는 동아리가 없습니다.
      </p>
    );
  }

  // 신호 화면은 이름(살펴볼 점 포함)·회장만 — 상태 변경·중앙·확보 지정은 일반 목록에서만 한다(참고 목록이 정리 명단이 되지 않게).
  const isSignalView = signal !== undefined;
  // 경과 일수는 이 시각 기준 KST 날짜 차이다 — 행마다 시계를 다시 읽지 않게 한 번만 잡는다(모집 표와 같다).
  const now = new Date();

  return (
    <div className="border-line overflow-x-auto rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="border-line bg-graysoft border-b text-[12px] uppercase text-charcoal-3">
          <tr>
            <th className={cn('whitespace-nowrap px-4 py-3 text-left', isSignalView && 'min-w-[16rem]')}>이름</th>
            {isSignalView ? null : <th className="whitespace-nowrap px-4 py-3 text-left">분류</th>}
            <th className="whitespace-nowrap px-4 py-3 text-left">회장</th>
            {isSignalView ? null : (
              <>
                <th className="whitespace-nowrap px-4 py-3 text-left">상태</th>
                <th className="whitespace-nowrap px-4 py-3 text-left">최근 변경</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">액션</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => {
            const actions = STATUS_ACTIONS[club.status];
            const auditText =
              club.statusChangedByName && club.statusChangedAt
                ? `${club.statusChangedByName} · ${formatDateKst(club.statusChangedAt)}`
                : '—';
            const isRejected = club.status === 'REJECTED' && club.rejectionReason;
            const cleanupCounts = pendingCleanupCounts(club);
            return (
              <React.Fragment key={club.id}>
                <tr className="border-line border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium text-ink-deep">
                      <Link
                        href={`/admin/clubs/${club.id}`}
                        className="break-keep hover:underline"
                      >
                        {club.name}
                      </Link>
                      {club.centralClub && (
                        <span
                          aria-label="중앙동아리"
                          className="whitespace-nowrap rounded-full bg-ink-deep px-1.5 py-0.5 text-[11px] font-semibold text-white"
                        >
                          🏛️ 중앙
                        </span>
                      )}
                      {club.facilitySecuredTimeTarget && (
                        <span
                          aria-label="기본 확보 시간 대상"
                          className="whitespace-nowrap rounded-full border border-ink bg-paper px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                        >
                          확보 대상
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-charcoal-3">{clubCategoryLabel(club.category)}</div>
                    {signal && club.signalDetail ? (
                      <SignalWatchPoints clubName={club.name} signal={signal} signalDetail={club.signalDetail} now={now} />
                    ) : null}
                  </td>
                  {isSignalView ? null : (
                    <td className="whitespace-nowrap px-4 py-3 text-charcoal-2">{club.division ?? '—'}</td>
                  )}
                  <td className="px-4 py-3">
                    {club.leaderName ? (
                      <div className="whitespace-nowrap">
                        <div className="text-ink-deep">{club.leaderName}</div>
                        <div className="text-xs text-charcoal-3">{club.leaderStudentId}</div>
                      </div>
                    ) : (
                      // 신호 화면은 어느 줄에도 경고색을 쓰지 않는다(스펙 §8-3) — 일반 목록만 기존 경고색.
                      <span className={cn('whitespace-nowrap', isSignalView ? 'text-charcoal-3' : 'text-coral-deep')}>회장 정보 없음</span>
                    )}
                  </td>
                  {isSignalView ? null : (
                    <>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
                            STATUS_BADGE_CLASS[club.status],
                          )}
                        >
                          {STATUS_LABEL[club.status]}
                        </span>
                        {cleanupCounts && (
                          <div className="mt-1 break-keep text-xs text-charcoal-2">{pendingCleanupRowText(cleanupCounts)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-charcoal-3">{auditText}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onCentralClubToggleClick(club)}
                            className="whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal hover:bg-cream"
                          >
                            {club.centralClub ? '중앙 해제' : '중앙 지정'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSecuredTargetToggleClick(club)}
                            className="whitespace-nowrap rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal hover:bg-cream"
                          >
                            {club.facilitySecuredTimeTarget ? '확보 해제' : '확보 지정'}
                          </button>
                          {/* 옆 동작 버튼과 같은 크기(py-1 text-xs) — 이 표의 동작 버튼은 모두 같은 크기라 이것만 44px 로 키우지 않는다(스펙 §5-1). */}
                          {cleanupCounts && (
                            <button
                              type="button"
                              onClick={() => onPendingCleanupClick(club, cleanupCounts)}
                              className="whitespace-nowrap rounded-md border border-coral/40 px-2.5 py-1 text-xs font-semibold text-coral-deep hover:bg-coral/10"
                            >
                              {PENDING_CLEANUP_ACTION_LABEL}
                            </button>
                          )}
                          {actions.map((action) => (
                            <button
                              key={action.nextStatus}
                              type="button"
                              onClick={() => onActionClick(club, action)}
                              className={cn(
                                'whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold',
                                action.tone === 'danger'
                                  ? 'border-coral/40 text-coral-deep hover:bg-coral/10'
                                  : 'border-sage-soft text-ink hover:bg-sage-mist',
                              )}
                            >
                              {action.label}
                            </button>
                          ))}
                          {(club.status === 'INACTIVE' || club.status === 'REJECTED') && (
                            <button
                              type="button"
                              onClick={() => onCloseClick(club)}
                              className="whitespace-nowrap rounded-md border border-coral/40 bg-coral/10 px-2.5 py-1 text-xs font-semibold text-coral-deep hover:bg-coral/20"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
                {isRejected && (
                  <tr className="border-line border-b bg-coral/10 last:border-b-0">
                    <td colSpan={isSignalView ? 2 : 6} className="px-4 py-2 text-xs text-coral-deep">
                      <span className="font-semibold">거절 사유: </span>
                      {club.rejectionReason}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 이름 칸 '살펴볼 점' — 경고색을 쓰지 않는다. 모집 제목은 말줄임하고 전체 제목은 접근 이름·title 에 둔다(스펙 §8-3). */
function SignalWatchPoints({
  clubName,
  signal,
  signalDetail,
  now,
}: {
  clubName: string;
  signal: AdminClubSignal;
  signalDetail: AdminClubSignalDetail;
  now: Date;
}) {
  const watchPoints = signalWatchPoints(signal, signalDetail, now);
  return (
    <div className="mt-1 text-xs text-charcoal-2">
      {watchPoints.recruitment ? (
        <>
          <p className="break-keep">
            {/* auto 표에서는 truncate 만으로 열이 줄지 않는다 — 폭 상한을 줘야 말줄임된다(모집 표 선례). 같은 창으로 열고 뒤로 가기가 신호 목록을 되살린다.
                터치 높이 44px(py-3.5 + text-xs 16px). */}
            <Link
              href={toRoute(`/admin/recruitments/${watchPoints.recruitment.recruitmentId}`)}
              aria-label={`${clubName} 모집: ${watchPoints.recruitment.title}`}
              title={watchPoints.recruitment.title}
              className="inline-block max-w-[12rem] truncate rounded py-3.5 align-middle font-medium text-ink-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              {watchPoints.recruitment.title}
            </Link>
            <span className="whitespace-nowrap">{` · ${watchPoints.recruitment.endedText}`}</span>
          </p>
          <p className="break-keep">{watchPoints.recruitment.countText}</p>
        </>
      ) : null}
      {watchPoints.joinRequestText ? <p className="break-keep">{watchPoints.joinRequestText}</p> : null}
      <p className="break-keep">{watchPoints.operatorText}</p>
    </div>
  );
}
