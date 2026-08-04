# 인증 초기 상태·구조 개선 (PR-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스펙 `docs/superpowers/specs/2026-08-03-auth-initial-state-design.md` 의 결정 사항 — 상태 모델(status 2값+isVerified, §8), 낙관적 시드 3단(§9.2)+만료 핸들러 술어(§9.1), A′ 세그먼트 SSR 시드(§5.2·§7), 레버 1 요청 선점(§4), hooks 게이트 셀렉터화(§10), `useBoundedAuthStatus` 제거(metric 9) — 를 구현한다.

**Architecture:** zustand 스토어의 **초기값은 정적**(`unauthenticated`/`isVerified:false`)으로 유지하고 시드는 전부 `setState` 업데이트로만 적용한다 — zustand v5 의 `useSyncExternalStore(subscribe, getState, getInitialState)` 하이드레이션 규약 위에서 SSR/프리렌더 HTML 과 하이드레이션 첫 렌더가 항상 일치한다(React #419 원천 차단, §5.1·§13). A′ 는 `(home)/layout.tsx`(서버)가 `auth_hint` 를 HMAC 검증해 boolean 만 내리고, 이 값을 (a) `AuthHintSeed` 가 클라 스토어에 승격-시드하고 (b) `useSeededAuthStatus(serverSeed)` 가 **서버 스냅샷**으로 써서 SSR HTML 이 처음부터 올바른 헤더를 그린다. 레버 1 은 `providers.tsx` 모듈 스코프에서 `client.users.me()` 를 선점하고 부트스트랩이 1회 소비한다(조율기·401 인터셉터는 기존 경로 그대로).

**Tech Stack:** Next.js 15 App Router · React 19 (`useSyncExternalStore`) · zustand 5 (`getInitialState`) · TanStack Query 5 · vitest + msw + Testing Library · Playwright (`@playwright/test` 1.62)

## Global Constraints

- **커밋·push·PR 생성 절대 금지** — 모든 작업은 워킹 트리에만. 최종 리뷰 승인 후 별도 지시로만 커밋한다. (플랜의 각 태스크에 커밋 스텝이 없는 것은 의도다)
- 브랜치: `feat/auth-initial-state` (origin/develop 5858a6c7 에서 분기, 이 워크트리에서 이미 생성됨)
- **레버 2(갱신 우선) 구현 금지** — refresh 선호·auth_hint non-HttpOnly(E)·미러 쿠키(C) 전부 금지 (§4.2 판정·사용자 지시)
- **수정 금지 영역**: `packages/api` 공개 API·`refresh-coordinator.ts`·`unauthorized-context.ts`·`middleware.ts`(import 만 허용)·백엔드 전체·rememberMe 정책
- SessionExpiryHandler = 세션 종료 판정의 단일 출처(SSOT) 유지 — 다른 곳에서 종료 판정 금지
- §9.3: 시드 값은 boolean 만 — role 을 클라 시드로 내리지 않는다
- 코드 규칙(frontend/CLAUDE.md): `any`·`as` 금지, `type` 사용(`interface` 금지), 모호한 축약 변수명 금지, 사용자 대면 문구는 한국어
- `useEffect` 데이터 패칭 금지 규칙의 예외: `AuthSessionBootstrap` 은 스펙이 유지를 명시한 기존 예외(§10 — 부트스트랩 컴포넌트 유지)
- 실행 명령 cwd: `pnpm` 은 `frontend/` 또는 `frontend/apps/web` (아래 각 스텝에 명시)
- 테스트 실행: `pnpm --filter @duing/web test -- --run <파일>` (frontend/ 에서) 또는 apps/web 에서 `npx vitest run <파일>`

## 스펙 결정 → 태스크 매핑

| 스펙 결정 | 태스크 |
|---|---|
| §8 상태 모델 (status 2값 + isVerified, 불변식 3) | 1 |
| §9.2 3단 시드 (로컬 이력 폴백 D) | 2 |
| §4 레버 1 (요청 선점, 조율기 경유) | 2·3 |
| §9.1 만료 핸들러 술어 + metric 7 계약 테스트 | 4 |
| §10 hooks 게이트 셀렉터화 + metric 8 | 5 |
| §5.2·§7 A′ 세그먼트 SSR 시드 + §9.3 | 6·7 |
| 문제 정의 3·4 소비자 전환 | 7·8·9 |
| metric 9 `useBoundedAuthStatus` 제거 + metric 6·10 | 10 |
| metric 1·2·4 + 시나리오 E2E | 11 |
| metric 3·5·8 성능 실측 (§4 전/후 비교) | 12 |

**metric 5 에 대한 주의**: "왕복 3→2" 는 레버 2 전제의 지표다. 레버 2 는 §4.2 판정(집단 간 비용 이전)과 사용자 지시로 **제외**됐으므로 이 지표는 달성 대상이 아니다 — 최종 보고에서 "의도적 미달성(스펙 §4.2 판정)"으로 명시한다. 임의로 레버 2 를 넣어 맞추지 말 것.

---

### Task 1: 상태 모델 — auth-store 2값 + isVerified

**Files:**
- Modify: `frontend/packages/stores/src/auth-store.ts` (전체 교체)
- Modify: `frontend/packages/stores/src/index.ts`
- Test: `frontend/apps/web/test/auth/auth-store-model.test.ts` (신규 — stores 패키지에 테스트 인프라가 없어 web 스위트에서 워크스페이스 import 로 검증하는 기존 관례를 따른다)

**Interfaces (Produces — 이후 모든 태스크가 사용):**
```ts
export type AuthStatus = 'authenticated' | 'unauthenticated';
type AuthState = {
  user: User | null;
  status: AuthStatus;          // 현재 최선의 판단(시드 또는 확정) — "모른다" 없음 (§8.1-1)
  isVerified: boolean;         // 서버 응답으로 확인됐는가 (§8.1-2)
  seedSession(status: AuthStatus): void;   // 시드 — isVerified 인 상태를 덮지 않음(승격 전용 아님, 단 검증 후 무시)
  setSession(user: User): void;            // 서버 200 확정 → authenticated + isVerified:true
  clearSession(): Promise<void>;           // 서버 확인된 종료 → unauthenticated + isVerified:true
};
export const useAuthStore: UseBoundStore<StoreApi<AuthState>>;
export const selectIsAuthenticated: (state: { status: AuthStatus }) => boolean;
```

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/web/test/auth/auth-store-model.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

const TEST_USER: User = {
  id: 1, studentId: '20240001', name: '홍길동', phone: '010-1234-5678',
  grade: 'FRESHMAN', role: 'STUDENT',
};

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

describe('auth-store 상태 모델 (§8)', () => {
  it('초기값은 정적이다 — unauthenticated · 미검증 (SSR/프리렌더가 이 값으로 그려진다)', () => {
    const initial = useAuthStore.getInitialState();
    expect(initial.status).toBe('unauthenticated');
    expect(initial.isVerified).toBe(false);
    expect(initial.user).toBeNull();
  });

  it('seedSession 은 status 만 바꾸고 검증 표식을 세우지 않는다', () => {
    useAuthStore.getState().seedSession('authenticated');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().isVerified).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('서버로 확인된 상태는 시드가 덮지 못한다 — 로그아웃 확정 후 시드 무시', async () => {
    await useAuthStore.getState().clearSession();
    useAuthStore.getState().seedSession('authenticated');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().isVerified).toBe(true);
  });

  it('setSession 은 검증된 로그인 상태를 세운다', () => {
    useAuthStore.getState().setSession(TEST_USER);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated', isVerified: true, user: TEST_USER,
    });
  });

  it('clearSession 은 검증된 미인증 상태를 세운다', async () => {
    useAuthStore.getState().setSession(TEST_USER);
    await useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated', isVerified: true, user: null,
    });
  });

  it('selectIsAuthenticated 는 시드·확정을 구분하지 않는다 (§10 게이트 술어)', () => {
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(false);
    useAuthStore.getState().seedSession('authenticated');
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — `frontend/` 에서 `pnpm --filter @duing/web test -- --run test/auth/auth-store-model.test.ts` → FAIL (`isVerified`/`seedSession` 부재, 초기 status 가 `'idle'`)

- [ ] **Step 3: 구현** — `packages/stores/src/auth-store.ts` 전체 교체

```ts
import { create } from 'zustand';

import { clearToken } from '@duing/api';

import type { User } from '@duing/types';

export type AuthStatus = 'authenticated' | 'unauthenticated';

type AuthState = {
  user: User | null;
  /** 현재 최선의 판단(시드 또는 서버 확정). "모른다"를 표현하지 않는다 — 화면은 이 값으로만 그린다. */
  status: AuthStatus;
  /** 서버 응답으로 확인된 값인가. 되돌릴 수 없는 동작·만료 처리 발동에만 함께 본다 — 화면 분기 금지. */
  isVerified: boolean;
  /** 부팅 시드(로컬 이력·A′ 서버 힌트). 서버로 확인된 상태는 덮지 않는다. */
  seedSession(status: AuthStatus): void;
  setSession(user: User): void;
  clearSession(): Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  // 초기값은 반드시 정적 — SSR/프리렌더 HTML 과 하이드레이션 첫 렌더가 이 값으로 그려지고
  // (zustand v5 useSyncExternalStore 의 서버 스냅샷 = getInitialState), 시드는 전부 "업데이트"로만
  // 적용된다. 초기값을 환경(localStorage·쿠키)에서 계산하면 하이드레이션 불일치(React #419)다.
  status: 'unauthenticated',
  isVerified: false,
  seedSession(status) {
    if (get().isVerified) return;
    set({ status });
  },
  setSession(user) {
    set({ user, status: 'authenticated', isVerified: true });
  },
  async clearSession() {
    await clearToken();
    // 호출부(로그아웃·전체 로그아웃·탈퇴·만료 확정)는 전부 서버가 확인한 종료 경로다.
    set({ user: null, status: 'unauthenticated', isVerified: true });
  },
}));

// 인증 종속 쿼리 게이트의 단일 술어(§10) — 소비자가 raw status 를 직접 비교하지 않게 한다.
// 시드된 authenticated 도 참: 신호가 로그인으로 보이면 확인을 기다리지 않고 요청한다.
// 401 이면 API 계층이 갱신하고, 정말 미인증이면 만료 경로로 흐른다.
export const selectIsAuthenticated = (state: { status: AuthStatus }): boolean =>
  state.status === 'authenticated';
```

`packages/stores/src/index.ts`:
```ts
export { selectIsAuthenticated, useAuthStore } from './auth-store';
export type { AuthStatus } from './auth-store';
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. 이 시점에 기존 스위트가 대량 실패하는 것은 정상(이후 태스크에서 갱신) — **이 태스크에서는 새 테스트 파일과 typecheck 만 본다**: `pnpm --filter @duing/stores typecheck`

---

### Task 2: 부팅 시드(3단·D 폴백) + 레버 1 선점 — authBoot 모듈

**Files:**
- Create: `frontend/apps/web/app/_lib/authBoot.ts`
- Modify: `frontend/apps/web/app/providers.tsx` (모듈 스코프 2줄 + import)
- Test: `frontend/apps/web/test/auth/auth-boot.test.ts` (신규)

**Interfaces:**
- Consumes: Task 1 의 `useAuthStore.seedSession`
- Produces:
```ts
export const HAD_SESSION_KEY = 'duing:had-session';
export function markHadSession(value: boolean): void;
export function hadSession(): boolean;
export function seedAuthFromLocalHistory(): void;                       // §9.2 신호-없음 행
export function startBootSessionRestore(client: DuingApiClient): void;  // 레버 1 — 1회만
export function consumeBootSessionRestore(): Promise<User> | null;      // 소비 후 null
```

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/web/test/auth/auth-boot.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import {
  HAD_SESSION_KEY,
  consumeBootSessionRestore,
  hadSession,
  markHadSession,
  seedAuthFromLocalHistory,
  startBootSessionRestore,
} from '@/app/_lib/authBoot';

const TEST_USER: User = {
  id: 1, studentId: '20240001', name: '홍길동', phone: '010-1234-5678',
  grade: 'FRESHMAN', role: 'STUDENT',
};

// startBootSessionRestore 는 client.users.me 만 사용한다 — 구조적 타입으로 최소 클라이언트를 만든다.
function fakeClient(me: () => Promise<User>) {
  return { users: { me } };
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  window.localStorage.clear();
  // 모듈 스코프 1회 가드 리셋 — 소비해서 비운다.
  consumeBootSessionRestore();
});

describe('seedAuthFromLocalHistory (§9.2 3단 시드 — 신호 없음 행)', () => {
  it('로컬 이력이 있으면 authenticated 로 시드한다(미검증)', () => {
    window.localStorage.setItem(HAD_SESSION_KEY, '1');
    seedAuthFromLocalHistory();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().isVerified).toBe(false);
  });

  it('이력이 없으면 아무것도 하지 않는다 — 초기값(unauthenticated)이 곧 시드다', () => {
    seedAuthFromLocalHistory();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().isVerified).toBe(false);
  });
});

describe('had-session 플래그', () => {
  it('mark(true)→hadSession true, mark(false)→false', () => {
    markHadSession(true);
    expect(hadSession()).toBe(true);
    markHadSession(false);
    expect(hadSession()).toBe(false);
  });
});

describe('startBootSessionRestore (레버 1)', () => {
  it('모듈 평가 시점에 요청을 시작하고, 정확히 1회만 시작한다', () => {
    const me = vi.fn().mockResolvedValue(TEST_USER);
    startBootSessionRestore(fakeClient(me));
    startBootSessionRestore(fakeClient(me));
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('소비는 1회 — 두 번째 consume 은 null (재시도는 새 요청을 쓴다)', async () => {
    const me = vi.fn().mockResolvedValue(TEST_USER);
    startBootSessionRestore(fakeClient(me));
    const first = consumeBootSessionRestore();
    expect(first).not.toBeNull();
    expect(consumeBootSessionRestore()).toBeNull();
    await expect(first).resolves.toEqual(TEST_USER);
  });

  it('선점 요청의 거부가 unhandled rejection 이 되지 않는다', async () => {
    const me = vi.fn().mockRejectedValue(new Error('만료'));
    startBootSessionRestore(fakeClient(me));
    // 소비자가 붙기 전 마이크로태스크 한 사이클 — unhandled 면 vitest 가 실패시킨다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(consumeBootSessionRestore()).rejects.toThrow('만료');
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @duing/web test -- --run test/auth/auth-boot.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `apps/web/app/_lib/authBoot.ts` 신규

```ts
import { useAuthStore } from '@duing/stores';

import type { User } from '@duing/types';

// 이 브라우저에서 세션이 살아 있던 적이 있는지 표시하는 로컬 플래그.
// 갱신은 AuthSessionBootstrap 의 status 구독 한 곳에서만 한다(그 파일의 주석 참조).
// 저장소는 웹 전용이라 packages/* 가 아닌 앱 계층에 둔다.
export const HAD_SESSION_KEY = 'duing:had-session';

export function markHadSession(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(HAD_SESSION_KEY, '1');
    else window.localStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등) — 시드·알림이 생략될 뿐 세션 복원에는 영향 없다.
  }
}

