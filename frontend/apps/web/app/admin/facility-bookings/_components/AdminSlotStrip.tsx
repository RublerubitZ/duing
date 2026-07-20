import type { AdminBookingOverlapItem } from '@duing/types';
import { buildSlotStrip } from '../_lib/adminBookingDisplay';

type Props = {
  startTime: string;
  endTime: string;
  overlaps: AdminBookingOverlapItem[];
};

function cellTone(overlapSource: string | null): string {
  if (overlapSource === 'SCHOOL') return 'bg-coral/40';
  if (overlapSource === 'INTERNAL') return 'bg-graysoft';
  if (overlapSource !== null) return 'border border-dashed border-[#8E6620] bg-[#FBEFD7]'; // 겹치는 PENDING
  return 'bg-paper';
}

export function AdminSlotStrip({ startTime, endTime, overlaps }: Props) {
  const cells = buildSlotStrip({ startTime, endTime, overlaps });
  return (
    <div role="group" aria-label="검증 컨텍스트 타임라인">
      <div className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-[2px]">
        {cells.map((cell) => (
          <div
            key={cell.hour}
            title={`${cell.hour}:00${cell.overlapOrganization !== null ? ` · ${cell.overlapOrganization}` : ''}`}
            className={`flex h-9 items-center justify-center overflow-hidden rounded-[3px] ${cellTone(cell.overlapSource)} ${
              cell.inRequest ? 'ring-2 ring-inset ring-ink' : 'border border-line/60'
            }`}
          >
            {/* 점유 조직명 표기(개편 스펙 §3) — 칸이 좁아 잘리면 title 툴팁이 전체 이름을 보완한다. */}
            {cell.overlapOrganization !== null && (
              <span className="truncate px-0.5 text-[9px] font-semibold text-charcoal-2">
                {cell.overlapOrganization}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-charcoal-3">
        <span>09시</span>
        <span>15시</span>
        <span>22시</span>
      </div>
    </div>
  );
}
