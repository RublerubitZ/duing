# PR-A: 네트워크 레이어 — 타임아웃 정책·에러 정규화·오프라인 fail-fast·retry 정책

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 API 요청에 분류별 타임아웃을 적용하고, 타임아웃·네트워크 오류를 한글 안내가 담긴 `ApiError`로 정규화하며, 오프라인이면 즉시 실패시키고, 타임아웃은 재시도하지 않게 한다.

**Architecture:** 유일한 네트워크 진입점인 `packages/api/src/client.ts`(ky 단일 인스턴스)에서 타임아웃·정규화·fail-fast를 처리하고, 재시도 정책은 `packages/hooks`의 공용 헬퍼로 일원화해 `apps/web/app/providers.tsx`가 사용한다. 화면들은 기존 `error instanceof ApiError ? error.message : …` 패턴으로 자동 수혜받는다(로그인 폼 1곳만 예외적으로 수정).

**Tech Stack:** ky 1.x(`timeout` 옵션·`TimeoutError`), TanStack Query v5, vitest + msw/node(기존 `packages/api/test` 컨벤션), Next.js 15 / React 19.

**스펙:** `docs/superpowers/specs/2026-07-12-network-resilience-design.md` §3

## Global Constraints

- 브랜치: `feat/fe-network-resilience` (이미 분기됨, origin/develop 기반) — push·PR 생성은 하지 않는다(리뷰 후 별도 진행)
- 커밋 메시지: 한국어 Conventional Commits (`feat(frontend): …`), Co-Authored-By/Generated 라인 금지
- `any`·`as` 단언 금지, `type` 선언 사용(`interface` 금지), 변수명 모호 축약 금지
- `packages/*`에 DOM API(`window`·`document`·`navigator`) 직접 참조 금지 — 어댑터 주입으로 우회
- 테스트 명령은 `frontend/` cwd에서 실행, `| tail` 파이프 금지(exit code 가림)
- 사용자 대면 문구(한글)는 스펙 §3.2의 문구를 글자 그대로 사용

---

### Task 1: 타임아웃 정책 상수 신설·적용

**Files:**
- Modify: `frontend/packages/api/src/client.ts` (673-684행의 기존 상수 2개 → 상수 객체로 통합, ky.create·엔드포인트별 적용)
- Modify: `frontend/packages/api/src/index.ts` (export 추가)
- Test: `frontend/packages/api/test/timeoutPolicy.test.ts` (신규)

