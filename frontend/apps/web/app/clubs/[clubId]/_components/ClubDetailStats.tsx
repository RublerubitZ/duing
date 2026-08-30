import type { ClubDetail } from '@duing/types';

import { formatClubFee } from '../../../_lib/clubFee';
import { activityScheduleLabel } from '../../_lib/activeDaysLabel';

type Props = { club: ClubDetail };

type Cell = { label: string; value: string; note?: string | null };

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
    cells.push({ label: '회비', value: feeText, note: club.feeNote });
  }

  if (cells.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-3 md:grid md:grid-cols-3 md:gap-0 md:py-5">
      {cells.map((cell) => (
        <div key={cell.label} className="flex items-baseline md:block">
          <div className="w-16 shrink-0 text-xs tracking-wide04 text-charcoal-3 md:mb-1.5 md:w-auto">
            {cell.label}
          </div>
          <div className="min-w-0 flex-1">
            <div className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-ink-deep break-keep [overflow-wrap:anywhere] md:text-[22px] md:leading-normal">
              {cell.value}
            </div>
            {/* max-h-[2lh]+overflow-hidden: line-clamp가 붙이는 말줄임 부호(…) 없이 2줄에서 자른다.
                lh 미지원 브라우저는 max-height 를 무시 → 전문 노출(레이아웃 깨짐 없는 저하). */}
            {cell.note != null && (
              <p className="mt-1 max-h-[2lh] overflow-hidden whitespace-pre-wrap break-words text-[12px] font-normal leading-relaxed text-charcoal-3">
                {cell.note}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
