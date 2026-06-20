/**
 * 사이트 절대 베이스 URL — sitemap.xml / robots.txt 의 절대 경로 생성에 사용한다.
 *
 * NEXT_PUBLIC_SITE_URL 미설정 시 운영 도메인(https://duings.com)으로 폴백하므로
 * Vercel 환경변수 누락이어도 운영 빌드는 정상 동작한다. 끝 슬래시는 제거해
 * `${SITE_URL}/sitemap.xml` 처럼 이어붙일 때 슬래시 중복(`//`)을 방지한다.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://duings.com').replace(/\/$/, '');
