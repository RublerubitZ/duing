import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/app/_lib/site';

/**
 * 검색엔진 크롤러 규칙 (App Router 규약: app/robots.ts → /robots.txt).
 *
 * 공개 페이지는 허용하고, 로그인·개인(마이)·운영자(관리/동아리 관리)·신청 폼·에러 화면 등
 * 색인 가치가 없거나 인증이 필요한 경로는 차단한다. sitemap 위치를 함께 알려 색인 진입점을 제공한다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin', // 운영자 콘솔
        '/manage', // 동아리 운영(회장) 콘솔
        '/me', // 마이페이지(개인)
        '/apply', // 모집 지원 폼(인증 필요)
        '/notifications', // 개인 알림
        '/login',
        '/signup',
        '/403', // 권한 없음 화면
        '/clubs/*/member', // 동아리 멤버 전용 영역 (목록/상세는 공개라 /clubs 자체는 허용)
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
