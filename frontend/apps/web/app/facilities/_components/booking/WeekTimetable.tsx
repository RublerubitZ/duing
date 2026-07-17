'use client';

import type { BookingAvailabilitySlot, BookingDayAvailability, BookingOperatingNote } from '@duing/types';
import type { SlotRange } from '../../_lib/bookingCalendar';
import {
  dayBookingEntries,
  isWithinBookable,
  pastelIndexByLabel,
  slotInRange,
  weekDatesOf,
} from '../../_lib/bookingCalendar';

const HOURS = Array.from({ length: 13 }, (_, index) => 9 + index);
// 월요일 시작 — weekDatesOf 와 정렬(colIndex 0=월 … 6=일). BookingCalendar 요일 헤더와 동일 순서.
const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const pad2 = (value: number) => String(value).padStart(2, '0');

// 확정(BLOCKED) 블록 파스텔 클래스 세트(§8.3) — pastelIndexByLabel 인덱스와 1:1(정적 문자열이라 tailwind purge 안전).
// { bg(저채도 파스텔), border(한 단계 진함), accent(좌측 3px 보더 진한 톤), name(이름 텍스트) }.
const PASTEL_BLOCK_CLASSES = [
  { bg: 'bg-pastel-mint', border: 'border-pastel-mint-border', accent: 'border-l-pastel-mint-accent', name: 'text-pastel-mint-accent' },
  { bg: 'bg-pastel-lemon', border: 'border-pastel-lemon-border', accent: 'border-l-pastel-lemon-accent', name: 'text-pastel-lemon-accent' },
  { bg: 'bg-pastel-coral', border: 'border-pastel-coral-border', accent: 'border-l-pastel-coral-accent', name: 'text-pastel-coral-accent' },
  { bg: 'bg-pastel-lavender', border: 'border-pastel-lavender-border', accent: 'border-l-pastel-lavender-accent', name: 'text-pastel-lavender-accent' },
  { bg: 'bg-pastel-beige', border: 'border-pastel-beige-border', accent: 'border-l-pastel-beige-accent', name: 'text-pastel-beige-accent' },
  { bg: 'bg-pastel-rose', border: 'border-pastel-rose-border', accent: 'border-l-pastel-rose-accent', name: 'text-pastel-rose-accent' },
] as const;

// 대기(warm) 고정색 블록 클래스(§8.2) — 파스텔과 달리 상태 고정색이라 라벨 무관 단일.
const PENDING_BLOCK_CLASS = { bg: 'bg-warm/15', border: 'border-warm/60', accent: 'border-l-warm', name: 'text-[#8E6620]' } as const;

type Props = {
  selectedDate: string;
  daysByIso: Map<string, BookingDayAvailability>;
  bookableFrom: string;
  bookableUntil: string;
  todayIso: string;
  selection: SlotRange | null;
  onSelectDate: (iso: string) => void;
  onTapSlot: (iso: string, slotStart: string) => void;
};

type BlockKind = 'BLOCKED' | 'PENDING';
// 컬럼 렌더 계획 항목 — 블록(rowSpan)·1시간 셀·데이터 없음·상위 블록에 덮인 행.
type PlanBlock = {
  type: 'block';
  kind: BlockKind;
  label: string;
  start: string;
  end: string;
  rowSpan: number;
  reachesBottom: boolean;
};
// operating: 운영 노트 구간에 속한 셀(§8.1 정정) — AVAILABLE 이면 sky 상태색 선택 가능 셀로 렌더.
type PlanCell = { type: 'cell'; hour: number; slot: BookingAvailabilitySlot; operating: boolean };
type PlanEmpty = { type: 'empty' };
type PlanCovered = { type: 'covered' };
type PlanEntry = PlanBlock | PlanCell | PlanEmpty | PlanCovered;

// 셀 상태(§4·§8.2 고정색) — 가능=sage 셀·운영 중 가능=sky 셀(둘 다 탭)·PAST=gray·창 밖=gray.
// BLOCKED/PENDING 은 블록으로 승격.
type CellState = { statusText: string; toneClass: string; selectable: boolean };