**Interfaces:**
- Produces: `export const REQUEST_TIMEOUT_MS = { default, login, authFlow, search, upload, logoutRevoke, bankSync }` — 이후 태스크와 테스트가 이 이름을 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/packages/api/test/timeoutPolicy.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';
import { REQUEST_TIMEOUT_MS } from '../src/client';
import { createApiClient } from '../src/client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('REQUEST_TIMEOUT_MS 정책', () => {
  it('스펙 §3.1의 분류별 타임아웃 값을 유지한다', () => {
    expect(REQUEST_TIMEOUT_MS).toEqual({
      default: 10_000,
      login: 5_000,
      authFlow: 8_000,
      search: 8_000,
      upload: 60_000,
      logoutRevoke: 5_000,
      bankSync: 30_000,
    });
  });

  it('로그인은 5초에 타임아웃된다 (서버 6초 지연 시 5초대에 거부)', async () => {
    server.use(
      http.post('*/auth/login', async () => {
        await delay(6_000);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );
    const startedAt = Date.now();
    await expect(
      client.auth.login({ studentId: '20251234', password: 'Test1234!@' }),
    ).rejects.toThrow();
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(4_500);
    expect(elapsedMs).toBeLessThan(6_000);
  }, 10_000);
});
```

주의: `beforeAll`/`afterEach`/`afterAll`도 vitest에서 import한다(기존 `authLogout.test.ts` 상단 참조). `LoginPayload` 필드명이 다르면 `packages/types`의 `LoginPayload` 정의에 맞춘다.

- [ ] **Step 2: 실패 확인**

Run (cwd `frontend/`): `pnpm --filter @duing/api test -- timeoutPolicy`
Expected: FAIL — `REQUEST_TIMEOUT_MS` export가 없어 import 에러, 또는 두 번째 테스트가 15s 전역값으로 6초 지연을 통과해버려 assertion 실패

- [ ] **Step 3: 구현** — `client.ts`의 기존 상수 블록(673-679행 부근)을 대체

기존 코드(삭제):

```ts
const LOGOUT_REVOKE_TIMEOUT_MS = 5_000;
const BANK_SYNC_TIMEOUT_MS = 30_000; // 외부 은행 조회(백엔드 connect5s+read15s) 보다 길게
```

신규 코드(같은 위치, 기존 주석의 의미 보존):

```ts
// 요청 분류별 클라이언트 타임아웃(ms). 모든 요청은 ky 전역 기본값(default)을 받고,
// 분류가 다른 엔드포인트만 개별 오버라이드한다.
// (스펙: docs/superpowers/specs/2026-07-12-network-resilience-design.md §3.1)
export const REQUEST_TIMEOUT_MS = {
  /** 전역 기본 — 일반 조회·변경 */
  default: 10_000,
  /** 로그인 — 대기 체감이 가장 민감한 경로 */
  login: 5_000,
  /** 가입·MO 인증·비밀번호 재설정·번호 변경 — 인증사 경유 가능성이 있어 로그인보다 여유 */
  authFlow: 8_000,
  /** 사용자가 타이핑 후 결과를 기다리는 검색성 목록 */
  search: 8_000,
  /** 파일 업로드 — 느린 회선에서도 전송이 완료되도록 넉넉히 */
  upload: 60_000,
  /** 로그아웃의 서버 폐기는 best-effort — 백엔드가 행이어도 로컬 로그아웃이 오래 묶이지 않게 짧게 */
  logoutRevoke: 5_000,
  /** 거래 동기화 — 백엔드가 외부 은행 API(connect 5s + read 15s)를 기다린다 */
  bankSync: 30_000,
} as const;
```

적용 지점 (모두 `client.ts`):

1. `ky.create`(682행 부근): `timeout: 15_000` → `timeout: REQUEST_TIMEOUT_MS.default`
2. `auth.login`(744행 부근): `http.post('auth/login', { json: payload, timeout: REQUEST_TIMEOUT_MS.login })`
3. `auth.signup`(742행 부근): `http.post('auth/signup', { json: payload, timeout: REQUEST_TIMEOUT_MS.authFlow })`
4. `auth.startPhoneVerification`(748행 부근)·`auth.getPhoneVerificationStatus`(755행 부근)·`auth.requestPasswordReset`(759행 부근)·`auth.completePasswordReset`(765행 부근): 각 options에 `timeout: REQUEST_TIMEOUT_MS.authFlow` 추가
5. `auth.logout`(766행 부근): `timeout: LOGOUT_REVOKE_TIMEOUT_MS` → `timeout: REQUEST_TIMEOUT_MS.logoutRevoke`
6. `users.startPhoneChangeVerification`(779행 부근)·`users.changePhone`(786행 부근): `timeout: REQUEST_TIMEOUT_MS.authFlow` 추가
7. `clubs.list`(790행 부근): options에 `timeout: REQUEST_TIMEOUT_MS.search` 추가
8. `applications.applicants`(876행 부근): `http.get(path)` → `http.get(path, { timeout: REQUEST_TIMEOUT_MS.search })`
9. `admin.clubs.list`(1103행 부근)·`admin.users.search`(1110행 부근): options에 `timeout: REQUEST_TIMEOUT_MS.search` 추가
10. `files.upload`(840행 부근): options에 `timeout: REQUEST_TIMEOUT_MS.upload` 추가
11. `leader.fees.bank.sync`(1340행 부근): `timeout: BANK_SYNC_TIMEOUT_MS` → `timeout: REQUEST_TIMEOUT_MS.bankSync`

`index.ts`에 export 추가:

```ts
export { createApiClient, ApiError, REQUEST_TIMEOUT_MS } from './client';
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/api test -- timeoutPolicy`
Expected: PASS (2 tests). 기존 스위트 회귀 확인: `pnpm --filter @duing/api test` → 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/api/src/client.ts frontend/packages/api/src/index.ts frontend/packages/api/test/timeoutPolicy.test.ts
git commit -m "feat(frontend): API 요청 분류별 클라이언트 타임아웃 정책 적용(전역 10s·로그인 5s·인증 8s·업로드 60s)"
```

