// SlotPatternForm 의 datetime-local 입력값을 기준으로 N 개 슬롯을 일괄 생성한다.
// startTime 은 `YYYY-MM-DDTHH:mm`(또는 `:ss`/`Z`/오프셋 포함) 로 들어오며,
// 백엔드 LocalDateTime(timezone-naive) 으로 그대로 직렬화되어야 한다.
//
// `Date` 객체로 변환 후 `.toISOString()` 을 사용하면 KST 입력이 UTC 로 9시간 어긋난다.
// 따라서 시각 산술은 로컬 wall-clock 기준으로 수행한 뒤, 다시 `YYYY-MM-DDTHH:mm:ss` 로
// 직렬화하여 backend 가 받는 로컬 시각을 보존한다.

import {
  formatLocalDateTime,
  parseLocalDateTime,
} from '@/components/interview/_utils/localDateTime';

export type SlotEntry = {
  startTime: string;
  endTime: string;
  capacity: number;
};

type GenerateSlotsArgs = {
  startTime: string;
  intervalMinutes: number;
  count: number;
  capacity: number;
  slotDurationMinutes?: number;
};

export function generateSlotsFromPattern(args: GenerateSlotsArgs): SlotEntry[] {
  const {
    startTime,
    intervalMinutes,
    count,
    capacity,
    slotDurationMinutes = intervalMinutes,
  } = args;

  const base = parseLocalDateTime(startTime);
  if (!base) {
    throw new Error(`Invalid datetime-local string: ${startTime}`);
  }
  // 로컬 컴포넌트를 그대로 Date 에 넣으면(`new Date(y, m-1, d, h, min, s)`)
  // 로컬 wall-clock 시각이 보존된다. getTime() 으로 ms 차를 더한 뒤 다시
  // 로컬 컴포넌트로 직렬화하므로 timezone 변환이 발생하지 않는다.
  const baseDate = new Date(
    base.year,
    base.month - 1,
    base.day,
    base.hour,
    base.minute,
    base.second,
  );

  const result: SlotEntry[] = [];
  for (let i = 0; i < count; i++) {
    const start = new Date(baseDate.getTime() + i * intervalMinutes * 60_000);
    const end = new Date(start.getTime() + slotDurationMinutes * 60_000);
    result.push({
      startTime: formatLocalDateTime(start),
      endTime: formatLocalDateTime(end),
      capacity,
    });
  }
  return result;
}
