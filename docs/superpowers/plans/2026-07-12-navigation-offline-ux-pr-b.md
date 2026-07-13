# PR-B: 내비게이션 UX — 동적 라우트 loading.tsx·오프라인 감지·내비게이션 가드

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라우트 전환이 느린 회선에서도 4초 안에 커밋되게 하여 VT TimeoutError를 근절하고, 오프라인 내비게이션 시도를 차단·안내해 브라우저 오류 페이지 이탈을 막는다.

**Architecture:** 공용 `RouteLoading`을 쓰는 `loading.tsx`를 공개 동적 라우트 3곳에 배치(재현 실험으로 효과 입증 — 클릭 +0.5s 커밋, TimeoutError 0건). 오프라인은 `useOnlineStatus`(useSyncExternalStore) 훅 하나를 배너와 전역 클릭 가드가 공유하며, 가드는 document capture 단계에서 내부 앵커 클릭을 차단한다(VT Link·일반 Link 모두 한 지점 방어).

**Tech Stack:** Next.js 15 App Router(`loading.tsx`), React 19 `useSyncExternalStore`, 자체 ToastProvider, vitest + testing-library(jsdom) + 실브라우저 QA(Playwright MCP).

**스펙:** `docs/superpowers/specs/2026-07-12-network-resilience-design.md` §4

## Global Constraints

- 브랜치: PR-A 머지 전이면 `feat/fe-network-resilience`에 이어서, 분리 시 develop에서 `feat/fe-navigation-offline-ux` 분기 — push·PR 생성은 하지 않는다(리뷰 후 별도 진행)
- 커밋 메시지: 한국어 Conventional Commits, Co-Authored-By/Generated 라인 금지
- `'use client'` 최소화 원칙 유지 — 신규 클라이언트 컴포넌트는 이 계획의 4개뿐
- 오프라인 안내 문구는 PR-A와 동일하게 "인터넷 연결을 확인해주세요." 를 글자 그대로 사용
- 고정 오버레이에 배경 미지정 금지(.duing 스코프 bg-cream 전파 함정) — 배너는 배경을 명시
- jsdom이 못 잡는 실브라우저 동작(클릭 캡처·하드 내비게이션)은 Task 5 QA로 검증 — 생략 금지
- 색상 토큰(`text-charcoal-2` 등)은 `apps/web/tailwind.config.ts` 에 실재하는 것만 사용(작성 전 확인)

---

### Task 1: RouteLoading 공용 컴포넌트 + 동적 라우트 loading.tsx 3곳

**Files:**
- Create: `frontend/apps/web/app/_components/RouteLoading.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/loading.tsx`
- Create: `frontend/apps/web/app/facilities/[facilityId]/loading.tsx`
- Create: `frontend/apps/web/app/notices/[noticeId]/loading.tsx`
- Test: `frontend/apps/web/test/components/route-loading.test.tsx` (신규)

**Interfaces:**
- Produces: `RouteLoading()` — 프롭 없는 로딩 화면. 이후 동적 라우트 loading.tsx가 재사용

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/apps/web/test/components/route-loading.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteLoading } from '@/app/_components/RouteLoading';

