// 면접 일정 시각(Schedule Time) 헬퍼 — 백엔드 LocalDateTime 은 오프셋 없는 한국 시간 벽시계
// (`YYYY-MM-DDTHH:mm:ss`)라 시각을 Date 로 바꾸지 않고 문자열 부품으로 다룬다(/TIMEZONE.md).
// `new Date(문자열)` 은 기기 시간대로 읽고, `toISOString()` 을 거치면 UTC 로 9시간 어긋난다.

// datetime-local 값 또는 백엔드 LocalDateTime 을 wall-clock 컴포넌트로 분해한다.
// 뒤에 붙은 밀리초·오프셋은 무시하므로 오프셋 없는 일정 시각에만 쓴다.
// 매치 실패 시 null 반환 — 호출부가 fallback 을 결정한다.
export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function parseLocalDateTime(value: string): LocalDateTimeParts | null {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  };
}

// 시작/종료 한 쌍을 한국어 range 로 포맷 — 면접 슬롯 목록·배정 화면 공용.
// 시작과 종료가 같은 날짜인 가정에 맞춰 시작에만 날짜를 표기한다.
export function formatSlotRange(startTime: string, endTime: string): string {
  const startParts = parseLocalDateTime(startTime);
  const endParts = parseLocalDateTime(endTime);
  if (!startParts || !endParts) {
    return `${startTime} ~ ${endTime}`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${startParts.month}월 ${startParts.day}일 ` +
    `${pad(startParts.hour)}:${pad(startParts.minute)} ~ ` +
    `${pad(endParts.hour)}:${pad(endParts.minute)}`
  );
}

// `{ startTime, endTime }` 슬롯을 카드/리스트 라벨용 단문(`M/D (요일) HH:mm – HH:mm`) 으로 포맷.
// 면접 수동 배정 UX P0-2 의 ApplicantInterviewScheduleCard 가 사용.
// wall-clock 보존 — `new Date(...).toISOString()` 같은 UTC 변환을 거치지 않는다.
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatSlotLabel(slot: { startTime: string; endTime: string }): string {
  const startParts = parseLocalDateTime(slot.startTime);
  const endParts = parseLocalDateTime(slot.endTime);
  if (!startParts || !endParts) {
    return `${slot.startTime} – ${slot.endTime}`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const weekday =
    WEEKDAY_LABELS[
      new Date(startParts.year, startParts.month - 1, startParts.day).getDay()
    ];
  return (
    `${startParts.month}/${startParts.day} (${weekday}) ` +
    `${pad(startParts.hour)}:${pad(startParts.minute)} – ` +
    `${pad(endParts.hour)}:${pad(endParts.minute)}`
  );
}
