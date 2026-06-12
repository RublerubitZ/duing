'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (managedClubs.length <= 1) {
    const only = managedClubs[0];
    return <span className="text-sm font-semibold text-charcoal">{only?.clubName ?? ''}</span>;
  }

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('clubId', event.target.value);
    router.replace(toRoute(`${pathname as `/${string}`}?${params.toString()}`));
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
