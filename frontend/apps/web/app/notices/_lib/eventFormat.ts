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
  const days = Math.ceil(diffMs / 86_400_000);
  if (days < 0) return '마감';
  if (days === 0) return 'D-DAY';
  return `D-${days}`;
}

export function formatPublishedDate(iso: string): string {
  const value = new Date(iso);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}.${month}.${day}`;
}
