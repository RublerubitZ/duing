import { createApiClient } from '@duing/api';
import { resolveApiBaseUrl } from './apiBaseUrl';
import type { HeroActivity } from '@/app/_components/sections/hero-activity';

// 홈 히어로 활동 토스트용 — 공개 활동 피드 상위 2건을 조회해 HeroActivity[] 로 매핑한다.
// 백엔드 호출 실패 시 빈 배열을 반환한다(호출부 resolveHeroToasts 가 폴백 토스트로 채운다).
const HERO_ACTIVITY_LIMIT = 2;
const apiBaseUrl = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);

export async function fetchPublicActivities(): Promise<HeroActivity[]> {
  const client = createApiClient({
    baseUrl: apiBaseUrl,
  });
  try {
    const feed = await client.publicActivities.list({ limit: HERO_ACTIVITY_LIMIT });
    return feed.items.map((item) => ({
      type: item.type,
      clubName: item.clubName,
      occurredAt: item.occurredAt,
    }));
  } catch {
    return [];
  }
}
