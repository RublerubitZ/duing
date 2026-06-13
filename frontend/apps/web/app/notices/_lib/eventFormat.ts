// 백엔드 LocalDateTime(타임존 없는 'YYYY-MM-DDTHH:mm:ss')을 클라이언트 로컬 시각으로 해석해 표시한다.
// 'Z'/오프셋이 붙은 문자열이 들어오면 로컬로 변환되므로, 백엔드 직렬화 계약(타임존 없음)이 바뀌면 재검토.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parts(iso: string): { date: string; time: string } {
  const value = new Date(iso);
  const date = `${value.getMonth() + 1}.${value.getDate()}(${WEEKDAYS[value.getDay()] ?? ''})`;
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return { date, time: `${hours}:${minutes}` };
}

export function formatEventRange(startAt: string, endAt: string | null): string {
  const start = parts(startAt);
  if (!endAt) return `${start.date} ${start.time}`;
  const end = parts(endAt);
  if (start.date === end.date) return `${start.date} ${start.time}–${end.time}`;
  return `${start.date} ~ ${end.date} · ${start.time}–${end.time}`;
}

export function formatDdayLabel(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs < 0) return '마감';
  const days = Math.ceil(diffMs / 86_400_000);
  if (days === 0) return 'D-DAY';
  return `D-${days}`;
}

export function formatPublishedDate(iso: string): string {
  const value = new Date(iso);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}.${month}.${day}`;
}
