'use client';

import { usePathname } from 'next/navigation';

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
 * 프리렌더(정적·ISR) 라우트에서 렌더되는 컴포넌트는 `usePathname()` 대신 이 훅을 쓸 것.
 */
export function useRoutePathname(): string {
  const pathname = usePathname();
  return pathname === '/index' ? '/' : pathname;
}
