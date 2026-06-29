# 히어로 활동 피드 연동 (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 히어로의 활동 토스트를 Phase A 의 폴백(빈 입력)에서 Phase 2 의 공개 활동 피드 API(`GET /api/v1/public-activities`) 실데이터로 교체한다.

**Architecture:** 홈(`app/page.tsx`)은 이미 `force-dynamic` 이라 요청 시점에 렌더된다. `HomeHero`(Server Component)가 `fetchClubStats` 와 나란히 새 `fetchPublicActivities` 를 `Promise.all` 로 호출해 상위 2건을 `HeroActivity[]` 로 받아 기존 순수 로직 `resolveHeroToasts(activities, now)` 에 넘긴다. 백엔드 장애·빈 응답 시 `[]` 를 반환하면 `resolveHeroToasts` 가 기존 폴백 토스트로 채운다(현행 동작 보존). 신규 컴포넌트·훅·상태관리 없음 — 데이터 배선만 추가한다.

**Tech Stack:** Next.js 15 App Router(Server Component), `@duing/api`(ky 기반 typed client), `@duing/types`, vitest.

---

## 설계 결정 (Design Decisions)

- **조회 한도 = 2**: 토스트는 정확히 2개만 노출(`resolveHeroToasts` 가 `activities[0]`, `activities[1]` 만 사용)하므로 `?limit=2` 로 페이로드를 최소화한다.
- **앱 레벨 캐시 없음**: `fetchClubStats` 와 동일하게 별도 캐싱을 두지 않는다(ky 라 Next fetch 캐시 비적용). 신선도는 `force-dynamic` + 백엔드 응답의 `Cache-Control: stale-while-revalidate`(CDN/프록시 계층)로 충분하다.
- **`as` 타입 단언 없음**: 백엔드 `PublicActivityType`(6종)은 FE `HeroActivityType`(7종)의 부분집합이라 `item.type` 을 그대로 대입해도 타입 안전하다(`RECRUIT_CLOSE` 만 응답에 영영 없음).

## Out of Scope

- `HeroActivityType` 에서 미사용 `RECRUIT_CLOSE` 제거 / `ACTIVITY_PRESETS` 정리 — Phase A 순수 로직·테스트 영향이라 본 PR 범위 밖(무해한 데드 유니온, 응답에 안 옴).
- 토스트 자동 롤링/주기적 refetch, 클라이언트 폴링 — 정적 2개 노출 유지.
- 백엔드 변경(이미 Phase 2 에서 머지됨), 새 React Query 훅, 새 UI 컴포넌트.
- 토스트 카피(메시지)·variant 변경 — Phase A `ACTIVITY_PRESETS` 그대로 사용.

---

## Task 0: 브랜치 분기 + 플랜 커밋

**Files:**
- Create: `docs/superpowers/plans/2026-06-29-hero-activity-feed-wiring.md` (본 문서)

- [ ] **Step 1: develop 최신화 + 브랜치 분기**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing checkout develop
git -C /Users/ksy/Desktop/BASIC/Coding/Duing pull --ff-only
git -C /Users/ksy/Desktop/BASIC/Coding/Duing checkout -b feat/hero-activity-feed-wiring
```

- [ ] **Step 2: 플랜 문서 커밋**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add docs/superpowers/plans/2026-06-29-hero-activity-feed-wiring.md
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "docs(web): 히어로 활동 피드 연동(Phase 3) 플랜 추가"
```

---

## Task 1: 공개 활동 피드 타입 + API 클라이언트 메서드 (계약 계층)

**Files:**
- Create: `frontend/packages/types/src/publicActivity.ts`
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/api/src/client.ts` (import 블록 / `DuingApiClient` 타입 / 구현)

- [ ] **Step 1: 타입 정의 작성**

`frontend/packages/types/src/publicActivity.ts` 생성:

```ts
// 공개 활동 피드 — 홈 히어로의 실시간 활동 토스트용. 백엔드 PublicActivityType(6종)과 1:1 매칭.
export type PublicActivityType =
  | 'RECRUIT_OPEN'
  | 'NOTICE_CREATED'
  | 'INTERVIEW_CREATED'
  | 'INTERVIEW_RESULT'
  | 'EVENT_CREATED'
  | 'FEE_OPEN';

