'use client';

import { useEffect, useRef, useState } from 'react';

import { ROUTER_REFRESH_EVENT } from '@/app/_lib/useGuardedRouter';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

type Props = {
  /** 지금 커밋이 인터셉트 상세인지 — ClubsSlotFrame 의 판별 값. */
  intercepted: boolean;
};

/**
 * 동아리 라우트 공지 영역(스펙 P1 §3.6) — Next 라우트 공지기(AppRouterAnnouncer)가 놓치는 인터셉트 전환만 화면 읽기에 알린다.
 * Next 공지기는 트리가 바뀐 커밋에서만 document.title 을 읽고 직전에 읽은 값과 다를 때만 읽어 준다. 인터셉트 뒤 head 는 목록 것이
 * 남아, 데이터가 커밋 뒤에 오는 진입(늦은 진입·키보드)은 앞으로도 뒤로도 침묵한다. 그래서 Next 가 마지막으로 읽은 제목(nextTitle)을
 * 따라가며 그 두 전환만 알린다.
 * - nextTitle 갱신: 경로가 바뀐 커밋의 effect(ClubsSlotFrame 의 마지막 자식이라 같은 커밋의 상세 제목 effect 뒤·Next 공지기 앞),
 *   주소가 그대로인 popstate(오버레이 닫기 — Next 가 트리를 복원하며 다시 읽는다), refresh 신호(로그아웃 등). 로그아웃으로 상세
 *   쿼리를 다시 받아도 상세 제목은 그대로라(스펙 §3.6 재로딩 중 제목 유지) 신호 때 읽은 값이 Next 가 refresh 커밋에서 읽을 값과 같다.
 * - (a) 인터셉트 동안 제목이 nextTitle 과 다른 값으로 바뀌면(데이터 도착) 그 제목을 알린다 — <head> 를 그동안만 관찰한다.
 * - (b) 인터셉트에서 나오는 커밋에서 제목이 nextTitle 과 같으면(Next 침묵) 그 제목을 알린다. 다르면 Next 몫이다.
 * - 경로가 바뀐 커밋마다 영역을 비운다 — 같은 문구가 이어져도 새 내용으로 읽힌다.
 * role="status" 가 암묵적 polite 라이브 영역이라 aria-live 는 겹쳐 적지 않는다. 경로는 effect 의존성으로만 쓴다(ISR 라우트 규약 —
 * 렌더 결과는 경로에 기대지 않는다).
 */
export function ClubsRouteAnnouncer({ intercepted }: Props) {
  const pathname = useRoutePathname();
  const [announcement, setAnnouncement] = useState('');
  const nextTitleRef = useRef<string | null>(null);
  // 마지막 경로 커밋 때의 location.pathname — popstate 가 주소를 바꾸는지 가른다.
  const committedLocationPathnameRef = useRef<string | null>(null);
  const wasInterceptedRef = useRef(false);

  useEffect(() => {
    const title = document.title;
    const leavesIntercept = wasInterceptedRef.current && !intercepted;
    setAnnouncement(leavesIntercept && title === nextTitleRef.current ? title : '');
    nextTitleRef.current = title;
    committedLocationPathnameRef.current = window.location.pathname;
    wasInterceptedRef.current = intercepted;
  }, [pathname, intercepted]);

  useEffect(() => {
    if (!intercepted) return;
    const observer = new MutationObserver(() => {
      const title = document.title;
      if (title !== nextTitleRef.current) setAnnouncement(title);
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    // 나가는 커밋에서 끊으면 대기 중이던 기록(상세 언마운트의 제목 복원)도 버려진다 — 복원을 (a) 로 잘못 알리지 않는다.
    return () => observer.disconnect();
  }, [pathname, intercepted]);

  useEffect(() => {
    // 주소가 그대로인 popstate 만 — 주소가 바뀌는 popstate(뒤로)에서 덮어쓰면 (b) 가 침묵해 늦은 진입의 복귀를 아무도 읽지 않는다.
    const syncOnSamePathPopState = () => {
      if (window.location.pathname === committedLocationPathnameRef.current) nextTitleRef.current = document.title;
    };
    const syncOnRefresh = () => {
      nextTitleRef.current = document.title;
    };
    window.addEventListener('popstate', syncOnSamePathPopState);
    window.addEventListener(ROUTER_REFRESH_EVENT, syncOnRefresh);
    return () => {
      window.removeEventListener('popstate', syncOnSamePathPopState);
      window.removeEventListener(ROUTER_REFRESH_EVENT, syncOnRefresh);
    };
  }, []);

  return (
    <div role="status" className="sr-only">
      {announcement}
    </div>
  );
}
