# Refresh Token PR-2(FE) — 웹 자동 갱신·rememberMe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 FE 가 401 을 만나면 크로스탭 single-flight 로 `auth/web/refresh` 를 호출해 원요청을 1회 재시도하고, 로그인 화면의 "로그인 상태 유지" 체크박스를 `rememberMe` 페이로드로 연결한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-18-refresh-token-session-auth-design.md` §12·§17. 갱신 조율은 신규 소형 모듈(`refresh-coordinator.ts` — navigator.locks 크로스탭 뮤텍스 + 탭 내 in-flight 공유 + localStorage 최근 갱신 생략)로 분리하고, `client.ts` 의 afterResponse 401 훅이 이를 소비한다. 재시도는 ky 공식 패턴(훅에서 `return ky(request)` — bare ky 라 훅 미적용 = 루프 불가). BE(PR-1, develop 머지됨)의 `/auth/web/refresh` 는 204 + Set-Cookie 3종을 반환한다.

**Tech Stack:** Next.js 15 / React 19, ky, React Query, vitest + msw(node) — `frontend/packages/api/test/` 전례.

## Global Constraints

- 브랜치 `feat/auth-refresh-web-client` (develop 에서 분기). **push·PR 생성 금지** — 로컬 커밋만.
- 커밋 메시지 한국어 Conventional Commits(`feat(frontend): ...`). **Co-Authored-By/🤖 Generated 라인 절대 금지.**
- pnpm 은 반드시 `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend` 후 실행(cwd 함정). 테스트 필터명은 해당 패키지 package.json 의 `name` 을 먼저 확인.
- 갱신 실패 의미(스펙 §17): refresh **401/404** = 세션 종료(notifyUnauthorized — 404 는 BE 롤백 호환), **5xx/네트워크/타임아웃** = 세션 유지·원 401 표면화. 재시도는 요청당 1회.
- `SessionExpiryHandler`·`AuthSessionBootstrap`·Zustand 스토어·middleware.ts 는 **무변경**.
- bearer transport 경로의 기존 401 동작(Authorization 보유 + 비로그아웃 → notify)은 그대로 유지 — refresh 연동은 웹 쿠키 모드 전용(RN 은 PR-4).
- RQ networkMode 'always'·ky retry:0 정책 불변(네트워크 내성 스펙과의 계약).

## File Structure

```
frontend/packages/types/src/user.ts            # LoginPayload.rememberMe?, LoginResult.refreshToken?
frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx  # 체크박스 → 페이로드 (기존 state 재사용)
frontend/packages/api/src/refresh-coordinator.ts   # 신규 — 갱신 조율(락·single-flight·최근 생략)
frontend/packages/api/src/client.ts            # afterResponse 401 훅 교체 + refresh 실행기
frontend/packages/api/test/refreshCoordinator.test.ts  # 신규 단위
frontend/packages/api/test/authRefresh.test.ts         # 신규 msw 통합
frontend/apps/web/test/auth/login-remember-me.test.tsx # 신규 컴포넌트
```

---

### Task 1: rememberMe 배선 — 타입·로그인 폼

**Files:**
- Modify: `frontend/packages/types/src/user.ts:109-118` (LoginPayload·LoginResult)
- Modify: `frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx:89-95` (제출 페이로드)
- Test: `frontend/apps/web/test/auth/login-remember-me.test.tsx` (신규)

**Interfaces:**
- Produces: `LoginPayload = { studentId: string; password: string; rememberMe?: boolean }` — Task 3 의 msw 테스트가 이 타입으로 로그인 호출.
- 참고: 체크박스 state(`rememberMe`, `LoginFormPanel.tsx:79`)와 UI(:245)는 이미 존재 — **전달만 끊겨 있다.** UI 신규 작성 금지.

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

`frontend/apps/web/test/auth/login-remember-me.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiClientProvider } from '@duing/hooks';
import { LoginFormPanel } from '@/app/(auth)/login/_components/LoginFormPanel';

// next/navigation 은 앱 라우터 밖에서 동작하지 않는다 — 레포 기존 컴포넌트 테스트 관례대로 mock.
// (기존 테스트 파일에서 동일 mock 형태를 찾아 그대로 따를 것 — 아래는 기본형)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const loginMock = vi.fn().mockResolvedValue({
  id: 1, studentId: '20261234', name: '테스터', phone: '010-0000-0000',
  grade: 'FRESHMAN', role: 'STUDENT',
});

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const apiClientStub = { auth: { login: loginMock } };
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClientStub as never}>
        <LoginFormPanel />
      </ApiClientProvider>
    </QueryClientProvider>,
  );
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/학번/), '20261234');
  await user.type(screen.getByLabelText(/비밀번호/), 'Abcd1234!');
  await user.click(screen.getByRole('button', { name: /로그인/ }));
}

describe('로그인 상태 유지 체크박스', () => {
  beforeEach(() => loginMock.mockClear());

  it('미체크(기본)면 로그인 페이로드에 rememberMe false 가 전달된다', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitCredentials(user);
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(loginMock).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: '20261234', rememberMe: false }),
    );
  });

  it('체크하면 로그인 페이로드에 rememberMe true 가 전달된다', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('checkbox', { name: /로그인 상태 유지/ }));
    await submitCredentials(user);
    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1));
    expect(loginMock).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: true }));
  });
});
```