---

### Task 2: 타임아웃·네트워크 오류를 ApiError로 정규화

**Files:**
- Modify: `frontend/packages/api/src/client.ts` (import·`toApiError`·메시지 상수)
- Modify: `frontend/packages/api/src/index.ts`
- Test: `frontend/packages/api/test/errorNormalization.test.ts` (신규)

**Interfaces:**
- Produces: `export const TIMEOUT_ERROR_MESSAGE = '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'`, `export const NETWORK_ERROR_MESSAGE = '인터넷 연결을 확인해주세요.'`, `export { toApiError }`(테스트용). 정규화 결과: `ApiError(status: 0, code: 'TIMEOUT' | 'NETWORK')` — Task 4·A5와 PR-B가 `code` 값을 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/packages/api/test/errorNormalization.test.ts`

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { TimeoutError } from 'ky';
import {
  createApiClient,
  ApiError,
  toApiError,
  TIMEOUT_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../src/client';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('toApiError 정규화', () => {
  it('ky TimeoutError → ApiError(code TIMEOUT, 한글 안내)', async () => {
    const kyTimeout = new TimeoutError(new Request('http://localhost:8080/api/v1/users/me'));
    await expect(toApiError(kyTimeout)).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'TIMEOUT',
      message: TIMEOUT_ERROR_MESSAGE,
    });
  });

  it('네트워크 실패(fetch TypeError) → ApiError(code NETWORK, 한글 안내)', async () => {
    server.use(http.get('*/users/me', () => HttpResponse.error()));
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK',
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('이미 ApiError면 그대로 재던진다', async () => {
    const original = new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
    await expect(toApiError(original)).rejects.toBe(original);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/api test -- errorNormalization`
Expected: FAIL — `toApiError`·메시지 상수 미export, 정규화 미구현(TimeoutError가 원본 그대로 재던져짐)

- [ ] **Step 3: 구현** — `client.ts`

import 수정(1행): `import ky, { type KyInstance, type ResponsePromise, HTTPError, TimeoutError } from 'ky';`

`ApiError` 클래스 정의 아래에 메시지 상수 추가:

```ts
// 사용자 대면 네트워크 오류 안내 문구 — 전 화면의 `error instanceof ApiError ? error.message : …`
// 패턴이 그대로 노출하므로 여기 한 곳에서만 관리한다. (스펙 §3.2)
export const TIMEOUT_ERROR_MESSAGE = '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
export const NETWORK_ERROR_MESSAGE = '인터넷 연결을 확인해주세요.';
```

`toApiError`(209행 부근)를 다음으로 교체하고 `export` 한다:

```ts
export async function toApiError(error: unknown): Promise<never> {
  // connectivity fail-fast 등 이미 정규화된 에러는 그대로 통과시킨다.
  if (error instanceof ApiError) {
    throw error;
  }
  // ky 타임아웃 — 분류별 REQUEST_TIMEOUT_MS 초과. 재시도 정책(shouldRetryQuery)이 code 로 식별한다.
  if (error instanceof TimeoutError) {
    throw new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT');
  }
  if (error instanceof HTTPError) {
    // …기존 HTTPError 분기 본문 그대로 유지…
  }
  // fetch 네트워크 실패(오프라인·DNS·연결 거부)는 TypeError 로 도착한다.
  if (error instanceof TypeError) {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
  }
  throw error;
}
```

`index.ts`에 export 추가:

```ts
export {
  createApiClient,
  ApiError,
  REQUEST_TIMEOUT_MS,
  TIMEOUT_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from './client';
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/api test`
Expected: errorNormalization 3 tests PASS + 기존 스위트 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/api/src/client.ts frontend/packages/api/src/index.ts frontend/packages/api/test/errorNormalization.test.ts
git commit -m "feat(frontend): 타임아웃·네트워크 오류를 한글 안내가 담긴 ApiError(TIMEOUT/NETWORK)로 정규화"
```

---

### Task 3: connectivity 어댑터 주입 + 오프라인 fail-fast

**Files:**
- Create: `frontend/packages/api/src/connectivity.ts`
- Modify: `frontend/packages/api/src/client.ts` (`beforeRequest` 훅)
- Modify: `frontend/packages/api/src/index.ts`
- Modify: `frontend/apps/web/app/providers.tsx` (어댑터 등록)
- Test: `frontend/packages/api/test/connectivity.test.ts` (신규)

**Interfaces:**
- Produces: `registerConnectivityAdapter(adapter: (() => boolean) | null): void` — 어댑터는 "온라인 여부"를 반환. `false`일 때만 차단(신호 없음/예외는 통과 — navigator.onLine의 false-negative 방어, 스펙 §3.3)
- Consumes: Task 2의 `ApiError`·`NETWORK_ERROR_MESSAGE`

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/packages/api/test/connectivity.test.ts`

