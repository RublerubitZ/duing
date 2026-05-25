# `/clubs` 탐색 흐름 정비 (학생 영역 P1)

작성일: 2026-05-24
도메인: 학생 탐색 흐름 — `/clubs` 목록 페이지 + Club 검색 API

---

## 1. 배경 & 목표

학생 탐색 흐름(`/` → `/clubs` → `/clubs/[id]`) 중 **`/clubs` 목록 페이지** 가 현재 가장 큰 개선 여지를 안고 있다. 코드 인스펙션으로 확인된 명확한 결함:

- **준비 중 필터 3 종이 UI 에 노출**: 활동 요일 / 단과대학 / 정렬 옵션 — 시각적으로는 활성처럼 보이지만 `disabled` 상태. 사용자에게 "되는 기능"으로 오인 가능.
- **scope(중앙/과) 필터가 클라이언트 후처리**: 백엔드에 scope 파라미터가 없어 페이지 결과(20개)를 받은 뒤 일부만 화면에 노출. **페이지네이션 정합성이 깨짐** — 페이지당 표시 개수가 fluctuate 한다. 코드 주석에서도 인지 (`ClubExplorePage.tsx:107`).
- **단과대학 칩 비동작** (`line 250`): onClick 없이 시각 효과만. `COLLEGES` 하드코딩.
- **view toggle (grid/list)**: 두 버튼 다 클릭 가능하지만 실제 모드 전환 없음.
- **명칭 부정확**: 사용자 시야에서 "과동아리" 로 표시되지만 정식 명칭은 "학과동아리". scope 식별자 `'과'` 한 글자도 데이터 모델 의미 빈약.

**목표**: `/clubs` 의 핵심 필터(scope · division · college · sort) 를 백엔드까지 일관되게 동작시키고, "준비 중" placeholder 와 명칭 혼란을 정리한다.

---

## 2. 범위

### In scope
- BE: `Club.college` 컬럼 추가, `ClubSearchCondition` 확장(centralClub / college / sortOption), 학생 측 `GET /clubs` 파라미터 확장
- BE: `ClubSortOption` enum (DEADLINE_SOON / RECENT / ALPHABETICAL) + repository 정렬 분기
- BE: 어드민 콘솔의 클럽 생성/수정에서 college 입력 받도록 일관성 유지
- FE: `ClubExplorePage` 클라이언트 후처리 제거, 단과대학 칩 활성화, 정렬 드롭다운 활성화, view toggle 제거, "준비 중" placeholder 정리
- FE: 명칭 일괄 교체 ("과동아리" → "학과동아리", scope 코드 `'과'` → `'학과'`)
- FE: BE `College` enum 미러 + displayName 매핑 헬퍼
- 어드민 콘솔 FE: 동아리 생성/수정 폼에 단과대학 드롭다운 추가

### Out of scope
- 활동 요일 필터: `Club.activeDays` 가 `VARCHAR(50)` free text 라 검색용으로 쓰려면 데이터 형식 정리 선행 필요. 다음 라운드.
- 인기순(즐겨찾기 count) 정렬: favorite 테이블 join 비용 검토 후 별도.
- `/` 홈 mock 의존 정리(`FeaturedClubs` / `RecruitmentTicker` / `Categories` 의 정적 데이터): 별도 라운드.
- `/clubs/[id]` 상세 페이지 정보 우선순위 재배치: 별도 라운드.
- 기존 동아리 데이터의 `college` 컬럼 backfill: 어드민이 화면에서 한 건씩 채워 넣는 방식으로 운영. 대량 backfill 마이그레이션 작성하지 않는다.

---

## 3. 데이터 모델

### 3.1 명칭·식별자

- 한국어 표시명: **"중앙동아리"** / **"학과동아리"** (UI 표시 레이어 전용)
- FE scope 식별자: `'전체' | '중앙' | '학과'`
- BE 검색 파라미터: `centralClub: Boolean | null` + `college: College | null` (영문, snake/camel 컨벤션 그대로)
- **학과동아리 정의**: `centralClub = false` 인 동아리. `college` 필드가 소속 단과대학을 가리킨다.

