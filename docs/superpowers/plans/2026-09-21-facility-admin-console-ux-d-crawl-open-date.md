# 시설 관리자 콘솔 UX — PR-D 크롤 예약·오픈일 탭 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크롤 예약 탭에 단체명 검색·공용 페이지네이션·직전 월 옵션을 넣고, 검토 탭 시설 셀렉트를 가벼운 목록 훅으로 통일하며, 오픈일 탭의 전체 적용 확인창·빈 마감일 표기를 명확히 한다(스펙 §2.4 D1~D6).

**Architecture:** 프론트 전용 6개 태스크. 크롤 탭은 `useDeferredValue` 로 검색어를 지연해 `q` 파라미터로 넘기고(BE 필터는 PR-A A4), 자체 footer 를 공용 `Pagination` 으로 바꾸고, `crawlGrouping.ts` 에 `previousYearMonth` 를 추가한다. 검토 탭은 `useFacilityUsageQuery` → `useFacilityListQuery`(응답 `id·roomName` 동일). 오픈일 탭은 순수 함수 두 개(`windowSummary`, `windowLabel` 수정)만 손댄다.

**Tech Stack:** Next.js 15 App Router · React 19(`useDeferredValue`) · TanStack Query · vitest + testing-library + msw

**Spec:** `docs/superpowers/specs/2026-09-21-facility-admin-console-ux-design.md` §1(사실)·§2.4(D1~D6)·§3(테스트)·§4(PR-D)

**Branch:** `fix/facility-crawl-open-date-ux`(`develop` 기준). D1·D3 는 PR-A(`q` 파라미터·직전 월 허용)에 의존 — 프론트는 독립 개발·테스트 가능하지만 **PR 생성은 PR-A 머지 후**.

## Global Constraints

- `any` 금지, `as` 단언 금지(타입 가드·Zod), 타입 선언은 `type` 만(`interface` 금지). (frontend/CLAUDE.md)
- 서버 상태는 TanStack Query 만. `useEffect` 안에서 데이터 패칭 금지. `useQuery` 자체 mock 금지 — 훅 모듈 부분 mock(`vi.mock('@duing/hooks', …importOriginal…)`) 또는 msw. (frontend/CLAUDE.md)
- 컴포넌트/훅에서 `ky`/`fetch` 직접 호출 금지 — `@duing/api` 경유. 타입은 `packages/types`, API 는 `packages/api`, 훅은 `packages/hooks`. (frontend/CLAUDE.md)
- 변수명은 역할이 드러나게(`data`/`res`/`e` 금지).
- 태스크 GREEN 조건 = `pnpm vitest run test/admin/facility-bookings` + `pnpm typecheck` + `pnpm lint` 셋 다(`frontend/apps/web` 에서). vitest 는 테스트 파일 TS 오류를 잡지 않는다.
- 공용 컴포넌트에 **훅을 추가**하면 다른 테스트의 부분 mock 이 깨진다 — 그 경우 `pnpm vitest run`(web 전체) 1회. 이 플랜은 D4 가 검토 탭의 훅을 **교체**하므로 D4 는 web 전체 스위트 1회 필수.
- 공용 `Pagination` 은 `<nav aria-label={ariaLabel}>` + '이전'/'다음' 버튼 + `aria-current="page"`. `totalPages <= 1` 이면 null.
- 커밋: Conventional Commits 한국어 `type(scope): 대상 — 변경점`. Co-Authored-By·🤖 라인 금지.
- 사용자 대면 문구는 한글, 해요체.

---

### Task D1: 크롤 예약 단체명 검색 (#17)

