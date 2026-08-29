import { fetchPublicPromotionSlides } from '@/app/_lib/home-data';
import { BannerCarouselClient } from './BannerCarouselClient';

/**
 * 공개 프로모션 배너 섹션 (서버 컴포넌트).
 *
 * SSR 시점에 슬라이드를 미리 fetch 해서 HTML 에 실데이터를 박는다.
 * 다른 홈 섹션(HomeHero/InterestingClubs/RecruitmentTicker) 과 동일한 패턴이며,
 * mock fallback 도 서버에서 결정되므로 hydration 직후 "목업 → 실데이터" 깜빡임이 없다.
 *
 * 캐러셀 UI 상태(activeIndex/isPlaying/transition) 는 BannerCarouselClient 가 담당.
 */
export async function BannerCarousel() {
  const slides = await fetchPublicPromotionSlides();
  if (slides.length === 0) return null;
  return <BannerCarouselClient slides={slides} />;
}