### 3.2 `Club.college` 컬럼 신설

```sql
-- Flyway V33
ALTER TABLE club ADD COLUMN college VARCHAR(40);
COMMENT ON COLUMN club.college IS
  '학과동아리(centralClub=false) 의 소속 단과대학. 중앙동아리는 null. user.College enum 코드와 동일.';
```

- 컬럼 nullable. 기존 행은 일괄 null 로 시작 — 어드민이 콘솔에서 단과대학을 골라 채워 넣는다.
- 값은 `com.duing.domain.user.entity.College` enum 코드(예: `IT_ENGINEERING`). 동일 enum 을 club 도메인에서도 import 해서 재사용한다.

### 3.3 `ClubSortOption` enum 신설

```java
package com.duing.domain.club.service.dto.query;

public enum ClubSortOption {
    /** 활성 모집의 마감일이 가까운 순. 모집 없는 동아리는 마지막. */
    DEADLINE_SOON,
    /** 등록일(createdAt) DESC. 기본값. */
    RECENT,
    /** 이름 가나다순 ASC. */
    ALPHABETICAL
}
```

### 3.4 `ClubSearchCondition` 확장

```java
public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword,
        List<String> tags,
        Boolean recruiting,
        Boolean centralClub,     // 추가 — null 이면 scope 필터 미적용
        College college,         // 추가 — null 이면 학과 필터 미적용
        ClubSortOption sortOption // 추가 — null 이면 RECENT 로 폴백
) { ... }
```

---

## 4. API 계약

### 4.1 학생 측 `GET /api/v1/clubs` (확장)

기존 파라미터(`category`, `division`, `keyword`, `tags`, `recruiting`, `page`, `size`) 에 추가:

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `centralClub` | `boolean?` | `true` = 중앙만, `false` = 학과만, 미지정 = 전체 |
| `college` | `College?` | enum 코드 (예: `IT_ENGINEERING`). 학과 scope 일 때만 유의미. |
| `sort` | `ClubSortOption?` | `DEADLINE_SOON` / `RECENT`(기본) / `ALPHABETICAL` |

### 4.2 어드민 측 `POST /api/v1/admin/clubs` + `PUT /api/v1/admin/clubs/{id}` (확장)

`CreateClubRequest` / `UpdateClubRequest` 에 `college: College?` 추가. `centralClub` 토글은 별도 PATCH 가 이미 존재 — 그쪽은 변경 없음.

---

## 5. PR 분리 계획

CLAUDE.md "API 1개 = 1 PR" 원칙을 고려해 다음 4 개 PR 로 쪼갠다. 모두 `develop` 에서 분기 / `develop` 으로 PR.

### PR-1 (BE): `Club.college` 컬럼 + 학생 검색 조건 확장
- `feat/club-college-and-scope-search-api`
- V33 마이그레이션 / Club 엔티티 / Club.create·update·UpdatePayload / Create·UpdateClubRequest / Create·UpdateClubCommand / ClubSearchCondition / ClubRepository QueryDSL / GET /clubs 컨트롤러 파라미터
- 통합테스트: `ClubSearchControllerTest` 신규 — scope/division/college 매트릭스

### PR-2 (BE): `ClubSortOption` + 정렬 분기
- `feat/club-sort-option-api`
- ClubSortOption enum / ClubSearchCondition 에 sortOption 추가 / repository 정렬 분기 / 컨트롤러 `sort` 파라미터
- 통합테스트: 각 정렬 옵션이 의도된 순서로 반환

### PR-3 (FE): 어드민 콘솔의 단과대학 입력 추가
- `feat/admin-club-college-input`
- AdminClubCreateForm / AdminClubEditForm 에 College 드롭다운 + 미러 enum + displayName 매핑
- BE PR-1 머지 후 시작

