'use client';

import type { LucideIcon } from 'lucide-react';
import { Building2, Check, ChevronDown, Guitar, Landmark, Mic, Sofa, Tent } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ContextFacility = { id: number; roomName: string; location: string | null };

type Props = {
  facilities: ContextFacility[];
  selectedId: number;
  onSelect: (facilityId: number) => void;
  onGoHome: () => void;
};

// 시설명 → lucide 아이콘(시설 성격 매핑) — 이모지 facilityIcon 과 동일 규칙. 크롤이 SoT 라 신규 시설은 Building2 폴백.
const FACILITY_ICON_RULES: [RegExp, LucideIcon][] = [
  [/커뮤니티룸/, Sofa],
  [/공동연습실/, Guitar],
  [/빛광장/, Mic],
  [/자유광장/, Tent],
  [/웅지관/, Landmark],
];

function facilityLucideIcon(roomName: string): LucideIcon {
  return FACILITY_ICON_RULES.find(([pattern]) => pattern.test(roomName))?.[1] ?? Building2;
}

/**
 * 시설 선택 드롭다운(Select 형) — 스크롤 탭은 시설 10개+ 에서 좌우 탐색 비용·한눈 파악이 나빠져 전환.
 * 현재 시설은 트리거 선택값으로 표시하고, 항목 선택 즉시 onSelect. "전체 보기"(홈 카드 그리드)는 별도 버튼 유지.
 */
export function FacilityContextBar({ facilities, selectedId, onSelect, onGoHome }: Props) {
  const selected = facilities.find((facility) => facility.id === selectedId);
  const SelectedIcon = facilityLucideIcon(selected?.roomName ?? '');
  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`시설 선택 — 현재 ${selected?.roomName ?? '시설'}`}
            className="flex min-w-0 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-paper px-3 py-2 text-left motion-safe:transition-colors hover:bg-cream/60"
          >
            <SelectedIcon aria-hidden className="h-4 w-4 shrink-0 text-ink" />
            <span className="min-w-0">
              <span className="block max-w-[220px] truncate text-sm font-bold text-ink-deep">
                {selected?.roomName ?? '시설 선택'}
              </span>
              {selected?.location && (
                <span className="block max-w-[220px] truncate text-[11px] text-charcoal-3">{selected.location}</span>
              )}
            </span>
            <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-charcoal-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
          {facilities.map((facility) => {
            const ItemIcon = facilityLucideIcon(facility.roomName);
            const isSelected = facility.id === selectedId;
            return (
              <DropdownMenuItem
                key={facility.id}
                className="gap-2"
                onSelect={() => {
                  // 현재 시설 재선택은 무시 — onSelect 는 캘린더·선택 상태를 리셋한다(불필요 리셋 방지).
                  if (!isSelected) onSelect(facility.id);
                }}
              >
                <ItemIcon aria-hidden className="h-4 w-4 shrink-0 text-charcoal-2" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{facility.roomName}</span>
                  {facility.location && (
                    <span className="block truncate text-[11px] text-charcoal-3">{facility.location}</span>
                  )}
                </span>
                {isSelected && <Check aria-hidden className="h-4 w-4 shrink-0 text-ink" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        onClick={onGoHome}
        className="inline-flex shrink-0 items-center rounded-full border border-dashed border-line bg-paper px-3 py-1.5 text-xs text-charcoal-3 hover:border-sage"
      >
        전체 보기
      </button>
    </div>
  );
}
