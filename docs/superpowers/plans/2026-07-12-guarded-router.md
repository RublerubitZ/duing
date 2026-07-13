# 가드 라우터: 프로그래매틱 내비게이션 오프라인 방어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 버튼·행·셀렉트 등 앵커가 아닌 트리거의 `router.push/replace`가 오프라인에서 하드 내비게이션(브라우저 오류 페이지 이탈)으로 빠지지 않도록, 오프라인 검사를 내장한 가드 라우터 훅으로 전 호출부를 교체하고 ESLint로 재발을 방지한다.

**Architecture:** `useGuardedRouter()`가 next/navigation `useRouter`를 감싸 push/replace만 오프라인 가드(차단+토스트)하고 나머지 메서드(back/forward/refresh/prefetch)는 그대로 통과시킨다. 기존 테스트 19개가 `next/navigation`을 mock하는 구조를 그대로 살리기 위해 훅은 내부에서 그 `useRouter`를 호출하며, ToastProvider 밖 렌더(테스트)에서도 throw하지 않도록 `useOptionalToast`를 신설한다. `no-restricted-imports`로 직접 `useRouter` import를 금지해 교체 완전성을 lint로 기계 증명한다.

**Tech Stack:** Next.js 15 App Router, React 19, 자체 ToastProvider, ESLint 9(.eslintrc.json), vitest.

**근거(전수 조사, 2026-07-12):** `useRouter` 사용 41개 파일 중 오프라인 노출 상호작용 11곳(알림 항목 버튼·지원자 표 행·이전/다음·동아리 셀렉터·일정 추가·뒤로가기 폴백·취소 버튼·미인증 로그인 이동 3곳) + 경계 3곳(query-only replace 필터). 기존 OfflineNavigationGuard는 앵커만 커버.

## Global Constraints

- 브랜치: `feat/fe-guarded-router` (feat/fe-navigation-offline-ux 위 스택, 체크아웃됨) — push·PR 생성은 하지 않는다
- 커밋: 한국어 Conventional Commits, attribution 라인 금지
- `any`·`as` 금지, `type` 선언 사용
- 안내 문구 verbatim: "인터넷 연결을 확인해주세요." (variant 'error') — PR-B 가드와 동일
- **호출부 교체는 import·훅 호출명만 변경** — push/replace 호출 코드·인자·주변 로직 불변 (순수 기계 치환)
- 테스트는 `frontend/` cwd, `| tail` 금지
- `useTransitionRouter` 사용 1곳(모집 삭제 후 이동 — mutation 성공 게이트라 미노출)은 교체하지 않는다(lint 룰은 next/navigation만 대상)

---

### Task 1: useOptionalToast + useGuardedRouter 훅 + ESLint 재발 방지 룰

**Files:**
- Modify: `frontend/apps/web/app/_components/toast/ToastProvider.tsx` (useOptionalToast 신설 — 기존 useToast 불변)
- Create: `frontend/apps/web/app/_lib/useGuardedRouter.ts`
- Modify: `frontend/apps/web/.eslintrc.json` (no-restricted-imports + 훅 파일 override)
- Test: `frontend/apps/web/test/lib/use-guarded-router.test.tsx` (신규)

**Interfaces:**
- Produces: `useGuardedRouter(): ReturnType<typeof useRouter>` — Task 2의 전 호출부가 drop-in으로 사용. `useOptionalToast(): ToastContextValue['addToast'] | null` — Provider 밖에서 null(throw 없음)

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/apps/web/test/lib/use-guarded-router.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';

const pushSpy = vi.fn();
const replaceSpy = vi.fn();
const backSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, back: backSpy, forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

function mockNavigatorOnLine(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
  pushSpy.mockClear();
  replaceSpy.mockClear();
  backSpy.mockClear();
});

function GuardedCaller({ action }: { action: 'push' | 'replace' | 'back' }) {
  const router = useGuardedRouter();
  return (
    <button
      onClick={() => {
        if (action === 'push') router.push('/clubs/1');
        else if (action === 'replace') router.replace('/clubs/1');
        else router.back();
      }}
    >
      이동
    </button>
  );
}

