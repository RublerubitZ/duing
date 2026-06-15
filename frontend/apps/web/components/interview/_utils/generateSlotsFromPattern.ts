// 라운드 슬롯 패턴 생성 유틸 — wizard Step3 와 라운드 dashboard 슬롯 섹션이 공용.
// 구 interview/_utils/generateSlotsFromPattern 을 복제·개조 (FE#3/4 가 구 페이지 삭제 시 독립 유지).
// 변경점: date + startTime/endTime 시간 분리 입력 → 계산 후 슬롯 배열 반환.
// capacity 는 필수 입력으로 개조 (스펙 §10.3).
//
// startTime 은 `YYYY-MM-DDTHH:mm:ss` (로컬, timezone-naive) 로 직렬화되어
// 백엔드 LocalDateTime 포맷과 일치해야 한다. UTC 변환 없음 (구 파일 주석 참조).

import {
  formatLocalDateTime,
  parseLocalDateTime,
} from '@/components/interview/_utils/localDateTime';

export type RoundSlotEntry = {
  startTime: string;
  endTime: string;
  capacity: number;
};

export type GenerateRoundSlotsResult =
  | { ok: true; slots: RoundSlotEntry[] }
  | { ok: false; reason: string };

type GenerateRoundSlotsArgs = {
  /** YYYY-MM-DD 날짜 문자열 */
  date: string;
  /** HH:mm 시작 시각 */
  startTime: string;
  /** HH:mm 종료 시각 */
  endTime: string;
  /** 슬롯 1개당 면접 시간(분) — 슬롯 간격이자 개별 슬롯 duration */
  durationMinutes: number;
  /** 슬롯당 정원 (필수, 1 이상) */
  capacity: number;
};

/**
 * 날짜 + 시간 범위 + 면접 시간(분) + 정원으로 슬롯 배열을 생성한다.
 *
 * 예) date='2026-07-15', startTime='10:00', endTime='12:00', durationMinutes=30, capacity=2
 * → startTime 10:00/10:30/11:00/11:30, endTime 10:30/11:00/11:30/12:00, capacity=2 (4개 슬롯)
 *
 * endTime 전에 시작할 수 있는 슬롯만 포함 (마지막 슬롯의 endTime == endTime 포함).
 * 자정 교차(종료 ≤ 시작)는 지원하지 않으며 역범위로 거부된다.
 */
export function generateRoundSlotsFromPattern(args: GenerateRoundSlotsArgs): GenerateRoundSlotsResult {
  const { date, startTime, endTime, durationMinutes, capacity } = args;

  const startIso = `${date}T${startTime}`;
  const endIso = `${date}T${endTime}`;

  const startParts = parseLocalDateTime(startIso);
  const endParts = parseLocalDateTime(endIso);

  if (!startParts || !endParts) {
    return { ok: false, reason: '슬롯 패턴 입력이 올바르지 않습니다. 날짜와 시각을 확인해주세요.' };
  }

  const toDate = (parts: ReturnType<typeof parseLocalDateTime>) => {
    if (!parts) throw new Error('Invalid parts');
    return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  };

  const baseStart = toDate(startParts);
  const rangeEnd = toDate(endParts);

  if (rangeEnd.getTime() <= baseStart.getTime()) {
    return {
      ok: false,
      reason:
        '종료 시각은 시작 시각보다 늦어야 합니다. 자정을 넘는 범위는 지원하지 않습니다.',
    };
  }

  const durationMs = durationMinutes * 60_000;

  const slots: RoundSlotEntry[] = [];
  let current = baseStart.getTime();

  while (current + durationMs <= rangeEnd.getTime()) {
    const slotStart = new Date(current);
    const slotEnd = new Date(current + durationMs);
    slots.push({
      startTime: formatLocalDateTime(slotStart),
      endTime: formatLocalDateTime(slotEnd),
      capacity,
    });
    current += durationMs;
  }

  return { ok: true, slots };
}