### PR-4 (FE): `/clubs` 탐색 페이지 재구성
- `feat/clubs-explore-redesign`
- exploreParams 확장 (`scope` 라벨 `'학과'`, `college` / `sort` 추가, URL 직렬화 갱신)
- `ClubExplorePage` 후처리 제거, 단과대 칩 활성화, 정렬 드롭다운 활성화, view toggle 제거, "과동아리" → "학과동아리" 일괄 교체
- ClubCard / ClubScope 타입 / clubAdapter / clubs.ts / _mocks.ts 의 scope 값 모두 `'학과'` 로 교체
- BE PR-1, PR-2 머지 후 시작

---

## 6. FE 상세 설계

### 6.1 `app/clubs/_lib/exploreParams.ts`

- `Scope = '전체' | '중앙' | '학과'` 로 변경
- `College` (BE enum 미러) 타입 추가
- `ExploreParams` 에 `college: College | undefined`, `sort: ClubSortOption` 추가
- `parseExploreParams` / `serializeExploreParams` / `toApiParams` 가 새 필드 처리
  - `toApiParams` 가 `scope='중앙'` → `centralClub=true`, `scope='학과'` → `centralClub=false` 매핑
- URL 키: `?scope=학과&college=IT_ENGINEERING&sort=DEADLINE_SOON`

### 6.2 `ClubExplorePage.tsx`

- `visibleClubs` 후처리 (`line 109~122`) 제거. `clubListQuery.data?.content ?? []` 를 그대로 매핑.
- scope 칩 라벨: `'중앙' → '중앙동아리'`, `'학과' → '학과동아리'`
- 학과 scope 선택 시 단과대학 칩 영역: `Object.values(College).map(...)` (FE 미러), 각 칩 클릭 → `updateParams({ college, page: 1 })`. 현 `COLLEGES` 하드코딩 제거.
- 사이드 필터의 단과대학 그룹: 동일 College enum 사용, `disabled` 제거.
- 정렬 드롭다운: `<select>` (또는 기존 dropdown 컴포넌트) — 옵션 3 개, onChange → `updateParams({ sort })`. `disabled` 제거.
- view toggle (grid/list) 두 버튼 영역 자체 삭제. 항상 grid.
- 활동 요일 필터 영역: 시각적 placeholder 만 유지하되 "곧 출시 — 활동 요일로 필터링하실 수 있게 준비 중입니다." 안내문 명확화.

### 6.3 `app/clubs/_components/ClubCard.tsx`

- 카드 우상단 뱃지 `'🏛️ 중앙' | '학과'` — `'과' → '학과'` 교체.

### 6.4 `app/clubs/_lib/clubs.ts`, `clubAdapter.ts`, `app/_mocks.ts`

- `ClubScope = '중앙' | '학과'` 통일.
- `clubAdapter.summaryToClub`: `centralClub ? '중앙' : '학과'`.
- `_mocks.ts` 의 `scope` 필드 같은 형태로 정정.

### 6.5 College enum 미러 (신설)

`packages/types/src/club.ts` 에 BE `College` enum 의 14 개 값을 string literal union 으로 추가하고, displayName 매핑은 `apps/web/app/_lib/college.ts` 에 둔다. 어드민 콘솔과 학생 측 탐색 페이지 양쪽에서 import 해 같은 라벨을 노출하도록 한다.

```ts
// packages/types/src/club.ts
export type College = 'PUBLIC_LEADERS' | 'GLOBAL_BUSINESS' | … | 'FREE_MAJOR';

// apps/web/app/_lib/college.ts
export const COLLEGE_OPTIONS: { code: College; label: string }[] = [
  { code: 'IT_ENGINEERING', label: 'IT·공과대학' },
  // … 14 개
];
export function collegeDisplayName(code: College): string { ... }
```

---

## 7. BE 상세 설계

### 7.1 PR-1 변경 파일