describe('useGuardedRouter', () => {
  it('오프라인이면 push를 차단하고 토스트를 띄운다', async () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="push" />
      </ToastProvider>,
    );
    screen.getByText('이동').click();
    expect(pushSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('인터넷 연결을 확인해주세요.')).toBeInTheDocument();
  });

  it('오프라인이면 replace도 차단한다', () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="replace" />
      </ToastProvider>,
    );
    screen.getByText('이동').click();
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('온라인이면 push/replace를 그대로 통과시킨다', () => {
    mockNavigatorOnLine(true);
    render(
      <ToastProvider>
        <GuardedCaller action="push" />
      </ToastProvider>,
    );
    screen.getByText('이동').click();
    expect(pushSpy).toHaveBeenCalledWith('/clubs/1');
  });

  it('back 등 나머지 메서드는 오프라인에서도 통과한다 (히스토리/캐시 기반)', () => {
    mockNavigatorOnLine(false);
    render(
      <ToastProvider>
        <GuardedCaller action="back" />
      </ToastProvider>,
    );
    screen.getByText('이동').click();
    expect(backSpy).toHaveBeenCalled();
  });

  it('ToastProvider 밖에서도 throw하지 않는다 (기존 테스트 mock 호환)', () => {
    mockNavigatorOnLine(false);
    expect(() => renderHook(() => useGuardedRouter())).not.toThrow();
  });
});
```

주의: `screen.getByText('이동').click()`이 act 경고를 내면 기존 스위트 관행(userEvent 또는 act 래핑)에 맞춰 조정. React import가 필요한 형태면 추가.

- [ ] **Step 2: 실패 확인**

Run (cwd `frontend/`): `pnpm --filter @duing/web test -- use-guarded-router`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`ToastProvider.tsx` — 기존 `useToast`는 그대로 두고, 컨텍스트를 null-허용으로 읽는 훅 추가(파일의 실제 컨텍스트 변수명에 맞출 것):

```tsx
// Provider 밖(예: 테스트의 얕은 렌더)에서도 안전하게 쓰는 선택적 접근자.
// 가드 라우터처럼 "토스트는 부가 피드백"인 소비자용 — 없으면 null 을 반환하고 throw 하지 않는다.
export function useOptionalToast(): ToastContextValue['addToast'] | null {
  const context = useContext(ToastContext);
  return context ? context.addToast : null;
}
```

`frontend/apps/web/app/_lib/useGuardedRouter.ts` (신규):

```ts
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOptionalToast } from '@/app/_components/toast/ToastProvider';

type AppRouter = ReturnType<typeof useRouter>;

// 프로그래매틱 내비게이션(push/replace)의 오프라인 방어.
// 오프라인에서 새 라우트 이동은 RSC fetch 실패 → Next 라우터의 하드 내비게이션 폴백으로
// 브라우저 오류 페이지 이탈을 일으킨다(재현 실험으로 확인). 앵커 클릭은 OfflineNavigationGuard 가
// 막지만, 버튼·행·셀렉트의 router 직접 호출은 이 훅이 유일한 방어선이다.
// back/forward 는 히스토리·라우터 캐시 기반이라 통과시키고, refresh/prefetch 도 이탈 위험이 없어 통과.
// 직접 `useRouter` import 는 ESLint(no-restricted-imports)로 금지되어 이 훅이 단일 진입점이 된다.
export function useGuardedRouter(): AppRouter {
  const router = useRouter();
  const addToast = useOptionalToast();

  return useMemo(
    () => ({
      ...router,
      push: (...pushArgs: Parameters<AppRouter['push']>) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          addToast?.('인터넷 연결을 확인해주세요.', { variant: 'error' });
          return;
        }
        router.push(...pushArgs);
      },
      replace: (...replaceArgs: Parameters<AppRouter['replace']>) => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          addToast?.('인터넷 연결을 확인해주세요.', { variant: 'error' });
          return;
        }
        router.replace(...replaceArgs);
      },
    }),
    [router, addToast],
  );
}
```

`.eslintrc.json` 교체:

```json
{
  "extends": ["next/core-web-vitals", "next/typescript"],
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "next/navigation",
            "importNames": ["useRouter"],
            "message": "오프라인 가드를 위해 @/app/_lib/useGuardedRouter 의 useGuardedRouter 를 사용하세요."
          }
        ]
      }
    ]
  },
  "overrides": [
    {
      "files": ["app/_lib/useGuardedRouter.ts"],
      "rules": { "no-restricted-imports": "off" }
    }
  ]
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- use-guarded-router` → 5 tests PASS
Run: `pnpm --filter @duing/web lint` → 이 시점에는 **기존 41개 파일이 룰 위반으로 FAIL하는 것이 정상** — 위반 목록이 Task 2의 교체 대상 전수와 일치하는지 개수만 기록(리포트에 남길 것). lint FAIL 상태로 커밋한다(Task 2가 즉시 해소).

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_lib/useGuardedRouter.ts frontend/apps/web/app/_components/toast/ToastProvider.tsx frontend/apps/web/.eslintrc.json frontend/apps/web/test/lib/use-guarded-router.test.tsx
git commit -m "feat(frontend): 오프라인 가드 라우터 훅 useGuardedRouter 추가 + 직접 useRouter import 금지 룰"
```