```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient, NETWORK_ERROR_MESSAGE } from '../src/client';
import { registerConnectivityAdapter } from '../src/connectivity';

// onUnhandledRequest: 'error' — 오프라인 fail-fast 가 뚫려 네트워크로 나가면 테스트가 즉시 실패한다.
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  registerConnectivityAdapter(null);
});
afterAll(() => server.close());

const client = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

describe('connectivity fail-fast', () => {
  it('어댑터가 false 를 반환하면 요청 없이 즉시 ApiError(NETWORK)로 거부한다', async () => {
    registerConnectivityAdapter(() => false);
    await expect(client.users.me()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK',
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('어댑터가 true 면 요청이 정상 진행된다', async () => {
    registerConnectivityAdapter(() => true);
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: true, data: { id: 1 }, message: null }),
      ),
    );
    await expect(client.users.me()).resolves.toMatchObject({ id: 1 });
  });

  it('어댑터 미등록이면 요청이 정상 진행된다', async () => {
    server.use(
      http.get('*/users/me', () =>
        HttpResponse.json({ ok: true, data: { id: 2 }, message: null }),
      ),
    );
    await expect(client.users.me()).resolves.toMatchObject({ id: 2 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/api test -- connectivity`
Expected: FAIL — `connectivity.ts` 모듈 없음

- [ ] **Step 3: 구현**

`frontend/packages/api/src/connectivity.ts` (신규 — `token.ts`의 어댑터 주입 패턴을 따른다):

```ts
// 플랫폼별 연결 상태 어댑터. packages/* 는 DOM API 를 직접 참조하지 않으므로
// (RN 등 플랫폼 추상화), 앱 쪽에서 navigator.onLine 등을 주입한다.
// 어댑터가 명시적으로 false 를 반환할 때만 오프라인으로 판정한다 —
// navigator.onLine 은 false-negative(온라인인데 신호 없음)가 있어 그 외에는 요청을 진행시키고
// 타임아웃(REQUEST_TIMEOUT_MS)이 최종 방어선이 된다. (스펙 §3.3)
type ConnectivityAdapter = () => boolean;

let connectivityAdapter: ConnectivityAdapter | null = null;

export function registerConnectivityAdapter(adapter: ConnectivityAdapter | null): void {
  connectivityAdapter = adapter;
}

export function isKnownOffline(): boolean {
  if (!connectivityAdapter) return false;
  try {
    return connectivityAdapter() === false;
  } catch {
    return false;
  }
}
```

`client.ts` — import 추가 후 `beforeRequest` 훅(686행 부근) 맨 앞에 fail-fast 삽입:

```ts
import { isKnownOffline } from './connectivity';
```

```ts
      beforeRequest: [
        async (request) => {
          // 확실한 오프라인이면 타임아웃까지 기다리지 않고 즉시 실패시킨다. (스펙 §3.3)
          if (isKnownOffline()) {
            throw new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
          }
          const token = await readToken();
          if (token) {
            request.headers.set('Authorization', `Bearer ${token}`);
          }
        },
      ],
```

`index.ts`: `export { registerConnectivityAdapter } from './connectivity';`

`apps/web/app/providers.tsx` — 모듈 스코프의 기존 어댑터 등록부(16-17행) 아래에 추가:

```ts
import { ApiError, createApiClient, registerCookieAdapter, registerConnectivityAdapter } from '@duing/api';
```

