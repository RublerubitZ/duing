import { useQuery } from '@tanstack/react-query';
import { useApiClient } from './api-context';
import { adminQueryKeys } from './adminQueryKeys';
import { retryUnlessStatuses } from './retry';

/** 400(주 범위 밖)·404(옛 백엔드)는 다시 받아도 같다 — 바로 구역 실패로 그린다. */
const retryWeeklyBriefing = retryUnlessStatuses(400, 404);

/**
 * 주간 브리핑 '한 주 돌아보기' 지표. 주가 바뀌면 키가 바뀌어 새로 받는다 — 이전 주 숫자를 새 기간 아래 남기지 않도록
 * placeholderData 를 두지 않는다. 가장 최근에 끝난 주는 월 00:01 하루 끝 기록 전후로 값이 바뀌어 staleTime 0 이다.
 * staleTime 을 undefined 로 넘기면 전역 기본값(30초)까지 덮이므로 최근 주일 때만 펼쳐 넣는다.
 */
export function useAdminWeeklyBriefingQuery(
  weekStart: string,
  options: { enabled?: boolean; isLatestWeek?: boolean } = {},
) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.weeklyBriefing(weekStart),
    queryFn: () => client.admin.weeklyBriefing(weekStart),
    enabled: options.enabled ?? true,
    retry: retryWeeklyBriefing,
    ...(options.isLatestWeek ? { staleTime: 0 } : {}),
  });
}

/** 주간 브리핑 시설 히트맵 — 한 주 돌아보기(고른 주)와 이번 주 챙길 것(서버가 정한 이번 주) 두 곳이 쓴다. */
export function useAdminWeeklyFacilityHeatmapQuery(weekStart: string, options: { enabled?: boolean } = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.weeklyFacilityHeatmap(weekStart),
    queryFn: () => client.admin.weeklyFacilityHeatmap(weekStart),
    enabled: options.enabled ?? true,
    retry: retryWeeklyBriefing,
  });
}

/** 이번 주 모집 기간이 끝나는 모집 — 응답의 weekStart 가 둘째 구역의 '이번 주'다(기기 시계 대신 서버 주). */
export function useAdminClosingRecruitmentsQuery(options: { enabled?: boolean } = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: adminQueryKeys.closingRecruitments(),
    queryFn: () => client.admin.closingRecruitments(),
    enabled: options.enabled ?? true,
    retry: retryWeeklyBriefing,
  });
}
