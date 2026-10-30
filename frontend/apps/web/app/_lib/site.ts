/**
 * 사이트 절대 베이스 URL — sitemap.xml / robots.txt 의 절대 경로 생성에 사용한다.
 *
 * NEXT_PUBLIC_SITE_URL 미설정 시 운영 도메인(https://duings.com)으로 폴백하므로
 * Vercel 환경변수 누락이어도 운영 빌드는 정상 동작한다. 끝 슬래시는 제거해
 * `${SITE_URL}/sitemap.xml` 처럼 이어붙일 때 슬래시 중복(`//`)을 방지한다.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://duings.com').replace(/\/$/, '');

/**
 * 사이트 기본 제목 — 루트 레이아웃 메타데이터의 title 이다. E2E(clubs-native-back)도 이 상수를 상대 경로로 불러와 기본 제목을
 * 알리지 않는지 보므로, 이 파일에는 Next·React 전용 import 를 두지 않는다(레이아웃 파일은 임의 export 가 Next 타입 검사에 걸린다).
 * 같은 이유로 `@/` 별칭 import 도 두지 않는다 — Playwright 변환의 별칭 해석에 기대지 않는다.
 */
export const SITE_TITLE = '두잉 | 대구대학교 동아리 플랫폼';