```ts
setStorage(webStorage);
registerCookieAdapter(webCookieAdapter);
// navigator.onLine 이 명시적으로 false 일 때만 오프라인 — SSR(navigator 부재)은 온라인 취급.
registerConnectivityAdapter(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/api test` / `pnpm --filter @duing/web test`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/api/src/connectivity.ts frontend/packages/api/src/client.ts frontend/packages/api/src/index.ts frontend/apps/web/app/providers.tsx frontend/packages/api/test/connectivity.test.ts
git commit -m "feat(frontend): 오프라인 감지 어댑터 주입으로 API 요청 즉시 실패(fail-fast) 처리"
```

---

### Task 4: React Query 재시도 정책 일원화 (TIMEOUT 무재시도)

**Files:**
- Create: `frontend/packages/hooks/src/retry.ts`
- Modify: `frontend/packages/hooks/src/index.ts`
- Modify: `frontend/apps/web/app/providers.tsx` (retry 함수 교체)
- Modify: `frontend/packages/hooks/src/fee.ts:18-24` (`retryUnlessNotFound`)
- Modify: `frontend/packages/hooks/src/bank.ts:12` 부근 (`retryUnlessForbidden`)
- Modify: `frontend/packages/hooks/src/federationInquiries.ts:16` 부근 (`retryUnlessClientError`)
- Modify: `frontend/packages/hooks/src/clubMembership.ts:19` 부근 (인라인 retry)
- Test: `frontend/packages/hooks/test/retry.test.tsx` (신규 — 기존 테스트 파일 확장자 컨벤션이 `.tsx`)

**Interfaces:**
- Consumes: Task 2의 `ApiError.code === 'TIMEOUT'`
- Produces: `shouldRetryQuery(failureCount: number, error: unknown): boolean`, `isNonRetryableError(error: unknown): boolean` — providers.tsx와 개별 훅 헬퍼가 사용

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/packages/hooks/test/retry.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { ApiError, TIMEOUT_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '@duing/api';
import { shouldRetryQuery, isNonRetryableError } from '../src/retry';

describe('shouldRetryQuery', () => {
  it('401/403 은 재시도하지 않는다', () => {
    expect(shouldRetryQuery(0, new ApiError(401, '인증 필요'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(403, '권한 없음'))).toBe(false);
  });

  it('TIMEOUT 은 재시도하지 않는다 — 이미 분류별 타임아웃만큼 대기했으므로 재시도는 체감 대기를 배가시킨다', () => {
    expect(shouldRetryQuery(0, new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT'))).toBe(false);
  });

  it('빠른 실패(NETWORK)와 5xx 는 1회만 재시도한다', () => {
    const networkError = new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
    expect(shouldRetryQuery(0, networkError)).toBe(true);
    expect(shouldRetryQuery(1, networkError)).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(500, '서버 오류'))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(500, '서버 오류'))).toBe(false);
  });

  it('ApiError 가 아닌 오류도 1회만 재시도한다', () => {
    expect(shouldRetryQuery(0, new Error('unknown'))).toBe(true);
    expect(shouldRetryQuery(1, new Error('unknown'))).toBe(false);
  });
});

describe('isNonRetryableError', () => {
  it('401·403·TIMEOUT 만 true', () => {
    expect(isNonRetryableError(new ApiError(401, 'x'))).toBe(true);
    expect(isNonRetryableError(new ApiError(403, 'x'))).toBe(true);
    expect(isNonRetryableError(new ApiError(0, 'x', undefined, 'TIMEOUT'))).toBe(true);
    expect(isNonRetryableError(new ApiError(0, 'x', undefined, 'NETWORK'))).toBe(false);
    expect(isNonRetryableError(new ApiError(404, 'x'))).toBe(false);
    expect(isNonRetryableError(new Error('x'))).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/hooks test -- retry`
Expected: FAIL — `../src/retry` 모듈 없음

- [ ] **Step 3: 구현**

`frontend/packages/hooks/src/retry.ts` (신규):

```ts
import { ApiError } from '@duing/api';

// 전역 query 재시도 상한. mutation 은 TanStack Query 기본값(재시도 0)을 그대로 둔다 —
// 비멱등 요청(로그인·제출)의 이중 실행 위험 차단. (스펙 §3.4)
const MAX_QUERY_RETRIES = 1;

// 재시도가 무의미하거나 해로운 오류: 인증 실패(401/403)는 반복해도 결과가 같고,
// TIMEOUT 은 이미 분류별 타임아웃만큼 대기했으므로 재시도가 체감 대기를 배가시킨다.
export function isNonRetryableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.code === 'TIMEOUT')
  );
}

// QueryClient defaultOptions.queries.retry 에 그대로 전달하는 전역 정책.
// 빠른 실패(NETWORK·연결 거부·5xx)는 1회 재시도 가치가 있어 유지한다.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isNonRetryableError(error)) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}
```