const hourIndexOf = (time: string) => Number(time.slice(0, 2)) - 9;

// 운영 노트 구간 판정 — DayBookingOverview.isWithinOperating 과 동일 기준(슬롯이 노트에 완전 포함).
function isWithinOperating(slot: BookingAvailabilitySlot, operatingNotes: BookingOperatingNote[]): boolean {
  return operatingNotes.some((note) => slot.start >= note.start && slot.end <= note.end);
}

/**
 * 한 요일 컬럼의 렌더 계획(§8.1) — 예약 건(dayBookingEntries: BLOCKED·PENDING 병합)을 rowSpan 블록으로,
 * 나머지(AVAILABLE·PAST)를 1시간 셀로 배치한다. 운영 구간은 블록이 아니라 셀의 operating 플래그(2026-07-17 정정
 * — sky 상태색 선택 가능 셀). 데이터 없는 날·창 밖 날은 블록 없이 1시간 셀만(기존 게이팅 유지). 길이 13(09~21시).
 */
function buildColumnPlan(
  day: BookingDayAvailability | undefined,
  withinWindow: boolean,
): PlanEntry[] {
  if (day === undefined) {
    return HOURS.map<PlanEntry>(() => ({ type: 'empty' }));
  }
  const cellAt = (hour: number, index: number): PlanEntry => {
    const slot = day.slots[index];
    if (slot === undefined) return { type: 'empty' };
    return { type: 'cell', hour, slot, operating: isWithinOperating(slot, day.operatingNotes) };
  };
  // 창 밖 날은 블록화하지 않고 1시간 셀(예약 기간 아님)로 둔다 — 기존 게이팅과 일관.
  if (!withinWindow) {
    return HOURS.map<PlanEntry>(cellAt);
  }
  const plan: (PlanEntry | undefined)[] = new Array<PlanEntry | undefined>(HOURS.length).fill(undefined);
  for (const entry of dayBookingEntries(day.slots)) {
    const start = Math.max(0, hourIndexOf(entry.start));
    const end = Math.min(HOURS.length, hourIndexOf(entry.end));
    if (end <= start) continue;
    plan[start] = {
      type: 'block',
      kind: entry.kind === 'PENDING' ? 'PENDING' : 'BLOCKED',
      label: entry.label,
      start: entry.start,
      end: entry.end,
      rowSpan: end - start,
      reachesBottom: end >= HOURS.length,
    };
    for (let index = start + 1; index < end; index += 1) plan[index] = { type: 'covered' };
  }
  return HOURS.map<PlanEntry>((hour, index) => plan[index] ?? cellAt(hour, index));
}

/**
 * 주간 타임테이블(§4·§8·목업 F3) — 좌측 시간 라벨 열 + 7일 컬럼(월~일) 그리드.
 * 예약 건은 병합 블록(확정=파스텔 순환·대기=warm, PC 비인터랙티브), AVAILABLE 은 선택 가능 셀 —
 * 운영 노트 구간이면 sky 상태색, 밖이면 sage(동작 동일: 탭=onTapSlot, 선택일=토글·다른 요일=그 날 전환+단일 선택).
 * 선택일 컬럼은 ink 프레임 + sage tint 로 강조하고, 블록이 여러 행을 차지해도 컬럼 좌우 보더가 이어진다.
 * 차단·지난·창 밖·데이터 없음은 비활성.
 */
