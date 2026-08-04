'use client';

import { useEffect, useRef, useState } from 'react';

// 오버레이(바텀시트·모달·드로어)가 열려 있는 동안 히스토리 엔트리를 1개 물고 있다가, 뒤로가기를
// 그 엔트리로 흡수해 페이지 이동 대신 최상단 오버레이만 닫는다.
//
// URL 은 바꾸지 않는다 — pushState 에 url 인자를 넘기지 않기 때문이며, 우리 엔트리는 아래 페이지
// 엔트리와 같은 URL 이 된다. 그래서 판정이 어긋나 back 이 한 번 더 일어나도 화면 이동은 발생하지
// 않는다(최악이 "아무 일도 안 일어남").
//
// 버전 의존 주의 — Next 15.5.18 의 app-router.js 를 읽고 확인한 동작이다. Next 는
// history.pushState/replaceState 를 패치하지만 state 에 __NA 가 있으면 조기 반환해 원본 API 를
// 그대로 부른다. 그래서 기존 history.state 를 펼쳐 __NA·내부 트리를 우리가 직접 들고 간다
// (Next 가 내부 필드를 복사해 준다는 동작에 기대지 않기 위해서다). state 를 통째로 갈아치우면
// __NA 가 유실돼 그 엔트리로 되돌아올 때 Next 가 location.reload() 를 부른다.
// Next 업그레이드 시 이 전제를 재확인할 것.
//
// 설계·엣지 케이스 근거: docs/superpowers/specs/2026-08-03-overlay-back-close-design.md

type OverlayEntry = { id: number; close: () => void };

// 문서 1회 토큰 — 새로고침 이전 문서가 남긴 엔트리와 ID 가 겹치는 것을 막는다.
const DOCUMENT_TOKEN = Math.random().toString(36).slice(2, 10);
// 죽은 엔트리 자동 스킵의 무한 루프 방어 상한. 정상 경로에서 연속으로 쌓이는 죽은 엔트리는 한두 개
// 수준이라 도달하지 않는 값이다 — 도달했다면 이미 상태가 어긋난 것이므로 브라우저 기본 동작에 맡긴다.
const MAX_SKIPS = 10;

const stack: OverlayEntry[] = [];
let nextOverlayId = 1;
// 우리가 유발한 traversal 잔여 수 — 사용자 조작 popstate 와 구분해 스킵 예산을 회계한다.
let selfTraversals = 0;
let skipBudget = MAX_SKIPS;
let installed = false;
// 지금 앉아 있는 엔트리의 오버레이 ID(우리 것이 아니면 null) — 앞으로 가기 판별에 쓴다.
// ID 는 단조 증가라 "착지 ID > 직전 ID" 면 위로 올라간 것, 즉 forward 다.
let currentMarkerId: number | null = null;
// 그 엔트리의 URL. 시트 안에서 router.replace 가 쿼리를 갱신하면 여기도 따라간다.
let currentHref: string | null = null;
let nativeReplaceState: History['replaceState'] | null = null;
// 지금 처리 중인 popstate 가 "URL 은 그대로고 오버레이만 닫는" 이동인지. View Transition 억제에 쓴다.
let overlayOnlyTraversal = false;
// 닫힘과 동시에 앞으로 내비게이션(Link 클릭·router.push)이 일어나는 닫힘이면, 최상단 엔트리 회수 back()
// 을 1회 건너뛴다. 내비게이션은 우리 엔트리 위에 새 엔트리를 쌓는데, 그 커밋이 Next 트랜지션이라
// 지연되어 회수 back() 이 먼저 나가면 아직 커밋 안 된 이동을 되돌려 삼킨다(모바일 콘솔·알림 시트에서
// 메뉴가 안 눌리던 원인). 건너뛴 엔트리는 죽은 엔트리로 남아 이후 뒤로가기에서 자동 스킵된다.
let suppressNextReclaim = false;

/**
 * 지금 처리 중인 popstate 가 오버레이만 닫는(=페이지가 바뀌지 않는) 이동인지 알려준다.
 *
 * <p>next-view-transitions 는 popstate 마다 전환을 시작하는데, 그 DOM 업데이트 프라미스를
 * `useEffect(..., [hash, pathname])` 에서만 resolve 한다. 우리 오버레이 엔트리는 URL 이 같아서
 * 그 effect 가 재실행되지 않고, 전환이 끝나지 않아 화면이 옛 스냅샷에 묶였다가 브라우저가
 * "Transition was aborted because of timeout in DOM update" 로 중단시킨다.
 * 같은 페이지 안의 레이어 닫기에는 페이지 전환이 필요 없으므로 아예 시작하지 않게 한다.
 */
export function isOverlayOnlyTraversal(): boolean {
  return overlayOnlyTraversal;
}

