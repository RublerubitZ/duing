// 라운드 슬롯 패턴 생성 유틸 — wizard Step3 와 라운드 dashboard 슬롯 섹션이 공용.
// 구 interview/_utils/generateSlotsFromPattern 을 복제·개조 (FE#3/4 가 구 페이지 삭제 시 독립 유지).
// 변경점: date + startTime/endTime 시간 분리 입력 → 계산 후 슬롯 배열 반환.
// capacity 는 필수 입력으로 개조 (스펙 §10.3).
//
// 입력·출력은 한국 시간 벽시계(오프셋 없는 `YYYY-MM-DDTHH:mm:ss`, 백엔드 LocalDateTime)다.
// Date 를 거치지 않고 하루 중 초로 계산한다 — 기기 로컬 Date 에 밀리초를 더하면 기기 시간대의
// 일광절약 전환일에 슬롯이 겹치거나 빠진다.

import {
  parseLocalDateTime,
  type LocalDateTimeParts,
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

const toSecondOfDay = (parts: LocalDateTimeParts) =>
  parts.hour * 3600 + parts.minute * 60 + parts.second;

const pad = (n: number) => String(n).padStart(2, '0');

const toWallClock = (date: string, secondOfDay: number) =>
  `${date}T${pad(Math.floor(secondOfDay / 3600))}:` +
  `${pad(Math.floor(secondOfDay / 60) % 60)}:${pad(secondOfDay % 60)}`;

/**
 * 날짜 + 시간 범위 + 면접 시간(분) + 정원으로 슬롯 배열을 생성한다.
 *
 * 예) date='2026-07-15', startTime='10:00', endTime='12:00', durationMinutes=30, capacity=2
 * → startTime 10:00/10:30/11:00/11:30, endTime 10:30/11:00/11:30/12:00, capacity=2 (4개 슬롯)
 *
 * 끝이 endTime 이내인 슬롯만 포함한다 (마지막 슬롯의 endTime == endTime 포함, 남는 꼬리는 버림).
 * 자정 교차(종료 ≤ 시작)는 지원하지 않으며 역범위로 거부된다.
 */
export function generateRoundSlotsFromPattern(args: GenerateRoundSlotsArgs): GenerateRoundSlotsResult {
  const { date, startTime, endTime, durationMinutes, capacity } = args;

  const startParts = parseLocalDateTime(`${date}T${startTime}`);
  const endParts = parseLocalDateTime(`${date}T${endTime}`);

  if (!startParts || !endParts) {
    return { ok: false, reason: '슬롯 패턴 입력이 올바르지 않습니다. 날짜와 시각을 확인해주세요.' };
  }

  const rangeStart = toSecondOfDay(startParts);
  const rangeEnd = toSecondOfDay(endParts);

  if (rangeEnd <= rangeStart) {
    return {
      ok: false,
      reason:
        '종료 시각은 시작 시각보다 늦어야 합니다. 자정을 넘는 범위는 지원하지 않습니다.',
    };
  }

  // 정수 초로 맞춘다 — 소수 분이 소수 초 문자열로 새지 않게.
  const durationSeconds = Math.round(durationMinutes * 60);

  const slots: RoundSlotEntry[] = [];
  for (
    let slotStart = rangeStart;
    slotStart + durationSeconds <= rangeEnd;
    slotStart += durationSeconds
  ) {
    slots.push({
      startTime: toWallClock(date, slotStart),
      endTime: toWallClock(date, slotStart + durationSeconds),
      capacity,
    });
  }

  return { ok: true, slots };
}
