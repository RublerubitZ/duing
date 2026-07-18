import { createApiClient } from '@duing/api';
import type { ClubSummary, FederationFaqItem } from '@duing/types';
import {
  FALLBACK_BANNERS,
  fallbackBannerToSlide,
  promotionToSlide,
  type CarouselSlide,
} from './promotion';
import { resolveApiBaseUrl } from './apiBaseUrl';

const apiBaseUrl = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);

function client() {
  return createApiClient({
    baseUrl: apiBaseUrl,
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

/** HomeQnaSection 용: 총동연 FAQ 상위 size 건(고정·정렬 순은 백엔드 sortOrder 를 따른다). */
export async function fetchFederationFaqHighlights(size: number): Promise<FederationFaqItem[]> {
  try {
    const page = await client().federationFaqs.list({ page: 0, size });
    return page.content;
  } catch (error) {
    logBackendUnavailable('fetchFederationFaqHighlights', error);
    return []; // BE 다운 시 홈 섹션 자체를 숨긴다(코드 버그로 오인 방지 — RecruitmentTicker 동일)
  }
}

/**
 * BannerCarousel 용: 공개 활성 프로모션 슬라이드.
 * DB 가 비었거나 백엔드 장애 시 정적 폴백 배너를 반환해 홈 레이아웃 깨짐을 방지한다.
 */
export async function fetchPublicPromotionSlides(): Promise<CarouselSlide[]> {
  try {
    const page = await client().promotions.list();
    if (page.content.length > 0) {
      return page.content.map(promotionToSlide);
    }
  } catch (error) {
    logBackendUnavailable('fetchPublicPromotionSlides', error);
  }
  return FALLBACK_BANNERS.map(fallbackBannerToSlide);
}
