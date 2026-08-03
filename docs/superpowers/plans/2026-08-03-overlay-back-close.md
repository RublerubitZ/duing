# 오버레이 뒤로가기 닫기(Back Dismiss) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 바텀시트·모달·드로어가 열린 상태의 뒤로가기(안드로이드 버튼/제스처, iOS 엣지 스와이프, 브라우저 뒤로가기)를 흡수해 페이지 이동 없이 최상단 오버레이만 닫는다.

**Architecture:** 오버레이가 열릴 때 **URL 을 바꾸지 않는 히스토리 엔트리**를 하나 push 하고(`{ __overlayToken, __overlayId }` 마커), 모듈 레벨 LIFO 스택과 popstate 리스너 1개가 "착지한 엔트리의 주인이 누구인가"로 닫을 대상을 판정한다. 판정은 동기, 실행(닫기 콜백·`history.back()`)은 `queueMicrotask`. 약 60개 Radix 오버레이는 `ui/dialog`·`ui/sheet` Root 래핑으로 호출처 수정 없이 커버하고, 수제 오버레이 16곳만 훅을 1줄씩 추가한다.

**Tech Stack:** Next.js 15.5 App Router, React 19, Radix Dialog 1.1, TypeScript, vitest + jsdom + @testing-library/react

**설계 문서:** `docs/superpowers/specs/2026-08-03-overlay-back-close-design.md` — 판정 알고리즘·엣지 케이스·수용 한계의 근거가 전부 여기 있다. 구현 전 반드시 읽는다.

## Global Constraints

- 작업 디렉터리는 `frontend/apps/web`. 명령은 `frontend/apps/web` 에서 실행한다(`pnpm test`, `pnpm typecheck`, `pnpm lint`).
- `any` 금지, `as` 타입 단언 금지 — 좁히기는 `in` 연산자 + `typeof` 가드로 한다.
- 타입 선언은 `type` 사용(`interface` 금지).
- 변수명은 역할이 드러나게 — `data`/`res`/`e` 같은 축약 금지.
- 커밋 메시지: Conventional Commits + 한국어, `{type}(frontend): 내용`. **`Co-Authored-By`·`🤖 Generated` 라인 절대 금지.**
- 요청 범위 밖 리팩터링 금지 — 오버레이 컴포넌트의 기존 마크업·스타일·닫기 로직은 건드리지 않는다.
- 브랜치는 이미 생성되어 있다: `feat/overlay-back-close`. **push 및 PR 생성은 하지 않는다**(사용자 지시 후에만).
- 히스토리 마커 필드명은 `__overlayToken`(string), `__overlayId`(number) 두 개로 분리한다. 하나의 문자열로 합치지 않는다.
- `window.history.pushState` 호출 시 **url 인자를 넘기지 않는다**. 넘기면 Next 라우터 dispatch 가 발생한다.
- 문서 로드 시점에 `history.back()` 을 호출하지 않는다. 잔존 마커는 `replaceState` 로 제거만 한다.
- `pushState`·`replaceState` 모두 **기존 `history.state` 를 보존**하고 마커만 덮어쓴다. `{}` 로 갈아치우면
  Next 의 `__NA`·내부 트리가 유실돼 그 엔트리로 되돌아올 때 `location.reload()` 가 발생한다.
- 이 레포는 `reactStrictMode: true` 다. 개발 모드의 effect 이중 실행에서도 **최종 상태가 정상적으로
  수렴**해야 한다(전이 중 여분 엔트리는 허용 — URL 이 동일해 화면 영향 없음). ID 대조 가드 없이
  무조건 `history.back()` 하는 구현은 여기서 깨진다.

---

### Task 1: 코어 모듈 `backDismiss.ts` + `useBackDismiss` 훅

**Files:**
- Create: `apps/web/app/_lib/backDismiss.ts`
- Test: `apps/web/test/_lib/back-dismiss.test.tsx`

**Interfaces:**
- Consumes: 없음(레포 내 의존 없음)
- Produces: `export function useBackDismiss(open: boolean, onClose?: (() => void) | null): void`
  — Task 2~4 가 이 시그니처 하나만 사용한다. `open` 이 true 이고 `onClose` 가 있을 때만 동작하며, 뒤로가기 발생 시 `onClose()` 를 호출한다.

- [ ] **Step 1: jsdom 히스토리 동작 확인 테스트 작성**

이 계획 전체가 "jsdom 이 `history.back()` 에 popstate 를 발화한다"는 가정 위에 있다. 먼저 확인한다.

