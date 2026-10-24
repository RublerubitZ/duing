'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { ROUTER_REFRESH_EVENT } from '@/app/_lib/useGuardedRouter';
import { useRoutePathname } from '@/app/_lib/useRoutePathname';

type Props = {
  /** 지금 커밋이 인터셉트 상세인지 — ClubsSlotFrame 의 판별 값. */
  intercepted: boolean;
  /** 밑 화면(children) 세그먼트 경로 — 목록이면 ''. 들어오는 커밋에서 직전 제목을 이을지 가른다. */
  underlyingKey: string;
};

/** 제목 연속성 가드가 head 에 넣는 자리 표시 <title> 의 표식 — 단위 테스트·E2E 가 같은 이름을 쓴다. */
export const TITLE_PLACEHOLDER_ATTRIBUTE = 'data-clubs-title-placeholder';

type TitleRefs = { titleElementRef: RefObject<Element | null>; interceptedRef: RefObject<boolean> };

// document.title 이 읽는 HTML <title> 들 — 하드 로드한 상세는 스트리밍 메타데이터라 <title> 이 body 에 있어 head 로 한정하지 않는다
// (SVG 아이콘의 <title> 은 뺀다). 페이지 제목은 자리 표시가 아닌 첫 요소다.
function titleElements(): { pageTitle: HTMLTitleElement | null; placeholder: HTMLTitleElement | null } {
  const titles = [...document.getElementsByTagName('title')].filter((element) => element instanceof HTMLTitleElement);
  return {
    pageTitle: titles.find((element) => !element.hasAttribute(TITLE_PLACEHOLDER_ATTRIBUTE)) ?? null,
    placeholder: titles.find((element) => element.hasAttribute(TITLE_PLACEHOLDER_ATTRIBUTE)) ?? null,
  };
}

/**
 * 자리 표시 <title> 을 head 맨 앞(document.title 이 읽고 쓰는 첫 <title>)에 넣는다. React 는 클라이언트 렌더의 <title> 을 첫
 * head > title 앞에 넣으므로, 공개된 페이지 제목은 자리 표시 앞에 온다. itemprop 은 방어다 — React 의 입양 경로(문서의 주인 없는 첫
 * <title> 을 자기 것으로 삼아 글자를 덮는다, 지금은 하이드레이션 때만)가 자리 표시를 건너뛰게 한다. 페이지 제목이 들어오면 정리 관찰이
 * 지운다. 정리 관찰과 인터셉트 동안의 head 관찰은 어느 쪽이 먼저 불려도 결과가 같다 — 통지는 관찰을 만든 순서라 경로마다 다르다.
 */
function insertPlaceholder(text: string, { titleElementRef, interceptedRef }: TitleRefs): HTMLTitleElement {
  const placeholder = document.createElement('title');
  placeholder.setAttribute(TITLE_PLACEHOLDER_ATTRIBUTE, '');
  placeholder.setAttribute('itemprop', 'name');
  placeholder.textContent = text;
  document.head.prepend(placeholder);
  const janitor = new MutationObserver(() => {
    const { pageTitle } = titleElements();
    if (pageTitle === null) return;
    if (placeholder.isConnected) {
      // 인터셉트 동안 들어온 페이지 제목에는 보이던 글자(비어 있지 않을 때만)를 옮긴다. 나간 뒤 새 화면의 제목은 그대로 맞다.
      const keptText = placeholder.textContent ?? '';
      if (interceptedRef.current && keptText !== '' && pageTitle.textContent !== keptText) pageTitle.textContent = keptText;
      placeholder.remove();
    }
    // 인터셉트 동안에는 기억 요소를 바꾸지 않는다 — head 관찰이 '기억한 자리 표시 ≠ 진짜 제목' 을 교체로 보고 데이터 도착으로 읽지 않게.
    if (!interceptedRef.current && titleElementRef.current === placeholder) titleElementRef.current = pageTitle;
    janitor.disconnect();
  });
  janitor.observe(document.head, { childList: true });
  return placeholder;
}

