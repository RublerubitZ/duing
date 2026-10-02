import type { MetadataRoute } from 'next';

import { fetchActiveClubIds } from '@/app/_lib/public-content';
import { SITE_URL } from '@/app/_lib/site';

/**
 * 검색엔진 색인용 sitemap.xml 생성 (App Router 규약: app/sitemap.ts → /sitemap.xml).
 *
 * 공개 정적 라우트와 공개(ACTIVE) 동아리 상세를 담는다. 동아리 상세는 24시간 ISR 로 본문이 초기 HTML 에
 * 들어가므로 색인 대상으로 제출한다 — 상세 URL 은 그 상세가 서버 렌더될 때만 넣는다(빈 셸을 제출하면 얇은
 * 콘텐츠 신호가 강해진다). 소식 상세는 아직 셸이라 넣지 않는다.
 * 24시간마다 다시 만들어 새 동아리가 하루 안에 들어간다. 빌드 국면 장애면 정적 경로만, 런타임 장애는 throw 해
 * 직전 사이트맵을 유지한다(public-content.ts).
 * 갱신 시각(lastModified)은 넣지 않는다 — 정확한 값이 없고, 재생성 시각을 넣으면 매일 바뀐 것처럼 보인다.
 */
export const revalidate = 86400;

const STATIC_ROUTES: ReadonlyArray<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/clubs', changeFrequency: 'daily', priority: 0.9 },
  { path: '/notices', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/calendar', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/introduce', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
  const clubIds = (await fetchActiveClubIds()) ?? [];
  const clubEntries = clubIds.map((clubId) => ({
    url: `${SITE_URL}/clubs/${clubId}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));
  return [...staticEntries, ...clubEntries];
}
