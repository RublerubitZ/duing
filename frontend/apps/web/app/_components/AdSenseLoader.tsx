'use client';

import { useRoutePathname } from '@/app/_lib/useRoutePathname';

/**
 * 광고 로더를 실을 공개 화면 — 게시자 콘텐츠(동아리 소개·소식·서비스 소개·약관)가 있는 곳만 둔다.
 * 여기 없는 경로는 전부 거부(기본 거부)다. 예약 현황(`/facilities`)·캠퍼스 일정(`/calendar`)은 도구 화면이고
 * `/faq` 는 등록된 질문이 0건이라 뺐다 — 애드센스는 게시자 콘텐츠가 없거나 탐색·행동 목적인 화면의 광고를
 * 금지한다(Google 게시자 정책 "게시자 콘텐츠가 없는 화면에 Google 게재 광고"). FAQ 를 채우면 다시 넣는다.
 */
const ALLOWED_PREFIXES = ['/clubs', '/notices', '/introduce', '/terms'] as const;

/** 동아리 부원 전용 영역(공지·일정) — `/clubs` 허용 프리픽스 안에 있지만 MemberAccessGuard 뒤 회원 전용이다. */
const MEMBER_AREA_PATTERN = /^\/clubs\/[^/]+\/member(\/|$)/;

/**
 * 광고 로더를 실을 공개 콘텐츠 화면인지 판정한다 — 프리픽스는 세그먼트 경계까지 맞아야 한다(`/clubsecret` 은 거부).
 */
export function isAdSenseAllowedPath(pathname: string): boolean {
  if (MEMBER_AREA_PATTERN.test(pathname)) return false;
  if (pathname === '/') return true;
  return ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Google AdSense 사이트 확인·광고 로더.
 *
 * <p>게시자 콘텐츠가 있는 공개 화면에서만 싣는다 — 개인정보가 보이는 화면(`/me`·`/manage`·`/admin`·`/apply`·
 * `/notifications`·인증·`/join`·`/clubs/{id}/member/**`)과 콘텐츠가 없는 도구 화면의 문서에는 광고 스크립트를 붙이지 않는다.
 *
 * <p>구글 안내가 "각 페이지의 &lt;head&gt; 안"을 요구하므로 next/script(body 주입)가 아니라 평문
 * 태그를 그대로 반환한다. React 19 는 `<script async src>` 를 어디서 렌더하든 head 로 호이스팅하고
 * SSR HTML 의 head 에 직렬화하므로, 크롤러는 허용 경로의 초기 HTML 에서 그대로 읽는다(#1126 요건).
 * async 라 렌더 비차단이고, client ID 는 공개 식별자(시크릿 아님)다.
 *
 * <p>경로 판정은 `useRoutePathname()` — ISR 재생성 중 `/index` 를 `/` 로 접어 hydration mismatch 를 막는다.
 *
 * <p>런타임 한계: 공개 화면을 먼저 거친 뒤 클라이언트 내비게이션으로 `/manage` 에 들어가면 로더는
 * 이미 로드돼 있다. 이 컴포넌트가 막는 것은 개인정보 화면의 <b>최초 문서 로드</b>와 그 이후 내비게이션이다.
 */
export function AdSenseLoader() {
  const pathname = useRoutePathname();
  if (!isAdSenseAllowedPath(pathname)) return null;
  return (
    <script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3402309590379365"
      crossOrigin="anonymous"
    />
  );
}
