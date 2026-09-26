'use client';

import { usePathname, useSelectedLayoutSegment } from 'next/navigation';

const NOT_FOUND_SEGMENT = '/_not-found';

/**
 * Vercel ISR 재생성 중에는 `usePathname()` 이 공개 경로(`/`) 가 아니라 Next 내부 페이지 경로
 * (`/index`) 를 돌려준다. 빌드타임 프리렌더와 브라우저에서는 `/` 라, 이 값으로 렌더를 가르는
 * 컴포넌트는 재생성된 HTML 과 클라이언트 첫 렌더가 갈려 hydration mismatch(React #418)가 난다.
 *
 * 실측(2026-08-10, preview 배포에 프로브를 얹어 확인):
 *   빌드타임 프리렌더 → "/"      · BottomNav 렌더됨
 *   런타임 ISR 재생성 → "/index" · BottomNav 사라짐 → 매 로드 #418
 *
 * `/index` 는 이 앱에 존재하지 않는 라우트라 `/` 로 접는 것이 안전하다.
 *
 * 트레일링 슬래시도 같은 이유로 접는다 — `skipTrailingSlashRedirect: true`(PostHog 프록시,
 * #750) 때문에 `/clubs/53/` 이 리다이렉트 없이 그대로 서빙되는데, 프리렌더 셸은 무슬래시
 * 경로로 렌더돼 있어 브라우저의 `usePathname()`(`/clubs/53/`)과 갈린다. BottomNav 처럼
 * 경로로 구조를 가르는 컴포넌트는 이 차이만으로 매 로드 #418 이 났다(2026-08-20 실측).
 *
 * 전역 404 도 같은 이유로 접는다 — 모든 404(미들웨어 rewrite 포함)는 빌드 때 `/_not-found` 경로로
 * 프리렌더한 HTML 한 장으로 응답하는데, 브라우저의 `usePathname()` 은 실제 주소(`/me/no-such`)다.
 * 그래서 BottomNav·AdSenseLoader 처럼 경로로 구조를 가르는 루트 레이아웃 컴포넌트가 탭 경로 아래
 * 404 에서 매번 #418 을 냈다(2026-09-26 실측, Next 15·16 동일). 라우터 트리의 세그먼트는 서버·브라우저
 * 모두 `/_not-found` 라(Next 전역 404 세그먼트 키, next/dist/shared/lib/segment.js NOT_FOUND_SEGMENT_KEY)
 * 그걸 보고 서버와 같은 값을 돌려준다. `_` 로 시작하는 폴더는 라우트가 될 수 없어 정상 페이지에서 이
 * 세그먼트가 나올 일은 없다. 이 값은 루트 레이아웃 직속 컴포넌트에서만 보인다 — not-found.tsx·페이지 안에서
 * 부르면 `useSelectedLayoutSegment()` 가 null 이라 실제 주소가 돌아온다.
 *
 * 프리렌더(정적·ISR) 라우트에서 렌더되는 컴포넌트는 `usePathname()` 대신 이 훅을 쓸 것. 이 훅에 닿는 컴포넌트를
 * 렌더하는 테스트는 `next/navigation` 모킹에 `useSelectedLayoutSegment` 도 넣어야 한다.
 */
export function useRoutePathname(): string {
  const pathname = usePathname();
  const selectedSegment = useSelectedLayoutSegment();
  if (selectedSegment === NOT_FOUND_SEGMENT) return NOT_FOUND_SEGMENT;
  // 슬래시를 먼저 접는다 — '/index/' 같은 합성 케이스도 '/index' 로 수렴한 뒤 '/' 로 접힌다.
  const collapsed =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') || '/' : pathname;
  return collapsed === '/index' ? '/' : collapsed;
}