- `backend/src/main/resources/db/migration/V33__alter_club_add_college.sql` (신규)
- `backend/src/main/java/com/duing/domain/club/entity/Club.java` — `@Enumerated(EnumType.STRING) private College college;` 추가, `create` / `UpdatePayload` / `update` 시그니처 확장
- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSearchCondition.java` — `centralClub`, `college` 필드
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepositoryImpl.java` (또는 QueryDSL 구현체) — `centralClub`, `college` BooleanExpression
- `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` (또는 api 인터페이스) — `@RequestParam Boolean centralClub`, `@RequestParam College college`
- `backend/src/main/java/com/duing/domain/club/api/AdminClubApi.java` + `CreateClubRequest` / `UpdateClubRequest` — `college` 입력
- `backend/src/main/java/com/duing/domain/club/service/dto/command/{Create,Update}ClubCommand.java` — `college` 필드

### 7.2 PR-2 변경 파일

- `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubSortOption.java` (신규)
- `ClubSearchCondition` 에 `sortOption: ClubSortOption` 추가 (기본값 처리는 service 단에서)
- `ClubRepositoryImpl` 정렬 분기:
  - `DEADLINE_SOON`: `LEFT JOIN recruitment r ON r.club_id = c.id AND r.status = 'OPEN'`, `ORDER BY r.end_date ASC NULLS LAST`
  - `RECENT`: `ORDER BY c.created_at DESC`
  - `ALPHABETICAL`: `ORDER BY c.name ASC`
- 컨트롤러 `@RequestParam ClubSortOption sort`

### 7.3 어드민 API 응답 DTO

`AdminClubSummaryQuery` / `AdminClubSummaryResponse` / `ClubDetailQuery` / `ClubDetailResponse` 에 `college` 필드 노출. 어드민 콘솔과 학생 측 상세 모두 표시 가능.

---

## 8. 테스트 전략

### 8.1 BE

- `ClubSearchControllerTest` (신규, PR-1)
  - `centralClub=true` 시 학과동아리 제외
  - `centralClub=false&college=IT_ENGINEERING` 시 해당 단과대 학과동아리만
  - `centralClub` 미지정 시 전체
- `ClubSearchSortTest` (신규, PR-2) — 각 sort 옵션의 순서 검증, `DEADLINE_SOON` 의 null last 동작
- 기존 통합테스트 회귀 — `College` enum 의 새 필드가 직렬화에 빈 응답을 만들지 않는지

### 8.2 FE

- `exploreParams.test.ts` (있다면) 라운드 트립: URL ↔ ExploreParams ↔ ApiParams
- `ClubExplorePage` 통합테스트(있다면) — scope 칩 클릭 → URL 갱신 → API 파라미터 반영 검증

---

## 9. PR self-check (CLAUDE.md / AGENTS.md)

각 PR 머지 직전 확인:

- [ ] 시크릿 / 환경변수 코드 내 미포함
- [ ] 의사코드 미포함 — 모든 메서드 본문 완전 구현
- [ ] 변수명 명확 — `dto`, `r`, `e` 같은 축약 금지
- [ ] BE: api 인터페이스 우선 작성 → Controller implements 패턴 준수
- [ ] BE: `@Builder` private, FetchType.LAZY, `@Transactional(readOnly=true)` 기본
- [ ] BE: Flyway V33 신규 파일 추가 (기존 파일 수정 금지)
- [ ] FE: TanStack Query 외 `useState/useEffect` 로 서버 상태 관리 금지
- [ ] FE: `as` 타입 단언, `any` 사용 없음
- [ ] FE: `function` 키워드 + `type` 선언 컨벤션
- [ ] 커밋 메시지: `feat(backend): ...` / `feat(frontend): ...` Conventional Commits
- [ ] PR 본문에 Co-Authored-By / Claude 어트리뷰션 금지

---

## 10. 후속(다음 라운드 후보)

본 spec 의 out of scope 중 다음 라운드 후보:

1. `Club.activeDays` 데이터 형식 정리 + 요일 필터 BE/FE
2. 즐겨찾기 count 기반 인기순 정렬
3. `/` 홈 mock 의존 세그먼트(`FeaturedClubs` / `RecruitmentTicker` / `Categories`) 실제 데이터 연결
4. `/clubs/[id]` 상세 페이지 정보 우선순위 재배치