/**
 * 인터셉트 동안 head 가 다시 그려졌으면 보이던 글자를 잇고 true — 데이터 도착이 아니다. 틈(페이지 <title> 없음)이면 자리 표시에 보이던
 * 글자를 넣고, 교체(다른 요소)면 새 요소에 옮긴다. 글자만 바뀌는 것(상세 제목 훅)은 같은 요소라 false 다.
 */
function keepTitleThroughHeadRender(refs: TitleRefs): boolean {
  const { titleElementRef } = refs;
  const { pageTitle, placeholder } = titleElements();
  const previous = titleElementRef.current;
  if (previous === null) {
    titleElementRef.current = placeholder ?? pageTitle;
    return false;
  }
  const keptText = previous.textContent ?? '';
  if (pageTitle === null) {
    if (placeholder !== null) {
      titleElementRef.current = placeholder;
      return previous !== placeholder;
    }
    titleElementRef.current = insertPlaceholder(keptText, refs);
    return true;
  }
  if (pageTitle === previous) return false;
  if (keptText !== '' && pageTitle.textContent !== keptText) pageTitle.textContent = keptText;
  placeholder?.remove();
  titleElementRef.current = pageTitle;
  return true;
}

/**
 * 동아리 라우트 공지 영역(스펙 P1 §3.6) — Next 라우트 공지기(AppRouterAnnouncer)가 놓치는 인터셉트 전환만 화면 읽기에 알린다.
 * Next 공지기는 트리가 바뀐 커밋에서만 document.title 을 읽고 직전에 읽은 값과 다를 때만 읽어 준다. 인터셉트 동안 제목은 목록 것이
 * 이어져, 데이터가 커밋 뒤에 오는 진입(늦은 진입·키보드)은 앞으로도 뒤로도 침묵한다. 그래서 Next 가 마지막으로 읽은 제목(nextTitle)을
 * 따라가며 그 두 전환만 알린다.
 * - 제목 연속성 가드(스펙 2026-10-24): 인터셉트 동안 head 재렌더는 제목 글자를 바꾸지 않는다. Next 16.3 은 인터셉트 뒤 head 가 목록
 *   것으로 남지만, 16.4 는 진입·상세→상세·뒤로에서 head 를 모달 페이지 메타데이터로 다시 그리며 <title> 이 빠지는 틈을 만든다. 틈은
 *   자리 표시(<title data-clubs-title-placeholder itemprop>)로 메우고 새 요소에는 보이던 글자를 옮긴다. 제목을 바꾸는 것은 데이터
 *   도착(상세 제목 훅)과 인터셉트를 나가는 전환뿐이다. 가드는 자기가 만든 자리 표시만 지우고, React·Next 의 요소는 글자만 고친다.
 * - nextTitle 갱신: 경로가 바뀐 커밋의 effect(ClubsSlotFrame 의 마지막 자식이라 같은 커밋의 상세 제목 effect 뒤·Next 공지기 앞),
 *   주소가 그대로인 popstate(오버레이 닫기 — Next 가 트리를 복원하며 다시 읽는다), refresh 신호(로그아웃 등). 로그아웃으로 상세
 *   쿼리를 다시 받아도 상세 제목은 그대로이고(스펙 §3.6 재로딩 중 제목 유지) refresh 커밋이 head 를 다시 그려 지운 상세 제목은 같은
 *   커밋에서 되돌리므로, 신호 때 읽은 값이 Next 가 refresh 커밋에서 읽을 값과 같다. 첫 로드 중 로그아웃이면 신호와 refresh 커밋
 *   사이에 데이터가 오지 않는다는 데 기댄다 — 로그아웃이 쿼리 캐시를 비우며 진행 중 요청을 버려 다시 받기는 refresh 커밋 렌더에서
 *   시작한다. 그 사이에 오면 동아리 제목(도착 때 영역·refresh 커밋 때 Next)과 뒤로의 목록 제목(영역·Next)이 각각 두 번 읽힌다.
 * - (a) 인터셉트 동안 제목이 nextTitle 과 다른 값으로 바뀌면(데이터 도착) 그 제목을 알린다 — <head> 를 그동안만 관찰한다.
 * - (b) 인터셉트에서 나오는 커밋에서 제목이 nextTitle 과 같으면(Next 침묵) 그 제목을 알린다. 다르면 Next 몫이다. 그 커밋에 옛 상세가
 *   남아 제목이 아직 상세 것이면(refresh 뒤 뒤로) 상세 정리가 되돌릴 제목을 먼저 넣는다.
 * - 경로가 바뀐 커밋마다 영역을 비운다 — 같은 문구가 이어져도 새 내용으로 읽힌다.
 * role="status" 가 암묵적 polite 라이브 영역이라 aria-live 는 겹쳐 적지 않는다. 경로는 effect 의존성으로만 쓴다(ISR 라우트 규약 —
 * 렌더 결과는 경로에 기대지 않는다).
 */
