# 캘린더 실데이터 통합 + GlobalEvent 도메인 설계

작성일: 2026-06-05
관련 도메인: GlobalEvent (신규) / Recruitment (재사용) / ClubEvent (재사용)

## 배경

현재 캘린더 페이지(`/calendar`)는 6 종류(notice/deadline/fair/show/meet/volunteer) `CalEvent` 하드코딩으로 운영된다. 백엔드에는 모집(Recruitment) 마감과 동아리 내부 일정(ClubEvent) 도메인이 이미 존재하지만, 학교 단위 행사(박람회·축제·동아리방 신청 등)를 표현할 도메인이 없어 캘린더 실데이터 통합이 막혀 있었다.

본 spec 은 **시간성 있는 학교 행사** 를 표현할 `GlobalEvent` 도메인을 신설하고, 캘린더를 3 도메인(GlobalEvent / Recruitment / ClubEvent)의 실데이터로 통합한다. **Notice 는 캘린더에서 제외** — "공지 = 안내문" / "일정 = 시간성 행사" 책임 분리.

## 목표

1. 학교 단위 행사 일정을 ADMIN 이 등록·관리할 수 있는 `GlobalEvent` 도메인 신설.
2. 캘린더가 GlobalEvent + Recruitment + ClubEvent 3 도메인의 실데이터를 통합 표시.
3. 캘린더의 로컬 작성/편집 기능을 제거하고, 적절한 sub-flow 로 안내하는 deep link 디스패처로 전환.
4. ADMIN 의 `OTHER` 카테고리 남용을 가시화하는 카테고리 분포 위젯 도입.

## 도메인 모델 (재정립)

| EventKind | Source 도메인 | Accent | 노출 범위 | 작성자 |
|---|---|---|---|---|
| `system` | **GlobalEvent (신규)** | warm | 모두 (비로그인 포함) | ADMIN |
| `deadline` | Recruitment.endDate | coral | 모두 | LEADER/OFFICER (모집 등록 시 자동) |
| `event` | ClubEvent | sage | **회원 클럽만** | LEADER/OFFICER |

**Notice 는 캘린더에 노출하지 않음.** "동아리방 배정 신청 시작/마감"·"축제 공연 기간"·"박람회 개최일" 같은 일정성 안내는 ADMIN 이 GlobalEvent 로 작성한다. 순수 공지(운영 규정 변경, 일반 안내)는 `/notices` 페이지에서만 노출.

## 변경 범위

본 spec 은 3 PR 로 분리한다:

| PR | 범위 |
|---|---|
| PR 1 (백엔드) | GlobalEvent 도메인 풀스택 (entity·migration·public read·admin CRUD·category stats·테스트) |
| PR 2 (프론트 어드민) | `/admin/global-events` 작성·수정·삭제 UI + 카테고리 분포 위젯 |
| PR 3 (프론트 캘린더) | 캘린더 실데이터 통합 + AddEventModal → Deep link 디스패처 |

PR 1 머지 후 PR 2 시작. PR 2 머지 후 PR 3.

---

## 1. GlobalEvent 도메인 (백엔드, PR 1)

### 1.1 엔티티 스키마

```sql
CREATE TABLE global_event (
  id           BIGSERIAL    PRIMARY KEY,
  title        VARCHAR(120) NOT NULL,
  description  TEXT,
  start_at     TIMESTAMP    NOT NULL,
  end_at       TIMESTAMP    NOT NULL,
  location     VARCHAR(200),
  link_url     VARCHAR(500),
  category     VARCHAR(30)  NOT NULL,
  created_by   BIGINT       NOT NULL REFERENCES users(id),
  deleted_at   TIMESTAMP,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_global_event_period CHECK (end_at >= start_at)
);

CREATE INDEX idx_global_event_start
  ON global_event (start_at)
  WHERE deleted_at IS NULL;
```

`BaseEntity` 상속, soft delete (`@SQLDelete` + `@SQLRestriction`).

### 1.2 `GlobalEventCategory` enum

