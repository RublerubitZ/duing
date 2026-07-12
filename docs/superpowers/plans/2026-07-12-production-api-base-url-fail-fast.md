# Production API Base URL Fail-Fast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 웹 빌드가 누락되거나 안전하지 않은 API base URL로 배포되지 않도록 공통 fail-fast 검증을 추가한다.

**Architecture:** Next.js 웹 앱 내부의 `app/_lib/apiBaseUrl.ts`가 환경별 API URL 계약을 단독 소유한다. Client Provider와 세 Server Component 데이터 모듈은 이 resolver 결과만 `createApiClient`에 전달하고, 공유 `@duing/api` 패키지와 모바일 경로는 변경하지 않는다.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Vitest 4

## Global Constraints

- production은 `NEXT_PUBLIC_API_BASE_URL` 누락·공백·비정상 URL·비 HTTPS·localhost/loopback을 거부한다.
- development/test는 환경변수 누락 시 `http://localhost:8080/api/v1`을 유지한다.
- API 패키지는 React Native 공유 영역이므로 웹 환경 정책을 추가하지 않는다.
- 구현은 실패 테스트를 먼저 확인하는 TDD 순서를 따른다.
- 요청 범위 밖의 리팩터링과 의존성 추가를 하지 않는다.

---

### Task 1: 공통 API URL resolver와 호출부 통합

**Files:**
- Create: `frontend/apps/web/app/_lib/apiBaseUrl.ts`
- Create: `frontend/apps/web/test/lib/api-base-url.test.ts`
- Modify: `frontend/apps/web/app/providers.tsx`
- Modify: `frontend/apps/web/app/_lib/home-data.ts`
- Modify: `frontend/apps/web/app/_lib/club-stats.ts`
- Modify: `frontend/apps/web/app/_lib/public-activities.ts`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_API_BASE_URL`, `process.env.NODE_ENV`
- Produces: `resolveApiBaseUrl(apiBaseUrl: string | undefined, nodeEnvironment: string | undefined): string`

- [ ] **Step 1: 운영 누락값 회귀 테스트를 먼저 작성한다**

`frontend/apps/web/test/lib/api-base-url.test.ts`에 production 환경에서 Providers import가
`NEXT_PUBLIC_API_BASE_URL` 오류로 실패해야 한다는 테스트를 작성한다. 기존 코드는 localhost로 폴백하므로
이 테스트가 실패해야 한다.

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API base URL 운영 검증', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('운영에서 API base URL이 비어 있으면 모듈 초기화를 거부한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(import('../../app/providers')).rejects.toThrow('NEXT_PUBLIC_API_BASE_URL');
  });
});
```

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/lib/api-base-url.test.ts
```

Expected: FAIL — 현재 `providers.tsx`가 빈 값을 localhost로 폴백해 import가 성공한다.

- [ ] **Step 3: 첫 테스트만 통과하는 최소 resolver를 만들고 Providers에 연결한다**

`frontend/apps/web/app/_lib/apiBaseUrl.ts`를 누락값만 거부하는 최소 구현으로 생성한다.

```ts
const LOCAL_API_BASE_URL = 'http://localhost:8080/api/v1';

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

export function resolveApiBaseUrl(
  apiBaseUrl: string | undefined,
  nodeEnvironment: string | undefined,
): string {
  const normalizedApiBaseUrl = apiBaseUrl?.trim();

  if (nodeEnvironment === 'production' && !normalizedApiBaseUrl) {
    throw new Error('운영 환경에는 NEXT_PUBLIC_API_BASE_URL 설정이 필요합니다.');
  }

  return trimTrailingSlashes(normalizedApiBaseUrl || LOCAL_API_BASE_URL);
}
```

`providers.tsx`의 API client 생성은 다음처럼 바꾼다.

```ts
import { resolveApiBaseUrl } from './_lib/apiBaseUrl';

const apiClient = createApiClient({
  baseUrl: resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV),
});
```

- [ ] **Step 4: GREEN을 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/lib/api-base-url.test.ts
```

Expected: PASS 1 test.

- [ ] **Step 5: resolver의 나머지 계약 테스트를 추가한다**

같은 테스트 파일에 resolver를 직접 import하고 다음 테스트를 추가한다.

```ts
import { resolveApiBaseUrl } from '../../app/_lib/apiBaseUrl';

describe('resolveApiBaseUrl', () => {
  it('운영에서 파싱할 수 없는 URL을 거부한다', () => {
    expect(() => resolveApiBaseUrl('not-a-url', 'production')).toThrow('형식');
  });

  it('운영에서 HTTP URL을 거부한다', () => {
    expect(() => resolveApiBaseUrl('http://api.duings.com/api/v1', 'production')).toThrow('HTTPS');
  });

  it.each(['https://localhost/api/v1', 'https://127.0.0.1/api/v1', 'https://[::1]/api/v1'])(
    '운영에서 loopback URL %s를 거부한다',
    (apiBaseUrl) => {
      expect(() => resolveApiBaseUrl(apiBaseUrl, 'production')).toThrow('loopback');
    },
  );

  it('운영 HTTPS URL을 정규화해 반환한다', () => {
    expect(resolveApiBaseUrl(' https://api.duings.com/api/v1/ ', 'production')).toBe(
      'https://api.duings.com/api/v1',
    );
  });

  it('개발에서 누락값을 로컬 API 주소로 폴백한다', () => {
    expect(resolveApiBaseUrl(undefined, 'development')).toBe('http://localhost:8080/api/v1');
  });

  it('개발에서 명시된 URL을 정규화해 반환한다', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:8080/api/v1/', 'development')).toBe(
      'http://127.0.0.1:8080/api/v1',
    );
  });
});
```