`apps/web/test/_lib/back-dismiss.test.tsx`:

```tsx
import { act, render, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBackDismiss } from '@/app/_lib/backDismiss';

// jsdom 의 traversal 은 태스크 큐에 실린다 — back() 후 popstate 와 우리 마이크로태스크까지 흘려보낸다.
async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('jsdom 히스토리 가정', () => {
  it('pushState 후 back() 이 popstate 를 발화하고 이전 state 로 되돌린다', async () => {
    window.history.replaceState({ marker: 'base' }, '');
    window.history.pushState({ marker: 'pushed' }, '');
    expect(window.history.state).toEqual({ marker: 'pushed' });

    const popped = vi.fn();
    window.addEventListener('popstate', popped);
    await pressBack();
    window.removeEventListener('popstate', popped);

    expect(popped).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual({ marker: 'base' });
  });
});
```

- [ ] **Step 2: 가정 확인 테스트 실행**

Run: `pnpm vitest run test/_lib/back-dismiss.test.tsx -t 'jsdom 히스토리 가정'`
Expected: `useBackDismiss` 가 아직 없어 import 에러로 FAIL 한다. import 줄을 잠시 주석 처리하고 다시 실행해 **이 테스트 자체는 PASS** 하는지 확인한 뒤 주석을 되돌린다.

가정이 깨지면(popstate 미발화 등) 진행을 멈추고 사용자에게 보고한다. 대안은 설계 문서에 적힌 `window.history` 스텁 방식이다.

- [ ] **Step 3: 단일 오버레이 실패 테스트 작성**

같은 파일에 이어서 추가한다:

```tsx
type OverlayProps = { name: string; refuseClose?: boolean };

const closeSpy = vi.fn();

// 실제 소비처와 같은 모양 — 열림 상태를 스스로 들고, onClose 로 닫는다.
function Overlay({ name, refuseClose = false }: OverlayProps) {
  const [open, setOpen] = useState(true);
  useBackDismiss(open, () => {
    closeSpy(name);
    if (!refuseClose) setOpen(false);
  });
  return open ? <div data-testid={`overlay-${name}`} /> : null;
}

describe('useBackDismiss', () => {
  beforeEach(() => {
    closeSpy.mockClear();
    window.history.replaceState({ marker: 'page' }, '');
  });

  afterEach(async () => {
    cleanup();
    // 언마운트 정리가 예약한 back() 을 흘려보낸 뒤 다음 테스트로 넘어간다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('열리면 히스토리 엔트리를 1개 push 하고, 뒤로가기 1회에 닫힌다', async () => {
    const { queryByTestId } = render(<Overlay name="a" />);
    expect(queryByTestId('overlay-a')).not.toBeNull();
    expect(window.history.state.__overlayId).toEqual(expect.any(Number));

    await pressBack();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(queryByTestId('overlay-a')).toBeNull();
    // 페이지 엔트리로 되돌아왔다 — 마커가 없다.
    expect(window.history.state.__overlayId).toBeUndefined();
  });
});
```

- [ ] **Step 4: 테스트 실행해 실패 확인**

Run: `pnpm vitest run test/_lib/back-dismiss.test.tsx`
Expected: FAIL — `Failed to resolve import "@/app/_lib/backDismiss"`

- [ ] **Step 5: 모듈 구현**

`apps/web/app/_lib/backDismiss.ts` 전체:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';