```java
public enum GlobalEventCategory {
    FAIR,        // 박람회
    FESTIVAL,    // 축제·공연
    APPLICATION, // 신청 시작/마감
    CONTEST,     // 대회
    UNION,       // 총동연 행사
    OTHER        // 기타 (가급적 다른 카테고리 사용)
}
```

DB NOT NULL + `@NotNull` 유지. ADMIN 이 반드시 선택.

### 1.3 필드 정책

- `title` (≤120) — 공백 트림 후 `min 1`
- `description` (≤2000) — 선택
- `startAt`, `endAt` — `endAt >= startAt` (DB CHECK + 엔티티 검증). 종일 이벤트는 `00:00 ~ 23:59` 로 표현
- `location` (≤200) — 자유 텍스트, 선택
- `linkUrl` (≤500) — 상세 안내 URL, 선택. `^(https?://).+` 패턴 검증
- `category` — enum 6종 (NOT NULL)
- `createdBy` — ADMIN userId (감사 목적)

### 1.4 API

**공개 (캘린더용, 비로그인 포함)**

| ID | 기능 | 경로 | 입력 | 출력 | 예외 |
|---|---|---|---|---|---|
| GE-1 | 글로벌 이벤트 윈도우 조회 | `GET /api/v1/global-events` | `from?`(default `today-30d`), `to?`(default `today+180d`), `category?` | `List<GlobalEventCardResponse>` (`startAt` ASC) (200) | `(to-from) > 400d` 400 |
| GE-2 | 글로벌 이벤트 상세 | `GET /api/v1/global-events/{eventId}` | `eventId` | `GlobalEventDetailResponse` (200) | 404 |

**어드민 CRUD + 통계**

| ID | 기능 | 경로 | 입력 | 출력 | 예외 |
|---|---|---|---|---|---|
| GE-3 | 어드민 목록 | `GET /api/v1/admin/global-events` | `category?`, `keyword?`, `Pageable` | `PageResponse<AdminGlobalEventSummary>` (200) | 401 / 403 |
| GE-3.5 | 카테고리 분포 통계 | `GET /api/v1/admin/global-events/category-stats` | — | `Map<GlobalEventCategory, Long>` (enum 6키 모두 보장, 0 포함) (200) | 401 / 403 |
| GE-4 | 어드민 상세 | `GET /api/v1/admin/global-events/{eventId}` | `eventId` | `AdminGlobalEventDetail` (200) | 401 / 403 / 404 |
| GE-5 | 생성 | `POST /api/v1/admin/global-events` | `title`, `description?`, `startAt`, `endAt`, `location?`, `linkUrl?`, `category` | `eventId` (201) | 401 / 403 / 검증 400 |
| GE-6 | 수정 | `PATCH /api/v1/admin/global-events/{eventId}` | partial fields | 204 | 401 / 403 / 404 / 검증 400 |
| GE-7 | 삭제 | `DELETE /api/v1/admin/global-events/{eventId}` | — | 204 | 401 / 403 / 404 |

**권한**:
- GE-1/2: 공개 (인증 없음).
- GE-3 ~ GE-7, GE-3.5: `@PreAuthorize("hasRole('ADMIN')")`.

**윈도우 정책 (GE-1)** — ClubEvent CE-1 과 동일:
- 둘 다 생략: `from = today-30d`, `to = today+180d`
- `(to - from) > 400d` → 400

### 1.5 응답 DTO

```jsonc
// GlobalEventCardResponse (공개 목록)
{
  "id": 12, "title": "가을 동아리 박람회",
  "startAt": "...", "endAt": "...",
  "location": "중앙광장", "category": "FAIR"
}

// GlobalEventDetailResponse (공개 상세)
{
  "id": 12, "title": "가을 동아리 박람회", "description": "...",
  "startAt": "...", "endAt": "...",
  "location": "중앙광장", "linkUrl": "https://...",
  "category": "FAIR"
}

// AdminGlobalEventSummary / Detail — 공개 필드 + createdBy + createdAt/updatedAt
{
  ...공개 필드...,
  "createdBy": { "id": 1, "name": "관리자" },
  "createdAt": "...", "updatedAt": "..."
}

// GE-3.5 응답 (enum 6키 모두 포함, 0 보장)
{ "FAIR": 5, "FESTIVAL": 12, "APPLICATION": 35, "CONTEST": 8, "UNION": 25, "OTHER": 2 }
```

