'use client';

import { cn } from '../../../_lib/cn';
import type { AdminClubSummary } from '@duing/types';
import {
  STATUS_ACTIONS,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  type StatusAction,
} from '../_lib/clubStatus';

type Props = {
  clubs: ReadonlyArray<AdminClubSummary>;
  onActionClick: (club: AdminClubSummary, action: StatusAction) => void;
};

export function AdminClubsTable({ clubs, onActionClick }: Props) {
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
            <th className="px-4 py-3 text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          {clubs.map((club) => {
            const actions = STATUS_ACTIONS[club.status];
            return (
              <tr key={club.id} className="border-line border-b last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{club.name}</div>
                  <div className="text-xs text-slate-500">{club.category}</div>
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
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1.5">
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
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
