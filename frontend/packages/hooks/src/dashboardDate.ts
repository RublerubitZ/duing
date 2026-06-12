// KST(Asia/Seoul) 기준 날짜 유틸. now를 인자로 받아 순수성을 유지한다.

const KST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** ISO datetime 또는 'YYYY-MM-DD'를 KST 'YYYY-MM-DD'로 변환 */
export function kstDateString(iso: string): string {
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00+09:00`) : new Date(iso);
  return KST_FORMATTER.format(date);
}

export function todayKstDateString(now: Date): string {
  return KST_FORMATTER.format(now);
}

export function isTodayKst(iso: string, now: Date): boolean {
  return kstDateString(iso) === todayKstDateString(now);
}

/** KST 캘린더 기준 (target - today) 일수. 양수면 미래, 음수면 경과 */
export function daysUntilKst(targetIso: string, now: Date): number {
  const targetMs = Date.parse(`${kstDateString(targetIso)}T00:00:00Z`);
  const todayMs = Date.parse(`${todayKstDateString(now)}T00:00:00Z`);
  return Math.round((targetMs - todayMs) / 86_400_000);
}