### 1.6 파일 변경 (PR 1)

```
backend/src/main/java/com/duing/domain/globalevent/
├── entity/GlobalEvent.java                              [신규]
├── entity/GlobalEventCategory.java                      [신규]
├── api/PublicGlobalEventApi.java                        [신규] GE-1, GE-2
├── api/AdminGlobalEventApi.java                         [신규] GE-3 ~ GE-7, GE-3.5
├── controller/PublicGlobalEventController.java          [신규]
├── controller/AdminGlobalEventController.java           [신규]
├── controller/dto/request/CreateGlobalEventRequest.java [신규]
├── controller/dto/request/UpdateGlobalEventRequest.java [신규]
├── controller/dto/response/GlobalEventCardResponse.java       [신규]
├── controller/dto/response/GlobalEventDetailResponse.java     [신규]
├── controller/dto/response/AdminGlobalEventSummary.java       [신규]
├── service/GlobalEventService.java                      [신규]
├── service/GeneralGlobalEventService.java               [신규] 프로젝트 컨벤션 유지 (General prefix)
├── service/dto/command/CreateGlobalEventCommand.java    [신규]
├── service/dto/command/UpdateGlobalEventCommand.java    [신규]
├── service/dto/query/AdminGlobalEventSearchCondition.java [신규]
├── repository/GlobalEventRepository.java                [신규]
├── repository/GlobalEventRepositoryCustom.java          [신규]
├── repository/GlobalEventRepositoryImpl.java            [신규] QueryDSL admin 검색 + category stats
└── exception/GlobalEventException.java                  [신규]

backend/src/main/resources/db/migration/
└── V35__create_global_event.sql                         [신규]
```

---

## 2. 어드민 작성 UI (프론트, PR 2)

### 2.1 라우트 구조

```
frontend/apps/web/app/admin/global-events/
├── page.tsx                                          [신규] 목록 + 카테고리 분포 위젯
├── new/page.tsx                                      [신규] 생성 폼
├── [eventId]/page.tsx                                [신규] 상세·수정 폼
└── _components/
    ├── AdminGlobalEventTable.tsx                     [신규]
    ├── AdminGlobalEventFilterBar.tsx                 [신규]
    ├── AdminGlobalEventCategoryStats.tsx             [신규] 분포 막대
    ├── AdminGlobalEventForm.tsx                      [신규] 생성/수정 공통
    └── AdminGlobalEventDeleteDialog.tsx              [신규]
```

`AdminSidebar` 와 `_lib/adminSections.ts` 에 항목 추가.

### 2.2 패키지 레이어 (PR 2 ~ PR 3 공통)

```
frontend/packages/types/src/
└── globalEvent.ts                                    [신규]
    - GlobalEventCategory ('FAIR'|'FESTIVAL'|'APPLICATION'|'CONTEST'|'UNION'|'OTHER')
    - GlobalEventCard, GlobalEventDetail
    - AdminGlobalEventSummary
    - CreateGlobalEventPayload, UpdateGlobalEventPayload
    - CategoryStats = Record<GlobalEventCategory, number>

frontend/packages/schemas/src/index.ts                [수정]
- createGlobalEventSchema (title 1~120, startAt/endAt + endAt>=startAt refine,
                            linkUrl regex(/^https?:\/\/.+/), category required)
- updateGlobalEventSchema (partial)

frontend/packages/api/src/client.ts                   [수정]
- globalEvents:        { list(params), get(id) }           // 공개
- admin.globalEvents:  { list(params), get(id), create, update, remove, categoryStats() }

frontend/packages/hooks/src/
├── globalEvents.ts                                   [신규]
│   - useGlobalEventListQuery(params)        // 공개, 캘린더용
│   - useGlobalEventDetailQuery(eventId)     // 공개, 캘린더 모달 lazy fetch
│   - useAdminGlobalEventListQuery(params)
│   - useAdminGlobalEventDetailQuery(eventId)
│   - useCreate/Update/RemoveGlobalEventMutation
│   - useGlobalEventCategoryStatsQuery (staleTime 5min)
└── globalEventQueryKeys.ts                           [신규]
```

