# `/clubs` 목록 모집 상태 필터·카드 표시 정비

작성일: 2026-05-25
도메인: 학생 탐색 흐름 — `/clubs` 목록 페이지 + `ClubSummary` API 응답

---

## 1. 배경 & 목표

`/clubs` 목록 페이지에서 모집 관련 표시가 실데이터와 어긋난다.

- **모든 카드가 "모집중"으로 표시** — `ClubSummary` 응답에 모집 정보가 없어서 프론트(`clubAdapter.summaryToClub`)가 동아리의 승인 상태(`ClubStatus.ACTIVE`)를 모집 상태(`open`)로 잘못 매핑한다.
- **모집 기간이 `'—'` 하드코딩** — 같은 이유. `ClubCard` 의 deadline/openDate 가 강제로 `'—'` 로 채워진다.
- **상시모집(`ALWAYS_OPEN`) 필터 옵션 자체가 누락** — `RECRUITMENT_LABEL` 에 `open/upcoming/closed` 만 정의.
- **`upcoming`/`closed` 필터가 BE 미지원** — `toApiParams` 가 `recruiting: true|false` 로만 매핑. UI 칩은 있지만 백엔드 쿼리에 안 들어간다.
- **기본 정렬이 모집 상태와 무관** — 모집이 끝난 동아리가 모집중 동아리 위에 노출되어 탐색 효율이 떨어진다.

`displayStatus`(`UPCOMING/OPEN/ALWAYS_OPEN/CLOSED`)는 [[2026-05-18-recruitment-integration-and-always-open-design]] 에서 BE 도메인까지 도입되었으나 **학생 목록 카드/필터에는 적용되지 않았다.** 본 spec 이 그 갭을 메운다.

**목표**: `/clubs` 카드의 모집 상태/기간을 정확히 표시하고, 모집 상태 필터를 실제 동작시키며, 기본 정렬을 모집 상태 우선순으로 바꾼다.

---

## 2. 범위

### In scope
- BE: `ClubSummaryResponse` 에 `activeRecruitment` 중첩 객체 추가 (displayStatus + 기간)
- BE: `GET /api/v1/clubs` 에 `recruitmentStatus` 필터 파라미터 추가 (값: `AVAILABLE | UPCOMING | CLOSED`)
- BE: 기본 정렬(`ClubSortOption.RECENT`)을 "모집 상태 그룹 + 그룹내 보조 정렬"로 재정의
- BE: 기존 `recruiting: boolean` 파라미터는 하위 호환을 위해 유지하되 deprecated 처리
- FE: `exploreParams` 의 필터 타입 확장(`전체 | 지원가능 | 모집예정 | 모집마감`)
- FE: `ClubExplorePage` 필터 칩 UI 갱신 (상시모집 옵션 통합)
- FE: `ClubCard` 의 모집 상태 뱃지/기간 렌더링을 `activeRecruitment.displayStatus` 기반으로 수정
- FE: `clubAdapter.summaryToClub` 의 잘못된 `deriveStatus` 로직 제거

### Out of scope
- 활동 요일(`Club.activeDays`) 필터 — 데이터 형식 정리 선행 필요. 별도 라운드.
- 즐겨찾기 count 기반 인기순 정렬 — 별도 라운드.
- `/clubs/[id]` 상세 페이지의 모집 카드 — [[2026-05-18-recruitment-integration-and-always-open-design]] §4 에서 다룸.
- 어드민 콘솔의 모집 상태 필터 — 어드민은 모집 도메인 자체에서 관리, 본 spec 은 학생 측만.
- 모집이력이 한 번도 없는 동아리를 별도 필터로 노출하는 기능 — "전체" 외에는 자동 제외, 카드에서 "모집 없음" 표시만.

---

## 3. 데이터 모델

### 3.1 `ClubSummaryResponse.activeRecruitment` 신설

```java
public record ClubSummaryResponse(
        Long clubId,
        String name,
        // ... 기존 필드
        ActiveRecruitmentSummary activeRecruitment  // 추가, null 가능
) {
    public record ActiveRecruitmentSummary(
            Long recruitmentId,
            RecruitmentDisplayStatus displayStatus,  // UPCOMING / OPEN / ALWAYS_OPEN / CLOSED
            LocalDate startDate,
            LocalDate endDate                         // 상시모집이면 null
    ) {}
}
```

**선택 규칙** (동아리당 1건):

