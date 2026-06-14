import type { ClubDetail } from '@duing/types';

import { activityScheduleLabel } from '../../_lib/activeDaysLabel';

type Props = { club: ClubDetail };

type Cell = { label: string; value: string };

export function ClubDetailStats({ club }: Props) {
  const cells: Cell[] = [];

  const schedule = activityScheduleLabel(club.activityFrequency, club.activeDays);
  if (schedule) {
    cells.push({ label: '활동', value: schedule });
  }
  if (club.foundedYear !== null) {
    cells.push({ label: '창설년도', value: String(club.foundedYear) });
  }
  if (club.membershipFee !== null) {
    cells.push({ label: '회비', value: club.membershipFee });
  }

  if (cells.length === 0) return null;

  return (
    <div className="grid grid-cols-3 border-y border-line py-5">
      {cells.map((cell) => (
        <div key={cell.label}>
          <div className="mb-1.5 text-xs tracking-wide04 text-charcoal-3">{cell.label}</div>
          <div className="font-display text-[22px] font-bold text-ink-deep">{cell.value}</div>
        </div>
      ))}
    </div>
  );
}
