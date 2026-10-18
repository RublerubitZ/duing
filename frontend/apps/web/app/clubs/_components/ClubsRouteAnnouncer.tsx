'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { ROUTER_REFRESH_EVENT } from '@/app/_lib/useGuardedRouter';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

type Props = {
  /** 지금 커밋이 인터셉트 상세인지 — ClubsSlotFrame 의 판별 값. */
  intercepted: boolean;
};

/**
 * 인터셉트 동안 head 가 다시 그려졌으면(<title> 이 새 요소) 옛 요소의 글자로 되돌리고 true. refresh(로그아웃) 커밋이 그렇다 — Next 는
 * head 를 children(숨은 목록) 리프 것으로 먼저 골라 다시 그려 상세 제목이 지워지는데(modal 페이지의 메타데이터는 섞이지 않는다), 상세
 * 제목 훅은 값이 그대로라 다시 쓰지 않는다. 글자만 바뀌는 것(상세 제목 훅)은 같은 요소라 여기 걸리지 않는다.
 */
function restoreTitleReplacedByHead(titleElementRef: RefObject<Element | null>): boolean {
  const titleElement = document.querySelector('head > title');
  const replacedElement = titleElementRef.current;
  titleElementRef.current = titleElement;
  if (replacedElement === null || replacedElement === titleElement) return false;
  const replacedTitle = replacedElement.textContent ?? '';
  if (document.title !== replacedTitle) document.title = replacedTitle;
  return true;
}

