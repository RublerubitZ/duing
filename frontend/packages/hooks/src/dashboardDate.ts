// KST(Asia/Seoul) 기준 날짜 유틸. now를 인자로 받아 순수성을 유지한다.

const KST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function hasZoneOffset(iso: string): boolean {
  return /[zZ]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso);
}

/**
 * 백엔드(Spring)가 반환하는 offset 없는 LocalDateTime 문자열을 KST instant로 파싱한다.
 * - 날짜만(length 10): `YYYY-MM-DD` → `YYYY-MM-DDT00:00:00+09:00`
 * - offset 없는 datetime: `YYYY-MM-DDTHH:mm:ss` → `...+09:00` (KST로 간주)
 * - 이미 Z 또는 offset 포함: 그대로 파싱
 */
export function parseKstInstant(iso: string): Date {
  if (iso.length === 10) return new Date(`${iso}T00:00:00+09:00`);
  if (!hasZoneOffset(iso)) return new Date(`${iso}+09:00`);
  return new Date(iso);
}

/** ISO datetime 또는 'YYYY-MM-DD'를 KST 'YYYY-MM-DD'로 변환 */
export function kstDateString(iso: string): string {
  return KST_FORMATTER.format(parseKstInstant(iso));
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