**Files:**
- Modify: `frontend/packages/types/src/admin.ts:82-88` (`AdminCrawlReservationParams`)
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityCrawlTab.tsx:3,42-55,58-113`
- Test: `frontend/apps/web/test/admin/facility-bookings/facility-crawl-tab.test.tsx`

**Interfaces:**
- Consumes: `useAdminCrawlReservationsQuery(params: AdminCrawlReservationParams)`(`packages/hooks/src/facilityCrawlAdmin.ts`), `client.admin.facilityCrawl.reservations` 는 `cleanParams(params)` 로 `undefined` 를 쿼리스트링에서 뺀다.
- Produces: `AdminCrawlReservationParams.q?: string` — BE A4 의 `q`(단체명 정규화 부분 일치). 빈 문자열·공백은 `undefined` 로 보내 파라미터 자체를 생략한다.

- [ ] **Step 1: 실패 테스트 추가** — `facility-crawl-tab.test.tsx` 의 `describe('FacilityCrawlTab', …)` 마지막 `it` 뒤에 추가:

```tsx
  it('단체명 검색어를 입력하면 q 파라미터로 재조회하고 페이지가 0으로 돌아가며, 지우면 q 를 보내지 않는다', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('고정관념');

    const searchInput = screen.getByRole('searchbox', { name: '단체명 검색' });
    await user.type(searchInput, ' 고정 ');

    await waitFor(() => expect(requestedParams.some((params) => params.q === '고정')).toBe(true));
    const searchedRequest = requestedParams.find((params) => params.q === '고정');
    expect(searchedRequest?.page).toBe('0');

    await user.clear(searchInput);
    await waitFor(() => {
      const lastRequest = requestedParams[requestedParams.length - 1];
      expect(lastRequest).toBeDefined();
      expect(lastRequest?.q).toBeUndefined();
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-crawl-tab.test.tsx -t "단체명 검색어"`
Expected: FAIL — `Unable to find an accessible element with the role "searchbox"`.

- [ ] **Step 3: 타입에 `q` 추가** — `packages/types/src/admin.ts`:

```ts
export type AdminCrawlReservationParams = {
  yearMonth?: string; // yyyy-MM, 당월·익월만 허용
  facilityId?: number;
  groupBy?: AdminCrawlGroupBy;
  q?: string; // 단체명 부분 일치(공백·꼬리 괄호 무시, BE 가 정규화) — 빈 값은 보내지 않는다
  page?: number;
  size?: number;
};
```

- [ ] **Step 4: 탭에 검색 입력 + deferred `q`** — `FacilityCrawlTab.tsx`:

import 수정:

```tsx
import { useDeferredValue, useMemo, useState } from 'react';
```

상태·쿼리(`const [page, setPage] = useState(0);` 바로 아래):

```tsx
  const [keyword, setKeyword] = useState('');
  // 타이핑마다 재조회하지 않도록 지연값으로 요청한다(React 19 내장). 공백만이면 파라미터를 생략한다.
  const deferredKeyword = useDeferredValue(keyword).trim();
  const q = deferredKeyword === '' ? undefined : deferredKeyword;

  const facilitiesQuery = useFacilityListQuery();
  const reservationsQuery = useAdminCrawlReservationsQuery({
    yearMonth,
    facilityId,
    groupBy,
    q,
    page,
    size: PAGE_SIZE,
  });
```

(기존 `const facilitiesQuery = …`·`const reservationsQuery = …` 블록은 위 코드로 대체한다.)

필터 행 — 시설 `</label>` 바로 뒤, 필터 행 `</div>` 앞에 추가:

```tsx
        <input
          type="search"
          aria-label="단체명 검색"
          placeholder="단체명 검색"
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setPage(0);
          }}
          className="rounded-md border border-line bg-paper px-2 py-1.5 text-xs"
        />
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-crawl-tab.test.tsx && pnpm typecheck && pnpm lint`
Expected: 5 passed, typecheck·lint 통과.

- [ ] **Step 6: 커밋**

```bash
git add frontend/packages/types/src/admin.ts frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityCrawlTab.tsx frontend/apps/web/test/admin/facility-bookings/facility-crawl-tab.test.tsx
git commit -m "feat(frontend): 크롤 예약 탭 — 단체명 검색어를 q 파라미터로 지연 전달"
```

---

### Task D2: 크롤 탭 공용 Pagination (#18)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityCrawlTab.tsx` (import, `hasNext` 제거, `<footer>` 블록 → `Pagination`)
- Test: `frontend/apps/web/test/admin/facility-bookings/facility-crawl-tab.test.tsx`

**Interfaces:**
- Consumes: `Pagination({ page, totalPages, onChange, ariaLabel, totalElements, pageSize, className })`(`@/components/Pagination`) — `totalPages <= 1` 이면 렌더하지 않는다.
- Produces: `<nav aria-label="크롤 예약 페이지">`(2페이지 이상일 때만). "총 N개 그룹" 표기는 한 페이지뿐일 때도 건수를 보여야 하므로 `Pagination` 밖에 남긴다(플랜 리뷰 반영).

- [ ] **Step 1: 실패 테스트 추가** — `describe` 마지막에 추가:

```tsx
  it('그룹이 두 페이지 이상이면 공용 페이지네이션이 뜨고 "다음"이 page=1 로 재조회하며, 한 페이지면 뜨지 않는다', async () => {
    server.use(
      http.get('*/admin/facility-crawl/reservations', ({ request }) => {
        const url = new URL(request.url);
        requestedParams.push(Object.fromEntries(url.searchParams.entries()));
        return HttpResponse.json({
          ok: true,
          data: { ...GROUP_PAGE, totalElements: 12, totalPages: 2, hasNext: true },
          message: null,
        });
      }),
    );
    const user = userEvent.setup();
    const { unmount } = renderPage();
    await screen.findByText('고정관념');

    const pagination = screen.getByRole('navigation', { name: '크롤 예약 페이지' });
    expect(within(pagination).getByText('1–10 / 12건')).toBeInTheDocument();
    await user.click(within(pagination).getByRole('button', { name: '다음' }));
    await waitFor(() => expect(requestedParams.some((params) => params.page === '1')).toBe(true));
    unmount();

    server.resetHandlers();
    renderPage();
    await screen.findByText('고정관념');
    expect(screen.queryByRole('navigation', { name: '크롤 예약 페이지' })).not.toBeInTheDocument();
    expect(screen.getByText(/총 \d+개 그룹/)).toBeInTheDocument(); // 한 페이지여도 건수는 남긴다
  });
```

파일 상단 import 에 `within` 추가:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-crawl-tab.test.tsx -t "공용 페이지네이션"`
Expected: FAIL — `Unable to find an accessible element with the role "navigation"`.

- [ ] **Step 3: footer 를 Pagination 으로 교체** — `FacilityCrawlTab.tsx`:

import 추가(`Skeleton` import 아래):

```tsx
import { Pagination } from '@/components/Pagination';
```

`const hasNext = page + 1 < totalPages;` 줄 삭제.

`</ConsoleCard>` 안, 그룹 `<ul>` 블록 바로 뒤에 추가:

```tsx
        <div className="px-[18px] pb-4">
          <p className="text-xs text-charcoal-3">총 {totalElements}개 그룹</p>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              ariaLabel="크롤 예약 페이지"
              totalElements={totalElements}
              pageSize={PAGE_SIZE}
              className="mt-2"
            />
          )}
        </div>