1. `isEffectivelyOpen = true` (status=OPEN ∧ (endDate IS NULL ∨ endDate ≥ today)) 인 모집이 있으면 그 중 가장 최근에 생성된 것
2. 위 조건의 모집이 없으면, 가장 최근에 마감된 모집 (`endDate DESC`)
3. 모집 이력이 한 번도 없으면 `null`

규칙 1은 운영 가정상 동아리당 동시 진행 모집은 1건이므로 사실상 유일하다. 다중일 경우의 안전망으로 `createdAt DESC LIMIT 1`.

### 3.2 `RecruitmentStatusFilter` enum 신설

```java
package com.duing.domain.club.service.dto.query;

public enum RecruitmentStatusFilter {
    /** OPEN ∨ ALWAYS_OPEN — 사용자 관점 "지금 지원 가능" */
    AVAILABLE,
    /** UPCOMING */
    UPCOMING,
    /** CLOSED (활성 모집 없는 동아리 제외, 과거 마감 이력만 매칭) */
    CLOSED
}
```

`null` 이면 필터 미적용(전체 동아리). [[2026-05-24-student-clubs-explore-redesign-design]] 의 `ClubSortOption` 과는 별개의 enum.

### 3.3 `ClubSearchCondition` 확장

```java
public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting,                           // deprecated, AVAILABLE 으로 매핑
        RecruitmentStatusFilter recruitmentStatus,    // 추가
        Boolean centralClub,
        College college,
        ClubSortOption sortOption
) { ... }
```

서비스 계층에서 `recruiting == true ∧ recruitmentStatus == null` 이면 `recruitmentStatus = AVAILABLE` 로 채워 호환 처리.

---

## 4. 정렬 규칙 재정의

`ClubSortOption.RECENT` 의 의미를 "모집 상태 그룹 + 그룹 내 보조 정렬" 로 바꾼다 (기존 의미는 사용처가 없어 안전).

### 4.1 그룹 우선순위 (1차 정렬)

| 순위 | 그룹 | 조건 |
|---|---|---|
| 1 | OPEN | `displayStatus = OPEN` |
| 2 | ALWAYS_OPEN | `displayStatus = ALWAYS_OPEN` |
| 3 | UPCOMING | `displayStatus = UPCOMING` |
| 4 | CLOSED | `displayStatus = CLOSED` |
| 5 | (모집 없음) | `activeRecruitment IS NULL` |

### 4.2 그룹 내 보조 정렬 (2차)

| 그룹 | 2차 정렬 | 근거 |
|---|---|---|
| OPEN | `endDate ASC` | 마감 임박 우선 |
| ALWAYS_OPEN | `club.createdAt DESC` | 최신 등록 우선 |
| UPCOMING | `startDate ASC` | 시작 임박 우선 |
| CLOSED | `endDate DESC` | 최근 마감 우선 |
| (모집 없음) | `club.createdAt DESC` | 최신 등록 우선 |

### 4.3 다른 정렬 옵션과의 관계

- `DEADLINE_SOON` — 명세 그대로 (활성 모집 마감 임박순, 모집 없는 동아리 마지막). 그룹 우선순위 미적용.
- `ALPHABETICAL` — 명세 그대로 (이름 가나다순). 그룹 우선순위 미적용.

---

## 5. API 계약

### 5.1 `GET /api/v1/clubs` (확장)

신규 파라미터:

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `recruitmentStatus` | `AVAILABLE \| UPCOMING \| CLOSED` (optional) | 미지정 시 전체. `AVAILABLE` 은 OPEN+ALWAYS_OPEN. `CLOSED` 는 활성 모집 없는 동아리 제외. |

기존 파라미터 변경:

- `recruiting: boolean` — **deprecated**. `recruitmentStatus` 가 지정되면 무시. 단독 사용 시 `true` → `AVAILABLE`, `false` → 활성 모집 없는 동아리(모집 없음 + CLOSED) 로 호환 처리.

응답 변경 — `ClubSummary` 항목에 `activeRecruitment` 객체 추가 (3.1 참조).

### 5.2 호환성 노트

기존 클라이언트(있다면)가 `recruiting=true` 만 보낼 경우 동일 결과(`AVAILABLE`)를 받는다. 신규 응답 필드 `activeRecruitment` 는 기존 클라이언트가 무시해도 무방.

---

## 6. FE 상세 설계

### 6.1 `app/clubs/_lib/exploreParams.ts`

