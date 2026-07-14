'use client';

import { facilityIcon } from '@/app/_lib/facilityIcon';

type ContextFacility = { id: number; roomName: string; location: string | null };

type Props = {
  facilities: ContextFacility[];
  selectedId: number;
  onSelect: (facilityId: number) => void;
  onGoHome: () => void;
};

export function FacilityContextBar({ facilities, selectedId, onSelect, onGoHome }: Props) {
  const selected = facilities.find((facility) => facility.id === selectedId);
  const others = facilities.filter((facility) => facility.id !== selectedId).slice(0, 5);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onGoHome}
        aria-label={`${selected?.roomName ?? '시설'} — 다른 시설 보기`}
        className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-paper py-1.5 pl-1.5 pr-3 motion-safe:transition-colors hover:bg-cream/60"
      >
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-sage-mist text-lg">
          {selected ? facilityIcon(selected.roomName) : '🏢'}
        </span>
        <span className="text-left">
          <span className="block text-sm font-bold text-ink-deep">{selected?.roomName}</span>
          {selected?.location && <span className="block text-[11px] text-charcoal-3">{selected.location}</span>}
        </span>
        <span aria-hidden className="text-xs text-charcoal-3">▾</span>
      </button>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
        {others.map((facility) => (
          <button
            key={facility.id}
            type="button"
            onClick={() => onSelect(facility.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-charcoal-2 hover:border-sage"
          >
            <span aria-hidden>{facilityIcon(facility.roomName)}</span>
            {facility.roomName}
          </button>
        ))}
        <button
          type="button"
          onClick={onGoHome}
          className="inline-flex shrink-0 items-center rounded-full border border-dashed border-line bg-paper px-3 py-1.5 text-xs text-charcoal-3 hover:border-sage"
        >
          전체 보기
        </button>
      </div>
    </div>
  );
}