export type PublicActivityItem = {
  type: PublicActivityType;
  clubId: number;
  clubName: string;
  // 이벤트 발생 시각(ISO 8601, 백엔드가 절대시각 Instant 로 직렬화).
  occurredAt: string;
};

export type PublicActivityFeed = {
  items: PublicActivityItem[];
};

export type PublicActivityListParams = {
  limit?: number;
};
```

- [ ] **Step 2: 배럴 export 추가**

`frontend/packages/types/src/index.ts` 끝에 한 줄 추가(기존 라인 유지):

```ts
export * from './publicActivity';
```

- [ ] **Step 3: API 클라이언트 import 에 신규 타입 추가**

`frontend/packages/api/src/client.ts` 의 `from '@duing/types'` import 블록(현재 `CashbookSearchParams` 등으로 끝나는 두 번째 블록, 166행 부근)에 추가:

```ts
  PublicActivityFeed,
  PublicActivityListParams,
```

- [ ] **Step 4: `DuingApiClient` 타입에 namespace 선언 추가**

`frontend/packages/api/src/client.ts` 의 `promotions: { list(): Promise<PageResponse<PromotionCard>>; };` 선언 바로 아래에 추가:

```ts
  publicActivities: {
    // GET /api/v1/public-activities — 공개·인증불요. 6도메인 최근 활동 집계(occurredAt DESC).
    list(params?: PublicActivityListParams): Promise<PublicActivityFeed>;
  };
```

- [ ] **Step 5: 구현 추가**

`frontend/packages/api/src/client.ts` 의 반환 객체에서 `promotions: { list: () => jsonOk<PageResponse<PromotionCard>>(http.get('promotions')), },` 바로 아래에 추가:

```ts
    publicActivities: {
      list: (params) =>
        jsonOk<PublicActivityFeed>(
          http.get('public-activities', { searchParams: cleanParams(params) }),
        ),
    },
```

- [ ] **Step 6: 타입체크로 계약 검증**

Run: `cd frontend && pnpm typecheck`
Expected: PASS (에러 0). 신규 타입이 클라이언트에서 정상 해석됨을 확인.

- [ ] **Step 7: 커밋**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add frontend/packages/types/src/publicActivity.ts frontend/packages/types/src/index.ts frontend/packages/api/src/client.ts
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(web): 공개 활동 피드 타입·API 클라이언트 메서드 추가"
```

---

## Task 2: `fetchPublicActivities` 서버 패치 유틸 (TDD)

**Files:**
- Create: `frontend/apps/web/app/_lib/public-activities.ts`
- Test: `frontend/apps/web/test/lib/public-activities.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/apps/web/test/lib/public-activities.test.ts` 생성 (`club-stats.test.ts` 모킹 패턴 미러링):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicActivityFeed } from '@duing/types';