```

(기존 `<footer>` 의 "총 N개 그룹" 문구·클래스를 그대로 옮긴다 — 실제 파일에서 기존 `<p>` 의 클래스명을 확인해 동일하게.)

`<footer …>…</footer>` 블록 전체 삭제.

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-crawl-tab.test.tsx && pnpm typecheck && pnpm lint`
Expected: 6 passed.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityCrawlTab.tsx frontend/apps/web/test/admin/facility-bookings/facility-crawl-tab.test.tsx
git commit -m "refactor(frontend): 크롤 예약 탭 — 자체 footer 페이징을 공용 Pagination 으로 교체"
```

---

### Task D3: 크롤 탭 직전 월 옵션 (#19)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_lib/crawlGrouping.ts:4-16`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityCrawlTab.tsx` (import, `monthOptions`, 월 버튼 라벨)
- Modify: `frontend/packages/types/src/admin.ts:83` (주석)
- Test: `frontend/apps/web/test/admin/facility-bookings/crawl-grouping.test.ts`, `facility-crawl-tab.test.tsx`

**Interfaces:**
- Produces: `previousYearMonth(yearMonth: string): string`(`crawlGrouping.ts`, `nextYearMonth` 대칭). BE A5 가 `currentMonth-1` 을 허용한다.

- [ ] **Step 1: 실패 테스트 (순수 함수)** — `crawl-grouping.test.ts` 의 `describe('nextYearMonth', …)` 뒤에 추가하고 import 에 `previousYearMonth` 를 넣는다:

```ts
describe('previousYearMonth', () => {
  it('연 경계를 안전하게 넘는다', () => {
    expect(previousYearMonth('2026-09')).toBe('2026-08');
    expect(previousYearMonth('2026-01')).toBe('2025-12');
  });
});
```

- [ ] **Step 2: 실패 테스트 (탭)** — `facility-crawl-tab.test.tsx` `describe` 마지막에 추가:

```tsx
  it('조회 월은 지난 달·이번 달·다음 달 3개이고, 지난 달을 고르면 직전 월로 재조회한다', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('고정관념');

    const monthGroup = screen.getByRole('group', { name: '조회 월' });
    expect(within(monthGroup).getAllByRole('button')).toHaveLength(3);
    const previousMonthButton = within(monthGroup).getByRole('button', { name: /^지난 달 \(\d{4}-\d{2}\)$/ });
    const previousMonth = previousMonthButton.textContent?.match(/\d{4}-\d{2}/)?.[0];
    await user.click(previousMonthButton);

    await waitFor(() => expect(requestedParams.some((params) => params.yearMonth === previousMonth)).toBe(true));
    expect(requestedParams.find((params) => params.yearMonth === previousMonth)?.page).toBe('0');
  });