- [ ] **Step 6: 보안 계약의 RED를 확인하고 resolver를 완성한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/lib/api-base-url.test.ts
```

Expected: FAIL 5 tests — 비정상 URL, HTTP, loopback 3종이 아직 허용된다.

RED 확인 후 `apiBaseUrl.ts`를 다음 구현으로 교체한다.

```ts
const LOCAL_API_BASE_URL = 'http://localhost:8080/api/v1';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const trimTrailingSlashes = (url: string): string => url.replace(/\/+$/, '');

export function resolveApiBaseUrl(
  apiBaseUrl: string | undefined,
  nodeEnvironment: string | undefined,
): string {
  const normalizedApiBaseUrl = apiBaseUrl?.trim();

  if (nodeEnvironment !== 'production') {
    return trimTrailingSlashes(normalizedApiBaseUrl || LOCAL_API_BASE_URL);
  }

  if (!normalizedApiBaseUrl) {
    throw new Error('운영 환경에는 NEXT_PUBLIC_API_BASE_URL 설정이 필요합니다.');
  }

  let parsedApiBaseUrl: URL;
  try {
    parsedApiBaseUrl = new URL(normalizedApiBaseUrl);
  } catch {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL 형식이 올바르지 않습니다.');
  }

  if (parsedApiBaseUrl.protocol !== 'https:') {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL은 HTTPS URL이어야 합니다.');
  }
  if (LOOPBACK_HOSTNAMES.has(parsedApiBaseUrl.hostname)) {
    throw new Error('운영 NEXT_PUBLIC_API_BASE_URL에는 loopback 주소를 사용할 수 없습니다.');
  }

  return trimTrailingSlashes(normalizedApiBaseUrl);
}
```

완성 후 다시 실행한다.

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/lib/api-base-url.test.ts
```

Expected: PASS 9 tests.

- [ ] **Step 7: 나머지 세 서버 조회 호출부를 공통 resolver로 교체한다**

`home-data.ts`, `club-stats.ts`, `public-activities.ts`에 아래 import를 추가하고 모든 inline 폴백을 교체한다.

```ts
import { resolveApiBaseUrl } from './apiBaseUrl';

const baseUrl = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);
```

각 `createApiClient`에는 `baseUrl` 또는 동일 resolver 호출 결과만 전달한다.

- [ ] **Step 8: 중복 폴백 제거와 대상 테스트를 검증한다**

Run:

```bash
rg -n "NEXT_PUBLIC_API_BASE_URL.*localhost:8080" frontend/apps/web/app
cd frontend
pnpm --filter @duing/web test -- --run test/lib/api-base-url.test.ts
```

Expected: `rg` 결과 0건, 테스트 PASS 9.

- [ ] **Step 9: 구현 단위를 커밋한다**

```bash
git add frontend/apps/web/app/_lib/apiBaseUrl.ts \
  frontend/apps/web/test/lib/api-base-url.test.ts \
  frontend/apps/web/app/providers.tsx \
  frontend/apps/web/app/_lib/home-data.ts \
  frontend/apps/web/app/_lib/club-stats.ts \
  frontend/apps/web/app/_lib/public-activities.ts
git commit -m "[#640] 운영 API URL fail-fast 검증 추가"
```

### Task 2: 전체 프론트 회귀 검증

**Files:**
- Verify: `frontend/**`

**Interfaces:**
- Consumes: Task 1의 `resolveApiBaseUrl`
- Produces: CI와 동일한 lint/typecheck/test/build 통과 증거

- [ ] **Step 1: lint와 typecheck를 실행한다**

```bash
cd frontend
pnpm lint
pnpm typecheck
```

Expected: exit 0. 기존 경고가 남으면 신규 경고가 아닌지 diff와 함께 확인한다.

- [ ] **Step 2: 전체 테스트를 실행한다**

```bash
cd frontend
pnpm test
```

Expected: 모든 workspace 테스트 PASS.

- [ ] **Step 3: 올바른 운영 환경변수로 production build를 실행한다**

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 pnpm build
```

Expected: Next.js production build exit 0.

- [ ] **Step 4: 잘못된 운영 환경변수의 build 차단을 확인한다**

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1 pnpm --filter @duing/web build
```

Expected: non-zero exit와 `NEXT_PUBLIC_API_BASE_URL` HTTPS 또는 loopback 오류.

- [ ] **Step 5: 최종 상태를 확인한다**

```bash
git diff --check
git status --short
git log -2 --oneline
```

Expected: whitespace 오류 없음. 설계 문서 커밋과 구현 커밋이 현재 브랜치에 존재한다.