export function ClubsRouteAnnouncer({ intercepted, underlyingKey }: Props) {
  const pathname = useRoutePathname();
  const [announcement, setAnnouncement] = useState('');
  const nextTitleRef = useRef<string | null>(null);
  // 마지막 경로 커밋 때의 location.pathname — popstate 가 주소를 바꾸는지 가른다.
  const committedLocationPathnameRef = useRef<string | null>(null);
  const wasInterceptedRef = useRef(false);
  // 레이아웃 단계에서 맞추는 인터셉트 여부 — 나가는 커밋의 관찰 콜백(마이크로태스크)은 passive 정리(관찰 끊기)보다 먼저 돌 수 있다
  // (전환 커밋의 passive 는 스케줄러 작업으로 미뤄진다). 그때 콜백이 아무것도 하지 않게 한다.
  const interceptedRef = useRef(false);
  // 인터셉트에 들어오는 커밋에 보이던 제목 — 상세 정리가 되돌릴 값이다. 직전 글자를 모르는 진입이면 null(빈 글자도 null 로 접는다).
  const titleBeforeInterceptRef = useRef<string | null>(null);
  // 인터셉트에 들어오기 직전 경로 커밋의 주소 — 나가는 틈은 이 주소로 돌아갈 때만 메운다.
  const pathBeforeInterceptRef = useRef<string | null>(null);
  // 직전 커밋의 밑 화면 키 — 들어오는 커밋에서 같을 때만 직전 제목을 잇는다.
  const underlyingKeyRef = useRef<string | null>(null);
  // 지금 보이는 제목 요소(자리 표시 포함) — 분리된 요소도 글자가 남아 직전 제목으로 쓴다. 바뀌면 head 가 다시 그려진 것이다.
  const titleElementRef = useRef<Element | null>(null);
  // 인터셉트 밖에서 제목 요소를 따라가는 관찰 — 공지 영역 커밋 밖의 head 교체(소프트 도착의 틈·공개)에도 기억을 잇는다.
  const titleTrackerRef = useRef<MutationObserver | null>(null);
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

  // head 재렌더는 커밋 안에서 처리한다 — refresh 커밋은 passive effect 를 관찰 콜백(마이크로태스크)보다 먼저 비워(실측) Next 공지기가
  // 지워진 제목을 읽는다. 이 프레임은 refresh 때 clubs 레이아웃과 함께 다시 그려져 이 effect 가 그 커밋에서 돈다.
  useLayoutEffect(() => {
    titleTrackerRef.current?.disconnect();
    titleTrackerRef.current = null;
    const refs = { titleElementRef, interceptedRef };
    const entering = intercepted && !interceptedRef.current;
    const leaving = !intercepted && interceptedRef.current;
    if (entering) {
      // 들어오는 커밋 — 상세 제목 effect(passive) 전이라 보이는 제목이 진입 직전 것이다. 밑 화면이 직전 커밋과 같을 때만 그 글자를
      // 잇는다. 다르면(회원 화면에서 돌아온 엔트리) Next 16.3 은 이 커밋에 head 가 이미 새 밑 화면 것이다.
      const continues = underlyingKeyRef.current === underlyingKey && titleElementRef.current !== null;
      interceptedRef.current = true;
      const { pageTitle, placeholder } = titleElements();
      let titleBefore: string;
      if (continues) {
        keepTitleThroughHeadRender(refs);
        titleBefore = titleElementRef.current?.textContent ?? '';
      } else if (pageTitle === null) {
        // 직전 글자를 모르는 틈 — 빈 자리 표시로 상세 제목 훅의 쓰기를 받는다. 자리 표시가 없으면 쓰기가 주인 없는 <title> 을 만들고,
        // 공개 때 React 의 <title> 이 그 앞에 들어와 쓴 제목이 가려진다.
        if (placeholder !== null) placeholder.textContent = '';
        titleElementRef.current = placeholder ?? insertPlaceholder('', refs);
        titleBefore = '';
      } else {
        // 직전 글자를 모르고 페이지 제목이 있다 — 그 제목을 기억한다. 앞 맥락(나가는 틈)의 자리 표시가 남았으면 지운다. 그 글자는 이
        // 엔트리 것이 아니고, 남기면 정리 관찰이 옛 글자를 페이지 제목에 옮긴다.
        placeholder?.remove();
        titleElementRef.current = pageTitle;
        titleBefore = pageTitle.textContent ?? '';
      }
      titleBeforeInterceptRef.current = titleBefore === '' ? null : titleBefore;
      pathBeforeInterceptRef.current = committedLocationPathnameRef.current;
    } else if (intercepted) {
      keepTitleThroughHeadRender(refs);
    } else {
      interceptedRef.current = false;
      const { pageTitle, placeholder } = titleElements();
      const titleBefore = titleBeforeInterceptRef.current;
      if (
        leaving &&
        pageTitle === null &&
        placeholder === null &&
        titleBefore !== null &&
        window.location.pathname === pathBeforeInterceptRef.current
      ) {
        // 나가는 틈 — 진입 직전 주소로 돌아갈 때만 진입 전 제목으로 메운다(Next 가 이 커밋에서 읽는다). 다른 주소면 새 화면 head 가 맞다.
        titleElementRef.current = insertPlaceholder(titleBefore, refs);
      } else if (placeholder !== null || pageTitle !== null) {
        titleElementRef.current = placeholder ?? pageTitle;
      }
      // 틈이면 직전 요소를 그대로 둔다(분리돼도 글자는 남는다). 진짜 제목이 들어오면 추적 관찰이 바꾼다.
      const tracker = new MutationObserver(() => {
        const current = titleElements();
        const shownTitle = current.placeholder ?? current.pageTitle;
        if (shownTitle !== null) titleElementRef.current = shownTitle;
      });
      tracker.observe(document.head, { childList: true });
      titleTrackerRef.current = tracker;
    }
    underlyingKeyRef.current = underlyingKey;
  });

  useLayoutEffect(
    () => () => {
      interceptedRef.current = false;
      titleTrackerRef.current?.disconnect();
      titleTrackerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!intercepted) return;
    const observer = new MutationObserver(() => {
      if (!interceptedRef.current) return;
      // head 재렌더는 데이터 도착이 아니다 — 위 effect 가 못 본 재렌더(프레임이 다시 그려지지 않은 커밋)면 여기서 잇는다.
      const headRendered = keepTitleThroughHeadRender({ titleElementRef, interceptedRef });
      const title = document.title;
      // 데이터 도착 = head 재렌더가 아닌데 인터셉트 동안 마지막으로 본 제목과 다를 때. 재렌더 뒤 보이는 제목(직전 글자를 모르는 진입이면
      // 공개된 메타데이터 제목)도 본 제목으로 적는다 — StrictMode(dev)는 공개된 <title> 을 같은 요소로 뺐다가 다시 넣고, 상세→상세
      // 커밋에서는 아직 끊기지 않은 앞 경로 관찰이 자리 표시를 같은 요소로 본다. 둘 다 같은 제목이라 알리지 않는다.
      const arrived = !headRendered && title !== interceptTitleRef.current;
      interceptTitleRef.current = title;
      if (arrived && title !== nextTitleRef.current) setAnnouncement(title);
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    // 나가는 커밋에서 끊으면 대기 중이던 기록(상세 언마운트의 제목 복원)도 버려진다 — 복원을 (a) 로 잘못 알리지 않는다.
    return () => {
      observer.disconnect();
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
