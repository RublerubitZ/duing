import type { AdminBookingOverlapItem } from '@duing/types';
import { buildSlotStrip, type SlotStripCell } from '../_lib/adminBookingDisplay';

type Props = {
  startTime: string;
  endTime: string;
  overlaps: AdminBookingOverlapItem[];
};

/**
 * 목업 슬롯 스트립 톤 매핑 — 가능=sage-mist · 점유=graysoft+조직명 · 신청=ink · 충돌=coral.
 * overlaps 는 BE 관리자 상세가 SCHOOL·INTERNAL 만 싣는다(대기 겹침은 overlappingPendingCount 숫자) — 겹침 항목은
 * source 값과 무관하게 점유로 그린다(계약 밖 값도 숨기지 않는 fail-closed 표시, P2-16).
 */
function cellVisual(cell: SlotStripCell): { tone: string; label: string } {
  const occupied = cell.overlapSource !== null;
  if (cell.inRequest && occupied) return { tone: 'bg-coral text-paper', label: '충돌' };
  if (cell.inRequest) return { tone: 'bg-ink text-paper', label: '신청' };
  if (occupied) return { tone: 'bg-graysoft text-charcoal-3', label: cell.overlapOrganization ?? '점유' };
  return { tone: 'bg-sage-mist text-ink', label: '가능' };
}

export function AdminSlotStrip({ startTime, endTime, overlaps }: Props) {
  const cells = buildSlotStrip({ startTime, endTime, overlaps });
  return (
    <div role="group" aria-label="검증 컨텍스트 타임라인">
      <div className="flex gap-1">
        {cells.map((cell) => {
          const visual = cellVisual(cell);
          return (
            <div key={cell.hour} className="min-w-0 flex-1 text-center">
              <p className="mb-1 tabular-nums text-[10px] leading-none text-charcoal-3">{cell.hour}시</p>
              <div
                title={`${cell.hour}:00${cell.overlapOrganization !== null ? ` · ${cell.overlapOrganization}` : ''}`}
                className={`flex h-[52px] items-center justify-center overflow-hidden rounded-sm px-0.5 ${visual.tone}`}
              >
                <span className="truncate text-[10px] font-bold leading-tight">{visual.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
