import type { ClubDetail } from '@duing/types';

import { formatClubFee } from '../../../_lib/clubFee';
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
  const feeText = formatClubFee(club.feeCycle, club.membershipFeeAmount);
  if (feeText !== null) {
    cells.push({ label: '회비', value: feeText });
  }

  if (cells.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-y border-line py-5 md:grid md:grid-cols-3 md:gap-0">
      {cells.map((cell) => (
        <div key={cell.label} className="flex items-baseline md:block">
          <div className="w-16 shrink-0 text-xs tracking-wide04 text-charcoal-3 md:mb-1.5 md:w-auto">
            {cell.label}
          </div>
          <div className="min-w-0 flex-1 font-display text-[15px] font-bold leading-snug text-ink-deep break-keep [overflow-wrap:anywhere] md:text-[22px] md:leading-normal">
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}