주의: 셀렉터(라벨 텍스트·role)는 `LoginFormPanel.tsx` 실마크업과 대조해 맞춘다(체크박스가 `<input type="checkbox">` + `<span>로그인 상태 유지</span>` 구조라 접근 가능한 이름이 없으면 label 연결 또는 `aria-label` 을 컴포넌트에 보강 — 접근성 개선을 겸한 최소 수정 허용). 기존 컴포넌트 테스트의 provider/mock 관례가 위와 다르면 **기존 관례가 정답**.

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter web test -- run test/auth/login-remember-me.test.tsx`
Expected: FAIL — `rememberMe: false` 미포함(현재 페이로드는 studentId/password 뿐)

- [ ] **Step 3: 타입·폼 수정**

`frontend/packages/types/src/user.ts` — 두 타입 교체:

```ts
export type LoginPayload = {
  studentId: string;
  password: string;
  /** 웹 전용 — 쿠키 지속성(Persistent/Session). 생략 시 false. 모바일(Bearer) 서버는 무시한다. */
  rememberMe?: boolean;
};

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  /** PR-1 부터 서버가 반환 — 웹(쿠키 모드)은 사용하지 않고 RN(PR-4)이 Secure Storage 에 보관한다. */
  refreshToken?: string;
  user: User;
};
```

`LoginFormPanel.tsx` 제출부 수정(`:95` 근방):

```tsx
      await login.mutateAsync({ ...parsed.data, rememberMe });
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: PASS 2건

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/types/src/user.ts "frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx" frontend/apps/web/test/auth/login-remember-me.test.tsx
git commit -m "feat(frontend): 로그인 상태 유지 체크박스를 rememberMe 페이로드로 연결"
```

---

### Task 2: refresh-coordinator — 크로스탭 single-flight 모듈

**Files:**
- Create: `frontend/packages/api/src/refresh-coordinator.ts`
- Test: `frontend/packages/api/test/refreshCoordinator.test.ts`

**Interfaces:**
- Produces:
  - `type RefreshOutcome = 'refreshed' | 'skipped' | 'session-expired' | 'unavailable'`
  - `createRefreshCoordinator(executeRefresh: () => Promise<RefreshOutcome>): { ensureFreshSession(): Promise<RefreshOutcome> }`
  - 의미: `refreshed`=갱신 성공, `skipped`=다른 탭이 10초 내 갱신(재시도만 하면 됨), `session-expired`=refresh 401/404(로그아웃 대상), `unavailable`=5xx/네트워크(세션 유지)

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`frontend/packages/api/test/refreshCoordinator.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRefreshCoordinator } from '../src/refresh-coordinator';
import type { RefreshOutcome } from '../src/refresh-coordinator';

