import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/app/_lib/site';

/**
 * 검색엔진 색인용 sitemap.xml 생성 (App Router 규약: app/sitemap.ts → /sitemap.xml).
 *
 * 공개·정적 라우트만 명시한다. 동아리/공지 상세(`/clubs/[id]`, `/notices/[id]`)는
 * 빌드 시점에 백엔드 목록 fetch 가 필요한데, 운영에서 Cloudflare 가 Vercel 서버(데이터센터)
 * 요청을 봇 챌린지로 막아 403 이 날 수 있어 sitemap 생성이 불안정해진다. 대신 검색엔진이
 * `/clubs`·`/notices` 목록 페이지에서 링크를 따라 상세를 크롤링하도록 둔다(내부 링크 기반 발견).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // 모든 정적 페이지의 lastModified 는 마지막 배포 시각으로 통일한다(빌드 시 1회 평가).
  const lastModified = new Date();

  const routes: Array<{
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

  return routes.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
