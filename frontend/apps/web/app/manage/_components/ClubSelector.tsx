'use client';

import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import type { ManagedClub } from '@duing/types';
import { toRoute } from '../../_lib/route';

type ClubSelectorProps = {
  managedClubs: ManagedClub[];
  currentClubId: number | null;
};

export function ClubSelector({ managedClubs, currentClubId }: ClubSelectorProps) {
  const router = useGuardedRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const selectedClubId = event.target.value;
    router.push(toRoute(`/manage/clubs/${selectedClubId}`));
  }

  return (
    <div className="px-2">
      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-cream/50">
        동아리 선택
      </label>
      <select
        value={currentClubId ?? ''}
        onChange={handleChange}
        className="w-full rounded-[8px] border border-white/15 bg-black/20 text-cream px-3 py-2.5 text-[13.5px] appearance-none focus:outline-none focus:border-sage"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%239DB6A0' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          backgroundSize: '12px',
          paddingRight: '30px',
        }}
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