### 2.3 작성 폼 (`AdminGlobalEventForm`)

생성/수정 공통. 필드:

| 필드 | UI | 검증 |
|---|---|---|
| 카테고리 | select | **placeholder "카테고리 선택" + 비선택 기본**, OTHER 맨 끝, OTHER 선택 시 경고 카피 |
| 제목 | text input | required, ≤120, 공백 트림 |
| 시작 일시 | datetime-local | required |
| 종료 일시 | datetime-local | required, ≥ 시작 |
| 장소 | text input | 선택, ≤200 |
| 링크 URL | url input | 선택, `^https?://.+`, ≤500 |
| 설명 | textarea (counter) | 선택, ≤2000 |

zod refine: `endAt >= startAt`. 모달이 아니라 **전체 페이지 폼** (어드민 다른 작성 페이지 패턴 일관).

### 2.4 카테고리 select 정책

```tsx
<select required defaultValue="">
  <option value="" disabled hidden>카테고리 선택</option>
  <option value="FAIR">박람회</option>
  <option value="FESTIVAL">축제·공연</option>
  <option value="APPLICATION">신청 시작/마감</option>
  <option value="CONTEST">대회</option>
  <option value="UNION">총동연 행사</option>
  <option value="OTHER">기타 (가급적 다른 카테고리 사용)</option>
</select>

{watch('category') === 'OTHER' && (
  <p className="mt-1 text-xs text-coral">
    ⚠️ 5개 카테고리 중 적합한 것이 없는 경우에만 사용해주세요.
  </p>
)}
```

### 2.5 카테고리 분포 위젯 (`AdminGlobalEventCategoryStats`)

목록 페이지 상단. `useGlobalEventCategoryStatsQuery()` 로 독립 fetch — 필터/페이지 변경에 영향 없음.

```
[ FAIR        ▓▓                  5건 ]
[ FESTIVAL    ▓▓▓▓▓             12건 ]
[ APPLICATION ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   35건 ]
[ CONTEST     ▓▓▓                8건 ]
[ UNION       ▓▓▓▓▓▓▓▓▓▓        25건 ]
[ OTHER       ▓                  2건 ]   ← 비율 ≥ 15% 면 막대 색 coral 로 경고
```

GE-5/6/7 mutation onSuccess 에서 `globalEventCategoryStats` 쿼리도 invalidate.

### 2.6 권한 가드

라우트 진입: `useMeQuery()` → `role !== 'ADMIN'` 이면 `/` redirect + toast. 기존 `/admin/*` 가드 패턴 재사용. 백엔드는 최종 방어선.

---

## 3. 캘린더 실데이터 통합 (프론트, PR 3)

### 3.1 핵심 변경

| 항목 | Before (하드코딩) | After |
|---|---|---|
| 데이터 소스 | `CAL_EVENTS_INITIAL` 정적 배열 | 3 도메인 병렬 fetch |
| `EventKind` | 6종 | **3종 (`system` / `deadline` / `event`)** |
| `AccentKey` | 6종 사용 | warm/coral/sage 활성, 나머지 보존만 |
| AddEventModal | 로컬 state append | **Deep link 디스패처** |
| 이벤트 클릭 모달 | 편집/삭제 가능 | 읽기 전용 + "원본 보기" 분기 |

### 3.2 `CalEvent` 타입 갱신

