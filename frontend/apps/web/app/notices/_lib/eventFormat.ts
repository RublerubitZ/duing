// 공지 행사/게시 시각 표기 — KST(Asia/Seoul) 고정. Schedule Time(무오프셋 KST 벽시계)과
// Event Time(`…Z` 절대시각) 모두 parseKstInstant 규칙으로 올바르게 파싱된다.
import { daysUntilKst, formatDateKst, kstDateTimeFormatter, parseKstInstant } from '@duing/hooks/datetime';
import type { NoticeEventInfo } from '@duing/types';

import { ddayLabel } from '@/app/_lib/dday';

// "9.25(금) 10:00" 조립용 — 월·일·요일·시·분을 KST 기준으로 한 번에 뽑는다.
const EVENT_PARTS_FORMATTER = kstDateTimeFormatter({
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partValue(formattedParts: Intl.DateTimeFormatPart[], partType: Intl.DateTimeFormatPartTypes): string {
  return formattedParts.find((part) => part.type === partType)?.value ?? '';
}

function parts(iso: string): { date: string; time: string } {
  const formattedParts = EVENT_PARTS_FORMATTER.formatToParts(parseKstInstant(iso));
  const date = `${partValue(formattedParts, 'month')}.${partValue(formattedParts, 'day')}(${partValue(formattedParts, 'weekday')})`;
  const time = `${partValue(formattedParts, 'hour')}:${partValue(formattedParts, 'minute')}`;
  return { date, time };
}

export function formatEventRange(startAt: string, endAt: string | null): string {
  const start = parts(startAt);
  if (!endAt) return `${start.date} ${start.time}`;
  const end = parts(endAt);
  if (start.date === end.date) return `${start.date} ${start.time}–${end.time}`;
  return `${start.date} ~ ${end.date} · ${start.time}–${end.time}`;
}

export function formatDdayLabel(expiresAt: string): string {
  // 만료 판정은 이 표면의 자체 축(시각 기준 선판정)을 유지하고, 라벨 표기만 공용 SSOT 를 따른다.
  if (parseKstInstant(expiresAt).getTime() < Date.now()) return '마감';
  return ddayLabel(daysUntilKst(expiresAt, new Date()));
}

export function formatPublishedDate(iso: string): string {
  return formatDateKst(iso);
}

// 이벤트 정보 → 라벨/값 행(일시 항상, 장소·주최·대상은 값이 있을 때만). 카드/요약이 공유한다.
export function buildEventRows(eventInfo: NoticeEventInfo): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: '일시', value: formatEventRange(eventInfo.startAt, eventInfo.endAt) },
  ];
  if (eventInfo.location) rows.push({ label: '장소', value: eventInfo.location });
  if (eventInfo.host) rows.push({ label: '주최', value: eventInfo.host });
  if (eventInfo.audience) rows.push({ label: '대상', value: eventInfo.audience });
  return rows;
}