/**
 * 동아리 라우트 공지 영역(스펙 P1 §3.6) — Next 라우트 공지기(AppRouterAnnouncer)가 놓치는 인터셉트 전환만 화면 읽기에 알린다.
 * Next 공지기는 트리가 바뀐 커밋에서만 document.title 을 읽고 직전에 읽은 값과 다를 때만 읽어 준다. 인터셉트 뒤 head 는 목록 것이
 * 남아, 데이터가 커밋 뒤에 오는 진입(늦은 진입·키보드)은 앞으로도 뒤로도 침묵한다. 그래서 Next 가 마지막으로 읽은 제목(nextTitle)을
 * 따라가며 그 두 전환만 알린다.
 * - nextTitle 갱신: 경로가 바뀐 커밋의 effect(ClubsSlotFrame 의 마지막 자식이라 같은 커밋의 상세 제목 effect 뒤·Next 공지기 앞),
 *   주소가 그대로인 popstate(오버레이 닫기 — Next 가 트리를 복원하며 다시 읽는다), refresh 신호(로그아웃 등). 로그아웃으로 상세
 *   쿼리를 다시 받아도 상세 제목은 그대로이고(스펙 §3.6 재로딩 중 제목 유지) refresh 커밋이 head 를 다시 그려 지운 상세 제목은 같은
 *   커밋에서 되돌리므로, 신호 때 읽은 값이 Next 가 refresh 커밋에서 읽을 값과 같다. 첫 로드 중 로그아웃이면 신호와 refresh 커밋
 *   사이에 데이터가 오지 않는다는 데 기댄다 — 로그아웃이 쿼리 캐시를 비우며 진행 중 요청을 버려 다시 받기는 refresh 커밋 렌더에서
 *   시작한다. 그 사이에 오면 뒤로에서 목록 제목이 두 번(영역·Next) 읽힌다.
 * - (a) 인터셉트 동안 제목이 nextTitle 과 다른 값으로 바뀌면(데이터 도착) 그 제목을 알린다 — <head> 를 그동안만 관찰한다.
 * - (b) 인터셉트에서 나오는 커밋에서 제목이 nextTitle 과 같으면(Next 침묵) 그 제목을 알린다. 다르면 Next 몫이다. 그 커밋에 옛 상세가
 *   남아 제목이 아직 상세 것이면(refresh 뒤 뒤로) 상세 정리가 되돌릴 제목을 먼저 넣는다.
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
  // 레이아웃 단계에서 맞추는 인터셉트 여부 — 나가는 커밋의 관찰 콜백(마이크로태스크)은 passive 정리(관찰 끊기)보다 먼저 돌 수 있다
  // (전환 커밋의 passive 는 스케줄러 작업으로 미뤄진다). 그때 콜백이 아무것도 하지 않게 한다.
  const interceptedRef = useRef(false);
  // 인터셉트에 들어오는 커밋의 head 제목 — 상세 정리가 되돌릴 값이다(회원 화면에서 돌아온 엔트리도 그 커밋 head 는 숨은 목록 것).
  const titleBeforeInterceptRef = useRef<string | null>(null);
  // 인터셉트 동안의 head <title> 요소 — 바뀌면 head 가 다시 그려진 것이다.
  const titleElementRef = useRef<Element | null>(null);
  // 인터셉트 동안 마지막으로 본 제목(경로 커밋 — 늦은 진입이면 아직 목록 제목 — 과 (a) 관찰) — nextTitle 은 (a) 가 바꾸지 않아,
  // 첫 로드 중 로그아웃처럼 신호 뒤에 도착한 제목은 nextTitle 과 다르다.
  const interceptTitleRef = useRef<string | null>(null);

  useEffect(() => {
    const leavesIntercept = wasInterceptedRef.current && !intercepted;
    const titleBeforeIntercept = titleBeforeInterceptRef.current;
    // refresh 뒤 뒤로는 비워진 캐시를 다시 받는 동안 옛 상세가 남아(Next) 제목이 아직 상세 것이다. 상세 정리가 나중에 되돌릴 제목을
    // 먼저 넣어 Next 가 이 커밋에서 읽게 한다 — 그러면 상세 정리는 제목이 제 것이 아니라 그대로 둔다.
    if (
      leavesIntercept &&
      titleBeforeIntercept !== null &&
      document.title === interceptTitleRef.current &&
      document.title !== titleBeforeIntercept
    ) {
      document.title = titleBeforeIntercept;
    }
    const title = document.title;
    setAnnouncement(leavesIntercept && title === nextTitleRef.current ? title : '');
    interceptTitleRef.current = intercepted ? title : null;
    nextTitleRef.current = title;
    committedLocationPathnameRef.current = window.location.pathname;
    wasInterceptedRef.current = intercepted;
  }, [pathname, intercepted]);

  // head 재렌더는 커밋 안에서 되돌린다 — refresh 커밋은 passive effect 를 관찰 콜백(마이크로태스크)보다 먼저 비워(실측) Next 공지기가
  // 지워진 제목을 읽는다. 이 프레임은 refresh 때 clubs 레이아웃과 함께 다시 그려져 이 effect 가 그 커밋에서 돈다.
  useLayoutEffect(() => {
    // 들어오는 커밋 — 상세 제목 effect(passive) 전이라 지금 제목이 head 의 것이다.
    if (intercepted && !interceptedRef.current) titleBeforeInterceptRef.current = document.title;
    interceptedRef.current = intercepted;
    if (intercepted) restoreTitleReplacedByHead(titleElementRef);
  });

  useLayoutEffect(
    () => () => {
      interceptedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!intercepted) return;
    titleElementRef.current = document.querySelector('head > title');
    const observer = new MutationObserver(() => {
      if (!interceptedRef.current) return;
      // head 재렌더는 데이터 도착이 아니다 — 위 effect 가 못 본 재렌더(프레임이 다시 그려지지 않은 커밋)면 여기서 되돌린다.
      if (restoreTitleReplacedByHead(titleElementRef)) return;
      const title = document.title;
      interceptTitleRef.current = title;
      if (title !== nextTitleRef.current) setAnnouncement(title);
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    // 나가는 커밋에서 끊으면 대기 중이던 기록(상세 언마운트의 제목 복원)도 버려진다 — 복원을 (a) 로 잘못 알리지 않는다.
    return () => {
      observer.disconnect();
      titleElementRef.current = null;
    };
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