export function WeekTimetable({
  selectedDate,
  daysByIso,
  bookableFrom,
  bookableUntil,
  todayIso,
  selection,
  onSelectDate,
  onTapSlot,
}: Props) {
  const weekDates = weekDatesOf(selectedDate);
  const columns = weekDates.map((iso) => {
    const withinWindow = daysByIso.has(iso) && isWithinBookable(iso, bookableFrom, bookableUntil);
    return { iso, withinWindow, plan: buildColumnPlan(daysByIso.get(iso), withinWindow) };
  });
  // 확정 블록 라벨 첫 등장 순(월→일·시간순)으로 파스텔을 순환 배정한다(§8.3).
  const pastelMap = pastelIndexByLabel(
    columns.flatMap((column) => column.plan)
      .filter((entry): entry is PlanBlock => entry.type === 'block' && entry.kind === 'BLOCKED')
      .map((entry) => entry.label),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-0 text-center">
        <thead>
          <tr>
            <th className="w-12" aria-hidden />
            {weekDates.map((iso, colIndex) => {
              const isSelectedColumn = iso === selectedDate;
              const dayNumber = Number(iso.slice(8, 10));
              const dayEnabled = daysByIso.has(iso) && isWithinBookable(iso, bookableFrom, bookableUntil);
              return (
                <th
                  key={iso}
                  className={`p-0 ${
                    isSelectedColumn ? 'rounded-t-md border-l border-r border-t border-ink bg-sage/20' : ''
                  }`}
                >
                  <button
                    type="button"
                    disabled={!dayEnabled}
                    onClick={() => onSelectDate(iso)}
                    aria-label={`${WEEKDAY_LABELS[colIndex]}요일 ${dayNumber}일${isSelectedColumn ? ' · 선택' : ''}`}
                    className="flex w-full flex-col items-center gap-0.5 px-1 py-1.5 disabled:cursor-default disabled:opacity-40"
                  >
                    <span className={`text-[10px] font-medium ${isSelectedColumn ? 'text-ink' : 'text-charcoal-3'}`}>
                      {WEEKDAY_LABELS[colIndex]}
                      {isSelectedColumn ? ' · 선택' : ''}
                    </span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[12px] font-bold ${
                        isSelectedColumn ? 'bg-ink text-cream' : 'text-charcoal'
                      }`}
                    >
                      {dayNumber}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hour, rowIndex) => {
            const isLastRow = rowIndex === HOURS.length - 1;
            return (
              <tr key={hour}>
                <td className="pr-1.5 align-top text-right">
                  <span className="font-mono text-[10px] text-charcoal-3">{pad2(hour)}:00</span>
                </td>
                {columns.map(({ iso, withinWindow, plan }, colIndex) => {
                  const entry = plan[rowIndex];
                  if (entry === undefined || entry.type === 'covered') return null;
                  const isSelectedColumn = iso === selectedDate;
                  const dayNumber = Number(iso.slice(8, 10));
                  const weekdayLabel = WEEKDAY_LABELS[colIndex];

                  if (entry.type === 'block') {
                    const tdFrame = selectedTdFrame(isSelectedColumn, entry.reachesBottom);
                    const visual = blockVisual(entry, pastelMap);
                    const displayName = entry.kind === 'PENDING' ? '승인 대기' : entry.label;
                    return (
                      <td key={iso} rowSpan={entry.rowSpan} className={`p-[2px] ${tdFrame}`}>
                        <button
                          type="button"
                          disabled
                          aria-label={blockAriaLabel(entry, weekdayLabel, dayNumber)}
                          className={`flex h-full min-h-9 w-full flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border border-l-[3px] px-1 py-0.5 text-left leading-tight disabled:cursor-default sm:min-h-10 ${visual.bg} ${visual.border} ${visual.accent}`}
                        >
                          <span className={`truncate text-[10px] font-bold ${visual.name}`}>{displayName}</span>
                          <span className="truncate font-mono text-[9px] text-charcoal-3">
                            {entry.start}~{entry.end}
                          </span>
                        </button>
                      </td>
                    );
                  }

                  const tdFrame = selectedTdFrame(isSelectedColumn, isLastRow);
                  if (entry.type === 'empty') {
                    return (
                      <td key={iso} className={`p-[2px] ${tdFrame}`}>
                        <div aria-hidden className="h-9 rounded-[5px] border border-transparent sm:h-10" />
                      </td>
                    );
                  }

                  const { slot } = entry;
                  const isPast = slot.status === 'PAST' || iso < todayIso;
                  const selected = isSelectedColumn && selection !== null && slotInRange(slot, selection);
                  const state = cellStateOf(slot.status, withinWindow, isPast, entry.operating);
                  return (
                    <td key={iso} className={`p-[2px] ${tdFrame}`}>
                      <button
                        type="button"
                        disabled={!state.selectable}
                        aria-pressed={state.selectable ? selected : undefined}
                        aria-label={`${weekdayLabel}요일 ${dayNumber}일 ${pad2(hour)}:00 ${state.statusText}`}
                        onClick={state.selectable ? () => onTapSlot(iso, slot.start) : undefined}
                        className={`flex h-9 w-full items-center justify-center rounded-[5px] border text-[9px] font-bold leading-none disabled:cursor-default sm:h-10 ${
                          selected ? 'border-sage bg-ink text-cream shadow-sm' : state.toneClass
                        }`}
                      >
                        {selected ? '✓' : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 선택일 컬럼 프레임(§4) — ink 좌우 보더 + sage tint. reachesBottom(마지막 행 도달 td)만 하단 라운드·보더.
function selectedTdFrame(isSelectedColumn: boolean, reachesBottom: boolean): string {
  if (!isSelectedColumn) return '';
  return `border-l border-r border-ink bg-sage/20${reachesBottom ? ' rounded-b-md border-b' : ''}`;
}

// 블록 색(§8.2) — 확정=라벨 첫 등장 순 파스텔, 대기=warm 고정.
function blockVisual(entry: PlanBlock, pastelMap: Map<string, number>) {
  if (entry.kind === 'PENDING') return PENDING_BLOCK_CLASS;
  const paletteIndex = pastelMap.get(entry.label) ?? 0;
  return PASTEL_BLOCK_CLASSES[paletteIndex] ?? PASTEL_BLOCK_CLASSES[0];
}

// 블록 aria-label(§8.1) — "요일 N일 HH:MM~HH:MM 라벨 상태". 대기는 이름 비노출("승인 대기"만).
function blockAriaLabel(entry: PlanBlock, weekdayLabel: string | undefined, dayNumber: number): string {
  const prefix = `${weekdayLabel}요일 ${dayNumber}일 ${entry.start}~${entry.end}`;
  if (entry.kind === 'PENDING') return `${prefix} 승인 대기`;
  return entry.label === '예약됨' ? `${prefix} 예약됨` : `${prefix} ${entry.label} 예약됨`;
}

// 셀 상태 파생 — 창 밖(게이팅) > 지난 > 가능(운영 구간=sky·밖=sage) 순. AVAILABLE 만 탭 가능(§4·§8.1 정정).
// BLOCKED/PENDING 은 블록으로 승격돼 미도달.
function cellStateOf(
  status: BookingAvailabilitySlot['status'],
  withinWindow: boolean,
  isPast: boolean,
  operating: boolean,
): CellState {
  if (!withinWindow) return { statusText: '예약 기간 아님', toneClass: 'border-line/60 bg-graysoft/40', selectable: false };
  if (isPast) return { statusText: '지난', toneClass: 'border-line/60 bg-graysoft/40', selectable: false };
  if (status === 'AVAILABLE') {
    // 운영 노트 구간의 가용 셀 = sky 상태색(§8.2) — 시각만 다르고 동작은 일반 가용 셀과 동일.
    if (operating) return { statusText: '운영 중 예약 가능', toneClass: 'border-sky-200 bg-sky-100', selectable: true };
    return { statusText: '가능', toneClass: 'border-sage-soft bg-sage-mist', selectable: true };
  }
  // 방어적 폴백(BLOCKED·PENDING_HOLD 는 블록으로 렌더되어 셀 경로에 도달하지 않음).
  return { statusText: '예약됨', toneClass: 'border-line bg-graysoft', selectable: false };
}