describe('RouteLoading', () => {
  it('스크린리더에 로딩 상태를 알리고 기존 로딩 문구 컨벤션을 따른다', () => {
    render(<RouteLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run (cwd `frontend/`): `pnpm --filter @duing/web test -- route-loading`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_components/RouteLoading.tsx`:

```tsx
// 라우트 전환용 공용 로딩 화면 — 동적 라우트의 loading.tsx 가 사용한다.
// 동적 라우트는 클릭 시점에 풀 RSC 페이로드 fetch 가 필요해, 로딩 경계가 없으면 느린 회선에서
// 커밋이 fetch 완료까지 밀려 View Transition 의 브라우저 데드라인(~4s)을 넘긴다
// (TimeoutError: Transition was aborted…, Sentry NEXT-DUING-9 — 재현 실험으로 확인).
// 이 경계는 프리페치에 포함되어 클릭 즉시 커밋을 가능하게 한다.
export function RouteLoading() {
  return (
    <div role="status" className="flex min-h-[60vh] items-center justify-center">
      <p className="animate-pulse text-sm text-charcoal-2">불러오는 중…</p>
    </div>
  );
}
```

`frontend/apps/web/app/clubs/[clubId]/loading.tsx` (facilities/[facilityId]·notices/[noticeId]도 동일 내용):

```tsx
import { RouteLoading } from '@/app/_components/RouteLoading';

export default function Loading() {
  return <RouteLoading />;
}
```

- [ ] **Step 4: 통과 확인 + 빌드로 라우트 인식 확인**

Run: `pnpm --filter @duing/web test -- route-loading` → PASS
Run: `pnpm --filter @duing/web build` → 성공 (loading.tsx는 라우트 테이블에 별도 표기되지 않지만 빌드 오류가 없어야 함)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/RouteLoading.tsx "frontend/apps/web/app/clubs/[clubId]/loading.tsx" "frontend/apps/web/app/facilities/[facilityId]/loading.tsx" "frontend/apps/web/app/notices/[noticeId]/loading.tsx" frontend/apps/web/test/components/route-loading.test.tsx
git commit -m "feat(frontend): 공개 동적 라우트 3곳에 로딩 경계 추가 — 느린 회선 전환 무피드백·VT TimeoutError 해소"
```

---

### Task 2: useOnlineStatus 훅

**Files:**
- Create: `frontend/apps/web/app/_lib/useOnlineStatus.ts`
- Test: `frontend/apps/web/test/lib/use-online-status.test.tsx` (신규)

**Interfaces:**
- Produces: `useOnlineStatus(): boolean` — Task 3(배너)이 사용. SSR 스냅샷은 항상 `true`(하이드레이션 mismatch 방지)

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/apps/web/test/lib/use-online-status.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '@/app/_lib/useOnlineStatus';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('useOnlineStatus', () => {
  it('navigator.onLine 초기값을 반환한다', () => {
    mockNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('offline/online 이벤트에 반응한다', () => {
    mockNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());

    mockNavigatorOnLine(false);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);

    mockNavigatorOnLine(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- use-online-status`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `frontend/apps/web/app/_lib/useOnlineStatus.ts`

```ts
'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// SSR 은 항상 온라인으로 렌더한다 — 초기 HTML/하이드레이션 mismatch 방지.
// 실제 오프라인이면 하이드레이션 직후 offline 스냅샷으로 갱신된다.
function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- use-online-status` → PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_lib/useOnlineStatus.ts frontend/apps/web/test/lib/use-online-status.test.tsx
git commit -m "feat(frontend): online/offline 이벤트 기반 useOnlineStatus 훅 추가"
```

---

### Task 3: 전역 오프라인 배너

**Files:**
- Create: `frontend/apps/web/app/_components/OfflineBanner.tsx`
- Modify: `frontend/apps/web/app/providers.tsx` (배선)
- Test: `frontend/apps/web/test/components/offline-banner.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 2의 `useOnlineStatus()`

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/apps/web/test/components/offline-banner.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '@/app/_components/OfflineBanner';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('OfflineBanner', () => {
  it('온라인이면 렌더하지 않는다', () => {
    mockNavigatorOnLine(true);
    render(<OfflineBanner />);
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('오프라인 전환 시 배너를 띄우고 복귀 시 제거한다', () => {
    mockNavigatorOnLine(false);
    render(<OfflineBanner />);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent('인터넷 연결을 확인해주세요.');

    mockNavigatorOnLine(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- offline-banner`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`frontend/apps/web/app/_components/OfflineBanner.tsx`:

```tsx
'use client';

import { useOnlineStatus } from '@/app/_lib/useOnlineStatus';

// 오프라인 동안 상단에 고정되는 슬림 배너. 온라인 복귀 시 자동 제거.
// 고정 오버레이는 배경을 명시한다 — .duing 스코프가 bg-cream 을 전파해 상단 띠가 생기는 함정 회피.
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] bg-charcoal px-4 py-2 text-center text-xs font-medium text-white"
    >
      인터넷 연결을 확인해주세요.
    </div>
  );
}
```

`bg-charcoal`이 tailwind.config.ts에 없으면 실재하는 가장 진한 중립 토큰으로 교체(예: `bg-charcoal-2`·`bg-neutral-900` 중 실재하는 것). z-index는 ToastProvider 오버레이보다 낮게(토스트가 위) — ToastProvider의 z 값을 확인해 조정.

`providers.tsx` 배선 — `<SessionExpiryHandler />` 옆에 추가:

```tsx
import { OfflineBanner } from './_components/OfflineBanner';
```

```tsx
          <ToastProvider>
            <SessionExpiryHandler />
            <OfflineBanner />
            {children}
          </ToastProvider>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- offline-banner` → PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/OfflineBanner.tsx frontend/apps/web/app/providers.tsx frontend/apps/web/test/components/offline-banner.test.tsx
git commit -m "feat(frontend): 오프라인 상단 고정 배너 추가"
```

---

### Task 4: 오프라인 내비게이션 가드 (전역 클릭 캡처)

**Files:**
- Create: `frontend/apps/web/app/_components/OfflineNavigationGuard.tsx`
- Modify: `frontend/apps/web/app/providers.tsx` (배선)
- Test: `frontend/apps/web/test/components/offline-navigation-guard.test.tsx` (신규)

**Interfaces:**
- Consumes: ToastProvider의 `useToast().addToast(message, { variant })`

배경(재현 실험 F4): 오프라인에서 내부 라우트 클릭 시 RSC fetch가 즉시 실패하고 Next 라우터가 하드 내비게이션으로 폴백해 브라우저 오류 페이지로 앱을 이탈한다(클릭 +12ms). `loading.tsx`로도 못 막는다(로딩 커밋 직후 하드내비 확인). 시도 자체를 차단하는 것이 유일한 방어다.

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/apps/web/test/components/offline-navigation-guard.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { OfflineNavigationGuard } from '@/app/_components/OfflineNavigationGuard';

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

function renderWithGuard(anchor: React.ReactNode) {
  return render(
    <ToastProvider>
      <OfflineNavigationGuard />
      {anchor}
    </ToastProvider>,
  );
}

describe('OfflineNavigationGuard', () => {
  it('오프라인에서 내부 라우트 앵커 클릭을 차단하고 토스트를 띄운다', async () => {
    mockNavigatorOnLine(false);
    const user = userEvent.setup();
    renderWithGuard(<a href="/clubs/1">동아리로</a>);

    const clickListener = vi.fn();
    document.querySelector('a')?.addEventListener('click', (clickEvent) => {
      clickListener(clickEvent.defaultPrevented);
    });
    await user.click(screen.getByText('동아리로'));

    expect(clickListener).toHaveBeenCalledWith(true); // defaultPrevented
    expect(await screen.findByText('인터넷 연결을 확인해주세요.')).toBeInTheDocument();
  });

  it('온라인이면 개입하지 않는다', async () => {
    mockNavigatorOnLine(true);
    const user = userEvent.setup();
    renderWithGuard(<a href="/clubs/1">동아리로</a>);
    await user.click(screen.getByText('동아리로'));
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });

  it('외부 링크·새 탭·다운로드·해시 앵커는 차단하지 않는다', async () => {
    mockNavigatorOnLine(false);
    const user = userEvent.setup();
    renderWithGuard(
      <>
        <a href="https://example.com">외부</a>
        <a href="/file.zip" download>
          다운로드
        </a>
        <a href="/docs" target="_blank" rel="noreferrer">
          새탭
        </a>
        <a href="#section">해시</a>
      </>,
    );
    await user.click(screen.getByText('외부'));
    await user.click(screen.getByText('다운로드'));
    await user.click(screen.getByText('새탭'));
    await user.click(screen.getByText('해시'));
    expect(screen.queryByText('인터넷 연결을 확인해주세요.')).not.toBeInTheDocument();
  });
});
```

주의: jsdom은 실제 내비게이션을 수행하지 않으므로 `defaultPrevented`와 토스트 표시로 차단을 검증한다. jsdom의 앵커 기본동작 "not implemented" 콘솔 에러가 시끄러우면 온라인 케이스의 앵커 href를 `#`으로 두거나 기존 스위트의 관행을 따른다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- offline-navigation-guard`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `frontend/apps/web/app/_components/OfflineNavigationGuard.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { useToast } from './toast/ToastProvider';

// 오프라인 상태의 내부 라우트 이동 시도를 원천 차단한다.
// 오프라인에서 클릭 시점 RSC fetch 가 실패하면 Next 라우터가 하드 내비게이션으로 폴백해
// 브라우저 오류 페이지로 앱을 이탈시킨다(재현 실험으로 확인) — 라우터 내부 동작이라
// 시도 차단이 유일한 방어다. capture 단계 리스너라 React 위임 핸들러(next-view-transitions
// Link 의 onClick 포함)보다 먼저 실행되어 VT Link·일반 Link 를 한 지점에서 모두 막는다.
export function OfflineNavigationGuard() {
  const { addToast } = useToast();

  useEffect(() => {
    function blockOfflineNavigation(clickEvent: MouseEvent) {
      if (navigator.onLine) return;
      if (clickEvent.defaultPrevented) return;
      // 수정자 키 클릭(새 탭 등)은 브라우저 기본 동작에 맡긴다.
      if (clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey || clickEvent.altKey) return;
      const eventTarget = clickEvent.target;
      if (!(eventTarget instanceof Element)) return;
      const anchor = eventTarget.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      // 내부 라우트('/x')만 차단 — 외부·프로토콜 상대('//')·해시·다운로드·새 탭은 통과.
      if (!href || !href.startsWith('/') || href.startsWith('//')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      addToast('인터넷 연결을 확인해주세요.', { variant: 'error' });
    }

    document.addEventListener('click', blockOfflineNavigation, true);
    return () => document.removeEventListener('click', blockOfflineNavigation, true);
  }, [addToast]);

  return null;
}
```

`providers.tsx` 배선 — Task 3에서 추가한 `<OfflineBanner />` 옆:

```tsx
import { OfflineNavigationGuard } from './_components/OfflineNavigationGuard';
```

```tsx
          <ToastProvider>
            <SessionExpiryHandler />
            <OfflineBanner />
            <OfflineNavigationGuard />
            {children}
          </ToastProvider>
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- offline-navigation-guard` → PASS, 이어서 `pnpm --filter @duing/web test` 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/OfflineNavigationGuard.tsx frontend/apps/web/app/providers.tsx frontend/apps/web/test/components/offline-navigation-guard.test.tsx
git commit -m "feat(frontend): 오프라인 내비게이션 가드 추가 — 하드 내비게이션 폴백으로 인한 앱 이탈 차단"
```

---

### Task 5: Sentry 가드 주석 현행화 + 실브라우저 QA

**Files:**
- Modify: `frontend/apps/web/instrumentation-client.ts:14-19` (주석만 — 동작 변경 없음)

- [ ] **Step 1: 주석 현행화**

`instrumentation-client.ts`의 ignoreErrors 설명 주석(14-19행)에 다음 내용을 반영해 갱신(코드 불변):

- timeout 항목: "동적 라우트 loading.tsx 배치(2026-07 네트워크 내성 작업)로 정상 회선 발생 경로는 해소 — 완전 오프라인·극단 저속 회선의 잔존 케이스만 남아 유지한다"
- invalid state 항목: 기존 설명(백그라운드 탭·bfcache) 유지

- [ ] **Step 2: 실브라우저 QA (jsdom 검증 불가 항목 — 생략 금지)**

`pnpm --filter @duing/web build` 후 `pnpm --filter @duing/web start`로 :3000 기동, Playwright(MCP)로:

1. **E1 재현 조건**: `/clubs` 접속(클럽 목록 API 목 응답) → 프리페치 대기 → 클릭 시점 RSC fetch 10s 지연 주입 → 클럽 카드 클릭
   - 기대: unhandledrejection **0건**(TimeoutError 없음), 클릭 +1s 내 URL `/clubs/1` + "불러오는 중…" 표시
2. **E2 재현 조건**: `/clubs` 접속 → 프리페치 대기 → `context.setOffline(true)` → 클럽 카드 클릭
   - 기대: `chrome-error://` 이탈 **없음**, URL `/clubs` 유지, 에러 토스트 "인터넷 연결을 확인해주세요." + 상단 배너 표시
3. **배너 복귀**: `setOffline(false)` → 배너 자동 제거 확인

검증 후 서버 종료: `lsof -ti :3000 | xargs kill`

- [ ] **Step 3: 전체 테스트·빌드 최종 확인**

Run: `pnpm --filter @duing/web test && pnpm --filter @duing/web build`
Expected: 전부 PASS·빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/instrumentation-client.ts
git commit -m "docs(frontend): VT abort Sentry 가드 유지 사유를 근본 원인 해결 이후 기준으로 현행화"
```

- [ ] **Step 5: 리뷰 게이트**

subagent-driven-development 의 태스크별 리뷰와 별개로, PR 전 codex:review 실행. push·PR 생성은 사용자 확인 후 진행.
