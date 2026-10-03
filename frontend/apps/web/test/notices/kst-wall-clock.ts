// 소식 expiresAt 은 오프셋 없는 KST 벽시계 문자열이다 — 지금 KST 시각에서 offsetMs 만큼 옮긴 값을 같은 형식으로 만든다.
// 실행 환경 시간대와 무관하다(UTC 시각에 9시간을 더한 ISO 문자열에서 Z 를 뗀다).
export function kstWallClock(offsetMs: number): string {
  return new Date(Date.now() + offsetMs + 9 * 3_600_000).toISOString().slice(0, 19);
}