/**
 * 오버레이를 "닫으면서 곧바로 앞으로 이동"하는 소비처(모바일 콘솔 메뉴 링크·알림 항목 탭 등)가
 * 닫기 직전에 호출한다. 다음 최상단 오버레이 닫힘 1회는 회수 back() 을 건너뛰어, 진행 중인
 * 내비게이션을 back() 이 되돌려 삼키는 것을 막는다. 건너뛴 엔트리는 자동 스킵되므로 히스토리도 안전하다.
 *
 * <p>열린 오버레이가 없으면 아무것도 하지 않는다 — 데스크탑 사이드바처럼 오버레이 밖 경로와 코드를
 * 공유하는 소비처가 무조건 호출해도, 소비될 닫힘이 없는 플래그가 잔존해 나중의 무관한 닫힘을
 * 오염시키지 않게 하기 위해서다.
 *
 * <p>오프라인이면 아무것도 하지 않는다 — 소비처의 이동은 전부 useGuardedRouter/OfflineNavigationGuard
 * 가 거부하므로 실제 이동이 없고, skip 을 걸면 사용자가 앉을 죽은 엔트리만 남긴다(뒤로가기 1회 낭비).
 */
export function skipNextOverlayReclaim(): void {
  if (stack.length === 0) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  suppressNextReclaim = true;
}

function readMarker(state: unknown): { token: string | null; id: number | null } {
  if (typeof state !== 'object' || state === null) return { token: null, id: null };
  const rawToken = '__overlayToken' in state ? state.__overlayToken : null;
  const rawId = '__overlayId' in state ? state.__overlayId : null;
  return {
    token: typeof rawToken === 'string' ? rawToken : null,
    id: typeof rawId === 'number' ? rawId : null,
  };
}

// 떠나온 URL 과 지금 URL 이 같은 페이지인지(쿼리 변화는 같은 페이지로 본다 — 시트 안 필터 동기화).
function isSamePageAs(previousHref: string | null): boolean {
  if (previousHref === null) return true;
  const previous = new URL(previousHref, window.location.href);
  return (
    previous.pathname === window.location.pathname && previous.hash === window.location.hash
  );
}

// 기존 history.state 를 보존한 채 오버레이 마커만 얹는다(__NA·Next 내부 트리 유실 방지).
function withMarker(marker: { __overlayToken?: string; __overlayId?: number }): object {
  const current: unknown = window.history.state;
  const base = typeof current === 'object' && current !== null ? current : {};
  return { ...base, ...marker };
}