```

- [ ] **Step 3: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/crawl-grouping.test.ts test/admin/facility-bookings/facility-crawl-tab.test.tsx`
Expected: FAIL — `previousYearMonth is not a function`, 버튼 개수 2.

- [ ] **Step 4: 구현** — `crawlGrouping.ts`(`nextYearMonth` 아래에 추가, 상단 주석 갱신):

```ts
/** Asia/Seoul 기준 현재 yyyy-MM — 크롤 데이터는 직전 월·당월·익월을 열람한다(직전 월은 재크롤 없이 보관분). */
export function seoulYearMonth(now: Date): string {
  // sv-SE 로케일은 yyyy-MM-dd 형식이라 슬라이스만으로 안전하다.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now).slice(0, 7);
}

function shiftYearMonth(yearMonth: string, monthDelta: number): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1 + monthDelta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function nextYearMonth(yearMonth: string): string {
  return shiftYearMonth(yearMonth, 1);
}

export function previousYearMonth(yearMonth: string): string {
  return shiftYearMonth(yearMonth, -1);
}
```

`FacilityCrawlTab.tsx`:

```tsx
import {
  contextDateLabel,
  crawledAtLabel,
  foldReservationContexts,
  nextYearMonth,
  previousYearMonth,
  seoulYearMonth,
} from '../_lib/crawlGrouping';
```

```tsx
  const monthOptions = [previousYearMonth(currentMonth), currentMonth, nextYearMonth(currentMonth)];
```

월 버튼 라벨(기존 삼항 교체):

```tsx
              {month === currentMonth
                ? `이번 달 (${month})`
                : month < currentMonth
                  ? `지난 달 (${month})`
                  : `다음 달 (${month})`}
```

`packages/types/src/admin.ts` 주석:

```ts
  yearMonth?: string; // yyyy-MM, 직전 월·당월·익월만 허용
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_lib/crawlGrouping.ts frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityCrawlTab.tsx frontend/packages/types/src/admin.ts frontend/apps/web/test/admin/facility-bookings/crawl-grouping.test.ts frontend/apps/web/test/admin/facility-bookings/facility-crawl-tab.test.tsx
git commit -m "feat(frontend): 크롤 예약 탭 — 지난 달 조회 옵션 추가"
```

---

