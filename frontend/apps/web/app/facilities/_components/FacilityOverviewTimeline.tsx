'use client';

import { Link } from 'next-view-transitions';

import { toRoute } from '../../_lib/route';
import {
  AXIS_START_HOUR,
  AXIS_END_HOUR,
  TIMELINE_HOURS,
  buildTimelineSegments,
  nextSlotLabel,
  seoulDateIso,
  seoulMinutesOfDay,
  timelineIndicatorPct,
} from '../_lib/facilityTimeline';
import type { FacilityItem } from '@duing/types';

const INK = '#1F4A36';
const INK_SOFT = '#2E6149';
const AVAILABLE_DOT = '#9DB6A0';
const MUTED = '#6F7574';
const RESERVED_FILL = '#2E6149';
const EMPTY_FILL = '#F0EDE5';
const INDICATOR = '#D9523A';

// 라벨 열(시설명·상태)과 바 열(오늘 예약)의 반응형 그리드 — 헤더 축과 각 행이 같은 트랙을 공유해야
// 시간 라벨·인디케이터가 세로로 정확히 이어진다. 모바일(sm 미만)은 라벨이 바 위로 쌓인다.
const ROW_GRID = 'grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]';

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

// 행 정보 줄 — 사용 중이면 '누가·언제까지'를, 아니면 다음 예약(단체 병기)을 보여준다.
// location 이 없으면 구분점 없이 뒷부분만 잇는다(빈 앞토막에 '· ' 가 남지 않게 join 으로 처리).
function rowInfoLine(facility: FacilityItem, todayIso: string): string {
  const infoParts: string[] = facility.location ? [facility.location] : [];
  const current = facility.currentReservation;
  if (facility.isUsingNow && current) {
    infoParts.push(`${current.organization} ${current.start}~${current.end} 사용 중`);
  } else if (facility.nextReservation) {
    infoParts.push(`다음 예약 ${nextSlotLabel(facility.nextReservation, todayIso)}`);
    infoParts.push(facility.nextReservation.organization);
  } else {
    infoParts.push('예정된 예약이 없어요');
  }
  return infoParts.join(' · ');
}

function OverviewRow({
  facility,
  todayIso,
  indicatorPct,
}: {
  facility: FacilityItem;
  todayIso: string;
  indicatorPct: number | null;
}) {
  const segments = buildTimelineSegments(facility.reservations, todayIso);
  const usingNow = facility.isUsingNow && facility.currentReservation !== null;
  const dotColor = usingNow ? INK_SOFT : AVAILABLE_DOT;

  return (
    <li>
      <Link
        href={toRoute(`/facilities/${facility.id}`)}
        aria-label={`${facility.roomName} 상세`}
        className={`${ROW_GRID} rounded-[12px] px-2 py-3 sm:items-center motion-safe:transition-colors hover:bg-cream`}
      >
        {/* 라벨 열: 상태점 + 시설명 / 위치 · 다음 예약 */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: dotColor, boxShadow: usingNow ? `0 0 0 3px ${dotColor}33` : undefined }}
              aria-hidden
            />
            <span className="shrink-0 text-[12px] font-bold" style={{ color: usingNow ? INK_SOFT : MUTED }}>
              {usingNow ? '사용중' : '이용가능'}
            </span>
            <span className="truncate text-[15px] font-semibold" style={{ color: INK }}>
              {facility.roomName}
            </span>
          </div>
          <p className="mt-1 truncate pl-4 text-[12.5px] text-charcoal-3">
            {rowInfoLine(facility, todayIso)}
          </p>
        </div>

        {/* 바 열: 오늘 09~22 예약 트랙 (행 전체가 링크이므로 세그먼트는 비인터랙티브 span) */}
        <div className="relative h-8 overflow-hidden rounded-[8px]" style={{ background: EMPTY_FILL }}>
          {segments.map((segment, index) => (
            <span
              key={`${segment.startMinutes}-${index}`}
              title={`${segment.organization} ${segment.startLabel}~${segment.endLabel}`}
              className="absolute top-0 h-full"
              style={{
                left: `${segment.leftPct}%`,
                width: `${segment.widthPct}%`,
                background: RESERVED_FILL,
              }}
            />
          ))}
          {indicatorPct !== null && (
            <span
              aria-hidden
              className="absolute top-0 h-full w-[2px]"
              style={{ left: `${indicatorPct}%`, background: INDICATOR }}
            />
          )}
        </div>
      </Link>
    </li>
  );
}

// /facilities 통합 타임라인 — 시설 = 행, 오늘 09:00~22:00 = 가로축. 공유 시간축 헤더 1개와
// 모든 행을 관통하는 현재시각 인디케이터(동일 %)로 어느 시설이 언제 비는지 한눈에 비교한다(§16.3).
export function FacilityOverviewTimeline({ facilities }: { facilities: FacilityItem[] }) {
  const now = new Date();
  const todayIso = seoulDateIso(now);
  const indicatorPct = timelineIndicatorPct(seoulMinutesOfDay(now));

  return (
    <div className="rounded-[18px] border border-line bg-paper p-4 sm:p-5">
      {/* 공유 시간축 헤더(짝수 시각만) — 행 트랙과 동일한 선형 좌표에 절대배치 */}
      <div className={`${ROW_GRID} px-2`}>
        <span className="hidden sm:block" aria-hidden />
        <div
          className="relative h-3 text-[10px] text-charcoal-3"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {TIMELINE_HOURS.filter((hour) => hour % 2 === AXIS_START_HOUR % 2).map((hour) => (
            <span
              key={hour}
              className="absolute -translate-x-1/2"
              style={{ left: `${((hour - AXIS_START_HOUR) / (AXIS_END_HOUR - AXIS_START_HOUR)) * 100}%` }}
            >
              {pad2(hour)}
            </span>
          ))}
        </div>
      </div>

      <ul className="mt-1 flex flex-col divide-y divide-line/60">
        {facilities.map((facility) => (
          <OverviewRow
            key={facility.id}
            facility={facility}
            todayIso={todayIso}
            indicatorPct={indicatorPct}
          />
        ))}
      </ul>
    </div>
  );
}
