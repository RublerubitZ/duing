import { createApiClient } from '@duing/api';
import type { ClubSummary } from '@duing/types';

function client() {
  return createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  });
}

/** FeaturedClubs 용: 현재 모집 중인 동아리를 인기순으로 size 만큼. */
export async function fetchPopularClubs(size: number): Promise<ClubSummary[]> {
  const page = await client().clubs.list({
    sort: 'POPULAR',
    recruitmentStatus: 'AVAILABLE',
    size,
  });
  return page.content;
}

/** RecruitmentTicker 용: 마감 임박순 모집 중 동아리, 상시모집(endDate=null) 은 제거. */
export async function fetchUpcomingDeadlineClubs(size: number): Promise<ClubSummary[]> {
  const page = await client().clubs.list({
    sort: 'DEADLINE_SOON',
    recruitmentStatus: 'AVAILABLE',
    size,
  });
  return page.content.filter((club) => club.activeRecruitment?.endDate != null);
}
