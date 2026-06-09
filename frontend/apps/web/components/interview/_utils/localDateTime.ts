// 면접(interview) 도메인 datetime-local 헬퍼 — UTC 변환 없이 로컬 wall-clock 을 보존한다.
// 백엔드 LocalDateTime(timezone-naive) 과 클라이언트 `<input type="datetime-local">`
// 사이의 변환은 모두 KST 등 사용자 로컬 기준으로 이뤄져야 하며, `new Date(...).toISOString()`
// 을 거치면 9시간 어긋난다. 본 모듈은 SlotPatternForm / InterviewConfigSection /
// SlotPreviewList / ManagementSlotCard / generateSlotsFromPattern 가 공용으로 사용한다.

// `<input type="datetime-local" min={...}>` 비교용 — 현재 로컬 시각의 `YYYY-MM-DDTHH:mm`.
export function nowLocalInputValue(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

// datetime-local 값 또는 백엔드 LocalDateTime(`Z`/오프셋 포함 가능) 을 wall-clock 컴포넌트로 분해한다.
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

// Date 객체를 백엔드 LocalDateTime 포맷 `YYYY-MM-DDTHH:mm:ss` 로 직렬화.
export function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// 백엔드 LocalDateTime / datetime-local 값을 사용자용 한국어 일시(`M월 D일 HH:mm`) 로 포맷.
// SlotPreviewList 의 단일 표시용. 매치 실패 시 원본 그대로 반환.
export function formatSlotMoment(value: string): string {
  const parts = parseLocalDateTime(value);
  if (!parts) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.month}월 ${parts.day}일 ${pad(parts.hour)}:${pad(parts.minute)}`;
}

// 시작/종료 한 쌍을 한국어 range 로 포맷 — ManagementSlotCard 용.
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
