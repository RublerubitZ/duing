'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ManagedClub } from '@duing/types';
import { toRoute } from '@/app/_lib/route';

export function DashboardClubSwitcher({
  managedClubs,
  selectedClubId,
}: {
  managedClubs: ManagedClub[];
  selectedClubId: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (managedClubs.length === 0) return null;
  if (managedClubs.length === 1) {
    const [onlyClub] = managedClubs;
    return <span className="text-sm font-semibold text-charcoal">{onlyClub?.clubName}</span>;
  }

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('clubId', event.target.value);
    router.replace(toRoute(`/manage?${params.toString()}`));
  }

  return (
    <select
      value={selectedClubId}
      onChange={handleChange}
      className="rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none"
    >
      {managedClubs.map((club) => (
        <option key={club.clubId} value={club.clubId}>
          {club.clubName}
        </option>
      ))}
    </select>
  );
}
