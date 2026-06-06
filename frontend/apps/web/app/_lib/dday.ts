/**
 * YYYY-MM-DD 형식 endDate 와 today 의 d-Day 표기.
 *
 * TODO(timezone): 현재 서버/런타임 로컬 타임존 기준으로 계산된다. 서비스가 KST 고정이고
 * 서버가 UTC 로 배포되면 자정 경계에서 1일 어긋날 수 있다. 프로젝트 전체 날짜 처리 정책과
 * 함께 별도 이슈로 검토 — 본 PR 의 mock 제거 범위에서는 변경하지 않는다.
 */
export function computeDday(endDate: string, today: Date): string {
  const end = new Date(`${endDate}T00:00:00`);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((end.getTime() - todayMidnight.getTime()) / 86_400_000);
  if (diff === 0) return 'D-day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}