// 오버레이(바텀시트·모달·드로어)가 열려 있는 동안 히스토리 엔트리를 1개 물고 있다가,
// 뒤로가기를 그 엔트리로 흡수해 페이지 이동 대신 최상단 오버레이만 닫는다.
//
// URL 은 바꾸지 않는다 — pushState 에 url 인자를 넘기지 않기 때문이며, 우리 엔트리는 아래 페이지
// 엔트리와 같은 URL 이 된다. 그래서 판정이 어긋나 back 이 한 번 더 일어나도 화면 이동은 발생하지
// 않는다(최악이 "아무 일도 안 일어남").
//
// 버전 의존 주의(Next 15.5.18 의 app-router.js 확인 기준): Next 는 history.pushState/replaceState 를
// 패치하지만 state 에 __NA 가 있으면 조기 반환해 원본 API 를 그대로 부른다. 그래서 기존 history.state 를
// 펼쳐 __NA·내부 트리를 직접 들고 간다 — Next 가 내부 필드를 복사해 준다는 동작에 기대지 않기 위해서다.
// state 를 통째로 갈아치우면 __NA 가 유실돼 그 엔트리로 되돌아올 때 Next 가 location.reload() 를 부른다.
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

  // 먼저 스택에서 제거한다 — 재진입 popstate 가 같은 오버레이를 두 번 집지 못하게 하는 장치는
  // 게이트 플래그가 아니라 이 순서다(게이트를 두면 아래 자동 스킵 연쇄가 끊긴다).
  const dismissed = landedOnLiveEntry ? stack.splice(landedIndex + 1) : stack.splice(0);

  if (dismissed.length > 0) {
    queueMicrotask(() => {
      for (let index = dismissed.length - 1; index >= 0; index -= 1) dismissed[index].close();
    });
  }

  if (landedOnDeadEntry && skipBudget > 0) {
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

  // 이전 문서가 남긴 마커가 현재 엔트리에 붙어 있으면 지운다. 자동 히스토리 이동은 하지 않는다 —
  // 판정이 틀렸을 때 "매 페이지 로드마다 히스토리를 한 칸 먹는" 훨씬 나쁜 실패 모드가 된다.
  // ponytail: 시트를 연 채 새로고침하면 그 잔존 엔트리 위에서 문서가 시작해 뒤로가기 1회가 먹힌다
  // (같은 URL 이라 화면 변화는 없음). 해소하려면 로드 시 자동 back 이 필요해 의도적으로 남긴다.
  const { token } = readMarker(window.history.state);
  if (token !== null && token !== DOCUMENT_TOKEN) {
    // 마커 두 개만 지운다 — state 를 통째로 갈아치우면 Next 의 __NA·내부 트리가 날아간다.
    window.history.replaceState(withMarker({ __overlayToken: undefined, __overlayId: undefined }), '');
  }

  // 리스너는 문서 수명 동안 1개만 유지한다. 스택이 빌 때마다 해제하면 코드 닫기가 예약한 back() 의
  // popstate 를 놓쳐 자기 유발 traversal 회계가 어긋난다. installed 플래그로 중복 등록은 없다.
  window.addEventListener('popstate', handlePopState);
}

