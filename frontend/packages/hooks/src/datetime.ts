// KST(Asia/Seoul) 고정 날짜/시간 표시 유틸. 파싱은 parseKstInstant 규칙을 따른다.
// - Event Time(발생 시각): 오프셋 포함 절대시각(`…Z`) → KST로 변환해 표시
// - Schedule Time(예정 시각): 오프셋 없는 KST 벽시계 문자열 → +09:00으로 간주해 그대로 표시
// Invalid 입력은 빈 화면 대신 원문을 그대로 반환한다(디버깅 흔적 유지).

import { parseKstInstant } from './dashboardDate';

// 서버 컴포넌트는 배럴(클라이언트 훅 포함) 대신 이 모듈(@duing/hooks/datetime)을 임포트한다.
export { parseKstInstant, daysUntilKst, kstDateString, isTodayKst, todayKstDateString } from './dashboardDate';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

// 연·월·일·시·분을 한 번에 뽑아 세 포맷 함수가 공유한다. hourCycle h23으로 자정=00시 보장.
const KST_PARTS_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function kstPartValue(
  formattedParts: Intl.DateTimeFormatPart[],
  partType: Intl.DateTimeFormatPartTypes,
): string {
  return formattedParts.find((part) => part.type === partType)?.value ?? '';
}

/** ISO 문자열을 KST `2026.07.20 23:30` 형태로. Invalid 입력은 원문 반환 */
export function formatDateTimeKst(iso: string): string {
  const parsed = parseKstInstant(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const formattedParts = KST_PARTS_FORMATTER.formatToParts(parsed);
  const datePart = `${kstPartValue(formattedParts, 'year')}.${kstPartValue(formattedParts, 'month')}.${kstPartValue(formattedParts, 'day')}`;
  const timePart = `${kstPartValue(formattedParts, 'hour')}:${kstPartValue(formattedParts, 'minute')}`;
  return `${datePart} ${timePart}`;
}

/** ISO 문자열을 KST `2026.07.20` 형태로. Invalid 입력은 원문 반환 */
export function formatDateKst(iso: string): string {
  const parsed = parseKstInstant(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const formattedParts = KST_PARTS_FORMATTER.formatToParts(parsed);
  return `${kstPartValue(formattedParts, 'year')}.${kstPartValue(formattedParts, 'month')}.${kstPartValue(formattedParts, 'day')}`;
}

/** ISO 문자열을 KST `23:30` 형태로. Invalid 입력은 원문 반환 */
export function formatTimeKst(iso: string): string {
  const parsed = parseKstInstant(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  const formattedParts = KST_PARTS_FORMATTER.formatToParts(parsed);
  return `${kstPartValue(formattedParts, 'hour')}:${kstPartValue(formattedParts, 'minute')}`;
}

/**
 * now 기준 상대 표기: 방금 전 · N분 전 · N시간 전 · N일 전, 7일 이상은 `2026.07.20` 날짜 폴백.
 * 미래 시각(서버 시계 편차)은 "방금 전", Invalid 입력은 원문 반환.
 * now 를 주입하면 결정적으로 테스트할 수 있다(기본값은 현재 시각).
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const occurred = parseKstInstant(iso);
  if (Number.isNaN(occurred.getTime())) return iso;
  const elapsedMs = now.getTime() - occurred.getTime();
  if (elapsedMs < MINUTE_MS) return '방금 전';
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}분 전`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}시간 전`;
  if (elapsedMs < WEEK_MS) return `${Math.floor(elapsedMs / DAY_MS)}일 전`;
  return formatDateKst(iso);
}

/**
 * 특수 포맷 화면(요일 포함 등)용 탈출구: timeZone 만 Asia/Seoul 로 고정한 ko-KR 포맷터.
 * 포맷터 인스턴스 생성 비용이 있으니 호출부에서 모듈 레벨 상수로 재사용할 것.
 */
export function kstDateTimeFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('ko-KR', { ...options, timeZone: 'Asia/Seoul' });
}