`frontend/packages/hooks/src/index.ts`에 추가: `export { shouldRetryQuery, isNonRetryableError } from './retry';`

`apps/web/app/providers.tsx` — 기존 retry 콜백(30-37행)을 교체:

```ts
import { shouldRetryQuery } from '@duing/hooks';
```

```ts
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // 재시도 정책은 @duing/hooks 의 shouldRetryQuery 로 일원화 —
            // 401/403(반복 무의미)·TIMEOUT(대기 배가)은 재시도하지 않고, 빠른 실패만 1회 재시도.
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
          },
        },
```

(기존 `ApiError` import가 providers.tsx에서 retry에만 쓰였다면 import 정리)

개별 헬퍼 4곳에 TIMEOUT 제외 합류 — 각 파일의 기존 함수를 다음 형태로 수정(기존 status 제외 조건·재시도 상한은 유지):

`fee.ts` (18-24행):

```ts
import { isNonRetryableError } from './retry';

// 계좌 미등록은 404(FeeAccountNotFoundException) 로 내려온다 — 정상적인 "빈 상태"이므로 재시도하지 않고
// 호출부가 ApiError(status 404) 로 등록 폼을 노출한다. 인증 실패·타임아웃도 재시도하지 않는다(전역 정책과 동일).
function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
  if (isNonRetryableError(error)) {
    return false;
  }
  if (error instanceof ApiError && error.status === 404) {
    return false;
  }
  return failureCount < 2;
}
```

`bank.ts`·`federationInquiries.ts`·`clubMembership.ts`도 동일 패턴: 함수 첫 줄에 `if (isNonRetryableError(error)) return false;` 를 추가하고 기존 status 조건·상한은 그대로 둔다. (각 파일의 실제 함수 본문을 읽고 첫 분기만 삽입 — 상한 숫자를 바꾸지 않는다.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/hooks test` / `pnpm --filter @duing/web test`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/hooks/src/retry.ts frontend/packages/hooks/src/index.ts frontend/packages/hooks/src/fee.ts frontend/packages/hooks/src/bank.ts frontend/packages/hooks/src/federationInquiries.ts frontend/packages/hooks/src/clubMembership.ts frontend/apps/web/app/providers.tsx frontend/packages/hooks/test/retry.test.tsx
git commit -m "feat(frontend): 쿼리 재시도 정책 일원화 — 타임아웃 무재시도로 최악 대기 31s→10s 단축"
```

---

### Task 5: 로그인 폼 — 네트워크 오류를 자격증명 오류로 오안내하는 버그 수정

**Files:**
- Modify: `frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx:93-96` (catch 블록)
- Test: `frontend/apps/web/test/auth/login-network-error.test.tsx` (신규)

**Interfaces:**
- Consumes: Task 2의 `ApiError`(`code: 'TIMEOUT' | 'NETWORK'`, `message`)

배경(재현 실험 F6): API 무응답 시 15초 후 "학번 또는 비밀번호가 올바르지 않습니다"가 표시됐다 — catch가 모든 오류를 자격증명 실패로 처리하기 때문. 네트워크성 오류는 정규화된 메시지를 그대로 보여준다.

- [ ] **Step 1: 실패하는 테스트 작성** — `frontend/apps/web/test/auth/login-network-error.test.tsx`

기존 `apps/web/test/` 컨벤션(vitest + testing-library, `test/setup.ts`가 next-view-transitions 전역 mock)을 따른다. 라우터·searchParams는 파일 로컬로 mock 한다.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClientProvider } from '@duing/hooks';
import { ApiError, TIMEOUT_ERROR_MESSAGE } from '@duing/api';
import type { DuingApiClient } from '@duing/api';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { LoginFormPanel } from '@/app/(auth)/login/_components/LoginFormPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

