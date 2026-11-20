'use client';

import { useAdminActiveClubsQuery } from '@duing/hooks';
import type { NoticeClubScopeRole, NoticeVisibility } from '@duing/types';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { VISIBILITY_LABEL, CLUB_SCOPE_ROLE_LABEL } from '../_lib/visibilityLabels';

type Props = {
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  onVisibilityChange: (next: NoticeVisibility) => void;
  onClubScopeRoleChange: (next: NoticeClubScopeRole | null) => void;
  onTargetClubIdsChange: (next: number[]) => void;
};

const VISIBILITY_OPTIONS: NoticeVisibility[] = ['PUBLIC', 'OFFICERS_ALL', 'CLUB_SCOPED'];
const ROLE_OPTIONS: NoticeClubScopeRole[] = ['OFFICERS_ONLY', 'ALL_MEMBERS'];

export function VisibilityPicker({
  visibility, clubScopeRole, targetClubIds,
  onVisibilityChange, onClubScopeRoleChange, onTargetClubIdsChange,
}: Props) {
  const clubsQuery = useAdminActiveClubsQuery();
  // 다 받은 뒤에만 센다 — 받기 전엔 모든 선택이 목록 밖으로 보인다.
  const listedClubIds = clubsQuery.data ? new Set(clubsQuery.data.map((club) => club.id)) : null;
  const unlistedSelectedCount = listedClubIds
    ? targetClubIds.filter((clubId) => !listedClubIds.has(clubId)).length
    : 0;

  return (
    <div className="space-y-3">
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {VISIBILITY_OPTIONS.map((opt) => {
          const active = opt === visibility;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onVisibilityChange(opt);
                if (opt !== 'CLUB_SCOPED') {
                  onClubScopeRoleChange(null);
                  onTargetClubIdsChange([]);
                } else if (clubScopeRole === null) {
                  onClubScopeRoleChange('OFFICERS_ONLY');
                }
              }}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold ${
                active ? 'bg-ink text-paper' : 'bg-paper border border-line text-charcoal-2'
              }`}
            >{VISIBILITY_LABEL[opt]}</button>
          );
        })}
      </div>

      {visibility === 'CLUB_SCOPED' && (
        <div className="space-y-3 pl-2 border-l-2 border-line">
          <div role="radiogroup" className="flex gap-2">
            {ROLE_OPTIONS.map((role) => {
              const active = role === clubScopeRole;
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => onClubScopeRoleChange(role)}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold ${
                    active ? 'bg-ink text-paper' : 'bg-paper border border-line text-charcoal-2'
                  }`}
                >{CLUB_SCOPE_ROLE_LABEL[role]}</button>
              );
            })}
          </div>

          <div className="max-h-60 overflow-y-auto rounded-md border border-line">
            {clubsQuery.isLoading && (
              <LoadingGate className="min-h-0 py-4" label="동아리 목록 불러오는 중" />
            )}
            {clubsQuery.data?.map((club) => {
              const checked = targetClubIds.includes(club.id);
              return (
                <label
                  key={club.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-graysoft cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      if (checked) {
                        onTargetClubIdsChange(targetClubIds.filter((id) => id !== club.id));
                      } else {
                        onTargetClubIdsChange([...targetClubIds, club.id]);
                      }
                    }}
                  />
                  <span>{club.name}</span>
                </label>
              );
            })}
          </div>

          <p className="text-[12px] text-charcoal-3" aria-live="polite" aria-atomic="true">
            선택된 동아리: {targetClubIds.length}개
          </p>
          {listedClubIds && unlistedSelectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-charcoal-3">
              <span>
                목록에 없는 동아리 {unlistedSelectedCount}곳도 선택돼 있습니다 — 운영 중이 아니라 지금은 회원에게 보이지 않고,
                폐쇄된 동아리가 섞여 있으면 저장이 거절됩니다.
              </span>
              <button
                type="button"
                onClick={() => onTargetClubIdsChange(targetClubIds.filter((clubId) => listedClubIds.has(clubId)))}
                className="font-semibold text-charcoal-2 underline underline-offset-2"
              >목록에 없는 선택 빼기</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}