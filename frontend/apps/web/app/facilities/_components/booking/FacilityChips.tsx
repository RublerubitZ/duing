'use client';

type ChipFacility = { id: number; roomName: string; isUsingNow: boolean };

type Props = {
  facilities: ChipFacility[];
  selectedId: number | null;
  onSelect: (facilityId: number) => void;
};

/** 시설 선택 가로 칩(§9.2) — 상태 도트로 "지금 사용중" 을 칩 레벨에 흡수한다. */
export function FacilityChips({ facilities, selectedId, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="시설 선택">
      {facilities.map((facility) => {
        const selected = facility.id === selectedId;
        return (
          <button
            key={facility.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(facility.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] motion-safe:transition-colors ${
              selected
                ? 'border-ink bg-ink text-cream'
                : 'border-line bg-paper text-charcoal-2 hover:border-sage'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${facility.isUsingNow ? 'bg-coral' : 'bg-sage'}`}
            />
            {facility.roomName}
          </button>
        );
      })}
    </div>
  );
}