function renderWithTimeoutFailingLogin() {
  const loginMock = vi
    .fn()
    .mockRejectedValue(new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT'));
  // 로그인 경로만 필요한 부분 클라이언트 — 나머지 도메인은 이 테스트에서 호출되지 않는다.
  const partialClient = { auth: { login: loginMock } };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={partialClient as unknown as DuingApiClient}>
        <ToastProvider>
          <LoginFormPanel />
        </ToastProvider>
      </ApiClientProvider>
    </QueryClientProvider>,
  );
  return { loginMock };
}

describe('LoginFormPanel 네트워크 오류 안내', () => {
  it('타임아웃이면 자격증명 오류가 아니라 시간 초과 안내를 표시한다', async () => {
    const user = userEvent.setup();
    const { loginMock } = renderWithTimeoutFailingLogin();

    await user.type(screen.getByPlaceholderText('20241234'), '20251234');
    await user.type(screen.getByLabelText(/비밀번호/), 'Test1234!@');
    await user.click(screen.getByRole('button', { name: /시작하기|로그인/ }));

    expect(await screen.findByText(TIMEOUT_ERROR_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('학번 또는 비밀번호가 올바르지 않습니다.')).not.toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledTimes(1);
  });
});
```

주의: `as unknown as DuingApiClient`는 테스트 더블 주입용 최소 사용(프로덕션 코드 `as` 금지 규칙은 테스트 더블에 한해 기존 스위트 관행을 따른다 — 기존 테스트에서 유사 사용이 없으면 전체 클라이언트 stub 팩토리를 만들어 우회). 비밀번호 input에 label이 없으면 `getByLabelText` 대신 실제 마크업(placeholder/name)에 맞춘 셀렉터로 조정한다.

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @duing/web test -- login-network-error`
Expected: FAIL — 화면에 "학번 또는 비밀번호가 올바르지 않습니다."가 표시됨

- [ ] **Step 3: 구현** — `LoginFormPanel.tsx`

import 추가: `import { ApiError } from '@duing/api';`

catch 블록(93-96행) 교체:

```tsx
    } catch (loginError) {
      // 타임아웃·오프라인은 자격증명 문제가 아니다 — 정규화된 안내(요청 시간 초과/연결 확인)를 그대로 보여줘
      // 사용자가 비밀번호를 의심하지 않게 한다. (재현 실험에서 확인된 오안내 수정)
      if (loginError instanceof ApiError && (loginError.code === 'TIMEOUT' || loginError.code === 'NETWORK')) {
        setError(loginError.message);
      } else {
        setError('학번 또는 비밀번호가 올바르지 않습니다.');
      }
    }
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @duing/web test -- login-network-error` → PASS, 이후 `pnpm --filter @duing/web test` 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add "frontend/apps/web/app/(auth)/login/_components/LoginFormPanel.tsx" frontend/apps/web/test/auth/login-network-error.test.tsx
git commit -m "fix(frontend): 로그인 타임아웃·오프라인을 자격증명 오류로 오안내하던 문제 수정"
```

---

### Task 6: 전체 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 세 패키지 테스트 전체 실행**

Run (cwd `frontend/`): `pnpm --filter @duing/api test && pnpm --filter @duing/hooks test && pnpm --filter @duing/web test`
Expected: 전부 PASS (출력 끝의 실패 카운트 0 확인 — `| tail` 금지)

- [ ] **Step 2: 프로덕션 빌드**

Run: `pnpm --filter @duing/web build`
Expected: 출력에 오류 없이 라우트 테이블 출력 (BUILD 성공)

- [ ] **Step 3: 행위 검증 (E3 재현 재실행)**

프로덕션 서버 기동 후 Playwright(MCP)로 API 행(hang) 주입 상태에서:
- `/login` 제출 → **약 5초** 후 버튼 복구 + "요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요." 표시 (기존: 15초 + 자격증명 오안내)
- `/clubs` 진입 → **약 8초** 후 로딩 문구 종료(검색 8s, 무재시도) (기존: 31초)
검증 후 서버 종료(`lsof -ti :3000 | xargs kill`).

- [ ] **Step 4: 리뷰 게이트**

subagent-driven-development 의 태스크별 spec/quality 리뷰와 별개로, PR 전 codex:review 를 실행한다. push·PR 생성은 사용자 확인 후 진행.