### Task D4: 검토 탭 시설 셀렉트를 목록 훅으로 통일 (#20)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/BookingManagementTab.tsx:4-8`(import), `:75`(`const usageQuery = useFacilityUsageQuery();`), `:184`(옵션 렌더 `usageQuery.data?.facilities`)
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx:14,25,44,159,161` + 신규 케이스

**Interfaces:**
- Consumes: `useFacilityListQuery(): UseQueryResult<FacilitySummary[]>`(`GET /facilities`, 활성·sortOrder 정렬 — 크롤 탭과 동일). `FacilitySummary` 는 `id·roomName·location` 을 가진다(`packages/types/src/facility.ts:36`).
- Produces: 검토 탭 시설 필터 `<select aria-label="시설 필터">` 옵션이 `useFacilityListQuery().data` 에서 나온다. `useFacilityUsageQuery` 는 검토 탭에서 더 이상 호출하지 않는다(다른 화면 `app/facilities/_pages/FacilityBookingPage.tsx` 는 계속 사용).

- [ ] **Step 1: 테스트 mock 교체 + 실패 테스트** — `admin-bookings-page.test.tsx`:

`:14` `const mockUsageQuery = vi.fn();` → `const mockFacilityListQuery = vi.fn();`

`vi.mock('@duing/hooks', …)` 안에서 `useFacilityUsageQuery: () => mockUsageQuery(),` 줄을 삭제하고, 기존 `useFacilityListQuery: () => ({ data: [] }),` 줄을 아래로 교체:

```tsx
  // 검토 탭 시설 필터·크롤 탭 시설 셀렉트가 함께 쓰는 활성 시설 목록(#20 통일).
  useFacilityListQuery: () => mockFacilityListQuery(),
```

`beforeEach`(`:159`, `:161`):

```tsx
    mockFacilityListQuery.mockReset();
    mockFacilityListQuery.mockReturnValue({ data: undefined });
