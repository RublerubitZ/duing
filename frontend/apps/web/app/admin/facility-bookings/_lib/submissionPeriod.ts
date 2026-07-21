// 제출 준비 기본 조회 기간 = 이번 달 1일~말일(≤31일이라 항상 유효) — 월간 제출 업무 단위(스펙 v3).
// 워크플로 탭 건수(셸)와 준비 탭이 같은 기본값을 공유해야 React Query 캐시가 하나로 합쳐진다.

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function currentMonthRange(): { startDate: string; endDate: string } {
  const today = new Date();
  return {
    startDate: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: toIso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}