function handlePopState() {
  // 판정은 동기로 끝낸다 — 마이크로태스크 안에서 history.state 를 다시 읽으면 뒤로가기 연타 시
  // 이미 다음 popstate 의 값이라 엉뚱한 대상을 집는다.
  const { token, id } = readMarker(window.history.state);
  const leftHref = currentHref;

  const isSelfTraversal = selfTraversals > 0;
  if (isSelfTraversal) selfTraversals -= 1;
  else skipBudget = MAX_SKIPS; // 사용자 조작이면 예산 회복

  const landedIndex =
    token === DOCUMENT_TOKEN && id !== null ? stack.findIndex((entry) => entry.id === id) : -1;
  const landedOnLiveEntry = landedIndex !== -1;
  // 마커는 있는데 주인이 없다 = 코드로 닫힌 중간 오버레이의 잔해거나 이전 문서의 엔트리.
  const landedOnDeadEntry = id !== null && !landedOnLiveEntry;
  // 앞으로 가기로 죽은 엔트리에 올라온 경우까지 건너뛰면 그 위 엔트리에 영원히 도달할 수 없다.
  const wentForward = id !== null && currentMarkerId !== null && id > currentMarkerId;

  const canSkip = landedOnDeadEntry && !wentForward && skipBudget > 0;

  // 먼저 스택에서 제거한다 — 재진입 popstate 가 같은 오버레이를 두 번 집지 못하게 하는 장치는
  // 게이트 플래그가 아니라 이 순서다(게이트를 두면 아래 자동 스킵 연쇄가 끊긴다).
  //
  // 주인 없는 엔트리에 착지했으면 아무것도 닫지 않는다 — 그 엔트리 **아래**에 있던 오버레이는
  // 여전히 열려 있어야 하고, 어느 것이 그런지는 한 칸 더 내려간 다음 위치에서만 알 수 있다.
  // (스킵 예산이 바닥나 더 내려갈 수 없을 때만 안전망으로 전부 닫는다.)
  const dismissed = landedOnLiveEntry
    ? stack.splice(landedIndex + 1)
    : canSkip
      ? []
      : stack.splice(0);

  // 이 popstate 가 우리 몫이고 페이지(pathname·hash)가 그대로면, 뒤이어 실행될
  // next-view-transitions 의 popstate 핸들러가 전환을 시작하지 못하게 막는다(끝나지 않는 전환 방지).
  // 리스너 등록 순서상 이 핸들러가 먼저 실행되므로 플래그가 제때 보인다. 같은 태스크가 끝나면 해제한다.
  const overlayTraversal = dismissed.length > 0 || isSelfTraversal || canSkip;
  const stayedOnSamePage = isSamePageAs(leftHref);
  overlayOnlyTraversal = overlayTraversal && stayedOnSamePage;
  if (overlayOnlyTraversal) {
    window.setTimeout(() => {
      overlayOnlyTraversal = false;
    }, 0);
  }

  if (dismissed.length > 0) {
    queueMicrotask(() => {
      // 최상단부터 닫는다(LIFO).
      for (const entry of [...dismissed].reverse()) entry.close();
    });
  }

  if (canSkip) {
    skipBudget -= 1;
    queueMicrotask(() => {
      selfTraversals += 1;
      window.history.back();
    });
  }

  currentMarkerId = token === DOCUMENT_TOKEN ? id : null;
  currentHref = window.location.href;

  // 우리 엔트리를 떠났는데 그 사이 URL 이 바뀌어 있었다면(시트 안에서 router.replace 로 필터·쿼리를
  // 갱신한 경우) 그 URL 을 착지한 엔트리에 다시 얹는다. 그러지 않으면 "시트만 닫았을 뿐인데 필터가
  // 초기화되는" 되감기가 생긴다. 소비처가 replace 를 쓴 것은 "뒤로가기 단계로 만들지 말라"는 뜻이다.
  // 같은 페이지 안(쿼리만 다름)일 때만 되돌린다 — 여러 칸을 건너뛰어 실제로 다른 페이지로 간
  // 이동에서 복원하면, 착지한 페이지의 엔트리 URL 을 시트가 있던 페이지 주소로 덮어쓴다.
  if (
    overlayTraversal &&
    stayedOnSamePage &&
    leftHref !== null &&
    leftHref !== window.location.href
  ) {
    queueMicrotask(() => {
      // __NA 를 넣지 않는다 — Next 패치가 내부 필드를 복사하면서 라우터의 canonicalUrl 까지
      // 새 URL 로 동기화하게 두어야 useSearchParams 와 주소창이 어긋나지 않는다.
      window.history.replaceState({}, '', leftHref);
      currentHref = window.location.href;
    });
  }
}

/**
 * popstate 리스너 설치 + 이전 문서가 남긴 마커 제거. providers 에서 문서 로드 시점에 1회 호출한다.
 *
 * <p>오버레이를 열 때(lazy) 설치하면, 새 문서로 진입해 오버레이를 한 번도 열지 않은 사용자는
 * 이전 문서가 남긴 엔트리를 만나도 스킵하지 못한다(뒤로가기 1회 소모). 로드 시점 설치가 그 틈을 막는다.
 * SSR 안전 — window 가 없으면 아무것도 하지 않는다.
 */
export function installBackDismiss() {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  // 이전 문서가 남긴 마커가 현재 엔트리에 붙어 있으면 마커 두 개만 지운다. 자동 히스토리 이동은
  // 하지 않는다 — 판정이 틀렸을 때 "매 페이지 로드마다 히스토리를 한 칸 먹는" 훨씬 나쁜 실패 모드가 된다.
  // ponytail: 시트를 연 채 새로고침하면 그 잔존 엔트리 위에서 문서가 시작해 뒤로가기 1회가 먹힌다
  // (같은 URL 이라 화면 변화는 없음). 해소하려면 로드 시 자동 back 이 필요해 의도적으로 남긴다.
  const { token } = readMarker(window.history.state);
  if (token !== null && token !== DOCUMENT_TOKEN) {
    window.history.replaceState(
      withMarker({ __overlayToken: undefined, __overlayId: undefined }),
      '',
    );
  }

  currentMarkerId = null;
  currentHref = window.location.href;

  // Next 의 HistoryUpdater 는 navigate/refresh/서버액션/server-patch 경로에서 커스텀 history state 를
  // 보존하지 않는다(preserveCustomHistoryState=false → state 를 {__NA, tree} 로 통째 교체).
  // 오버레이가 열린 채 router.replace 나 refresh 가 한 번이라도 일어나면 우리 마커가 증발하고,
  // 그러면 엔트리를 회수할 수도 죽은 엔트리로 인식할 수도 없어 죽은 뒤로가기가 계속 쌓인다.
  // 우리 엔트리 위에서 일어나는 replace 에 한해 마커를 다시 얹는다.
  nativeReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
    const topEntry = stack.at(-1);
    const { token, id } = readMarker(window.history.state);
    if (topEntry !== undefined && token === DOCUMENT_TOKEN && id === topEntry.id) {
      const base = typeof data === 'object' && data !== null ? data : {};
      nativeReplaceState?.(
        { ...base, __overlayToken: DOCUMENT_TOKEN, __overlayId: topEntry.id },
        unused,
        url,
      );
      currentHref = window.location.href;
      return;
    }
    nativeReplaceState?.(data, unused, url);
  };

  // 리스너는 문서 수명 동안 1개만 유지한다. 스택이 빌 때마다 해제하면 코드 닫기가 예약한 back() 의
  // popstate 를 놓쳐 자기 유발 traversal 회계가 어긋난다. installed 플래그로 중복 등록은 없다.
  window.addEventListener('popstate', handlePopState);
}