```ts
export type RecruitmentFilter = 'all' | 'available' | 'upcoming' | 'closed';

export const RECRUITMENT_LABEL: Record<RecruitmentFilter, string> = {
  all: '전체',
  available: '지원가능',
  upcoming: '모집예정',
  closed: '모집마감',
};
```

- `ExploreParams.recruitment` 의 타입을 위 union 으로 교체. 기본값 `'all'`.
- `toApiParams` 매핑:
  - `'all'` → 파라미터 미전송
  - `'available'` → `recruitmentStatus=AVAILABLE`
  - `'upcoming'` → `recruitmentStatus=UPCOMING`
  - `'closed'` → `recruitmentStatus=CLOSED`
- `recruiting` 파라미터는 더 이상 사용하지 않음(클라이언트에서 제거).

### 6.2 `ClubExplorePage.tsx`

- 모집 필터 영역(현 라인 253~262) 의 옵션 배열을 `['all', 'available', 'upcoming', 'closed']` 로 교체.
- 기본 선택 상태는 `'all'`.

### 6.3 `packages/types/src/club.ts`

```ts
export type RecruitmentDisplayStatus = 'UPCOMING' | 'OPEN' | 'ALWAYS_OPEN' | 'CLOSED';

export type ActiveRecruitmentSummary = {
  recruitmentId: number;
  displayStatus: RecruitmentDisplayStatus;
  startDate: string;        // ISO date
  endDate: string | null;
};

export type ClubSummary = {
  // ... 기존 필드
  activeRecruitment: ActiveRecruitmentSummary | null;
};
```

### 6.4 `app/clubs/_lib/clubAdapter.ts`

- `deriveStatus(summary)` 의 `summary.status === 'ACTIVE' ? 'open' : 'closed'` 로직 **삭제**.
- 카드용 상태값은 `activeRecruitment?.displayStatus ?? null` 로 직매핑.
- `deadline`/`openDate` 의 `'—'` 하드코딩 제거 — 카드 컴포넌트가 null 처리.

### 6.5 `app/clubs/_components/ClubCard.tsx`

뱃지 라벨:

| displayStatus | 라벨 | 톤 |
|---|---|---|
| OPEN | `모집중` | accent |
| ALWAYS_OPEN | `상시모집` | accent |
| UPCOMING | `모집예정` | neutral |
| CLOSED | `모집마감` | muted |
| null | `모집 없음` | muted |

기간 줄 렌더링 (상태별 분기):

| displayStatus | 표시 |
|---|---|
| OPEN | `모집 MM.DD - MM.DD` (startDate - endDate) |
| ALWAYS_OPEN | `상시모집` |
| UPCOMING | `MM.DD부터 모집` (startDate) |
| CLOSED | `모집 종료` |
| null | 기간 줄 자체 숨김 |

날짜 포맷터는 `apps/web/app/_lib/date.ts` 에 `formatMonthDay(iso: string)` 헬퍼 추가.

---

## 7. BE 상세 설계

### 7.1 변경 파일 (PR-A)

- `backend/src/main/java/com/duing/domain/club/service/dto/query/RecruitmentStatusFilter.java` (신규)
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java` — `recruitmentStatus` 필드 추가
- `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubSummaryResponse.java` — `activeRecruitment` 추가 + 중첩 record `ActiveRecruitmentSummary`
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java`
  - `searchClubs` 쿼리에 활성 모집 1건 + 마감 이력 1건을 함께 fetch 하는 보조 쿼리 (N+1 회피)
  - `recruitmentStatus` 필터 BooleanExpression
  - `sortOption = RECENT` 시 그룹 우선순위 + 보조 정렬 OrderSpecifier 적용
- `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` (또는 api 인터페이스) — `@RequestParam RecruitmentStatusFilter recruitmentStatus`
- `backend/src/main/java/com/duing/domain/club/service/ClubSearchService.java` — `recruiting` 하위호환 매핑

### 7.2 N+1 회피 전략

ClubSummary 매핑 시 동아리 N건당 모집 lookup N회를 막기 위해:

```sql
-- 의사 SQL (실제는 QueryDSL)
SELECT c.*, r.*
FROM club c
LEFT JOIN LATERAL (
  SELECT id, display_status_computed, start_date, end_date
  FROM recruitment
  WHERE club_id = c.id
  ORDER BY
    CASE WHEN status = 'OPEN' AND (end_date IS NULL OR end_date >= :today) THEN 0 ELSE 1 END,
    end_date DESC NULLS FIRST,
    created_at DESC
  LIMIT 1
) r ON true
WHERE ...
```

