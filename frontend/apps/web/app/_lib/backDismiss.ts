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

function readMarker(state: unknown): { token: string | null; id: number | null } {
  if (typeof state !== 'object' || state === null) return { token: null, id: null };
  const rawToken = '__overlayToken' in state ? state.__overlayToken : null;
  const rawId = '__overlayId' in state ? state.__overlayId : null;
  return {
    token: typeof rawToken === 'string' ? rawToken : null,
    id: typeof rawId === 'number' ? rawId : null,
  };
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

  if (selfTraversals > 0) selfTraversals -= 1;
  else skipBudget = MAX_SKIPS; // 사용자 조작이면 예산 회복

  const landedIndex =
    token === DOCUMENT_TOKEN && id !== null ? stack.findIndex((entry) => entry.id === id) : -1;
  const landedOnLiveEntry = landedIndex !== -1;
  // 마커는 있는데 주인이 없다 = 코드로 닫힌 중간 오버레이의 잔해거나 이전 문서의 엔트리.
  const landedOnDeadEntry = id !== null && !landedOnLiveEntry;

  const canSkip = landedOnDeadEntry && skipBudget > 0;

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
}

function install() {
  if (installed) return;
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

  useEffect(() => {
    if (!open || !onCloseRef.current) return;
    install();

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

    return () => {
      const index = stack.indexOf(entry);
      if (index === -1) return; // popstate 가 이미 소비했다 — 히스토리도 이미 정리됐다.
      const wasTop = index === stack.length - 1;
      stack.splice(index, 1);
      // 중간 오버레이는 히스토리를 건드리지 않는다 — 그 엔트리는 죽은 엔트리로 남아 나중에 자동 스킵된다.
      // 이것이 back() 호출을 줄이면서 "죽은 뒤로가기 1회"를 없애는 핵심이다.
      if (!wasTop) return;

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
  }, [open, consumedGeneration]);
}