/**
 * 오버레이가 열려 있는 동안 뒤로가기(안드로이드 버튼·제스처, iOS 엣지 스와이프, 브라우저 뒤로가기)를
 * 흡수해 페이지 이동 대신 이 오버레이만 닫는다.
 *
 * @param open 오버레이 표시 여부. 마운트 자체가 열림인 컴포넌트는 `true` 를 넘긴다.
 * @param onClose 뒤로가기로 닫을 때 호출할 콜백. 없으면(닫을 수 없는 다이얼로그) 아무것도 하지 않는다.
 */
export function useBackDismiss(open: boolean, onClose?: (() => void) | null): void {
  const onCloseRef = useRef(onClose);
  // 인라인 화살표 함수를 넘겨도 effect 가 재등록되지 않도록 콜백은 ref 로만 읽는다.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // popstate 가 엔트리를 소비한 뒤 소비처가 닫기를 거부하면(전송 중 가드 등) 다시 push 하기 위한 트리거.
  const [consumedGeneration, setConsumedGeneration] = useState(0);
  // onClose 가 열린 뒤에 뒤늦게 붙는 소비처를 위해 존재 여부를 의존성에 넣는다 — ref 만 보면
  // 그런 소비처에서 엔트리가 영영 등록되지 않아 뒤로가기가 페이지를 이탈시킨다.
  const canDismiss = Boolean(onClose);

  useEffect(() => {
    if (!open || !canDismiss) return;
    // providers 에서 이미 설치됐지만, 단위 테스트처럼 providers 없이 훅만 쓰는 경로를 위한 폴백이다.
    installBackDismiss();

    const entry: OverlayEntry = {
      id: nextOverlayId,
      close: () => {
        setConsumedGeneration((current) => current + 1);
        onCloseRef.current?.();
      },
    };
    nextOverlayId += 1;
    stack.push(entry);
    window.history.pushState(
      withMarker({ __overlayToken: DOCUMENT_TOKEN, __overlayId: entry.id }),
      '',
    );
    currentMarkerId = entry.id;
    currentHref = window.location.href;

    return () => {
      // skip 플래그는 닫힘이 popstate 에 선점당한 경우(index === -1)에도 반드시 소진한다 — 여기서
      // 살아남으면 시간이 한참 지난 무관한 닫힘의 회수를 억제하는 원격 오염이 된다.
      const reclaimSuppressed = suppressNextReclaim;
      suppressNextReclaim = false;
      const index = stack.indexOf(entry);
      if (index === -1) return; // popstate 가 이미 소비했다 — 히스토리도 이미 정리됐다.
      const wasTop = index === stack.length - 1;
      stack.splice(index, 1);
      // 이 닫힘이 내비게이션과 겹친다고 소비처가 표시했으면, 회수 back() 을 건너뛰고 죽은 엔트리로 남긴다
      // (내비게이션이 우리 엔트리 위에 쌓는 새 엔트리를 back() 이 되돌려 이동을 삼키는 것을 막는다).
      // 중간 오버레이는 히스토리를 건드리지 않는다 — 그 엔트리는 죽은 엔트리로 남아 나중에 자동 스킵된다.
      // 이것이 back() 호출을 줄이면서 "죽은 뒤로가기 1회"를 없애는 핵심이다.
      if (!wasTop || reclaimSuppressed) return;

      queueMicrotask(() => {
        const { token, id } = readMarker(window.history.state);
        // 페이지 이동이 이미 히스토리를 덮었으면 회수하지 않는다 — 여기서 back() 하면 이전 페이지로 튕긴다.
        // ponytail: 닫기와 페이지 이동이 동시에 일어나는 경로는 커밋 순서가 뒤집히는 좁은 창이 남는다.
        // Next 의 진행 중 내비게이션을 외부에서 관측할 방법이 없어 0 으로 만들 수 없다. 가드에 걸리면
        // 엔트리는 죽은 상태로 남았다가 자동 스킵된다.
        if (token !== DOCUMENT_TOKEN || id !== entry.id) return;
        selfTraversals += 1;
        window.history.back();
      });
    };
  }, [open, canDismiss, consumedGeneration]);
}
