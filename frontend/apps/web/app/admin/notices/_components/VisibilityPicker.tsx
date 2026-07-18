'use client';

import { useAdminClubsQuery } from '@duing/hooks';
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
  const clubsQuery = useAdminClubsQuery({ size: 200 });

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
            {clubsQuery.data?.content.map((club) => {
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

          <p className="text-[12px] text-charcoal-3">
            선택된 동아리: {targetClubIds.length}개
          </p>
        </div>
      )}
    </div>
  );
}