// jsdom 에는 navigator.locks 가 없다 — 탭 내 in-flight 공유 폴백 경로가 검증 대상이다.
describe('refresh coordinator', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function deferredRefresh() {
    let resolve!: (outcome: RefreshOutcome) => void;
    const executeRefresh = vi.fn(
      () => new Promise<RefreshOutcome>((res) => { resolve = res; }),
    );
    return { executeRefresh, resolveWith: (outcome: RefreshOutcome) => resolve(outcome) };
  }

  it('동시에 두 번 요청해도 갱신 실행은 한 번이고 같은 결과를 공유한다', async () => {
    const { executeRefresh, resolveWith } = deferredRefresh();
    const coordinator = createRefreshCoordinator(executeRefresh);

    const first = coordinator.ensureFreshSession();
    const second = coordinator.ensureFreshSession();
    resolveWith('refreshed');

    await expect(first).resolves.toBe('refreshed');
    await expect(second).resolves.toBe('refreshed');
    expect(executeRefresh).toHaveBeenCalledTimes(1);
  });

  it('직전 갱신 후에는 새 in-flight 가 다시 실행된다(영구 캐시 아님)', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>()
      .mockResolvedValue('session-expired');
    const coordinator = createRefreshCoordinator(executeRefresh);

    await expect(coordinator.ensureFreshSession()).resolves.toBe('session-expired');
    await expect(coordinator.ensureFreshSession()).resolves.toBe('session-expired');
    expect(executeRefresh).toHaveBeenCalledTimes(2);
  });

  it('다른 탭이 10초 안에 갱신한 기록이 있으면 실행 없이 skipped 를 반환한다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const coordinator = createRefreshCoordinator(executeRefresh);
    localStorage.setItem('duing:auth:web-refreshed-at', String(Date.now() - 3_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('skipped');
    expect(executeRefresh).not.toHaveBeenCalled();
  });

  it('갱신 성공 시각을 기록하고, 10초가 지난 기록은 생략 사유가 되지 않는다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const coordinator = createRefreshCoordinator(executeRefresh);
    localStorage.setItem('duing:auth:web-refreshed-at', String(Date.now() - 11_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('refreshed');
    expect(executeRefresh).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem('duing:auth:web-refreshed-at'))).toBeGreaterThan(0);
  });

  it('실패(unavailable) 는 갱신 시각을 기록하지 않는다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('unavailable');
    const coordinator = createRefreshCoordinator(executeRefresh);

    await expect(coordinator.ensureFreshSession()).resolves.toBe('unavailable');
    expect(localStorage.getItem('duing:auth:web-refreshed-at')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/api test -- run test/refreshCoordinator.test.ts`
(필터명은 `frontend/packages/api/package.json` 의 `name` 확인 후 조정)
Expected: FAIL — 모듈 미존재

- [ ] **Step 3: 구현**

`frontend/packages/api/src/refresh-coordinator.ts`:

```ts
/**
 * 웹 refresh 갱신 조율 (스펙 §12) — 3중 방어의 FE 1·2층.
 * 1층: navigator.locks 크로스탭 뮤텍스(미지원 환경은 탭 내 in-flight 공유 폴백).
 * 2층: localStorage 최근 갱신 시각 — 락 획득 후 다른 탭이 방금(10초) 갱신했으면 실행 생략.
 * (3층 BE grace window 는 여기를 뚫는 잔여 경합의 안전망이다.)
 * 쿠키는 탭 간 공유 저장소라, 어느 탭이 갱신했든 재시도만 하면 새 쿠키를 쓴다.
 */
const LAST_REFRESH_STORAGE_KEY = 'duing:auth:web-refreshed-at';
const RECENT_REFRESH_SKIP_MS = 10_000;
const CROSS_TAB_LOCK_NAME = 'duing-auth:refresh';

export type RefreshOutcome = 'refreshed' | 'skipped' | 'session-expired' | 'unavailable';

export type RefreshCoordinator = {
  ensureFreshSession(): Promise<RefreshOutcome>;
};

export function createRefreshCoordinator(
  executeRefresh: () => Promise<RefreshOutcome>,
): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | null = null;

  async function refreshUnderLock(): Promise<RefreshOutcome> {
    if (wasRefreshedRecently()) {
      return 'skipped';
    }
    const outcome = await executeRefresh();
    if (outcome === 'refreshed') {
      markRefreshedNow();
    }
    return outcome;
  }

  function withCrossTabLock(task: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      return locks.request(CROSS_TAB_LOCK_NAME, task) as Promise<RefreshOutcome>;
    }
    return task();
  }

  return {
    ensureFreshSession() {
      if (inFlight === null) {
        inFlight = withCrossTabLock(refreshUnderLock).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}

function wasRefreshedRecently(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_REFRESH_STORAGE_KEY);
    if (raw === null || raw === undefined) return false;
    const refreshedAt = Number(raw);
    return Number.isFinite(refreshedAt) && Date.now() - refreshedAt < RECENT_REFRESH_SKIP_MS;
  } catch {
    return false; // localStorage 접근 불가(프라이빗 모드 등) — 생략 최적화만 포기
  }
}

function markRefreshedNow(): void {
  try {
    globalThis.localStorage?.setItem(LAST_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    // 기록 실패는 무해 — 다음 탭이 한 번 더 갱신할 뿐(BE grace 가 흡수)
  }
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: PASS 5건

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/api/src/refresh-coordinator.ts frontend/packages/api/test/refreshCoordinator.test.ts
git commit -m "feat(frontend): 크로스탭 single-flight refresh 조율 모듈 추가"
```

---

### Task 3: client.ts 401 → 갱신 → 재시도 통합

**Files:**
- Modify: `frontend/packages/api/src/client.ts` (afterResponse 훅 + refresh 실행기)
- Test: `frontend/packages/api/test/authRefresh.test.ts` (신규)

**Interfaces:**
- Consumes: Task 2 `createRefreshCoordinator`/`RefreshOutcome`, 기존 `notifyUnauthorized`(unauthorized-context), `REQUEST_TIMEOUT_MS.authFlow`
- Produces: 외부 API 불변 — `createApiClient` 시그니처·반환 타입 그대로. 동작만 변경(쿠키 모드 401 처리).

- [ ] **Step 1: 실패하는 msw 통합 테스트 작성**

`frontend/packages/api/test/authRefresh.test.ts` (관례는 `authTransport.test.ts` 참조 — BASE_URL·server 셋업 동일):

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';
import { registerUnauthorizedHandler } from '../src/unauthorized-context';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();
const unauthorizedHandler = vi.fn();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  unauthorizedHandler.mockClear();
  localStorage.clear();
});
afterAll(() => server.close());

function cookieClient() {
  return createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
}

beforeEach(() => {
  registerUnauthorizedHandler(unauthorizedHandler);
});

describe('쿠키 모드 401 자동 갱신', () => {
  it('401 을 만나면 refresh 후 원요청을 재시도해 성공을 돌려주고 세션 종료를 알리지 않는다', async () => {
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meCallCount += 1;
        if (meCallCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        return HttpResponse.json({
          ok: true,
          data: { id: 1, studentId: '20261234', name: '테스터', phone: '010-0000-0000', grade: 'FRESHMAN', role: 'STUDENT' },
          message: null,
        });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 204 })),
    );

    const me = await cookieClient().users.me();

    expect(me.studentId).toBe('20261234');
    expect(meCallCount).toBe(2);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('refresh 가 401 이면 세션 종료를 알린다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료', code: 'AUTH_SESSION_EXPIRED' }, { status: 401 })),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it('refresh 가 5xx 면 세션을 끝내지 않고 원 401 을 그대로 표면화한다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me`, () =>
        HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () => new HttpResponse(null, { status: 503 })),
    );

    await expect(cookieClient().users.me()).rejects.toMatchObject({ status: 401 });
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('동시 401 여러 건도 refresh 는 한 번만 나간다', async () => {
    let refreshCallCount = 0;
    let meCallCount = 0;
    server.use(
      http.get(`${BASE_URL}/users/me`, () => {
        meCallCount += 1;
        if (meCallCount <= 2) {
          return HttpResponse.json({ ok: false, data: null, message: '만료' }, { status: 401 });
        }
        return HttpResponse.json({
          ok: true,
          data: { id: 1, studentId: '20261234', name: '테스터', phone: '010-0000-0000', grade: 'FRESHMAN', role: 'STUDENT' },
          message: null,
        });
      }),
      http.post(`${BASE_URL}/auth/web/refresh`, async () => {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const client = cookieClient();
    const results = await Promise.all([client.users.me(), client.users.me()]);

    expect(results).toHaveLength(2);
    expect(refreshCallCount).toBe(1);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });

  it('웹 로그인·로그아웃·refresh 자신의 401 에는 갱신을 시도하지 않는다', async () => {
    let refreshCallCount = 0;
    server.use(
      http.post(`${BASE_URL}/auth/web/login`, () =>
        HttpResponse.json({ ok: false, data: null, message: '자격 오류' }, { status: 401 })),
      http.post(`${BASE_URL}/auth/web/refresh`, () => {
        refreshCallCount += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(
      cookieClient().auth.login({ studentId: '20261234', password: 'x', rememberMe: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(refreshCallCount).toBe(0);
    expect(unauthorizedHandler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/api test -- run test/authRefresh.test.ts`
Expected: FAIL — 첫 테스트가 401 reject(갱신 미구현), 동시 테스트도 실패

- [ ] **Step 3: client.ts 통합 구현**

(a) import 추가:

```ts
import { createRefreshCoordinator } from './refresh-coordinator';
import type { RefreshOutcome } from './refresh-coordinator';
```

(b) `createApiClient` 안, `ky.create` **앞**에 refresh 실행기·조율기 구성:

```ts
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  // refresh 호출은 bare ky — http 인스턴스의 훅(401→갱신)을 태우면 자기재귀가 되므로 분리한다.
  // throwHttpErrors:false 로 상태코드를 직접 분기: 401/404=세션 종료(404 는 BE 롤백 호환 §19.2),
  // 그 외 실패(5xx·네트워크·타임아웃)=일시 장애로 보고 세션을 유지한다(§17).
  const refreshCoordinator =
    authTransport === 'cookie'
      ? createRefreshCoordinator(async (): Promise<RefreshOutcome> => {
          try {
            const refreshResponse = await ky.post(`${normalizedBaseUrl}/auth/web/refresh`, {
              credentials: 'include',
              retry: 0,
              timeout: REQUEST_TIMEOUT_MS.authFlow,
              throwHttpErrors: false,
            });
            if (refreshResponse.status === 204) return 'refreshed';
            if (refreshResponse.status === 401 || refreshResponse.status === 404) return 'session-expired';
            return 'unavailable';
          } catch {
            return 'unavailable';
          }
        })
      : null;
```

기존 `prefixUrl: baseUrl.replace(/\/$/, '')` 은 `prefixUrl: normalizedBaseUrl` 로 정리.

(c) afterResponse 훅 전체 교체:

```ts
      afterResponse: [
        async (request, _options, response) => {
          if (response.status !== 401) {
            return;
          }
          if (authTransport === 'cookie') {
            // 로그인(자격 오류)·로그아웃(의도적)·refresh 자신(조율기가 전담)의 401 은 갱신 대상이 아니다.
            const isAuthPath =
              request.url.endsWith('/auth/web/login') ||
              request.url.endsWith('/auth/web/logout') ||
              request.url.endsWith('/auth/web/refresh');
            if (isAuthPath) {
              return;
            }
            const outcome = await refreshCoordinator!.ensureFreshSession();
            if (outcome === 'refreshed' || outcome === 'skipped') {
              // ky 공식 재시도 패턴 — bare ky 는 이 훅을 다시 타지 않아 루프가 없고,
              // 재시도가 다시 401 이어도 그대로 표면화된다(다음 요청이 새 갱신 사이클을 연다).
              return ky(request);
            }
            if (outcome === 'session-expired') {
              notifyUnauthorized();
            }
            return; // 'unavailable' — 세션 유지, 원 401 표면화 (§17)
          }
          // Bearer(모바일) 모드는 기존 동작 유지 — refresh 연동은 RN(PR-4)에서.
          const isBearerLogoutRequest = request.url.endsWith('/auth/logout');
          if (request.headers.has('Authorization') && !isBearerLogoutRequest) {
            notifyUnauthorized();
          }
        },
      ],
```

기존 훅의 주석(로그아웃 401 오탐 설명)은 새 구조에 맞게 위 주석으로 대체된다. `request.url.endsWith(...)` 판별식은 기존 코드의 것을 재사용.

- [ ] **Step 4: 통과 확인 + 기존 회귀**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/api test -- run`
Expected: authRefresh 5건 PASS + 기존 api 테스트(authTransport·authLogout·errorNormalization 등) 전부 PASS. 기존 테스트 중 "쿠키 모드 401 → notify" 를 직접 단언하던 케이스가 있으면 새 의미(갱신 시도 후)에 맞게 msw refresh 핸들러(401 반환)를 추가해 보정하고 report 에 명시.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/api/src/client.ts frontend/packages/api/test/authRefresh.test.ts
git commit -m "feat(frontend): 401 자동 갱신·원요청 재시도 — 세션 만료 오탐 제거"
```

---

### Task 4: 전체 FE 회귀

**Files:** 수정 없음(보정 발생 시만).

- [ ] **Step 1: 전체 검증**

Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm lint && pnpm typecheck && pnpm test -- run`
(스크립트 명이 다르면 루트 `frontend/package.json` 의 scripts 확인 — turbo 경유일 수 있음)
Expected: 전부 통과. 실패 시 이 브랜치가 깬 것만 최소 수정(값·로직 불변) 후 재실행, 수정 목록 report 에 나열.

- [ ] **Step 2: Commit(보정 있을 때만)**

```bash
git add -A frontend && git commit -m "test(frontend): 401 갱신 도입에 따른 기존 테스트 보정"
```

## Self-Review (작성자 수행)

- 스펙 §17 전 항목 매핑: 401→갱신→재시도(T3), 갱신 401/404→로그아웃·5xx→유지(T3 테스트 2·3), single-flight(T2+T3 테스트 4), 재시도 1회·루프 차단(bare ky 패턴), 체크박스 연동(T1), SessionExpiryHandler 등 무변경(T3 훅만 수정), vitest 케이스 5종 전부 계획에 존재.
- 타입 일관성: `RefreshOutcome` 4값·`ensureFreshSession` 명칭이 T2 정의 = T3 소비 일치. `rememberMe?: boolean` T1 정의 = T3 테스트 사용 일치.
- 미확정 지점 2곳(테스트 필터명, 컴포넌트 테스트 mock 관례)은 "실파일 확인 후 기존 관례 우선" 지시로 명시 — 플레이스홀더 아님.