```ts
// frontend/apps/web/app/calendar/_types/index.ts

export type EventKind = 'system' | 'deadline' | 'event';
export type EventSource = 'global' | 'recruitment' | 'clubEvent';
export type AccentKey = 'ink' | 'coral' | 'warm' | 'berry' | 'sage' | 'sky';

export type CalEvent = {
  id: string;                       // prefix 포함 (g-/r-/c-)
  date: string;                     // YYYY-MM-DD
  kind: EventKind;                  // 시각 분류
  sourceType: EventSource;          // [신규] 의미 분류 — 라우팅·detail fetch 용
  sourceId: number;                 // [신규] 원본 도메인의 raw ID
  sourceClubId?: number;            // [신규, clubEvent 만] member events 경로 생성용
  title: string;
  time: string;
  place: string;
  club: string | null;
  accent: AccentKey;
  span?: number;
  description?: string;
};
```

`KIND_LABEL`, `KIND_ORDER`, `ACCENT` 매핑도 3종 기준 갱신:

```ts
const KIND_LABEL: Record<EventKind, string> = {
  system:   '행사·일정',
  deadline: '모집 마감',
  event:    '동아리 일정',
};
const KIND_ORDER: EventKind[] = ['system', 'deadline', 'event'];
```

### 3.3 `useCalendarMonthQuery` (3 도메인 합본 훅)

```
frontend/packages/hooks/src/calendarMonth.ts          [신규]
```

```ts
export function useCalendarMonthQuery(yearMonth: string) {
  const from = startOfMonth(yearMonth);  // YYYY-MM-01
  const to   = endOfMonth(yearMonth);    // YYYY-MM-{lastDay}

  const recruitmentQuery = useRecruitmentCalendarQuery({ yearMonth });
  const globalEventQuery = useGlobalEventListQuery({ from, to });
  const { data: myClubs = [] } = useMyClubsQuery();
  const clubEventQueries = useQueries({
    queries: myClubs.map((club) => ({
      queryKey: clubEventKeys.list(club.clubId, { from, to }),
      queryFn: () => client.clubEvents.list(club.clubId, { from, to }),
      staleTime: 30 * 1000,
    })),
  });

  return {
    events: [
      ...(globalEventQuery.data ?? []).map(toCalEvent_global),
      ...(recruitmentQuery.data ?? []).map(toCalEvent_recruitment),
      ...clubEventQueries.flatMap((q, idx) =>
        (q.data ?? []).map(item => toCalEvent_clubEvent(item, myClubs[idx]))
      ),
    ],
    isLoading: globalEventQuery.isLoading || recruitmentQuery.isLoading
            || clubEventQueries.some(q => q.isLoading),
    isError: globalEventQuery.isError || recruitmentQuery.isError
          || clubEventQueries.some(q => q.isError),
  };
}
```

### 3.4 정규화 mapper (`_lib/calendarMappers.ts`)

```ts
export function toCalEvent_global(item: GlobalEventCard): CalEvent {
  return {
    id: `g-${item.id}`,
    sourceType: 'global', sourceId: item.id,
    kind: 'system', accent: 'warm',
    date: item.startAt.slice(0, 10),
    title: item.title,
    time: formatRange(item.startAt, item.endAt),
    place: item.location ?? '',
    club: null,
    span: spanDays(item.startAt, item.endAt),
  };
}

export function toCalEvent_recruitment(item: RecruitmentSummary): CalEvent {
  // R-1 응답: id, clubId, clubName 모두 존재 (확인 완료)
  return {
    id: `r-${item.id}`,
    sourceType: 'recruitment', sourceId: item.id,
    kind: 'deadline', accent: 'coral',
    date: item.endDate,
    title: `${item.clubName} 모집 마감`,
    time: '23:59',
    place: '지원폼',
    club: item.clubName,
  };
}

export function toCalEvent_clubEvent(item: ClubEventCard, club: MyClubSummary): CalEvent {
  return {
    id: `c-${item.id}`,
    sourceType: 'clubEvent', sourceId: item.id,
    sourceClubId: club.clubId,
    kind: 'event', accent: 'sage',
    date: item.startAt.slice(0, 10),
    title: item.title,
    time: formatRange(item.startAt, item.endAt),
    place: item.location ?? '',
    club: club.clubName,
  };
}
```