```

`describe` 안에 케이스 추가(첫 `it` 뒤):

```tsx
  it('검토 탭 시설 필터는 활성 시설 목록 훅의 응답으로 옵션을 만든다', () => {
    mockFacilityListQuery.mockReturnValue({
      data: [
        { id: 100, roomName: '세미나실', location: null },
        { id: 101, roomName: '공연장', location: '학생회관' },
      ],
    });
    render(<AdminFacilityBookingsPage />);

    const facilitySelect = screen.getByRole('combobox', { name: '시설 필터' });
    expect(within(facilitySelect).getByRole('option', { name: '세미나실' })).toHaveValue('100');
    expect(within(facilitySelect).getByRole('option', { name: '공연장' })).toHaveValue('101');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/admin-bookings-page.test.tsx`
Expected: 새 케이스 FAIL(옵션 없음) — 검토 탭이 아직 `useFacilityUsageQuery`(원본 훅, ApiClientProvider 없음)를 부르므로 다른 케이스도 깨질 수 있다. 어느 쪽이든 RED.

- [ ] **Step 3: 훅 교체** — `BookingManagementTab.tsx`:

```tsx
import {
  useAdminFacilityBookingQueueQuery,
  useAdminFacilityBookingSummaryQuery,
  useFacilityListQuery,
} from '@duing/hooks';
```

`:344` `const usageQuery = useFacilityUsageQuery();` →

```tsx
  // 활성 시설 목록(가벼움) — 크롤 탭과 같은 훅. 세 관리자 엔드포인트는 같은 활성·정렬 목록을 돌려주므로 가장 작은 응답을 쓴다(#20).
  const facilitiesQuery = useFacilityListQuery();
```

`:453` 옵션 렌더:

```tsx
              {(facilitiesQuery.data ?? []).map((facility) => (
                <option key={facility.id} value={String(facility.id)}>{facility.roomName}</option>
              ))}
```

- [ ] **Step 4: 통과 확인 (web 전체 스위트 — 공용 탭의 훅 교체)**

Run: `cd frontend/apps/web && pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: 전부 통과. `grep -rn "useFacilityUsageQuery" app/admin` 결과 0줄.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_tabs/BookingManagementTab.tsx frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx
git commit -m "refactor(frontend): 예약 검토 탭 — 시설 필터를 크롤 탭과 같은 활성 시설 목록 훅으로 통일"
```

---

### Task D5: 전체 적용 확인창 before 요약 (#21)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityOpenDateTab.tsx:36,44-50,321`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_components/FacilityOpenDateConfirmDialog.tsx:16` (주석)
- Test: `frontend/apps/web/test/admin/facility-bookings/facility-open-date-tab.test.tsx:227`

**Interfaces:**
- Produces: `windowSummary(facilities: AdminFacility[]): string` — `"열림 N · 닫힘 M"`, 마감 지정 시설이 있으면 `" (마감 지정 K)"` 를 덧붙인다. 탭 파일 내부 순수 함수(export 하지 않음).

- [ ] **Step 1: 실패 테스트** — `facility-open-date-tab.test.tsx` 전체 적용 케이스(`'전체 적용은 시설 수와 무관하게 …'`)의 단언 교체:

```tsx
    expect(within(dialog).getByText('활성 시설 3개')).toBeInTheDocument();
    // 픽스처: 공연장(열림·마감 없음)·세미나실(닫힘)·연습실(열림·마감 지정) → 무엇을 덮어쓰는지 집계로 보여준다(#21).
    expect(within(dialog).getByText('열림 2 · 닫힘 1 (마감 지정 1)')).toBeInTheDocument();
    expect(within(dialog).queryByText('여러 값')).not.toBeInTheDocument();
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-open-date-tab.test.tsx -t "전체 적용은 시설 수와"`
Expected: FAIL — `Unable to find an element with the text: 열림 2 · 닫힘 1 (마감 지정 1)`.

- [ ] **Step 3: 구현** — `FacilityOpenDateTab.tsx`, `windowLabel` 아래에 추가:

```tsx
/** 전체 적용 확인창의 "이전" — 시설마다 값이 달라 한 창으로 못 적으니 무엇을 덮어쓰는지 집계로 보여준다(#21). */
function windowSummary(facilities: AdminFacility[]): string {
  const openCount = facilities.filter((facility) => facility.bookingOpenDate !== null).length;
  const closeSpecifiedCount = facilities.filter(
    (facility) => facility.bookingOpenDate !== null && facility.bookingCloseDate !== null,
  ).length;
  const base = `열림 ${openCount} · 닫힘 ${facilities.length - openCount}`;
  return closeSpecifiedCount > 0 ? `${base} (마감 지정 ${closeSpecifiedCount})` : base;
}
```

`:321` `before={pendingChange.scope === 'all' ? '여러 값' : windowLabel(pendingChange.before)}` →

```tsx
          before={pendingChange.scope === 'all' ? windowSummary(facilities) : windowLabel(pendingChange.before)}
```

`FacilityOpenDateConfirmDialog.tsx:16` 주석:

```tsx
  /** 이전 창("M.d ~ M.d" · "닫힘" · 전체 적용이면 "열림 N · 닫힘 M (마감 지정 K)" 집계). */
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-open-date-tab.test.tsx && pnpm typecheck && pnpm lint`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityOpenDateTab.tsx frontend/apps/web/app/admin/facility-bookings/_components/FacilityOpenDateConfirmDialog.tsx frontend/apps/web/test/admin/facility-bookings/facility-open-date-tab.test.tsx
git commit -m "fix(frontend): 오픈일 탭 — 전체 적용 확인창에 열림·닫힘·마감 지정 집계 표기"
```

---

### Task D6: 빈 마감일 = "익월 말일" 렌더 (#22)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityOpenDateTab.tsx:43-46,228-231`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_components/FacilityOpenDateConfirmDialog.tsx:16` (주석)
- Test: `frontend/apps/web/test/admin/facility-bookings/facility-open-date-tab.test.tsx:21-27,96`

**Interfaces:**
- Produces: `windowLabel({open, close})` 가 `close === null` 이면 `"M.d ~ 익월 말일"`, 현재 창 셀은 `"yyyy-MM-dd ~ 익월 말일"`. 닫힘은 그대로 `"닫힘"`.

- [ ] **Step 1: 테스트 헬퍼·단언 갱신** — `facility-open-date-tab.test.tsx`:

```tsx
// 행 현재값 셀은 원본 ISO 를 잇고(관리자는 연도까지 확인한다), 다이얼로그는 M.d 로 줄여 보여준다.
// 마감일이 없으면 상한(익월 말일)까지라는 뜻을 글자로 적는다(#22) — 신규 운영진이 "~" 만 보고 헤매지 않게.
const windowCell = (open: string, close: string | null) =>
  close === null ? `${open} ~ 익월 말일` : `${open} ~ ${close}`;
const monthDay = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;
function windowLabel(open: string | null, close: string | null): string {
  if (open === null) return '닫힘';
  return close === null ? `${monthDay(open)} ~ 익월 말일` : `${monthDay(open)} ~ ${monthDay(close)}`;
}
```

첫 케이스 주석(`:96`) 갱신:

```tsx
    // 마감일 없는 시설은 "익월 말일" 로 상한을 글자로 보여준다.
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/facility-open-date-tab.test.tsx`
Expected: 셀·다이얼로그 텍스트를 쓰는 케이스들이 FAIL(`… ~ 익월 말일` 없음).

- [ ] **Step 3: 구현** — `FacilityOpenDateTab.tsx`:

```tsx
const OPEN_ENDED_CLOSE_LABEL = '익월 말일';

/** 창 표기 — 마감일이 없으면 상한(익월 말일)까지라는 뜻을 글자로 적는다(#22). */
function windowLabel({ open, close }: WindowValue): string {
  if (open === null) return CLOSED_LABEL;
  return `${monthDayLabel(open)} ~ ${close === null ? OPEN_ENDED_CLOSE_LABEL : monthDayLabel(close)}`;
}
```

`:228-231` 현재값 셀:

```tsx
                  // 현재값 셀만 원본 ISO 를 잇는다 — 관리자는 연도까지 확인한다(다이얼로그는 M.d 로 줄인다).
                  const currentText =
                    current.open === null
                      ? CLOSED_LABEL
                      : `${current.open} ~ ${current.close ?? OPEN_ENDED_CLOSE_LABEL}`;
```

`FacilityOpenDateConfirmDialog.tsx:16` 주석:

```tsx
  /** 이전 창("M.d ~ M.d" · 마감일 없으면 "M.d ~ 익월 말일" · "닫힘" · 전체 적용이면 집계). */
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/admin/facility-bookings/_tabs/FacilityOpenDateTab.tsx frontend/apps/web/app/admin/facility-bookings/_components/FacilityOpenDateConfirmDialog.tsx frontend/apps/web/test/admin/facility-bookings/facility-open-date-tab.test.tsx
git commit -m "fix(frontend): 오픈일 탭 — 빈 마감일을 \"익월 말일\" 로 표기"
```

---

## PR 생성 (PR-A 머지 후)

- 제목: `fix(frontend): 시설 관리자 콘솔 — 크롤 예약 검색·지난 달·공용 페이징, 오픈일 확인창·마감 표기 (UX 감사 #17~#22)`
- 본문 🚀/🤔/💬, 파일명 나열 금지. 머지는 사용자 지시 후.

## Self-Review

- 스펙 커버리지: D1 #17 · D2 #18 · D3 #19 · D4 #20 · D5 #21 · D6 #22 — 각 1 태스크, 수용 기준(훅 인자 q·nav 접근성 이름·버튼 3개·옵션 렌더·집계 텍스트·"익월 말일")이 테스트 문장과 1:1.
- 플레이스홀더 없음. 타입·이름 일관: `previousYearMonth`(D3 lib·탭·테스트), `mockFacilityListQuery`(D4), `windowSummary`(D5), `OPEN_ENDED_CLOSE_LABEL`(D6) 모두 동일 철자. D5 의 `windowSummary` 와 D6 의 `windowLabel` 은 같은 파일이라 D5→D6 순서로 적용해도 충돌 없음.
- D4 만 web 전체 스위트를 요구한다(공용 탭 훅 교체) — 나머지는 폴더 스위트.
