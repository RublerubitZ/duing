'use client';

import { useRouter } from 'next/navigation';
import type { ManagedClub } from '@duing/types';
import { toRoute } from '../../_lib/route';

type ClubSelectorProps = {
  managedClubs: ManagedClub[];
  currentClubId: number | null;
};

export function ClubSelector({ managedClubs, currentClubId }: ClubSelectorProps) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const selectedClubId = event.target.value;
    router.push(toRoute(`/manage/clubs/${selectedClubId}`));
  }

  return (
    <div className="px-3 py-2">
      <label className="mb-1 block text-xs font-medium text-slate-500">동아리 선택</label>
      <select
        value={currentClubId ?? ''}
        onChange={handleChange}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
      >
        {managedClubs.map((managedClub) => (
          <option key={managedClub.clubId} value={managedClub.clubId}>
            {managedClub.clubName}
            {managedClub.myRole === 'LEADER' ? ' (회장)' : ' (운영진)'}
          </option>
        ))}
      </select>
    </div>
  );
}