### 3.5 AddEventModal → `AddEventDispatcher` 로 전환

기존 `AddEventModal.tsx` 제거. 신규 `AddEventDispatcher.tsx`:

```tsx
<Dialog>
  <DialogTitle>일정 추가</DialogTitle>

  {managedClubs.length > 0 && (
    <Section title="동아리 일정 추가">
      <ClubSelect value={selectedClubId} options={managedClubs} />
      <Button onClick={() => router.push(`/clubs/${selectedClubId}/member/events`)}>
        선택한 동아리 일정 페이지로 이동
      </Button>
    </Section>
  )}

  {isAdmin && (
    <Section title="총동연 일정 등록">
      <Button onClick={() => router.push('/admin/global-events/new')}>
        글로벌 일정 등록
      </Button>
    </Section>
  )}

  {managedClubs.length > 0 && (
    <Section title="모집 공고">
      <Button onClick={() => router.push(`/manage/clubs/${selectedClubId}/recruitments/new`)}>
        모집 공고 작성
      </Button>
    </Section>
  )}

  {managedClubs.length === 0 && !isAdmin && (
    <p>일정 추가 권한이 없습니다. 동아리 운영진이거나 총동연이어야 합니다.</p>
  )}
</Dialog>
```

기존 `expandRepeat()` / `handleAddEvent` / `handleUpdateEvent` / `handleDeleteEvent` 로직 전부 제거 (서버 SoT 이전됨).

### 3.6 이벤트 상세 모달 (`EventDetailModal`)

기존 편집/삭제 액션 제거. 읽기 전용 + `sourceType` 기반 "원본 보기" 분기:

```ts
const SOURCE_URL: Record<EventSource, (event: CalEvent) => string | null> = {
  global:      (e) => null,  // 공개 상세 페이지 없음 → 모달 안에서 detail lazy fetch
  recruitment: (e) => `/apply/${e.sourceId}`,
  clubEvent:   (e) => `/clubs/${e.sourceClubId}/member/events/${e.sourceId}`,
};
```

`sourceType === 'global'` 인 경우: `useGlobalEventDetailQuery(sourceId)` 로 lazy fetch (모달 오픈 시점) → description + linkUrl 표시. `linkUrl` 있으면 "자세히 보기" 외부 링크 노출.

`sourceType === 'recruitment'` / `'clubEvent'` 인 경우: "원본 보기" 버튼 → 해당 페이지로 이동.

### 3.7 비로그인·로딩·에러

- 비로그인: GlobalEvent + Recruitment 만 표시. 상단 배너 "내 동아리 일정을 보려면 로그인해주세요"
- 한 도메인만 에러: 성공한 도메인은 그대로 렌더, 상단 toast "일부 일정을 불러오지 못했습니다 [다시 시도]"
- 전체 로딩: 월 grid 셸 표시, 셀별 회색

### 3.8 캐시·refetch 정책

- `useCalendarMonthQuery(yearMonth)`: `staleTime: 30s`
- 월 변경 시 새 query key → 자동 fetch
- 각 도메인 mutation (다른 페이지에서 발생) 의 invalidate 가 캘린더 query 도 자동 무효화 (queryKey prefix 공유)

### 3.9 파일 변경 (PR 3)

```
frontend/apps/web/app/calendar/
├── _pages/CalendarPage.tsx                           [수정] 데이터 소스 교체, 편집 로직 제거
├── _components/AddEventModal.tsx                     [제거]
├── _components/AddEventDispatcher.tsx                [신규]
├── _components/EventDetailModal.tsx                  [수정] 읽기 전용 + sourceType 분기
├── _types/index.ts                                   [수정] EventKind 3종, sourceType/sourceId/sourceClubId 추가
└── _lib/calendarMappers.ts                           [신규]

frontend/packages/hooks/src/calendarMonth.ts          [신규]
```

---

## 4. 에러 처리 매트릭스

### 4.1 백엔드