/**
 * 오버레이가 열려 있는 동안 뒤로가기를 흡수한다.
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
        // Next 의 진행 중 내비게이션을 외부에서 관측할 방법이 없어 0 으로 만들 수 없다. 튕기는 대신
        // 가드에 걸리면 엔트리는 죽은 상태로 남았다가 자동 스킵된다.
        if (token !== DOCUMENT_TOKEN || id !== entry.id) return;
        selfTraversals += 1;
        window.history.back();
      });
    };
  }, [open, consumedGeneration]);
}
```

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `pnpm vitest run test/_lib/back-dismiss.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: 나머지 케이스 테스트 추가**

`describe('useBackDismiss')` 블록 안에 이어서 추가한다:

```tsx
  it('중첩 오버레이는 최상단부터 순차적으로 닫힌다', async () => {
    const { queryByTestId } = render(
      <>
        <Overlay name="a" />
        <Overlay name="b" />
      </>,
    );

    await pressBack();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenLastCalledWith('b');
    expect(queryByTestId('overlay-a')).not.toBeNull();

    await pressBack();
    expect(closeSpy).toHaveBeenLastCalledWith('a');
    expect(queryByTestId('overlay-a')).toBeNull();
    expect(window.history.state.__overlayId).toBeUndefined();
  });

  it('코드로 닫으면 엔트리를 회수해 다음 뒤로가기는 페이지 몫이 된다', async () => {
    function CodeClosed() {
      const [open, setOpen] = useState(true);
      useBackDismiss(open, () => setOpen(false));
      return open ? (
        <button type="button" onClick={() => setOpen(false)}>
          닫기
        </button>
      ) : null;
    }

    const { getByRole } = render(<CodeClosed />);
    await act(async () => {
      getByRole('button').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 우리 엔트리가 회수돼 페이지 엔트리 위에 앉아 있다.
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('중간 오버레이를 코드로 닫아도 죽은 뒤로가기가 생기지 않는다', async () => {
    function Pair() {
      const [lowerOpen, setLowerOpen] = useState(true);
      const [upperOpen, setUpperOpen] = useState(true);
      useBackDismiss(lowerOpen, () => setLowerOpen(false));
      useBackDismiss(upperOpen, () => {
        closeSpy('upper');
        setUpperOpen(false);
      });
      return (
        <button type="button" onClick={() => setLowerOpen(false)}>
          아래 닫기
        </button>
      );
    }

    const { getByRole } = render(<Pair />);
    // 아래(중간) 오버레이만 코드로 닫는다 — 히스토리에는 주인 없는 엔트리가 남는다.
    await act(async () => {
      getByRole('button').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 뒤로가기 1회로 위 오버레이가 닫히고, 죽은 엔트리는 자동 스킵돼 페이지 엔트리까지 내려온다.
    await pressBack();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(closeSpy).toHaveBeenCalledWith('upper');
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('이전 문서 토큰이 붙은 엔트리는 죽은 엔트리로 보고 건너뛴다', async () => {
    render(<Overlay name="a" />);
    // 오버레이 엔트리 아래에 이전 문서의 잔존 엔트리가 있는 상황을 만든다.
    const overlayState = window.history.state;
    window.history.replaceState({ __overlayToken: 'stale-doc', __overlayId: 99 }, '');
    window.history.pushState(overlayState, '');

    await pressBack();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(closeSpy).toHaveBeenCalledWith('a');
    expect(window.history.state).toEqual({ marker: 'page' });
  });

  it('소비처가 닫기를 거부하면 엔트리를 다시 push 한다', async () => {
    const { queryByTestId } = render(<Overlay name="a" refuseClose />);

    await pressBack();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(queryByTestId('overlay-a')).not.toBeNull();
    expect(window.history.state.__overlayId).toEqual(expect.any(Number));

    // 여전히 열려 있으므로 두 번째 뒤로가기도 시트가 먹는다.
    await pressBack();
    expect(closeSpy).toHaveBeenCalledTimes(2);
    expect(queryByTestId('overlay-a')).not.toBeNull();
  });

  it('죽은 엔트리가 많아도 자동 스킵은 10회로 제한된다', async () => {
    render(<Overlay name="a" />);
    const backSpy = vi.spyOn(window.history, 'back');
    for (let index = 0; index < 15; index += 1) {
      window.history.pushState({ __overlayToken: 'stale-doc', __overlayId: index }, '');
    }

    await pressBack();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // 최초 1회(테스트가 부른 back) + 자동 스킵 10회 이하
    expect(backSpy.mock.calls.length).toBeLessThanOrEqual(11);
    backSpy.mockRestore();
  });

  it('오버레이를 여러 번 열고 닫아도 popstate 리스너는 추가로 등록되지 않는다', async () => {
    // 첫 마운트에서 설치가 끝난 상태를 만든 뒤부터 관찰한다.
    cleanup();
    const addListenerSpy = vi.spyOn(window, 'addEventListener');
    for (let index = 0; index < 3; index += 1) {
      const { unmount } = render(<Overlay name={`loop-${index}`} />);
      unmount();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    const popstateRegistrations = addListenerSpy.mock.calls.filter(([type]) => type === 'popstate');
    expect(popstateRegistrations).toHaveLength(0);
    addListenerSpy.mockRestore();
  });
```

- [ ] **Step 8: 전체 테스트·타입·린트 확인**

Run: `pnpm vitest run test/_lib/back-dismiss.test.tsx`
Expected: PASS (9 tests)

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 0

실패하는 테스트가 있으면 **모듈을 고치고**, 테스트를 느슨하게 바꾸지 않는다. 단 `pressBack()` 의 대기 시간 부족으로 인한 불안정은 대기 방식(`setTimeout` 0 → 10ms)을 조정해도 된다.

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/_lib/backDismiss.ts apps/web/test/_lib/back-dismiss.test.tsx
git commit -m "feat(frontend): 오버레이 뒤로가기 닫기 코어 — 문서 토큰·오버레이 ID 기반 히스토리 스택"
```

---

### Task 2: Radix Dialog/Sheet Root 래핑

**Files:**
- Modify: `apps/web/components/ui/dialog.tsx` (Root 정의부)
- Modify: `apps/web/components/ui/sheet.tsx` (Root 정의부)
- Test: `apps/web/test/components/back-dismiss-overlays.test.tsx` (신규)

**Interfaces:**
- Consumes: `useBackDismiss(open, onClose)` — Task 1
- Produces: `Dialog`, `Sheet` 가 기존과 동일한 props(`open`, `onOpenChange`, `children`, `modal` 등)를 받는 컴포넌트. 호출처 약 60곳은 수정하지 않는다.

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/test/components/back-dismiss-overlays.test.tsx`:

```tsx
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

async function pressBack() {
  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Radix 오버레이 뒤로가기 닫기', () => {
  it('Dialog 가 열린 상태의 뒤로가기는 다이얼로그만 닫는다', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>제목</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }

    const { queryByText } = render(<Host />);
    expect(queryByText('제목')).not.toBeNull();

    await pressBack();

    expect(queryByText('제목')).toBeNull();
  });

  it('Sheet 가 열린 상태의 뒤로가기는 시트만 닫는다', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom">
            <SheetTitle>필터</SheetTitle>
          </SheetContent>
        </Sheet>
      );
    }

    const { queryByText } = render(<Host />);
    expect(queryByText('필터')).not.toBeNull();

    await pressBack();

    expect(queryByText('필터')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm vitest run test/components/back-dismiss-overlays.test.tsx`
Expected: FAIL — 뒤로가기 후에도 '제목'/'필터' 가 남아 있다.

- [ ] **Step 3: `dialog.tsx` Root 교체**

`apps/web/components/ui/dialog.tsx` 에서 import 에 훅을 추가하고:

```tsx
import { useBackDismiss } from '@/app/_lib/backDismiss';
```

`const Dialog = DialogPrimitive.Root;` 를 아래로 교체한다:

```tsx
// 열려 있는 동안 뒤로가기(안드로이드 버튼·제스처, iOS 엣지 스와이프, 브라우저 뒤로가기)를 흡수해
// 페이지 이동 대신 이 다이얼로그만 닫는다. 호출처는 기존과 동일한 props 를 쓴다.
function Dialog({
  open,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  useBackDismiss(open === true, onOpenChange ? () => onOpenChange(false) : null);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />;
}
```

- [ ] **Step 4: `sheet.tsx` Root 교체**

`apps/web/components/ui/sheet.tsx` 에 동일하게 import 를 추가하고:

```tsx
import { useBackDismiss } from '@/app/_lib/backDismiss';
```

`const Sheet = SheetPrimitive.Root;` 를 아래로 교체한다:

```tsx
// 열려 있는 동안 뒤로가기(안드로이드 버튼·제스처, iOS 엣지 스와이프, 브라우저 뒤로가기)를 흡수해
// 페이지 이동 대신 이 시트만 닫는다. 호출처는 기존과 동일한 props 를 쓴다.
function Sheet({
  open,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Root>) {
  useBackDismiss(open === true, onOpenChange ? () => onOpenChange(false) : null);
  return <SheetPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run test/components/back-dismiss-overlays.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: 기존 오버레이 테스트 회귀 확인**

Run: `pnpm vitest run test/components test/admin test/facilities test/manage`
Expected: 기존과 동일하게 PASS. 실패가 나오면 **원인을 먼저 파악한다** — 래핑이 `open`/`onOpenChange` 전달을 빠뜨렸는지, 테스트가 히스토리를 공유해 깨지는지 구분한다.

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 0

- [ ] **Step 7: 커밋**

```bash
git add apps/web/components/ui/dialog.tsx apps/web/components/ui/sheet.tsx apps/web/test/components/back-dismiss-overlays.test.tsx
git commit -m "feat(frontend): Dialog·Sheet Root 에 뒤로가기 닫기 연결 — 호출처 무수정 일괄 적용"
```

---

### Task 3: 사용자 화면 수제 오버레이 8곳 적용

**Files:**
- Modify: `apps/web/app/clubs/[clubId]/member/_components/ClubEventFormModal.tsx`
- Modify: `apps/web/app/clubs/[clubId]/member/_components/ClubNoticeFormModal.tsx`
- Modify: `apps/web/app/calendar/_components/EventDetailModal.tsx`
- Modify: `apps/web/app/calendar/_components/AddEventDispatcher.tsx`
- Modify: `apps/web/app/calendar/_pages/CalendarPage.tsx`
- Modify: `apps/web/app/me/applications/_components/ApplyDetailModal.tsx`
- Modify: `apps/web/app/me/applications/[applicationId]/_components/RespondAvailabilityModal.tsx`
- Modify: `apps/web/components/report/ReportModal.tsx`
- Modify: `apps/web/app/clubs/[clubId]/_components/PhotoLightbox.tsx`
- Modify: `apps/web/app/notices/_components/NoticeImageLightbox.tsx`

**Interfaces:**
- Consumes: `useBackDismiss(open, onClose)` — Task 1
- Produces: 없음(외부 시그니처 변경 없음)

**공통 규칙 — 어긋나면 런타임 에러가 난다:**

1. import 는 각 파일의 기존 `@/app/...` import 그룹에 맞춰 넣는다: `import { useBackDismiss } from '@/app/_lib/backDismiss';`
   `components/report/ReportModal.tsx` 도 같은 경로를 쓴다(`cn` 이 `@/app/_lib/cn` 을 쓰는 것과 동일한 전례).
2. 훅 호출은 **컴포넌트 최상단, 모든 조기 반환(`if (!open) return null`) 보다 위**에 둔다. 아래에 두면 훅 규칙 위반으로 렌더가 깨진다.
3. 마운트 자체가 열림인 컴포넌트는 `useBackDismiss(true, onClose)`.
4. 기존 마크업·스타일·Escape 리스너·닫기 로직은 건드리지 않는다.

- [ ] **Step 1: 마운트=열림 컴포넌트 4곳 적용**

`ClubEventFormModal.tsx` — `export function ClubEventFormModal(props: Props) {` 바로 다음 줄에:

```tsx
  useBackDismiss(true, props.onClose);
```

`ClubNoticeFormModal.tsx` — 동일하게 컴포넌트 본문 첫 줄에 `useBackDismiss(true, props.onClose);`
(props 구조분해를 쓰고 있으면 그 이름에 맞춘다.)

`RespondAvailabilityModal.tsx` — `export function RespondAvailabilityModal({ ..., onClose, ... }: Props) {` 본문 첫 줄에:

```tsx
  useBackDismiss(true, onClose);
```

`components/report/ReportModal.tsx` — `export function ReportModal({ targetType, targetId, targetLabel, onClose }: Props) {` 본문 첫 줄에:

```tsx
  useBackDismiss(true, onClose);
```

- [ ] **Step 2: `open` prop 컴포넌트 4곳 적용**

`EventDetailModal.tsx` — `export function EventDetailModal({ event, open, onClose }: Props) {` 본문에서 **`if (!open) return null;` 위**에:

```tsx
  useBackDismiss(open, onClose);
```

`AddEventDispatcher.tsx` — `export function AddEventDispatcher({ open, onClose }: Props) {` 본문에서 **`if (!open) return null;` 위**에:

```tsx
  useBackDismiss(open, onClose);
```

`ApplyDetailModal.tsx` — `export function ApplyDetailModal({ app, detail, onClose }: ApplyDetailModalProps) {` 본문에서 **`if (!app) return null;` 위**에 (`app` 존재가 곧 열림이다):

```tsx
  useBackDismiss(app !== null, onClose);
```

`app` 의 타입이 `undefined` 도 허용하면 `useBackDismiss(app != null, onClose)` 로 쓴다.

`CalendarPage.tsx` — `const [detailOpen, setDetailOpen] = useState<boolean>(false);` (166행 부근) 아래에:

```tsx
  // 모바일에서는 바텀시트, 데스크톱에서는 사이드 패널 — 뷰포트 분기 없이 뒤로가기로 닫는다.
  useBackDismiss(detailOpen, () => setDetailOpen(false));
```

- [ ] **Step 3: 라이트박스 2곳 적용**

이 둘은 `DialogPrimitive.Root` 를 직접 쓰므로 Task 2 의 래핑이 닿지 않는다.

`PhotoLightbox.tsx` — `export function PhotoLightbox({ slides, initialIndex, open, onClose }: Props) {` 본문 첫 줄에:

```tsx
  useBackDismiss(open, onClose);
```

`NoticeImageLightbox.tsx` — `export function NoticeImageLightbox({ image, onClose }: Props) {` 본문에서 내부 `open` 계산 이후, 조기 반환보다 위에:

```tsx
  useBackDismiss(open, onClose);
```

`open` 이 `image !== null` 같은 파생값이면 그 값을 그대로 넘긴다. **파일을 읽고 실제 변수명을 확인한 뒤 작성한다.**

- [ ] **Step 4: 타입·린트·테스트 확인**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 0 — 특히 "React Hook is called conditionally" 는 Step 1~3 의 배치 규칙 2번 위반이다.

Run: `pnpm vitest run`
Expected: 전량 PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/app/clubs apps/web/app/calendar apps/web/app/me apps/web/app/notices apps/web/components/report
git commit -m "feat(frontend): 사용자 화면 수제 오버레이·라이트박스에 뒤로가기 닫기 적용"
```

---

### Task 4: 관리 콘솔 수제 오버레이 6곳 적용

**Files:**
- Modify: `apps/web/app/manage/clubs/[clubId]/fees/_components/BankReviewQueue.tsx` (오버레이 2개)
- Modify: `apps/web/app/manage/clubs/[clubId]/fees/_components/BillList.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/fees/_components/PolicyList.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/fees/_components/PaymentHistory.tsx`
- Modify: `apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx`

**Interfaces:**
- Consumes: `useBackDismiss(open, onClose)` — Task 1
- Produces: 없음

Task 3 의 공통 규칙 4가지가 그대로 적용된다(import 경로 `@/app/_lib/backDismiss`, 조기 반환보다 위, 마운트=열림은 `true`, 마크업 무수정).

- [ ] **Step 1: 확인 모달 컴포넌트 5곳 적용**

아래 컴포넌트들은 모두 **마운트 자체가 열림**이고 `onClose` prop 을 이미 받는다. 각 컴포넌트 본문 첫 줄에 `useBackDismiss(true, onClose);` 를 넣는다.

| 파일 | 컴포넌트 |
| --- | --- |
| `fees/_components/BankReviewQueue.tsx` | `IgnoreTransactionConfirm` |
| `fees/_components/BillList.tsx` | `CancelBillConfirm` |
| `fees/_components/PolicyList.tsx` | `DeletePolicyConfirm` |
| `fees/_components/FeeAccountSection.tsx` | `DeleteFeeAccountConfirm` |
| `fees/_components/PaymentHistory.tsx` | `VoidPaymentConfirm` |

`PaymentHistory.tsx` 의 `PaymentHistory` 본체는 `<Dialog open …>` 이라 Task 2 래핑이 이미 커버한다 — **중복으로 훅을 넣지 않는다.**

- [ ] **Step 2: 인라인 상태 오버레이 2곳 적용**

`BankReviewQueue.tsx` 의 `MatchedTransactionRow` 는 별도 컴포넌트가 아니라 `isUnmatchOpen` 상태로 오버레이를 인라인 렌더한다. 상태 선언 아래에 넣는다:

```tsx
  useBackDismiss(isUnmatchOpen, () => setUnmatchOpen(false));
```

상태·세터 이름은 파일을 읽고 실제 이름으로 맞춘다.

`app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx` 의 마감 확인 모달(`showCloseConfirm`) — 상태 선언 아래에:

```tsx
  useBackDismiss(showCloseConfirm, () => setShowCloseConfirm(false));
```

- [ ] **Step 3: 남은 수제 오버레이가 없는지 확인**

Run:
```bash
cd frontend/apps/web && grep -rn "fixed inset-0\|position: 'fixed'" --include="*.tsx" app components | grep -v "components/ui/" | grep -v "z-40\|z-30"
```
Expected: 출력에 남는 항목이 전부 Task 3·4 에서 처리한 파일이거나 비모달 UI(하단 고정 액션바, BottomNav, 토스트)여야 한다. 처리 안 된 모달이 나오면 같은 방식으로 추가하고 이 계획에 기록한다.

- [ ] **Step 4: 타입·린트·전체 테스트**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: 전량 PASS, 에러 0

- [ ] **Step 5: 커밋**

```bash
git add "apps/web/app/manage"
git commit -m "feat(frontend): 관리 콘솔 회비·모집 확인 모달에 뒤로가기 닫기 적용"
```

---

### Task 5: 실브라우저 검증 + 마무리

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-overlay-back-close-design.md` (상태 갱신)

**Interfaces:**
- Consumes: Task 1~4 전부
- Produces: 실기기 QA 체크리스트(사용자 전달용)

- [ ] **Step 1: 개발 서버 기동**

Run: `cd frontend/apps/web && pnpm dev > /tmp/duing-dev.log 2>&1 &`
로그를 파일로 받는다 — 파이프(`| head`)로 띄우면 파이프가 닫히며 서버가 죽는다.
`/tmp/duing-dev.log` 에서 `Local:` 포트가 **3000** 인지 확인한다. 3001 로 밀렸으면 좀비 서버가 3000 을 점유한 것이니 부모 → 워커(next-server) → 포트 순으로 정리 후 재기동한다.

- [ ] **Step 2: 시나리오 A — 시트만 닫히고 페이지 유지**

Playwright MCP 로 `http://localhost:3000/clubs` 접속 → 모바일 뷰포트(390×844)로 리사이즈 → 필터 시트 열기 → `browser_navigate_back` → 시트가 닫히고 URL 이 `/clubs` 그대로인지 확인 → 다시 `browser_navigate_back` → 이전 페이지로 이동하는지 확인.

- [ ] **Step 3: 시나리오 B — 닫기 + 이동 동시 경로**

로그인 상태에서 알림 시트를 열고 항목을 탭한다(닫기와 페이지 이동이 겹치는 경로). 이동이 정상인지, 뒤로가기 1회로 원래 페이지에 돌아오는지 확인한다. `browser_console_messages` 로 에러가 없는지도 본다.

- [ ] **Step 4: 시나리오 C — 코드 닫기 후 뒤로가기**

같은 필터 시트를 열고 **적용/닫기 버튼으로** 닫은 뒤 뒤로가기 1회 → 이전 페이지로 이동해야 한다(제자리에 머물면 엔트리 회수가 실패한 것이다).

- [ ] **Step 5: 개발 서버 종료**

시각 QA가 끝나면 개발 서버를 종료한다(부모 프로세스 → 워커 순).

- [ ] **Step 6: 설계 문서 상태 갱신 + 커밋**

`docs/superpowers/specs/2026-08-03-overlay-back-close-design.md` 헤더의 `상태: 승인 대기` 를 `상태: 구현 완료 (실기기 QA 대기)` 로 바꾼다.

```bash
git add docs/superpowers/specs/2026-08-03-overlay-back-close-design.md
git commit -m "docs(spec): 오버레이 뒤로가기 닫기 구현 완료 상태 반영"
```

- [ ] **Step 7: 사용자에게 실기기 체크리스트 전달**

아래 항목을 그대로 보고한다(자동화 불가 — 사용자 수행):

- Android Chrome 시스템 뒤로가기 버튼 / 뒤로가기 제스처
- iOS Safari 엣지 스와이프 백 / iOS Chrome
- PWA standalone 실행
- 각 환경에서: 단일 시트 / 중첩 시트 / 버튼으로 닫은 뒤 뒤로가기 / 드로어 메뉴 탭으로 페이지 이동 / 시트 연 채 새로고침 후 뒤로가기

**push·PR 생성은 사용자 지시 후에만 한다.**

---

## Self-Review

**Spec coverage**

| 스펙 요구 | 담당 |
| --- | --- |
| pushState/popstate 기반 히스토리 관리 | Task 1 Step 5 |
| 문서 토큰 + 오버레이 ID 별도 필드 | Task 1 Step 5 (`readMarker`, `pushState`) |
| 스택(LIFO) 순차 닫기 | Task 1 Step 5 `handlePopState` + Step 7 중첩 테스트 |
| 코드 닫기 시 히스토리 정리 | Task 1 Step 5 cleanup + Step 7 코드 닫기 테스트 |
| 죽은 엔트리 자동 스킵(죽은 뒤로가기 제거) | Task 1 Step 5 `landedOnDeadEntry` + Step 7 중간 닫기/이전 문서 테스트 |
| 로드 시 자동 back 금지·replaceState 만 | Task 1 Step 5 `install()` |
| 선 splice + queueMicrotask + 자기 유발 카운터 | Task 1 Step 5 `handlePopState` |
| 리스너 중복 등록·누수 방지 | Task 1 Step 5 `installed` + Step 7 리스너 테스트 |
| Radix 전체 적용(약 60곳) | Task 2 |
| 수제 오버레이 16곳 | Task 3(10) + Task 4(6+2 인라인) |
| 라이트박스 포함 | Task 3 Step 3 |
| 드롭다운/팝오버 제외 | 어느 Task 에서도 건드리지 않음 |
| 페이지 이동·새로고침·딥링크·Forward 보존 | URL 무변경 설계 + Task 5 시나리오 A~C |
| 접근성 유지 | 기존 `onClose`/`onOpenChange` 경로만 재사용 — 신규 포커스 처리 없음 |
| 플랫폼 검증 | Task 5 Step 2~4(실브라우저) + Step 7(실기기, 사용자) |

**Placeholder scan:** "TBD"·"적절히 처리" 류 없음. 파일별 실제 심볼명을 확인하라고 지시한 곳(NoticeImageLightbox 의 `open` 파생값, BankReviewQueue 의 상태명)은 원본 파일을 읽어야 확정되는 값이라 의도적으로 확인 절차를 남겼다.

**Type consistency:** `useBackDismiss(open: boolean, onClose?: (() => void) | null)` 시그니처가 Task 2~4 전부에서 동일하게 쓰인다. `readMarker` 반환은 `{ token: string | null; id: number | null }` 로 `handlePopState`·cleanup 양쪽에서 같은 필드명을 쓴다.
