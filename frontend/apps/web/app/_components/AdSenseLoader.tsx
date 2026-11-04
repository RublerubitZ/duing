'use client';

import { useRoutePathname } from '@/app/_lib/useRoutePathname';

import { AdSenseScript } from './AdSenseScript';

/**
 * 레이아웃이 광고 로더를 싣는 공개 화면 — 경로만으로 게시자 콘텐츠가 있다고 말할 수 있는 곳(홈·목록·서비스 소개·약관·FAQ)이다.
 * 정확히 일치해야 하고 나머지는 전부 거부(기본 거부)다.
 * - 동아리·소식 상세(`/clubs/<id>`·`/notices/<id>`)는 여기 없다 — 같은 경로가 없는·숨긴·삭제된 자원의 noindex 셸이 되기도
 *   하고 동아리 상세는 소개 한 줄뿐인 곳도 많아서, 서버 조회 결과를 아는 page.tsx 가 콘텐츠가 있을 때만 <AdSenseScript /> 를 싣는다.
 * - 예약 현황(`/facilities`)·캠퍼스 일정(`/calendar`)은 도구 화면이라 뺐다.
 * 애드센스는 게시자 콘텐츠가 없거나 가치가 낮은 화면, 오류·탐색·행동 목적 화면의 광고를 금지한다(Google 게시자 정책
 * "게시자 콘텐츠가 없는 화면에 Google 게재 광고"). `/faq` 는 서버가 질문·답변을 초기 HTML 에 그린다(24시간 ISR) — 공개 FAQ 를
 * 0건으로 만들면 다시 뺀다.
 */
const ALLOWED_PATHS: ReadonlySet<string> = new Set(['/', '/clubs', '/notices', '/introduce', '/terms', '/faq']);

/** 레이아웃이 광고 로더를 실을 경로인지 — 정확 일치만 본다(`/clubs/1`·`/clubsecret` 은 거부). */
export function isAdSenseAllowedPath(pathname: string): boolean {
  return ALLOWED_PATHS.has(pathname);
}

/**
 * Google AdSense 사이트 확인·광고 로더(루트 레이아웃 head).
 *
 * <p>개인정보가 보이는 화면(`/me`·`/manage`·`/admin`·`/apply`·`/notifications`·인증·`/join`·`/clubs/{id}/member/**`)과
 * 콘텐츠가 없는 도구·빈 화면의 문서에는 광고 스크립트를 붙이지 않는다. 상세는 page.tsx 가 판단한다(위 허용 목록 주석).
 *
 * <p>경로 판정은 `useRoutePathname()` — ISR 재생성 중 `/index` 를 `/` 로 접어 hydration mismatch 를 막는다.
 *
 * <p>런타임 한계(소프트 이동): 한 번 로드된 로더는 문서에 남는다 — 공개 화면을 거친 뒤 클라이언트 내비게이션으로 `/manage` 나
 * 얇은 상세에 들어가도 그대로다. 반대로 인터셉트 모달로 연 동아리 상세는 서버 데이터가 없는 셸이라 로더를 새로 싣지 않는다.
 * 크롤러는 하드 로드만 하므로 이 컴포넌트와 상세 page.tsx 가 막는 것은 그런 화면의 <b>최초 문서 로드</b>다.
 */
export function AdSenseLoader() {
  const pathname = useRoutePathname();
  if (!isAdSenseAllowedPath(pathname)) return null;
  return <AdSenseScript />;
}
