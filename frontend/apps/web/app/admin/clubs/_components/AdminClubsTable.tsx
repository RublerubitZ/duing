'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '../../../_lib/cn';
import type { AdminClubSummary } from '@duing/types';
import { clubCategoryLabel } from '../../../clubs/[clubId]/_lib/clubCategoryLabel';
import {
  STATUS_ACTIONS,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  type StatusAction,
} from '../_lib/clubStatus';

type Props = {
  clubs: ReadonlyArray<AdminClubSummary>;
  onActionClick: (club: AdminClubSummary, action: StatusAction) => void;
  onCentralClubToggleClick: (club: AdminClubSummary) => void;
  onCloseClick: (club: AdminClubSummary) => void;
};

export function AdminClubsTable({ clubs, onActionClick, onCentralClubToggleClick, onCloseClick }: Props) {
  if (clubs.length === 0) {
    return (
      <p className="border-line text-charcoal-3 rounded-md border bg-white py-10 text-center text-sm">
        조건에 맞는 동아리가 없습니다.
      </p>
    );
  }

  return (
    <div className="border-line overflow-hidden rounded-md border bg-white">
      <table className="w-full text-sm">
        <thead className="border-line bg-graysoft border-b text-[12px] uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">이름</th>
            <th className="px-4 py-3 text-left">분류</th>
            <th className="px-4 py-3 text-left">회장</th>
            <th className="px-4 py-3 text-left">상태</th>
            <th className="px-4 py-3 text-left">최근 변경</th>
            <th className="px-4 py-3 text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => {
            const actions = STATUS_ACTIONS[club.status];
            const auditText =
              club.statusChangedByName && club.statusChangedAt
                ? `${club.statusChangedByName} · ${new Date(club.statusChangedAt).toLocaleDateString('ko-KR')}`
                : '—';
            const isRejected = club.status === 'REJECTED' && club.rejectionReason;
            return (
              <React.Fragment key={club.id}>
                <tr className="border-line border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      <Link
                        href={`/admin/clubs/${club.id}`}
                        className="hover:underline"
                      >
                        {club.name}
                      </Link>
                      {club.centralClub && (
                        <span
                          aria-label="중앙동아리"
                          className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        >
                          🏛️ 중앙
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{clubCategoryLabel(club.category)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{club.division ?? '—'}</td>
                  <td className="px-4 py-3">
                    {club.leaderName ? (
                      <div>
                        <div className="text-slate-900">{club.leaderName}</div>
                        <div className="text-xs text-slate-500">{club.leaderStudentId}</div>
                      </div>
                    ) : (
                      <span className="text-rose-600">회장 정보 없음</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                        STATUS_BADGE_CLASS[club.status],
                      )}
                    >
                      {STATUS_LABEL[club.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{auditText}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onCentralClubToggleClick(club)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {club.centralClub ? '중앙 해제' : '중앙 지정'}
                      </button>
                      {actions.map((action) => (
                        <button
                          key={action.nextStatus}
                          type="button"
                          onClick={() => onActionClick(club, action)}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs font-semibold',
                            action.tone === 'danger'
                              ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
                          )}
                        >
                          {action.label}
                        </button>
                      ))}
                      {club.status === 'INACTIVE' && (
                        <button
                          type="button"
                          onClick={() => onCloseClick(club)}
                          className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          폐쇄
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isRejected && (
                  <tr className="border-line border-b bg-rose-50 last:border-b-0">
                    <td colSpan={6} className="px-4 py-2 text-xs text-rose-700">
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