export function hadSession(): boolean {
  try {
    return window.localStorage.getItem(HAD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

// §9.2 3단 시드의 클라이언트 층(신호 없음 행) — 로컬 이력이 있으면 authenticated 로 추정한다.
// 이력이 없으면 스토어 초기값(unauthenticated)이 곧 시드다. 홈에서는 A′ 서버 시드(AuthHintSeed)가
// 이 값을 승격할 수 있다. 시드가 틀렸다면 서버 확인(부트스트랩/만료 핸들러)이 정정한다.
export function seedAuthFromLocalHistory(): void {
  if (typeof window === 'undefined') return;
  if (hadSession()) useAuthStore.getState().seedSession('authenticated');
}

// 레버 1(§4) — 세션 복원 요청을 모듈 평가 시점(하이드레이션 전)에 선점한다.
// 일반 클라이언트 경로를 그대로 탄다: 401 이면 afterResponse 훅이 refresh 조율기
// (ensureFreshSession)를 경유해 갱신 후 재시도한다 — 조율기 우회 없음.
// me 만 쓰므로 구조적 타입으로 받는다(테스트에서 전체 클라이언트 불필요).
type BootRestoreClient = { users: { me(): Promise<User> } };

let bootSessionPromise: Promise<User> | null = null;

export function startBootSessionRestore(client: BootRestoreClient): void {
  if (typeof window === 'undefined' || bootSessionPromise !== null) return;
  bootSessionPromise = client.users.me();
  // 소비 전 거부가 unhandled rejection 소음이 되지 않게 별도 체인으로 삼킨다(원본은 보존).
  bootSessionPromise.catch(() => {});
}

export function consumeBootSessionRestore(): Promise<User> | null {
  const consumed = bootSessionPromise;
  bootSessionPromise = null;
  return consumed;
}
```

`providers.tsx` 수정 — import 에 추가하고, 모듈 스코프의 `installBackDismiss();` 다음·`Providers` 함수 앞(즉 `const apiClient = ...` 바로 아래)에:

```ts
import { seedAuthFromLocalHistory, startBootSessionRestore } from './_lib/authBoot';
// ... (기존 apiClient 선언 유지)

// 부팅 시드(§9.2)를 먼저 세우고 복원 요청(§4 레버 1)을 하이드레이션 전에 출발시킨다.
// 시드가 먼저여야 게이트 달린 쿼리들이 첫 마운트부터 열린다.
seedAuthFromLocalHistory();
startBootSessionRestore(apiClient);
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. `pnpm --filter @duing/web typecheck` (기존 테스트 실패는 무시, tsc 만)

---

### Task 3: AuthSessionBootstrap — 선점 소비 + 새 모델 술어

**Files:**
- Modify: `frontend/apps/web/app/_components/AuthSessionBootstrap.tsx` (전체 교체)
- Test: `frontend/apps/web/test/auth/session-bootstrap.test.tsx` (갱신)

**Interfaces:**
- Consumes: Task 2 `consumeBootSessionRestore`·`hadSession`·`markHadSession`, Task 1 스토어
- Produces: 동작 계약 — (a) attempt 0 은 선점 프로미스 소비, 재시도는 새 요청 (b) 성공 → `setSession` (c) 실패 → 검증된-미인증이면 침묵(핸들러 소관), 이력 있으면 재시도 토스트 (d) had-session 갱신·posthog reset 은 **검증된** 전이에서만

- [ ] **Step 1: 구현** — `AuthSessionBootstrap.tsx` 전체 교체 (테스트 갱신이 방대해 구현→테스트 순서로 진행하되 Step 2 에서 기존 테스트의 계약을 전부 재작성한다)

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

import { useToast } from '@/app/_components/toast/ToastProvider';
import { consumeBootSessionRestore, hadSession, markHadSession } from '@/app/_lib/authBoot';
import posthog from 'posthog-js';

export function AuthSessionBootstrap() {
  const [attempt, setAttempt] = useState(0);
  const client = useApiClient();
  const setSession = useAuthStore((state) => state.setSession);
  const status = useAuthStore((state) => state.status);
  const isVerified = useAuthStore((state) => state.isVerified);
  const { addToast } = useToast();

  const previousStateRef = useRef({ status, isVerified });

  // had-session 플래그와 PostHog 신원은 "서버로 확인된" 전이만 따라간다.
  // 시드(미검증 authenticated)에 플래그를 다시 심으면 스텔 플래그가 스스로를 영속시키고,
  // 시드가 무너진 익명 방문(미검증 authenticated → 확정 미인증)에 reset 을 걸면
  // 가입 전 행동과 가입 후 identify 의 연결이 끊긴다. 세션이 서고 지워지는 경로가 여럿이라
  // 호출부마다 심는 대신 스토어 전이 한 곳에서만 갱신한다(빠지는 곳 방지 — 기존 주석 계약 유지).
  useEffect(() => {
    if (isVerified && status === 'authenticated') markHadSession(true);
    else if (isVerified && status === 'unauthenticated') {
      markHadSession(false);
      const previous = previousStateRef.current;
      if (previous.isVerified && previous.status === 'authenticated') posthog.reset();
    }
    previousStateRef.current = { status, isVerified };
  }, [status, isVerified]);

  useEffect(() => {
    let cancelled = false;
    // 레버 1: 부팅 1회분은 모듈 스코프에서 선점된 요청을 받아쓴다(요청이 하이드레이션보다
    // 먼저 나간다). 재시도(attempt>0)와 선점이 없던 경우는 여기서 새로 요청한다.
    const preflighted = attempt === 0 ? consumeBootSessionRestore() : null;
    void (preflighted ?? client.users.me())
      .then((user) => {
        if (cancelled) return;
        setSession(user);
        posthog.identify(String(user.id), { role: user.role, grade: user.grade, college: user.college });
      })
      .catch(() => {
        if (cancelled) return;
        // 401 을 세션 종료로 해석하지 않는다. 진짜 만료와 일시 장애(갱신이 403·5xx·타임아웃·
        // 오프라인으로 실패)의 예외 객체가 완전히 동일해, 반환 채널만으로는 구분할 근거가 없다.
        // 종료 판정은 SessionExpiryHandler 한 곳에 있고, 확정됐다면 그쪽이 이 catch 보다 먼저
        // (동기 setState 로) 스토어를 내려둔다 — 여기서는 그 결과만 읽는다.
        // TODO(후속 #844): 다른 탭이 10초 내 갱신해 'skipped' 로 재시도된 요청이 다시 401 이면
        // 사이드 채널이 울리지 않아, 서버측 세션 폐기가 일시 장애로 오분류된다.
        const settled = useAuthStore.getState();
        if (settled.isVerified && settled.status === 'unauthenticated') return;
        if (!hadSession()) return;
        // durationMs 0 — 자동으로 사라지지 않는다. 복구 수단(다시 시도)이 붙은 알림이라
        // 사용자가 처리하거나 닫을 때까지 남는다.
        addToast('세션을 확인하지 못했습니다. 로그인 상태는 유지됩니다.', {
          variant: 'error',
          durationMs: 0,
          action: {
            label: '다시 시도',
            onClick: () => setAttempt((currentAttempt) => currentAttempt + 1),
          },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, client, setSession, addToast]);

  return null;
}
```

- [ ] **Step 2: 기존 테스트 갱신** — `test/auth/session-bootstrap.test.tsx`
  - `useAuthStore.setState({ status: 'idle', user: null })` (38행) → `useAuthStore.setState(useAuthStore.getInitialState(), true)`
  - "세션 복원 성공 → authenticated" 계약 유지, 추가 단언: `isVerified === true`
  - "153·219행의 `setState({status:'unauthenticated'})`" → `setState({ status: 'unauthenticated', isVerified: true })` (검증된 종료를 뜻하던 자리)
  - 신규 케이스 3개:
    1. **선점 소비**: `startBootSessionRestore` 로 msw 카운터를 미리 돌리고 렌더 → `/users/me` 호출 수 1 (부트스트랩이 새 요청을 안 냄)
    2. **재시도는 새 요청**: 실패 토스트의 "다시 시도" 클릭 → 호출 수 +1
    3. **시드 상태 플래그 회귀**: `seedSession('authenticated')` + 만료 체인(me 401·refresh 401) → `hadSession()` 이 **true 로 재마킹되지 않음**(효과가 미검증 상태를 무시), 이후 핸들러 없는 구성이므로 상태는 시드 그대로
  - `posthog.reset` 스파이 케이스: `setState({status:'authenticated', isVerified:false})` → `setState({status:'unauthenticated', isVerified:true})` 전이에서 reset **0회** / `isVerified:true` authenticated → 검증된 미인증 전이에서 **1회**

- [ ] **Step 3: 통과 확인** — `pnpm --filter @duing/web test -- --run test/auth/session-bootstrap.test.tsx test/auth/auth-boot.test.ts test/auth/auth-store-model.test.ts` → PASS

---

### Task 4: SessionExpiryHandler — §9.1 술어 + metric 7 계약 테스트

**Files:**
- Modify: `frontend/apps/web/app/_components/SessionExpiryHandler.tsx` (핸들러 본문만)
- Test: `frontend/apps/web/test/auth/session-expiry.test.tsx` (갱신 + metric 7 케이스), `test/auth/session-judgment.test.tsx` (상태 셋업 갱신)

**Interfaces:**
- Consumes: Task 1 스토어 (`isVerified`)
- Produces: 계약 — 중복 가드 = `status==='unauthenticated' && isVerified`; 부수효과 게이트 `hadLiveSession = isVerified && status==='authenticated'`; 상태 확정은 `{status:'unauthenticated', isVerified:true}` 동기 기록

- [ ] **Step 1: 실패하는 테스트 추가** — `session-expiry.test.tsx` 에 metric 7 계약 테스트 (기존 파일의 렌더·스파이 헬퍼 재사용):

```tsx
it('[metric 7] 시드된(미검증) authenticated 에서 종료 통지가 와도 토스트·이동·로그아웃 요청이 없다', () => {
  useAuthStore.setState({ status: 'authenticated', isVerified: false, user: null });
  renderHandler(); // 기존 헬퍼 — registerUnauthorizedHandler 가 등록된 상태
  act(() => notifyUnauthorized());
  // 상태 정리는 수행한다 — 확정 미인증으로 내려간다.
  expect(useAuthStore.getState().status).toBe('unauthenticated');
  expect(useAuthStore.getState().isVerified).toBe(true);
  // 부수효과는 전부 0 — 정상 방문자를 로그인으로 튕겨내지 않는다(§9.1).
  expect(screen.queryByText(/세션이 만료되었어요/)).toBeNull();
  expect(pushSpy).not.toHaveBeenCalled();
  expect(logoutCallCount).toBe(0);
});

it('검증된 authenticated 에서의 종료 통지는 기존 만료 처리 전부를 수행한다', () => {
  useAuthStore.setState({ status: 'authenticated', isVerified: true, user: TEST_USER });
  renderHandler();
  act(() => notifyUnauthorized());
  expect(screen.getByText(/세션이 만료되었어요/)).toBeInTheDocument();
  expect(pushSpy).toHaveBeenCalledTimes(1);
});

it('보류 통지 flush 가 시드된 상태에서 일어나도 조용하다 — 부팅 중 만료의 등록 시점 재생', () => {
  // 핸들러 등록 전에 통지가 먼저 도착(콜드 부팅 중 만료) — 등록 시점에 flush 된다.
  useAuthStore.setState({ status: 'authenticated', isVerified: false, user: null });
  act(() => notifyUnauthorized());
  renderHandler();
  expect(useAuthStore.getState()).toMatchObject({ status: 'unauthenticated', isVerified: true });
  expect(screen.queryByText(/세션이 만료되었어요/)).toBeNull();
  expect(pushSpy).not.toHaveBeenCalled();
});
```

(기존 파일의 `idle` 셋업 3곳: 41행 리셋 → `setState(getInitialState(), true)`, 146·157행의 idle 케이스는 "시드 전 초기 상태(미검증 unauthenticated)에서 통지 → 상태만 verified 미인증으로, 부수효과 0" 으로 의미를 바꿔 재작성)

- [ ] **Step 2: 실패 확인** — `pnpm --filter @duing/web test -- --run test/auth/session-expiry.test.tsx` → FAIL

- [ ] **Step 3: 구현** — 핸들러 콜백 교체 (`SessionExpiryHandler.tsx` 26~56행):

```ts
    registerUnauthorizedHandler(() => {
      const { status, isVerified, clearSession } = useAuthStore.getState();
      // 이미 종료가 확정(검증된 미인증)됐으면 중복 통지다. 동시다발 401 의 중복 토스트/이동을
      // 막기 위해 상태를 동기적으로 먼저 내려, 이후 호출은 이 가드에서 걸러지게 한다.
      if (status === 'unauthenticated' && isVerified) return;
      // 부수효과 게이트(§9.1) — "이 브라우저에서 세션이 살아 있었는가"는 이제 신뢰할 수 있는
      // 신호(서버 검증 여부)로 판정한다. 시드(미검증 authenticated)는 로컬 이력·힌트 추정일 뿐이라
      // 여기서 부수효과를 열면 스텔·위조 신호 하나가 정상 방문자를 로그인 페이지로 튕겨낸다.
      const hadLiveSession = isVerified && status === 'authenticated';
      // 종료 확정은 동기 setState 로 먼저 기록한다 — clearSession() 은 async 라 이 통지를
      // 유발한 요청의 catch 보다 늦게 반영될 수 있고, 그러면 호출자가 확정된 만료를
      // 일시 장애로 오판한다. 둘을 합치는 정리가 들어오면 이 계약이 조용히 깨진다.
      useAuthStore.setState({ status: 'unauthenticated', isVerified: true });
      // catch 필수 — 이 정리는 익명 방문자의 페이지 로드에서도 돈다(이하 기존 주석 유지).
      void clearSession().catch(() => {});
      if (!hadLiveSession) return;
      // (이하 로그아웃·캐시 비움·토스트·이동 — 기존 코드 그대로)
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter @duing/web test -- --run test/auth/session-expiry.test.tsx test/auth/session-judgment.test.tsx` → PASS (judgment 파일은 상태 셋업만 `isVerified` 명시로 갱신)

---

### Task 5: hooks 게이트 셀렉터화 + metric 8 테스트

**Files:**
- Modify: `frontend/packages/hooks/src/auth.ts` (52~70행 `useMeQuery`·`useMySessionsQuery`)
- Modify: `frontend/packages/hooks/src/favorites.ts` (게이트 2곳 + `onError` 의 sessionEnded 술어)
- Modify: `frontend/packages/hooks/src/applications.ts` (게이트 2곳)
- Test: `frontend/packages/hooks/test/favoritesAuthGuard.test.tsx` (갱신), `frontend/apps/web/test/auth/anon-traffic.test.tsx` (신규 — metric 8)

**Interfaces:**
- Consumes: Task 1 `selectIsAuthenticated`

- [ ] **Step 1: 게이트 교체** — 6곳 모두 동일 패턴:

```ts
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';
// ...
  const isAuthedLikely = useAuthStore(selectIsAuthenticated);
  return useQuery({ /* ... */ enabled: isAuthedLikely });
```
(`applications.ts` 91행은 `enabled: isAuthedLikely && applicationId !== undefined`)

`favorites.ts` `onError` (66행) — 종료 확정 판정은 검증된 미인증으로 좁힌다:
```ts
      const { status: authStatus, isVerified } = useAuthStore.getState();
      const sessionEnded = isVerified && authStatus === 'unauthenticated';
```

- [ ] **Step 2: metric 8 테스트 신규** — `apps/web/test/auth/anon-traffic.test.tsx`

```tsx
// 비로그인 부팅(시드 unauthenticated)에서 인증 종속 쿼리가 한 건도 나가지 않는다(metric 8).
// 부트스트랩의 /users/me 1건은 기존과 동일한 기준선이라 제외한다.
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useFavoriteIdsQuery, useMeQuery, useMyApplicationsQuery } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

const BASE = 'http://localhost:8080/api/v1';
const requestedPaths: string[] = [];
const server = setupServer(
  http.all(`${BASE}/*`, ({ request }) => {
    requestedPaths.push(new URL(request.url).pathname);
    return HttpResponse.json({ ok: false, data: null, message: '인증이 필요합니다.' }, { status: 401 });
  }),
);
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); requestedPaths.length = 0; });
afterAll(() => server.close());

it('시드된 unauthenticated(익명 부팅)에서는 인증 종속 쿼리가 비활성이다', async () => {
  useAuthStore.setState(useAuthStore.getInitialState(), true); // 익명: 시드 = 초기값
  const { result } = renderHook(
    () => ({
      me: useMeQuery(),
      favorites: useFavoriteIdsQuery(),
      applications: useMyApplicationsQuery(),
    }),
    { wrapper: createQueryWrapper() }, // 기존 테스트 유틸 관례(favoritesAuthGuard.test.tsx)를 따라 작성
  );
  await waitFor(() => expect(result.current.me.fetchStatus).toBe('idle'));
  expect(requestedPaths).toHaveLength(0);
});

it('시드된 authenticated(미검증)에서는 확인을 기다리지 않고 요청한다 (§10)', async () => {
  useAuthStore.setState({ status: 'authenticated', isVerified: false, user: null });
  const { result } = renderHook(() => useFavoriteIdsQuery(), { wrapper: createQueryWrapper() });
  await waitFor(() => expect(requestedPaths.some((path) => path.endsWith('/favorites/ids'))).toBe(true));
});
```
(`createQueryWrapper` 는 `packages/hooks/test/favoritesAuthGuard.test.tsx` 의 wrapper 구성을 그대로 옮겨 파일 내 헬퍼로 둔다 — ApiClientProvider + QueryClientProvider. 실제 경로 문자열은 그 파일에서 확인해 맞춘다)

- [ ] **Step 3: 기존 hooks 테스트 갱신** — `packages/hooks/test/favoritesAuthGuard.test.tsx` 의 `'idle'` 5곳: "idle 은 비활성" 케이스를 "시드된 unauthenticated 는 비활성 / 시드된 authenticated 는 활성"으로 재작성. `dashboardActiveRecruitments.test.tsx` 의 1곳도 상태 셋업만 교체.

- [ ] **Step 4: 통과 확인** — `pnpm --filter @duing/hooks test -- --run` + `pnpm --filter @duing/web test -- --run test/auth/anon-traffic.test.tsx` → PASS

---

### Task 6: A′ — (home) 레이아웃 SSR 시드 + useSeededAuthStatus

**Files:**
- Create: `frontend/apps/web/app/_components/AuthHintSeed.tsx`
- Create: `frontend/apps/web/app/_lib/useSeededAuthStatus.ts`
- Modify: `frontend/apps/web/app/(home)/layout.tsx`
- Test: `frontend/apps/web/test/auth/auth-hint-seed.test.tsx` (신규), `frontend/apps/web/test/auth/use-seeded-auth-status.test.tsx` (신규)

**Interfaces:**
- Consumes: `verifyAuthHint` (`apps/web/middleware.ts` 가 이미 export — Node 런타임에서 Web Crypto 로 동작, `test/auth/middleware-auth-hint.test.ts` 가 import 전례), Task 1 스토어
- Produces:
```ts
export function AuthHintSeed({ authenticated }: { authenticated: boolean }): null;
export function useSeededAuthStatus(serverSeed?: boolean | null): AuthStatus;
```

- [ ] **Step 1: 실패하는 테스트 작성** — `test/auth/auth-hint-seed.test.tsx`

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useAuthStore } from '@duing/stores';
import { AuthHintSeed } from '@/app/_components/AuthHintSeed';

beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

describe('AuthHintSeed (A′ 서버 시드)', () => {
  it('서버가 로그인으로 봤으면 스토어를 authenticated 로 시드한다(미검증)', () => {
    render(<AuthHintSeed authenticated />);
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', isVerified: false });
  });

  it('힌트 부재·무효(false)는 시드하지 않는다 — 로컬 이력 추정을 미인증으로 내리면 오답(§9.2)', () => {
    useAuthStore.getState().seedSession('authenticated'); // 로컬 이력 층이 먼저 세운 값
    render(<AuthHintSeed authenticated={false} />);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('검증된 상태는 덮지 않는다 — 로그아웃 확정 후 뒤늦은 시드 무시', async () => {
    await useAuthStore.getState().clearSession();
    render(<AuthHintSeed authenticated />);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
```

`test/auth/use-seeded-auth-status.test.tsx`:
```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from '@duing/stores';
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';

beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

describe('useSeededAuthStatus', () => {
  it('클라이언트에서는 스토어 현재값을 따른다', () => {
    const { result } = renderHook(() => useSeededAuthStatus(null));
    expect(result.current).toBe('unauthenticated');
    act(() => useAuthStore.getState().seedSession('authenticated'));
    expect(result.current).toBe('authenticated');
  });

  it('serverSeed 는 SSR 스냅샷이다 — 클라 렌더 결과에는 스토어가 우선한다', () => {
    // jsdom 은 하이드레이션 프레임을 재현하지 못하므로, 여기서는 "클라 값이 스토어"임을 고정하고
    // SSR HTML 일치는 Task 11 의 실브라우저 E2E(하이드레이션 오류 0)로 검증한다.
    const { result } = renderHook(() => useSeededAuthStatus(true));
    expect(result.current).toBe('unauthenticated'); // 스토어 미시드 상태
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter @duing/web test -- --run test/auth/auth-hint-seed.test.tsx test/auth/use-seeded-auth-status.test.tsx` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`apps/web/app/_components/AuthHintSeed.tsx`:
```tsx
'use client';

import { useState } from 'react';

import { useAuthStore } from '@duing/stores';

// A′(§5.2) — (home) 레이아웃이 서버에서 검증한 auth_hint 유무를 클라 스토어에 반영한다.
// 승격 전용: 서버가 로그인으로 봤을 때만 시드한다. 힌트 부재·무효는 시드하지 않는다 —
// 로컬 이력 기반 추정(§9.2 3단: 신호 없음+이력 있음=유지)을 미인증으로 내리면,
// AUTH_HINT_SECRET 로테이션·힌트 만료 같은 정상 상황에서 로그인 사용자 전원이 로그아웃 화면을 본다.
// 렌더 페이즈(lazy useState)에서 1회 적용한다 — 하이드레이션이 끝나고 스토어 구독이 값을 재확인하기
// 전에 반영돼야 첫 커밋부터 시드가 보인다. 서버 렌더에서는 아무것도 하지 않는다(모듈 스코프
// 서버 스토어는 요청 간 공유라, 요청별 값을 쓰면 동시 요청끼리 오염된다).
export function AuthHintSeed({ authenticated }: { authenticated: boolean }) {
  useState(() => {
    if (typeof window === 'undefined' || !authenticated) return;
    useAuthStore.getState().seedSession('authenticated');
  });
  return null;
}
```

`apps/web/app/_lib/useSeededAuthStatus.ts`:
```ts
'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { useAuthStore } from '@duing/stores';

import type { AuthStatus } from '@duing/stores';

// 화면 렌더용 status 셀렉터(§10) — 소비자가 raw 비교를 하지 않게 하는 단일 지점.
// serverSeed(A′ 가 SSR 에서 검증한 값)가 있으면 그것이 서버 스냅샷이 된다:
// SSR HTML 과 하이드레이션 첫 렌더가 서버 값으로 일치하고(React #419 방지), 하이드레이션 직후
// 스토어 현재값(부팅 시드·서버 확정 반영)으로 동기화된다. serverSeed 가 없는 라우트는 스토어
// 초기값이 서버 스냅샷이라 정적 프리렌더 HTML 과 일치한다.
export function useSeededAuthStatus(serverSeed: boolean | null = null): AuthStatus {
  const getServerSnapshot = useCallback((): AuthStatus => {
    if (serverSeed === null) return useAuthStore.getInitialState().status;
    return serverSeed ? 'authenticated' : 'unauthenticated';
  }, [serverSeed]);
  return useSyncExternalStore(
    useAuthStore.subscribe,
    () => useAuthStore.getState().status,
    getServerSnapshot,
  );
}
```

`apps/web/app/(home)/layout.tsx` 전체 교체:
```tsx
import type { ReactNode } from 'react';

import { cookies } from 'next/headers';

import { verifyAuthHint } from '@/middleware';

import { AuthHintSeed } from '../_components/AuthHintSeed';
import { HomeNav } from '../_components/HomeNav';

// 홈 상단 GNB 를 페이지가 아닌 레이아웃에 둔다 — 홈은 force-dynamic 이라 탭 재방문 시
// RSC 페치가 도는데, 헤더가 페이지 안에 있으면 로딩 폴백 동안 헤더째 사라져 깜빡인다.
// 레이아웃은 로딩 경계 밖이므로 페치 중에도 GNB 가 유지된다(clubs/facilities 레이아웃과 동일 구조).
//
// A′(스펙 §5.2·§7): 여기서 auth_hint 를 서버 검증해 헤더의 초기 인증 상태를 SSR 에 확정한다.
// 홈은 이미 force-dynamic 이라 cookies() 를 읽어도 정적 페이지 손실이 없다(metric 6).
// 클라이언트로는 boolean 만 내린다 — role 은 담지 않는다(§9.3). 시크릿 부재(로컬 미설정)면
// 검증 불가 → false 로 두고 클라 시드에 맡긴다. 프로덕션 부재는 미들웨어가 이미 부팅을 막는다.
export default async function HomeLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const authHint = cookieStore.get('auth_hint')?.value ?? null;
  const authHintSecret = process.env.AUTH_HINT_SECRET;
  const authHintClaims =
    authHint && authHintSecret ? await verifyAuthHint(authHint, authHintSecret) : null;
  const initialAuthenticated = authHintClaims !== null;
  return (
    <div className="duing min-h-dvh bg-cream">
      <AuthHintSeed authenticated={initialAuthenticated} />
      <HomeNav slimOnMobile initialAuthenticated={initialAuthenticated} />
      {children}
    </div>
  );
}
```
(HomeNav 의 `initialAuthenticated` prop 은 Task 7 에서 추가된다 — Task 6·7 은 같은 세션에서 연달아 진행하고, 중간 상태의 typecheck 실패는 Task 7 완료로 해소한다. 순서를 바꾸지 말 것: prop 정의(7)보다 사용(6)이 먼저 커밋되는 일은 없다 — 커밋 자체가 없으므로 트리 기준으로만 정합하면 된다)

- [ ] **Step 4: 통과 확인** — Step 1 테스트 2파일 PASS. layout 은 Task 7 완료 후 `pnpm --filter @duing/web typecheck` 로 함께 확인.

---

### Task 7: 헤더 소비자 — HomeNav·HomeNavAuthSlot·NotificationBell·UserMenu (metric 1·2)

**Files:**
- Modify: `frontend/apps/web/app/_components/HomeNav.tsx` (prop 추가·전달)
- Modify: `frontend/apps/web/app/_components/HomeNavAuthSlot.tsx` (자리표시 삭제)
- Modify: `frontend/apps/web/app/_components/NotificationBell.tsx` (prop·훅 교체)
- Modify: `frontend/apps/web/components/UserMenu.tsx` (prop·null user 대응)
- Test: `frontend/apps/web/test/components/user-menu.test.tsx`·`test/auth/idle-auth-consumers.test.tsx` (갱신), `test/components/notification-bell.test.tsx` (갱신)

**Interfaces:**
- Consumes: Task 6 `useSeededAuthStatus`
- Produces: `HomeNav`/`HomeNavAuthSlot`/`NotificationBell`/`UserMenu` 모두 `initialAuthenticated?: boolean | null` (기본 `null`) — 홈 외 호출부는 무변경

- [ ] **Step 1: 구현**

`HomeNav.tsx`: `type Props = { slimOnMobile?: boolean; initialAuthenticated?: boolean | null };` → `<NotificationBell initialAuthenticated={initialAuthenticated ?? null} />`, `<HomeNavAuthSlot initialAuthenticated={initialAuthenticated ?? null} />` (다른 호출부 5곳은 prop 미전달 = null).

`HomeNavAuthSlot.tsx` 전체 교체:
```tsx
'use client';

import Link from 'next/link';

import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { UserMenu } from '@/components/UserMenu';

// 시드 모델(스펙 §8·§9.2)에서는 "확인 중" 대기 상태가 없다 — status 는 언제나 현재 최선의
// 판단이고, 홈에서는 A′ 서버 시드가 SSR 시점에 이 값을 확정한다(자리표시 제거 — metric 1·2).
// 시드가 틀린 드문 경우(스텔 힌트 등)는 서버 확인이 도착하는 대로 그쪽으로 정정된다.
export function HomeNavAuthSlot({
  initialAuthenticated = null,
}: {
  initialAuthenticated?: boolean | null;
}) {
  const status = useSeededAuthStatus(initialAuthenticated);

  if (status !== 'authenticated') {
    return (
      <div className="flex items-center gap-2.5">
        <Link
          href="/login"
          className="grid h-10 place-items-center rounded-full px-4 text-[13px] font-semibold text-charcoal-2 hover:bg-graysoft"
        >
          로그인
        </Link>
        <Link href="/signup" className="btn btn-primary btn-sm rounded-full px-4">
          가입하기
        </Link>
      </div>
    );
  }

  return <UserMenu initialAuthenticated={initialAuthenticated} />;
}
```

`UserMenu.tsx` 변경점 (23~34행):
```tsx
export function UserMenu({
  initialAuthenticated = null,
}: {
  initialAuthenticated?: boolean | null;
} = {}) {
  const status = useSeededAuthStatus(initialAuthenticated);
  // ... (meQuery·logout·router·addToast 기존 그대로)
  if (status !== 'authenticated') return null;
  // 시드 직후에는 프로필이 아직 없다 — '회원' 폴백이 SSR·시드 구간을 그대로 받는다(기존 폴백 재사용).
  const userName = meQuery.data?.name ?? '회원';
```
(import 를 `useAuthStore` → `useSeededAuthStatus` 로 교체. 나머지 로직 무변경)

`NotificationBell.tsx` 변경점:
```tsx
export function NotificationBell({
  initialAuthenticated = null,
}: {
  initialAuthenticated?: boolean | null;
} = {}) {
  const isAuthenticated = useSeededAuthStatus(initialAuthenticated) === 'authenticated';
  // (이하 기존 그대로 — enabled 인자·null 렌더 포함)
```

- [ ] **Step 2: 테스트 갱신**
  - `user-menu.test.tsx`: 상태 셋업 `'idle'` → 초기값 리셋; "authenticated + 프로필 미도착 → '회원님' 트리거 렌더" 케이스 추가(시드 구간 계약)
  - `idle-auth-consumers.test.tsx`: **파일 개명 없이** 내용 재작성 — "idle 자리표시" 단언(HomeNavAuthSlot `role="status"`)을 "시드된 unauthenticated 는 즉시 로그인·가입 버튼(자리표시 없음 — metric 2)" / "시드된 authenticated 는 즉시 UserMenu(로그인 버튼 0 — metric 1 단위 수준)" 로 교체. `role="status"` 자리표시가 **DOM 에 존재하지 않음**을 `queryByRole('status')` null 로 단언
  - `notification-bell.test.tsx`: 상태 셋업만 새 모델로

- [ ] **Step 3: 통과 확인** — `pnpm --filter @duing/web test -- --run test/components/user-menu.test.tsx test/components/notification-bell.test.tsx test/auth/idle-auth-consumers.test.tsx` → PASS. `pnpm --filter @duing/web typecheck` → PASS (Task 6 layout 포함)

---

### Task 8: 가드 전환 — MeAuthGuard·AdminRoleGuard·notifications (metric 4)

**Files:**
- Modify: `frontend/apps/web/app/me/_components/MeAuthGuard.tsx`
- Modify: `frontend/apps/web/app/admin/_components/AdminRoleGuard.tsx`
- Modify: `frontend/apps/web/app/notifications/page.tsx`
- Test: `frontend/apps/web/test/me/me-auth-guard.test.tsx`, `frontend/apps/web/test/admin/*role-guard*`(존재 시), `frontend/apps/web/test/notifications/*` (갱신)

**Interfaces:** Consumes Task 6 `useSeededAuthStatus`(인자 없이 — 이 라우트들은 A′ 밖), Task 1 스토어.

- [ ] **Step 1: 구현**

`MeAuthGuard.tsx` — 훅 교체와 주석 갱신만 (렌더 구조 유지):
```tsx
import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';

// 미들웨어는 auth_hint(라우팅 힌트)만 보고 /me 를 통과시키므로, 힌트가 실제 세션보다 오래
// 살아남으면 미인증 상태로도 여기까지 도달한다. 시드 모델에서 status 는 항상 현재 최선의
// 판단이다 — 로컬 이력이 있으면 authenticated 로 시드돼 보호 화면이 즉시 열리고, 시드가
// 틀렸다면 만료 핸들러의 확정이 이 가드를 로그인 유도로 되돌린다. 의도적 로그아웃의 일시
// 노출은 기존처럼 delayed-show 가 가린다.
export function MeAuthGuard({ children }: { children: ReactNode }) {
  const status = useSeededAuthStatus();
  const pathname = usePathname();
  if (status !== 'unauthenticated') return <>{children}</>;
  // (이하 기존 로그인 유도 렌더 그대로)
```

`AdminRoleGuard.tsx` 전체 교체:
```tsx
'use client';

import { useMeQuery } from '@duing/hooks';

import { useSeededAuthStatus } from '@/app/_lib/useSeededAuthStatus';
import { LoadingGate } from '@/components/loading/LoadingGate';

/**
 * Defense-in-depth: middleware 가 이미 /admin/* 진입을 ADMIN 으로 제한하지만,
 * 토큰 클레임이 위조되거나 캐시된 페이지가 노출되는 코너 케이스를 막기 위해
 * 클라이언트에서 `useMeQuery` 의 실제 role 값을 한 번 더 확인한다.
 * role 은 시드에 실리지 않으므로(§9.3) 판정은 항상 서버 프로필(meQuery)로만 한다.
 */
export function AdminRoleGuard({ children }: { children: React.ReactNode }) {
  const authStatus = useSeededAuthStatus();
  const meQuery = useMeQuery();

  // 시드된 authenticated 에서는 meQuery 가 즉시 활성이다 — 프로필이 도착할 때까지가 "확인 중"
  // 이고, 그동안 권한 거부 문구를 먼저 띄우면 로그인한 관리자가 콘솔을 열 때마다 그걸 본다
  // (metric 4). 조회 실패는 권한 미확인이므로 거부로 떨어뜨린다(관리자 콘솔은 fail-closed).
  if (authStatus === 'authenticated' && !meQuery.isError && meQuery.data === undefined) {
    return <LoadingGate label="권한 확인 중" />;
  }
  if (meQuery.data?.role !== 'ADMIN') {
    return (
      <p className="text-danger px-4 sm:px-6 md:px-10 py-12 text-sm">
        총동연(관리자) 권한이 필요합니다.
      </p>
    );
  }
  return <>{children}</>;
}
```

`notifications/page.tsx` (21~54행 대체):
```tsx
  const authStatus = useSeededAuthStatus();
  // ... (router 등 유지, boundedAuthStatus 제거)
  const listQuery = useNotificationListQuery(unreadOnly, authStatus === 'authenticated');

  useEffect(() => {
    // 시드 모델에서 unauthenticated 는 "현재 최선의 판단이 비로그인"이다 — 즉시 로그인으로
    // 보낸다(이 라우트는 미들웨어 밖이라 이 리다이렉트가 유일한 가드다). 시드가 틀린 드문
    // 경우는 로그인 화면이 세션을 확인하고 next 로 되돌린다.
    if (authStatus === 'unauthenticated') {
      router.replace('/login?next=/notifications');
    }
  }, [authStatus, router]);

  if (authStatus !== 'authenticated') {
    return <LoadingGate label="이동 중" />;
  }
```

- [ ] **Step 2: 테스트 갱신** — `me-auth-guard.test.tsx`: idle 케이스 → "시드된 authenticated 는 children" / "검증·시드 무관 unauthenticated 는 로그인 유도". AdminRoleGuard 테스트(기존 위치 확인: `grep -rl AdminRoleGuard apps/web/test`): metric 4 계약 — "시드된 authenticated + 프로필 미도착 → LoadingGate(권한 문구 없음)" / "role STUDENT → 권한 문구" / "meQuery 오류 → 권한 문구". notifications 테스트: 상태 셋업 갱신 + "unauthenticated 즉시 replace('/login?next=/notifications')".

- [ ] **Step 3: 통과 확인** — 해당 3개 스위트 PASS

---

### Task 9: 소비자 전환 — 찜·탐색·예약 폼·지원·로그인 잔여

**Files:**
- Modify: `frontend/apps/web/app/_components/FavoriteToggleButton.tsx`
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx` (108~120행 술어 + 534·690행 분기)
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingForm.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_lib/useClubApply.ts` (주석만 — 동작 무변경)
- Test: 각 기존 스위트 갱신 (`test/clubs/*explore*`, `test/facilities/facility-booking-page.test.tsx`, FavoriteToggle 관련)

**핵심 규칙 (§8.1 소비자 표):** 찜 토글 **방향**은 되돌릴 수 없는 동작 축 — 방향을 모르는 동안(= `status==='authenticated' && favoriteIdsQuery.data === undefined`) 비활성. 화면 렌더는 `status` 로만.

> **[Task 8 보정 — 리뷰 발견 반영]** 비-A′ 라우트의 SSR/프리렌더 프레임은 스토어 초기값
> (`unauthenticated`)으로 그려지므로, 가드가 그 프레임에 부정 UI(권한 거부·로그인 유도)를 실으면
> 미들웨어를 통과한 정당한 사용자 전원이 하이드레이션까지 그 화면을 본다(§9.2 가 금지하는 화면,
> metric 4 위반). 보정: `app/_lib/useHydrated.ts`(useSyncExternalStore 하이드레이션 검출) 추가 —
> AdminRoleGuard 는 미하이드레이션 프레임에 LoadingGate(기존 idle 프레임과 동등), MeAuthGuard 는
> children(기존 idle 프레임과 동등)을 렌더한다. 화면은 여전히 status 로만 가른다(§8.1 유지 —
> 하이드레이션 게이트는 상태 분기가 아니라 SSR 정합 장치다). notifications 의 로그인 이동은
> 부수효과이므로 **확정 신호(verified unauthenticated)** 에만 발화 — 시드 미인증(익명)은
> 부트스트랩 401 체인의 확정(핸들러 동기 기록)을 기다렸다 이동한다(base 동작과 동일한 대기).

- [ ] **Step 1: 구현**

`FavoriteToggleButton.tsx`:
```tsx
  const status = useSeededAuthStatus();
  const favoriteIdsQuery = useFavoriteIdsQuery();
  // 찜 방향은 로드된 목록에 달려 있다 — 시드로 화면은 열되, ids 도착 전에는 방향을 알 수 없어
  // 누르지 못하게 막는다(§8.1: 되돌릴 수 없는 동작). 미인증이면 클릭이 로그인 이동이라 무관.
  const isDirectionUnknown = status === 'authenticated' && favoriteIdsQuery.data === undefined;
```
- `isAuthPending` 참조 2곳(31행 가드·70행 disabled)을 `isDirectionUnknown` 으로 교체, `useBoundedAuthStatus` import 제거.

`ClubExplorePage.tsx`:
- 108~110행 주석·훅: `const authStatus = useSeededAuthStatus();`
- `requiresLoginForFavorite = params.favorite && authStatus !== 'authenticated'` (유지 — 시드 의미로 동작)
- `isAuthPending` → `const isFavoriteDirectionUnknown = authStatus === 'authenticated' && favoriteIdsQuery.data === undefined;` 로 대체하고 하트 disabled 에 연결(기존 isAuthPending 소비처 grep 후 전부 교체)
- 534·690행: `authStatus === 'idle' ? (스켈레톤) : (FavoriteLoginPrompt)` 3항 분기를 **FavoriteLoginPrompt 단일 렌더**로 축소 (idle 없음 — 시드된 미인증은 곧 로그인 유도가 옳다)

`BookingForm.tsx`:
- 40~42행: `const authStatus = useSeededAuthStatus(); const authUser = useAuthStore((state) => state.user);` (`useBoundedAuthStatus` 제거)
- 61~63행 idle 스켈레톤 분기 **삭제** (시드가 대기를 대체)
- 65행 분기 유지: `if (authStatus !== 'authenticated') { ...로그인 안내... }`
- 프리필 회귀 방지 — 시드 부팅에서는 mount 시점에 `authUser` 가 null 이고 프로필이 뒤에 도착한다. 54행 useState 초기화만으로는 프리필이 유실되므로 backfill 효과를 추가:
```tsx
  const contactPhoneTouchedRef = useRef(false);
  // 시드 부팅에서는 프로필(/users/me)이 폼 마운트 뒤에 도착한다 — 사용자가 아직 입력하지
  // 않았을 때만 늦게 온 프로필 번호를 채워 기존 프리필 동작을 유지한다.
  useEffect(() => {
    if (contactPhoneTouchedRef.current) return;
    if (contactPhone === '' && authUser?.phone) setContactPhone(formatPhone(authUser.phone));
  }, [authUser, contactPhone]);
```
  (contactPhone 입력 onChange 에서 `contactPhoneTouchedRef.current = true` 설정 — 기존 핸들러에 1줄)

`useClubApply.ts`: 45~47행 주석의 "(idle)" 표현을 시드 모델 설명으로 갱신 — 동작 무변경(시드된 미인증 → 로그인 이동 / 시드된 로그인 → 요청 후 401 판정, 기존 계약 그대로).

- [ ] **Step 2: 테스트 갱신** — facility-booking-page.test.tsx 의 idle 2곳: "시드된 authenticated 에서 폼이 즉시 열리고, 늦게 도착한 프로필 번호가 빈 연락처를 채운다 / 사용자가 입력한 뒤에는 덮지 않는다" 케이스로 재작성. 탐색·찜 스위트: 방향 미확정 비활성 + ids 도착 후 활성 단언.

- [ ] **Step 3: 통과 확인** — 해당 스위트 PASS

---

### Task 10: useBoundedAuthStatus 제거 + 전 스위트 정리 (metric 6·9·10)

**Files:**
- Delete: `frontend/apps/web/app/_lib/useBoundedAuthStatus.ts`
- Modify: 잔여 `'idle'` 참조 테스트 일괄 갱신 — `test/(auth)/login/LoginFormPanel.test.tsx`, `test/(auth)/signup/*` 3파일, `test/auth/login-remember-me.test.tsx`, `test/me/settings/*` 3파일 (상태 셋업 기계적 교체: `{status:'idle',user:null}` → `useAuthStore.getInitialState()` 리셋 / `'unauthenticated'` 셋업에 `isVerified:true` 명시가 필요한 곳만)
- Modify: `frontend/apps/web/test/auth/legacy-auth-cleanup.test.ts`·기타 grep 잔여

- [ ] **Step 1: 삭제 및 참조 소거** — `rm apps/web/app/_lib/useBoundedAuthStatus.ts` 후 `grep -rn "useBoundedAuthStatus" frontend/apps/` → **0건** (metric 9)
- [ ] **Step 2: 잔여 idle 참조 정리** — `grep -rn "'idle'" frontend/apps/web frontend/packages --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v fetchStatus` → 남는 것은 RQ `fetchStatus === 'idle'` 뿐이어야 한다 (auth status 의 idle 0건)
- [ ] **Step 3: 전체 검증** — `frontend/` 에서:
  - `pnpm --filter @duing/web test -- --run` → 전부 PASS
  - `pnpm -r test -- --run` (패키지 스위트) → PASS
  - `pnpm --filter @duing/web typecheck` · `pnpm --filter @duing/web lint` → PASS
  - `pnpm build` → 성공 + 라우트 표 `○` 개수 **40 유지** (metric 6 — 빌드 로그의 `○` 라인 수를 세어 기록. `(home)` 외 라우트가 동적으로 바뀌지 않았는지 확인)

---

### Task 11: Playwright E2E — SSR→하이드레이션·플로우·metric 1·2·4

**Files:**
- Create: `frontend/apps/web/e2e/auth-initial-state.spec.ts`
- Create: `frontend/apps/web/playwright.auth-initial.config.ts`

**전제:** 프로덕션 빌드(`pnpm build` — Task 10 완료본)를 `next start -p 3106` 로 띄우고, 백엔드는 Playwright `context.route` 로 대체한다(api.duings.com 을 가로채는 방식 — §4.2 측정 하네스와 동일 원리. 빌드 시 `NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1`). `auth_hint` 는 테스트가 `AUTH_HINT_SECRET` (env `E2E_AUTH_HINT_SECRET`, 기본 `.env.local` 값 주입) 으로 직접 서명해 `context.addCookies` 로 심는다 — 미들웨어·(home) 레이아웃이 실제 HMAC 검증을 통과한다.

- [ ] **Step 1: config 작성** — `playwright.auth-initial.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

// PR-3 인증 초기 상태 E2E — 관리자 스모크(playwright.config.ts)와 달리 실백엔드 없이
// 프로덕션 빌드 + route 인터셉트로 자급한다. 실행:
//   NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 pnpm build   (선행 1회)
//   npx playwright test -c playwright.auth-initial.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: 'auth-initial-state.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3106',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  webServer: {
    command: 'node_modules/.bin/next start -p 3106',
    url: 'http://localhost:3106',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: 스펙 작성** — `e2e/auth-initial-state.spec.ts` 골격과 필수 케이스 (전부 실제 코드로):

```ts
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

const API_HOST = 'https://api.duings.com';
const HINT_SECRET = process.env.E2E_AUTH_HINT_SECRET ?? 'af0d8da622ffc2b180ff3f3c8e9aafc9de0a9e9fa71d0003a68d6966b2b65f38';

const TEST_USER = {
  id: 9001, studentId: '20240001', name: '홍길동', phone: '010-1234-5678',
  grade: 'JUNIOR', role: 'STUDENT', college: 'IT_ENGINEERING', major: '컴퓨터공학',
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signAuthHint(role: 'STUDENT' | 'ADMIN', expiresInSeconds = 3600): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    typ: 'AUTH_HINT', role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }));
  const signature = createHmac('sha256', HINT_SECRET)
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function seedLoggedInCookies(context: BrowserContext, role: 'STUDENT' | 'ADMIN' = 'STUDENT') {
  await context.addCookies([
    { name: 'auth_hint', value: signAuthHint(role), domain: 'localhost', path: '/' },
  ]);
  await context.addInitScript(() => window.localStorage.setItem('duing:had-session', '1'));
}

type ApiScenario = 'valid' | 'expired' | 'anonymous' | 'refresh-unavailable';

async function routeApi(context: BrowserContext, scenario: ApiScenario) {
  let meCalls = 0;
  let refreshCalls = 0;
  let accessValid = scenario === 'valid';
  const cors = {
    'access-control-allow-origin': 'http://localhost:3106',
    'access-control-allow-credentials': 'true',
  };
  const ok = (data: unknown) => JSON.stringify({ ok: true, data, message: null });
  const fail = (message: string) => JSON.stringify({ ok: false, data: null, message });
  await context.route(`${API_HOST}/**`, async (route) => {
    const url = route.request().url();
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        ...cors,
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'content-type',
      }});
    }
    if (url.includes('/auth/web/refresh')) {
      refreshCalls += 1;
      if (scenario === 'anonymous') return route.fulfill({ status: 401, headers: { ...cors, 'content-type': 'application/json' }, body: fail('인증이 필요합니다.') });
      if (scenario === 'refresh-unavailable') return route.fulfill({ status: 503, headers: { ...cors, 'content-type': 'application/json' }, body: fail('일시 오류') });
      accessValid = true;
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.includes('/users/me')) {
      meCalls += 1;
      if (scenario === 'anonymous' || !accessValid) {
        return route.fulfill({ status: 401, headers: { ...cors, 'content-type': 'application/json' }, body: fail('인증이 필요합니다.') });
      }
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: ok(TEST_USER) });
    }
    if (url.includes('/favorites/ids')) {
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: ok({ clubIds: [1] }) });
    }
    // 그 밖의 API 는 빈 목록 — 이 스펙의 관심사가 아니다.
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' },
      body: ok({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 0 }) });
  });
  return { meCalls: () => meCalls, refreshCalls: () => refreshCalls };
}