`display_status_computed` 는 별도 컬럼이 아니라 SQL CASE 식 (entity 의 `RecruitmentDisplayStatus.resolve()` 와 동일 규칙). PostgreSQL `LATERAL JOIN` 이 QueryDSL 표현이 어려우면 두 번째 쿼리로 club id 묶음에 대한 `IN` lookup + 매핑 어댑터를 둔다.

---

## 8. 테스트 전략

### 8.1 BE

- `ClubSearchControllerTest` (기존 확장 또는 신규)
  - 각 `recruitmentStatus` 값별 결과 검증 (AVAILABLE → OPEN+ALWAYS_OPEN, UPCOMING, CLOSED, 미지정)
  - `recruiting=true` 하위호환 동작
  - `activeRecruitment` 응답 매핑 — 활성/마감/없음 3 케이스
- `ClubSearchSortTest` (신규)
  - 기본 정렬: 5개 그룹 순서 검증
  - 각 그룹내 2차 정렬 검증

### 8.2 FE

- `exploreParams.test.ts` — `recruitment` 라운드 트립 (URL ↔ ExploreParams ↔ ApiParams)
- `ClubCard` 스냅샷/렌더링 테스트 — 5개 displayStatus 케이스의 뱃지/기간 라벨

---

## 9. PR 분할 계획

### PR-A (BE): 모집 정보 노출 + 필터 + 정렬 재정의
- 브랜치: `feat/club-summary-active-recruitment`
- 변경: §7.1 파일들 + §8.1 테스트
- 머지 후 PR-B 분기

### PR-B (FE): 모집 상태 필터 UI + 카드 표시 수정
- 브랜치: `feat/clubs-recruitment-status-filter`
- 변경: §6.1~6.5 파일들 + §8.2 테스트

---

## 10. PR self-check (CLAUDE.md / 메모리)

각 PR 머지 직전 확인:

- [ ] 시크릿 / 환경변수 코드 내 미포함
- [ ] 의사코드 미포함 — 모든 메서드 본문 완전 구현
- [ ] 변수명 명확 — `r`, `dto` 같은 축약 금지
- [ ] BE: api 인터페이스 우선 작성 → Controller implements 패턴 준수
- [ ] BE: `@Transactional(readOnly=true)` 기본, FetchType.LAZY
- [ ] BE: Flyway 신규 파일 추가 없음 (스키마 변경 없음 — `display_status` 는 도출값)
- [ ] FE: TanStack Query 외 `useState/useEffect` 로 서버 상태 관리 금지
- [ ] FE: `as` 타입 단언, `any` 사용 없음
- [ ] FE: `function` 키워드 + `type` 선언 컨벤션
- [ ] 커밋 메시지: `feat(backend): ...` / `feat(frontend): ...` Conventional Commits
- [ ] PR 본문에 Co-Authored-By / Claude 어트리뷰션 금지

---

## 11. 리스크 / 체크 포인트

- **모집 lookup 성능** — 동아리 N건당 모집 1건 lookup. `(club_id, status, end_date)` 인덱스 확인 필요. 없다면 별도 인덱스 추가 검토.
- **기본 정렬 의미 변경** — `ClubSortOption.RECENT` 의 의미가 바뀐다. 호출 사이트(어드민 콘솔, 다른 페이지)에서 `RECENT` 를 등록일 기준으로 기대하는 곳이 없는지 grep 필수. 있다면 별도 옵션 분리 검토.
- **하위호환 `recruiting` 파라미터** — FE 전 사용처 제거 후 다음 라운드에 BE 에서 완전히 제거. 본 PR 에서는 deprecated 어노테이션만.
- **`displayStatus` 계산 시점** — BE 응답 시점의 `today` 기준. 클라이언트 시간대와 차이 발생 가능 (서버 KST 기준 권장).

---

## 12. 후속(다음 라운드 후보)

- `recruiting` 파라미터 완전 제거 (FE 사용처 정리 후)
- 활동 요일 필터 (`Club.activeDays` 데이터 정리 선행)
- 즐겨찾기 count 기반 인기순 정렬
- 모집 마감 이력이 한 번도 없는 동아리만 모아 보는 별도 뷰