// createApiClient 를 모킹해, 백엔드 호출 없이 fetchPublicActivities 의 매핑·폴백·파라미터를 검증한다.
const { createApiClientMock, listMock } = vi.hoisted(() => ({
  createApiClientMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('@duing/api', () => ({
  createApiClient: createApiClientMock,
}));

import { fetchPublicActivities } from '@/app/_lib/public-activities';

beforeEach(() => {
  createApiClientMock.mockReset();
  listMock.mockReset();
  createApiClientMock.mockReturnValue({ publicActivities: { list: listMock } });
});

describe('fetchPublicActivities', () => {
  it('list 가 throw 하면 빈 배열을 반환한다(폴백 토스트로 대체)', async () => {
    listMock.mockRejectedValue(new Error('backend unavailable'));

    const activities = await fetchPublicActivities();

    expect(activities).toEqual([]);
  });

  it('items 를 HeroActivity(type·clubName·occurredAt)로 매핑한다(clubId 제외)', async () => {
    const feed: PublicActivityFeed = {
      items: [
        { type: 'NOTICE_CREATED', clubId: 7, clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00Z' },
        { type: 'INTERVIEW_RESULT', clubId: 3, clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00Z' },
      ],
    };
    listMock.mockResolvedValue(feed);

    const activities = await fetchPublicActivities();

    expect(activities).toEqual([
      { type: 'NOTICE_CREATED', clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00Z' },
      { type: 'INTERVIEW_RESULT', clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00Z' },
    ]);
  });

  it('상위 2건만 요청한다(limit=2)', async () => {
    listMock.mockResolvedValue({ items: [] });

    await fetchPublicActivities();

    expect(listMock).toHaveBeenCalledWith({ limit: 2 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- public-activities`
Expected: FAIL — `fetchPublicActivities` 모듈/함수 미존재.

- [ ] **Step 3: 최소 구현 작성**

`frontend/apps/web/app/_lib/public-activities.ts` 생성:

```ts
import { createApiClient } from '@duing/api';
import type { HeroActivity } from '@/app/_components/sections/hero-activity';

// 홈 히어로 활동 토스트용 — 공개 활동 피드 상위 2건을 조회해 HeroActivity[] 로 매핑한다.
// 백엔드 호출 실패 시 빈 배열을 반환한다(호출부 resolveHeroToasts 가 폴백 토스트로 채운다).
const HERO_ACTIVITY_LIMIT = 2;

export async function fetchPublicActivities(): Promise<HeroActivity[]> {
  const client = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  });
  try {
    const feed = await client.publicActivities.list({ limit: HERO_ACTIVITY_LIMIT });
    return feed.items.map((item) => ({
      type: item.type,
      clubName: item.clubName,
      occurredAt: item.occurredAt,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web test -- public-activities`
Expected: PASS (3 케이스).

- [ ] **Step 5: 커밋**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add frontend/apps/web/app/_lib/public-activities.ts frontend/apps/web/test/lib/public-activities.test.ts
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(web): 공개 활동 피드 fetch 유틸(상위 2건·실패시 폴백)"
```

---

## Task 3: HomeHero 실데이터 배선 + 렌더 테스트 + 시각 QA

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/HomeHero.tsx:1-21` (import + 패치 배선)
- Test: `frontend/apps/web/test/home/home-hero.test.tsx` (실활동 렌더 케이스 추가)

- [ ] **Step 1: 실활동 렌더 테스트 추가(실패 확인용)**

`frontend/apps/web/test/home/home-hero.test.tsx` 의 `describe('HeroRightVisual', ...)` 안, 마지막 `it('폴백 토스트 2개...')` 바로 아래에 추가:

```tsx
  it('실활동 토스트는 동아리명·발생문구를 렌더한다(폴백 대체)', () => {
    const toasts = resolveHeroToasts(
      [
        { type: 'NOTICE_CREATED', clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00.000Z' },
        { type: 'INTERVIEW_RESULT', clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00.000Z' },
      ],
      NOW,
    );
    render(<HeroRightVisual recruitingCount={1} toasts={toasts} />);
    expect(screen.getByText('두잉코딩')).toBeInTheDocument();
    expect(screen.getByText('새 공지 등록')).toBeInTheDocument();
    expect(screen.getByText('캠퍼스밴드')).toBeInTheDocument();
    expect(screen.getByText('합격자 발표')).toBeInTheDocument();
    expect(screen.queryByText('캠퍼스 동아리')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 실행(이 케이스는 기존 컴포넌트로 이미 통과)**

Run: `cd frontend && pnpm --filter @duing/web test -- home-hero`
Expected: PASS — `resolveHeroToasts`/`HeroRightVisual` 는 이미 실활동을 지원하므로 이 테스트는 "실데이터가 UI 까지 흐름"을 고정하는 회귀 가드다.

- [ ] **Step 3: HomeHero 에 fetch 배선**

`frontend/apps/web/app/_components/sections/HomeHero.tsx` 수정.

(a) import 추가 — 7행 `resolveHeroToasts` import 아래:

```tsx
import { fetchPublicActivities } from '@/app/_lib/public-activities';
```

(b) 18–21행을 아래로 교체:

```tsx
export async function HomeHero() {
  // 통계·활동을 병렬 조회. 활동 조회 실패 시 [] → resolveHeroToasts 가 폴백 토스트로 채운다.
  const [stats, activities] = await Promise.all([fetchClubStats(), fetchPublicActivities()]);
  const now = new Date();
  const toasts = resolveHeroToasts(activities, now);
```

(기존 `const stats = await fetchClubStats();` / `// Phase A: 실활동 미조회 ...` 주석 / `const now = new Date();` / `const toasts = resolveHeroToasts([], now);` 4줄을 위 블록으로 대체.)

- [ ] **Step 4: 타입체크 + 전체 테스트 + 빌드**

Run: `cd frontend && pnpm typecheck && pnpm --filter @duing/web test`
Expected: PASS (신규 3 + 기존 전부).

Run: `cd frontend && pnpm --filter @duing/web build`
Expected: BUILD 성공(홈 `force-dynamic` 유지, 타입 에러 0).

- [ ] **Step 5: 실브라우저 시각 QA (:3000)**

dev 서버 기동 후 `http://localhost:3000` 확인:
1. 로컬 백엔드가 살아 있고 활동 데이터가 있으면 → 토스트 2개가 **실제 동아리명**으로 노출.
2. 백엔드 다운/데이터 없음 → 토스트가 **"캠퍼스 동아리" 폴백**으로 노출(에러 없이 우아하게 저하).
3. 콘솔 에러/하이드레이션 경고 없음, 모바일(좁은 뷰포트)에서도 토스트 2개 정상.

QA 후 dev 서버 종료. (참고: dev 서버 좀비·포트 정리는 메모리 `reference_next_dev_zombie_and_local_backend` 규약 따름.)

- [ ] **Step 6: 커밋**

```bash
git -C /Users/ksy/Desktop/BASIC/Coding/Duing add frontend/apps/web/app/_components/sections/HomeHero.tsx frontend/apps/web/test/home/home-hero.test.tsx
git -C /Users/ksy/Desktop/BASIC/Coding/Duing commit -m "feat(web): 히어로 활동 토스트 실데이터 연동"
```

---

## Self-Review

**1. Spec coverage:**
- 폴백→실데이터 교체 → Task 3(HomeHero 배선). ✅
- API 호출 계층(typed client, `@duing/api` 경유, 직접 fetch 금지) → Task 1. ✅
- 실패 시 폴백 보존 → Task 2(`catch → []`) + Task 3 QA. ✅
- 상위 2건 한도 → Task 2(`limit: 2`). ✅
- 실시간성(빌드 박제 방지) → 홈 `force-dynamic` 기확인. ✅

**2. Placeholder scan:** 모든 코드/명령/기대출력 구체화됨. TBD/“적절히 처리” 없음. ✅

**3. Type consistency:**
- `PublicActivityType`(6) ⊂ `HeroActivityType`(7) → `item.type` 대입 타입 안전(`as` 불필요). ✅
- `fetchPublicActivities(): Promise<HeroActivity[]>` → `resolveHeroToasts(activities, now)` 시그니처(`HeroActivity[]`) 일치. ✅
- 클라이언트 `publicActivities.list(params?: PublicActivityListParams): Promise<PublicActivityFeed>` → `feed.items` 매핑 일치. ✅
- 테스트의 `{ items: [...] }` 형태 = `PublicActivityFeed`. ✅