---

### Task 2: 호출부 전수 교체 스윕 (41개 파일)

**Files:**
- Modify: `frontend/apps/web/app/**` + `frontend/apps/web/components/**`의 `useRouter`(next/navigation) 사용 파일 전부 — `grep -rln "useRouter" frontend/apps/web/app frontend/apps/web/components --include="*.tsx" --include="*.ts"`로 추출 (테스트 제외, 41개 예상)

**Interfaces:**
- Consumes: Task 1의 `useGuardedRouter` (drop-in — 시그니처 동일)

- [ ] **Step 1: 기계 치환**

각 파일에서 다음만 변경(그 외 코드 불변):
1. `import { useRouter } from 'next/navigation';` → `import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';`
   - `useRouter`가 `usePathname`/`useSearchParams` 등과 **묶여** import된 파일은 useRouter만 분리하고 나머지는 next/navigation import에 남긴다
2. `const router = useRouter();` → `const router = useGuardedRouter();` (변수명이 다르면 그 이름 유지)

교체하지 않는 것: `useTransitionRouter` 사용 1곳(`manage/.../recruitments/[recruitmentId]/page.tsx`), 서버 컴포넌트의 `redirect()`, 테스트 파일.

- [ ] **Step 2: 완전성 기계 증명**

Run: `pnpm --filter @duing/web lint`
Expected: PASS — no-restricted-imports 위반 0 = 직접 useRouter import 전멸 증명
Run: `grep -rn "useRouter" frontend/apps/web/app frontend/apps/web/components --include="*.tsx" --include="*.ts" | grep "next/navigation"` → 출력 없음

- [ ] **Step 3: 전체 테스트 + 빌드**

Run: `pnpm --filter @duing/web test`
Expected: 전부 PASS — **기존 테스트 파일 수정 없이** 통과해야 한다(next/navigation mock을 훅이 내부에서 감싸는 구조 + useOptionalToast 덕분). 실패하는 테스트가 있으면 원인을 리포트에 기록하고 해당 테스트의 mock 구조에 맞춰 최소 조정(단언 의미 불변).
Run: `pnpm --filter @duing/web build` → 성공

- [ ] **Step 4: 커밋**

```bash
git add -A frontend/apps/web
git commit -m "refactor(frontend): 프로그래매틱 내비게이션 전 호출부를 가드 라우터로 교체"
```

---

### Task 3: 실브라우저 QA + 최종 리뷰 (컨트롤러 수행)

- [ ] 프로덕션 빌드 + 서버 기동 후 Playwright(MCP):
  1. 오프라인 + `/clubs`에서 찜(하트) 버튼 클릭(미인증 → push('/login?next=')) → 이동 없음 + 토스트 확인
  2. 오프라인 + `/clubs/[id]` 직접 진입(history 없음) 후 뒤로 버튼(push('/clubs') 폴백) → 이동 없음 + 토스트 확인
  3. 온라인 동일 동작 → 정상 이동 확인
- [ ] 최종 브랜치 리뷰(fable) + codex CLI 리뷰 → 발견 처리
- [ ] push·PR 생성은 사용자 지시 대기
