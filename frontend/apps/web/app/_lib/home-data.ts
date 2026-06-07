import { createApiClient } from '@duing/api';
import type { ClubSummary } from '@duing/types';

function client() {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  });
}

// 백엔드 미가동/장애 시에도 홈을 500 없이 렌더하기 위한 폴백.
// Server Component 에서 호출되므로, 네트워크 실패는 빈 배열로 swallow 한다.
function logBackendUnavailable(scope: string, error: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[home-data] ${scope} 백엔드 호출 실패 — 빈 결과로 폴백`, error);
  }
}

/** FeaturedClubs 용: 현재 모집 중인 동아리를 인기순으로 size 만큼. */
export async function fetchPopularClubs(size: number): Promise<ClubSummary[]> {
  try {
    const page = await client().clubs.list({
      sort: 'POPULAR',
      recruitmentStatus: 'AVAILABLE',
      size,
    });
    return page.content;
  } catch (error) {
    logBackendUnavailable('fetchPopularClubs', error);
    return [];
  }
}

/** RecruitmentTicker 용: 마감 임박순 모집 중 동아리, 상시모집(endDate=null) 은 제거. */
export async function fetchUpcomingDeadlineClubs(size: number): Promise<ClubSummary[]> {
  try {
    const page = await client().clubs.list({
      sort: 'DEADLINE_SOON',
      recruitmentStatus: 'AVAILABLE',
      size,
    });
    return page.content.filter((club) => club.activeRecruitment?.endDate != null);
  } catch (error) {
    logBackendUnavailable('fetchUpcomingDeadlineClubs', error);
    return [];
  }
}