// 헤더 상태를 rAF 프레임 단위로 기록한다 — metric 1(로그인 버튼 0프레임)·metric 2(자리표시 0ms).
const HEADER_OBSERVER = `
window.__headerFrames = [];
(function poll() {
  const hasLoginButton = document.querySelector('header a[href="/login"]') !== null;
  const hasPlaceholder = document.querySelector('header [role="status"]') !== null;
  const hasMenu = Array.from(document.querySelectorAll('header button'))
    .some((node) => node.textContent && node.textContent.includes('님'));
  window.__headerFrames.push({ t: performance.now(), hasLoginButton, hasPlaceholder, hasMenu });
  requestAnimationFrame(poll);
})();
`;

test.describe('PR-3 인증 초기 상태', () => {
  test('[metric 1] 로그인 사용자 홈 하드 로드 — 로그인 버튼 0프레임, 하이드레이션 오류 0', async ({ browser }) => {
    const context = await browser.newContext();
    await seedLoggedInCookies(context);
    await routeApi(context, 'expired');
    const page = await context.newPage();
    const hydrationErrors: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('418') || message.text().includes('419') || message.text().includes('Hydration')) {
        hydrationErrors.push(message.text());
      }
    });
    await page.addInitScript(HEADER_OBSERVER);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__headerFrames.some((frame) => frame.hasMenu));
    const frames = await page.evaluate(() => window.__headerFrames);
    expect(frames.filter((frame) => frame.hasLoginButton)).toHaveLength(0);
    expect(frames.filter((frame) => frame.hasPlaceholder)).toHaveLength(0);
    expect(hydrationErrors).toHaveLength(0);
    await context.close();
  });

  test('[metric 2] 비로그인 홈 하드 로드 — 자리표시 0ms, 즉시 로그인·가입 버튼', async ({ browser }) => {
    const context = await browser.newContext();
    await routeApi(context, 'anonymous');
    const page = await context.newPage();
    await page.addInitScript(HEADER_OBSERVER);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__headerFrames.some((frame) => frame.hasLoginButton));
    const frames = await page.evaluate(() => window.__headerFrames);
    expect(frames.filter((frame) => frame.hasPlaceholder)).toHaveLength(0);
    expect(frames.filter((frame) => frame.hasMenu)).toHaveLength(0);
    await context.close();
  });
});
```

  나머지 필수 케이스 (같은 헬퍼로 이어서 작성):
  - **[metric 4]** `seedLoggedInCookies(context, 'ADMIN')` + `routeApi('valid')`(me 가 role ADMIN 반환하도록 TEST_USER 오버라이드) → `/admin/clubs` 하드 로드 → 전 프레임에서 "권한이 필요합니다" 0회 (본문 폴링은 HEADER_OBSERVER 와 같은 패턴으로 `document.body.textContent` 검사)
  - **refresh 성공(access 만료)**: 'expired' + 로그인 쿠키 → 홈 → 메뉴 유지, `meCalls()===2 && refreshCalls()===1` (3왕복 — 레버 2 미구현 기준), 로그인 버튼 0프레임
  - **refresh 실패(진짜 만료)**: 'anonymous' 시나리오 + 로그인 쿠키(had-session 있음) → 홈 → 만료 토스트 노출 + `/login` 이동 (검증된 세션이 아니므로... **주의**: 시드는 미검증이라 §9.1 게이트가 조용히 내린다 — 단언은 "토스트·이동 없이 로그인 버튼으로 정정"이 옳다. 검증된 세션의 만료 재생은 valid 로 부팅해 setSession 후 API 를 anonymous 로 재라우팅하고 찜 클릭으로 401 을 유발해 토스트·이동을 단언)
  - **refresh 일시 장애**: 'refresh-unavailable' + 로그인 쿠키 → 홈 → 로그아웃으로 뒤집히지 않음(메뉴/재시도 토스트 유지 — PR-2 계약), 로그인 버튼 0프레임
  - **로그아웃**: valid 부팅 → 메뉴 → 로그아웃 클릭(로그아웃 API 는 204 라우팅 추가) → 로그인 버튼 노출 + `duing:had-session` 제거 단언
  - **Explore**: valid 부팅 → `/clubs` → 하트가 ids 도착 전 disabled, 도착 후 enabled·방향 정확(`aria-pressed`)
  - **Notifications**: 로그인 부팅 → `/notifications` 즉시 목록 / 익명 → `/login?next=/notifications` 로 replace
  - **Me**: 로그인 부팅 → `/me` 하드 로드 → "로그인이 필요한 페이지예요" 0프레임
  - **CPU 4x**: metric 1·2 두 케이스를 `context.newCDPSession(page)` + `Emulation.setCPUThrottlingRate({rate:4})` 로 반복
- [ ] **Step 3: 실행·통과 확인** — `frontend/apps/web` 에서:
  1. `NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 AUTH_HINT_SECRET=<.env.local 값> ../../node_modules/.bin/...` 대신: `NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 pnpm --filter @duing/web build` (frontend/ 에서 패키지 선빌드 포함 `pnpm build`)
  2. `npx playwright test -c playwright.auth-initial.config.ts` → 전부 PASS (webServer 가 AUTH_HINT_SECRET 을 읽도록 `.env.local` 이 워크트리에 존재함을 확인)

---

### Task 12: 성능 검증 — 구현 전/후 실측 (metric 3·5·8)

**Files:**
- Create: `frontend/apps/web/e2e/measure-boot.mjs` 사용은 하지 않는다 — 세션 스크래치의 기존 하네스를 재사용: `/private/tmp/.../scratchpad/measure.mjs` (§4.2 측정과 동일 조건이어야 전/후가 비교된다)

- [ ] **Step 1: baseline(§4 전 = develop) 측정** — develop 워킹트리 손대지 말고 이 워크트리에서: `git stash` 없이 **빌드 산출물 분리**가 어려우므로, 순서로 해결한다: 먼저 `git worktree` 격리 없이 현 브랜치에서 구현 완료 후, baseline 은 `git stash push` → `pnpm build` → 측정 → `git stash pop` → `pnpm build` → 측정. (stash 는 커밋이 아니다 — Global Constraints 위반 아님. pop 실패 대비: stash 직후 `git stash list` 확인)
- [ ] **Step 2: 측정 실행** — 스크래치 하네스로 두 빌드 각각: 시나리오 `expired`·`valid`·`anonymous` × CPU 1x/4x × 왕복 280ms, 5회 중앙값. 수집 지표: 인증 요청 시작 시각(첫 인증 API startTime), 인증 확정 시각(헤더 확정 rAF 마크), `/users/me`·`refresh` 호출 수, FCP. **PR 후 빌드는 추가로**: SSR 확정 여부(첫 프레임부터 메뉴/버튼 — 요청 도착 전 확정), 홈 헤더 전환 시간(첫 페인트 대비 헤더 변화 시각 — metric 3 의 "확정 시점" 보고)
- [ ] **Step 3: 판정 기록** — metric 3: §4 전 대비 요청 시작 단축(레버 1)·확정 시점 SSR 로 이동(A′) 을 수치로. metric 5: 3왕복 유지 — "레버 2 의도적 제외(§4.2)" 로 보고. metric 8: anonymous 시나리오의 인증 API 요청 수 전/후 동일 확인. 결과 표는 최종 보고에 포함하고 스펙 문서는 수정하지 않는다(구현 PR 범위 밖).

---

## Self-Review 결과 (플랜 작성 시점)

- **스펙 커버리지**: §8(T1) §9.1(T4) §9.2(T2·T6) §9.3(T6·T8-Admin 주석) §10(T1·T5) §4 레버1(T2·T3) A′(T6·T7) metric 1·2(T7·T11) 3(T12) 4(T8·T11) 6(T10) 7(T4) 8(T5·T12) 9(T10) 10(T10) — 전부 태스크에 대응. metric 5·11 은 의도적 제외/배포 후 항목으로 보고서에 명시.
- **타입 일관성**: `AuthStatus`·`seedSession`·`selectIsAuthenticated`·`useSeededAuthStatus(serverSeed)`·`consumeBootSessionRestore` 명칭이 태스크 전반에서 동일함을 확인.
- **잔여 리스크 명시**: (a) zustand v5 `getInitialState` 하이드레이션 규약이 이 설계의 축 — Task 11 의 하이드레이션 오류 0 단언이 실검증선 (b) Task 6·7 은 prop 정의 순서 때문에 중간 typecheck 실패가 정상 — 연달아 진행 (c) BookingForm 프리필 backfill 은 기존 동작 보존용 신규 코드 — 전용 테스트 필수.