| 상황 | HTTP | 프론트 |
|---|---|---|
| GE-1/2 5xx | 5xx | 캘린더 상단 toast + 재시도 |
| GE-1 윈도우 캡 초과 | 400 | 캘린더는 default 윈도우로만 호출하므로 정상 경로에선 발생 X (방어적) |
| GE-2 없음 | 404 | 모달의 detail fetch 실패 → fallback "상세 정보를 불러오지 못했습니다" |
| GE-3.5 5xx | 5xx | 분포 위젯 "분포를 불러오지 못했습니다" + 재시도 |
| GE-5 검증 실패 (title 공백·endAt<startAt·잘못된 URL·category null) | 400 | 폼 필드별 에러 메시지 |
| GE-5/6/7 ADMIN 아님 | 403 | 가드 차단했어야. 도달 시 `/` redirect |
| GE-6/7 없음 | 404 | 목록 invalidate + toast |

### 4.2 프론트 캘린더

| 상황 | 처리 |
|---|---|
| 비로그인 | GlobalEvent + Recruitment 만 표시. 상단 안내 배너 |
| 한 도메인만 에러 | 성공한 도메인은 그대로, 상단 toast |
| 전체 로딩 | 월 grid 셸 표시 |
| 회원 클럽 0개 | ClubEvent 호출 skip |

### 4.3 AddEventDispatcher

| 사용자 권한 | UI |
|---|---|
| LEADER/OFFICER (운영 클럽 ≥ 1) | 동아리 일정 + 모집 공고 섹션 |
| ADMIN | 글로벌 일정 등록 섹션 |
| LEADER/OFFICER + ADMIN | 둘 다 |
| 일반 STUDENT | "일정 추가 권한이 없습니다" 안내 |

---

## 5. 테스트 전략

### 5.1 백엔드 (PR 1)

| 클래스 | 케이스 |
|---|---|
| `PublicGlobalEventControllerTest` | GE-1 공개 조회 (비로그인·로그인) / 윈도우 기본값·캡 (400d 초과 400) / GE-2 200·404 |
| `AdminGlobalEventControllerTest` | GE-3 페이지네이션·필터 / GE-4 상세 / GE-5 생성 (검증 실패 case: title 공백·endAt<startAt·linkUrl 패턴 / category null) / GE-6 부분 수정 / GE-7 삭제 / STUDENT 의 admin 엔드포인트 403 / GE-3.5 분포 정확성 (enum 6키 모두 보장, 0 포함) |

RestAssured + Fixture Monkey + TestContainers. `@DisplayName` 한글 문장형.

### 5.2 프론트 (PR 2, PR 3)

`pnpm lint && pnpm typecheck && pnpm build` 그린 보장. 수동 시나리오:

**PR 2 (어드민)**:
- 카테고리 select OTHER 선택 시 경고 카피 노출
- 분포 위젯 OTHER 비율 ≥ 15% → 막대 색 coral
- linkUrl 잘못된 형식 입력 → 폼 에러
- 삭제 후 목록 + 분포 동시 갱신

**PR 3 (캘린더)**:
- 비로그인: GlobalEvent + Recruitment 만 표시, 상단 로그인 배너
- STUDENT (회원 클럽 0): 동일
- LEADER (회원 클럽 1): + ClubEvent 노출
- LEADER (회원 클럽 3): N+1 병렬 호출 정상 동작, 합쳐서 노출
- ADMIN: 모든 데이터 + AddEventDispatcher "글로벌 일정 등록" 활성
- 다일 GlobalEvent (예: 박람회 3일): `span: 3` 으로 bar 렌더 확인
- 모집 마감 카드 클릭 → `/apply/{recruitmentId}` 이동
- ClubEvent 카드 클릭 → `/clubs/{clubId}/member/events/{eventId}` 이동
- GlobalEvent 카드 클릭 → 모달 안에서 description + linkUrl(있으면) 표시

---

## 6. Out of Scope

이번 spec 에서 다루지 않음 — 후속 PR/spec:

1. **Notice 캘린더 통합** — 공지는 `/notices` 페이지에서만. 일정성 공지는 ADMIN 이 GlobalEvent 로 작성.
2. **GlobalEvent 공개 상세 페이지** (`/global-events/[eventId]`) — 캘린더 모달의 description + 선택적 linkUrl 외부 링크면 충분. 별도 페이지 YAGNI.
3. **ClubEvent N+1 통합 엔드포인트** (`GET /me/club-events?yearMonth=`) — 본 spec 의 §리스크 §3 에 기술부채 명시. 트리거 조건: 회원 클럽 평균 5+ 또는 캘린더 로딩 지연 사용자 보고 발생 시.
4. **`ClubEventType` enum 도입** — ClubEvent 안에서 meet/show/fair/volunteer 시각 구분. 현재는 모두 `event` 단일 kind.
5. **`OTHER` 카테고리 자동 감사** — 비율 임계치 초과 시 ADMIN 알림 / 주기 리포트.
6. **GlobalEvent 반복 일정** (RRULE/Series) — 매주 정기 행사 자동 등록. 현재는 단일 일정만.
7. **GlobalEvent 종일 플래그** (`allDay: boolean`) — 현재는 `00:00~23:59` 로 표현.
8. **캘린더 "기간 더 보기" 옵션** — 사용자가 윈도우 확장 (예: 다음 1년). 현재는 백엔드 default 만.
9. **AddEventDispatcher 안에서 인라인 작성** — 모달 안에서 직접 등록. 현재는 deep link 로 sub-page 이동.
10. **카테고리 분포 위젯의 시계열 비교** — "지난달 대비 OTHER 가 늘었음" 같은 추세.
11. **GlobalEvent 이미지 첨부** (`coverImageUrl`) — 현재는 텍스트만.
12. **캘린더 검색·키워드 필터** — 현재는 월 단위 grid + kind 필터만.
13. **EXTERNAL 모집의 외부 폼 분기** — 모집 마감 카드 클릭 시 `applicationMode === 'EXTERNAL'` 이면 `externalFormUrl` 로 직행. MVP 에선 `/apply/{id}` 로 통일.

---

## 7. 리스크·체크 포인트

- **ClubEvent N+1 (회원 클럽 N개 → N회 호출)**: 회원 클럽 1~3개 환경에선 무시 가능. 캐시 `staleTime: 30s` + `useQueries` 병렬로 완화. 트리거 조건 시 §Out of Scope 3 의 통합 API 도입. **기술부채로 명시 인지.**
- **GlobalEvent 카테고리 enum 추가 비용**: 추후 `SCHOLARSHIP` 등 새 카테고리 추가 시 enum + 한글 라벨 매핑 동시 갱신. 응답 파싱은 `unknown` fallback 으로 안전성 확보.
- **윈도우 캡 400일 의 근거**: ClubEvent 와 동일. 다년치 데이터는 캘린더에서 미지원.
- **`OTHER` 임계치 15%**: 임의 수치. 운영해보고 조정 (Out of Scope 5 의 자동 감사와 묶어 결정).
- **`AddEventDispatcher` STUDENT UX**: "권한 없음" 안내가 부정적 인상 가능. 향후 일반 사용자도 "내 개인 일정 추가" 같은 기능이 들어오면 UX 개선 필요.
- **Recruitment R-1 응답에 `id` 필드 존재 확인 완료**: `RecruitmentSummaryResponse.id` 존재. `/apply/{id}` URL 생성 안전.
- **공개 GlobalEvent 조회 권한 (`permitAll`)**: 향후 캠퍼스 외부 노출이 문제되면 인증 게이트 추가 옵션. 현재는 학교 도메인 메일 인증 학생만 가입하므로 큰 노출 위험 없음.
- **`General` prefix 의미 중복 (`GeneralGlobalEventService`)**: 표기상 어색하나 프로젝트 컨벤션 일관성 우선. 다른 도메인 서비스 패턴과 grep 가능.
- **`sourceType` 분리의 미래 활용**: 현재는 도메인 1:1 매칭이지만 향후 라우팅 변경·notification 통합·로깅 등 비-시각 로직에서 활용 가능. `kind` 와 분리해둔 이점.
