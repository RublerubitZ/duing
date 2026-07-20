// 백엔드 시각 필드의 두 가지 직렬화 형태를 구분하기 위한 문서화용 별칭.
// 런타임 구분은 없다(둘 다 string) — 파싱은 @duing/hooks 의 parseKstInstant 가 흡수한다.

/**
 * Event Time(발생 시각) — 오프셋 포함 절대시각 문자열.
 * 예: `2026-07-20T04:07:00Z`, `2026-07-20T13:07:00+09:00`
 * createdAt / submittedAt / paidAt 등. 구버전 백엔드는 오프셋 없이 줄 수 있다(KST로 간주).
 */
export type IsoInstantString = string;

/**
 * Schedule Time(예정 시각) — 오프셋 없는 KST 벽시계 문자열.
 * 예: `2026-07-20T18:00:00`, date-only `2026-07-20`
 * 행사 startAt/endAt, 면접 슬롯, 공지 노출 종료 등. 항상 +09:00 으로 해석한다.
 */
export type KstWallClockString = string;
