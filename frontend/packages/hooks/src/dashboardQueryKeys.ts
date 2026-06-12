// 대시보드 카드용 쿼리키. 모집/라운드/통계 등 하위 데이터는 기존 도메인 키를 재사용하고,
// 여기서는 카드5 카운트(공지·이벤트 집계)처럼 대시보드 전용 합성 쿼리에만 사용한다.
export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  feedCounts: (clubId: number) => [...dashboardQueryKeys.all, clubId, 'feed-counts'] as const,
  todayEvents: (clubId: number, day: string) =>
    [...dashboardQueryKeys.all, clubId, 'today-events', day] as const,
};
