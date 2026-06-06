# `/clubs` 활동요일 필터 활성화

작성일: 2026-06-06
도메인: 학생 탐색 흐름 — `/clubs` 목록 페이지 + `GET /api/v1/clubs`

---

## 1. 배경 & 목표

`/clubs` 탐색 페이지의 좌측 필터 패널에는 활동요일 (월~일) 토글 UI 가 이미 그려져 있으나 `disabled` 상태로 잠겨있다. `ClubExplorePage.tsx:282-297` 에 "활동 요일 필터는 다음 업데이트에 추가될 예정입니다." 안내가 박혀있는 상태.

데이터는 이미 갖춰져 있다:
- `Club.activeDays` (`active_days VARCHAR(50)` CSV, `"MONDAY,WEDNESDAY,FRIDAY"` 형태)
- `ClubDetailResponse.activeDays: ClubDayOfWeek[]` 노출 + 상세 페이지에서 표시 중

[[2026-05-24-student-clubs-explore-redesign-design]] 시점에 활동요일 필터는 "데이터 형식 정리 선행 필요" 로 명시적 Out of scope 였다. 이번 라운드에서 그 갭을 메운다 — 단, 저장 구조는 그대로 두고 검색만 얹는다.

**목표**: 학생이 원하는 활동 요일을 다중 선택해 동아리를 필터링할 수 있게 한다.

- 단일 요일: 월요일에 활동하는 동아리만
- 다중 요일 (OR): 월 또는 수요일에 활동하는 동아리

---

## 2. 범위

### In scope
- BE: `GET /api/v1/clubs` 에 `activeDays: List<DayOfWeek>` 쿼리 파라미터 추가 (반복 스타일)
- BE: `ClubSearchCondition` 에 `Set<DayOfWeek> activeDays` 필드 + 정규화 헬퍼
- BE: `ClubRepositoryImpl` 에 `activeDaysOverlap()` predicate 추가 — OR 매칭
- BE: HQL 함수 등록 변경 여부 결정 (§7 deferred decision)
- FE: `ClubSearchParams.activeDays?: ClubDayOfWeek[]` 추가, API 클라이언트 반복 파라미터 직렬화
- FE: `ExploreParams.activeDays`, URL 파싱·직렬화 (`?activeDays=MONDAY&activeDays=WEDNESDAY`)
- FE: `ClubExplorePage` 의 요일 토글 활성화, 액티브 필터 칩 노출, 안내 문구 제거
- FE/BE 테스트: §6

### Out of scope
- `active_days` 컬럼을 native `text[]` 로 마이그레이션 — 별도 후속 이슈로 트래킹
- 활동 시간대 (오전/오후/저녁) 필터 — 데이터 자체가 없음
- 활동요일 기반 정렬 — 활동요일은 카디널리티 7, 정렬 의미 약함
- 어드민 콘솔의 활동요일 필터 — 어드민은 별도 흐름

---

## 3. 검색 의미론

**OR 매칭으로 확정.**

월·수 선택 시:
- ✓ 알고리즘 (월,수,금) — 월·수 둘 다 일치
- ✓ 영화감상 (월) — 월만 일치
- ✓ 농구 (수) — 수만 일치
- ✗ 봉사 (화,목) — 어떤 요일도 미일치

근거:
1. UX — 학생이 "내가 가능한 요일" 을 체크하는 흐름. 가능 요일을 늘릴수록 결과가 줄어드는 AND 는 직관 반대.
2. 일관성 — 기존 `tags` 필터가 OR (`array_overlap_text`) 로 동작.
3. 일반적 동아리 탐색 UX (Linkareer 등) 가 OR.

### 정규화 규칙
- **빈 선택 (`size == 0`)** → 필터 미적용
- **7개 모두 선택 (`size == 7`)** → 필터 미적용 (의미상 동일, 쿼리·URL 단순화)
- **`active_days` 가 NULL 인 동아리** → 필터 적용 시 결과에서 **제외** (활동요일 미설정). 필터 미적용 시는 포함.

---

## 4. API 명세

```
GET /api/v1/clubs?activeDays=MONDAY&activeDays=WEDNESDAY
```

| 항목 | 값 |
|---|---|
| 파라미터명 | `activeDays` |
| 타입 | `List<DayOfWeek>` (Java) / `ClubDayOfWeek[]` (TS) |
| 직렬화 스타일 | 반복 (`?activeDays=A&activeDays=B`) — 기존 `tags` 와 동일 |
| 필수 여부 | optional |
| 의미 | OR 매칭 |
| 잘못된 enum 값 | Spring 기본 `MethodArgumentTypeMismatchException` → 400 (기존 `ClubCategory` 와 동일) |
| Swagger 설명 | `"활동요일 다중 (OR 매칭). 선택 요일 중 하나라도 포함하면 매칭. 미지정/전체 선택 시 필터 미적용."` |

### 다른 파라미터 모양을 채택하지 않은 이유

- **CSV 단일 (`?activeDays=MONDAY,WEDNESDAY`)** — Spring 기본 바인딩이 enum 리스트의 CSV split 을 자동 처리하지 않아 별도 컨버터 필요. 기존 컨벤션 (`tags`) 과도 불일치.
- **명시적 단일 (`?activeDays=MONDAY`)** — 다중 선택 표현 불가. 학생 UX 핵심 요구를 못 채움.

---

## 5. 구현 계획

### 5-1. Backend

**5-1-1. DB**
- 스키마 변경 없음. Flyway 마이그레이션 불필요.

**5-1-2. HQL 함수 등록** — §7 deferred decision 참조. 현 권장안 (A1) 기준 변경 1줄. 빈 문자열 레거시 방어를 위해 `nullif` 포함 (§9.2):

```java
// PostgresFunctionContributor.java
functionContributions.getFunctionRegistry().registerPattern(
        "array_overlap_csv",
        "(string_to_array(nullif(?1, ''), ',') && string_to_array(?2, ','))",
        booleanType
);
```

**5-1-3. 변경 파일 목록**

| 파일 | 변경 |
|---|---|
| `global/config/PostgresFunctionContributor.java` | `array_overlap_csv` 등록 (A1 채택 시) |
| `domain/club/api/ClubApi.java` | `getClubs(...)` 시그니처에 `@RequestParam(required=false) List<DayOfWeek> activeDays` 추가 + Swagger 파라미터 설명 |
| `domain/club/controller/ClubController.java` | 동일 파라미터 수신. `ClubSearchCondition` 생성자 호출 시 `activeDays == null ? null : Set.copyOf(activeDays)` 로 `List → Set` 변환하여 전달 (요일 중복 방어) |
| `domain/club/service/dto/query/ClubSearchCondition.java` | `Set<DayOfWeek> activeDays` 필드 추가. `hasActiveDays()`, `effectiveActiveDays()` 헬퍼 |
| `domain/club/repository/ClubRepositoryImpl.java` | `activeDaysOverlap(Set<DayOfWeek>)` 메서드 추가 + predicates 배열 합류 |

**5-1-4. `ClubSearchCondition` 헬퍼**

```java
public Set<DayOfWeek> effectiveActiveDays() {
    if (activeDays == null || activeDays.isEmpty() || activeDays.size() == 7) {
        return null;  // 7개 = 미적용으로 정규화
    }
    return activeDays;
}
```

생성자 측 시그니처 변경에 따라 `record` 의 component 추가는 기존 호출 사이트 (`ClubController.getClubs`, 테스트) 도 함께 갱신해야 함.

**5-1-5. `ClubRepositoryImpl.activeDaysOverlap`**

```java
private BooleanExpression activeDaysOverlap(Set<DayOfWeek> days) {
    if (days == null) return null;
    String csv = days.stream()
            .map(DayOfWeek::name)
            .collect(Collectors.joining(","));
    return Expressions.booleanTemplate(
            "function('array_overlap_csv', {0}, {1}) = true",
            club.activeDays,
            csv
    );
}
```

`predicates` 배열에 합류:

```java
BooleanExpression[] predicates = {
        club.status.eq(ClubStatus.ACTIVE),
        categoryEq(condition.category()),
        divisionEq(condition.division()),
        keywordContains(condition.keyword()),
        tagsOverlap(condition.tags()),
        recruitmentStatusFilter(effectiveStatus),
        centralClubEq(condition.centralClub()),
        collegeEq(condition.college()),
        activeDaysOverlap(condition.effectiveActiveDays()),  // NEW
};
```

### 5-2. Frontend

| 파일 | 변경 |
|---|---|
| `packages/types/src/club.ts` | `ClubSearchParams.activeDays?: ClubDayOfWeek[]` |
| `packages/api/src/client.ts` | `clubs.list(...)` 내부 searchParams 빌더에 `(activeDays ?? []).forEach(day => searchParams.append('activeDays', day))` |
| `apps/web/app/clubs/_lib/exploreParams.ts` | `ExploreParams.activeDays: ClubDayOfWeek[]` + `DEFAULT_EXPLORE_PARAMS.activeDays = []` + parse·serialize·toApiParams 갱신 |
| `apps/web/app/clubs/_pages/ClubExplorePage.tsx` | `disabled` 제거, 토글 핸들러 + active state + 안내문 삭제 + 액티브 필터 칩 |
| `apps/web/app/clubs/[clubId]/_lib/activeDaysLabel.ts` → `apps/web/app/clubs/_lib/activeDaysLabel.ts` 로 **승격 이동** | 이미 `dayLabel(MONDAY → '월')`, `ORDER`, `activityScheduleLabel` 존재. 두 라우트(`/clubs`, `/clubs/[clubId]`)에서 공유하므로 한 단계 상위로 이동. import 경로 갱신 필요한 파일: `_components/ClubDetailStats.tsx`, `_components/ClubDetailActivity.tsx`, `_components/ClubDetailTabs.tsx`, 관련 테스트 (`test/clubs/active-days-label.test.ts`, `test/clubs/club-detail-tabs.test.tsx`) |

**5-2-1. `exploreParams.ts` 핵심 변경**

```ts
const DAY_OF_WEEK: readonly ClubDayOfWeek[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
];
const VALID_DAYS = new Set<string>(DAY_OF_WEEK);

// parseExploreParams
const activeDays = search.getAll('activeDays').filter(
  (value): value is ClubDayOfWeek => VALID_DAYS.has(value),
);

// serializeExploreParams
params.activeDays.forEach(day => next.append('activeDays', day));

// toApiParams — 7개 또는 0개면 undefined
const activeDays =
  params.activeDays.length === 0 || params.activeDays.length === 7
    ? undefined
    : params.activeDays;
```

**5-2-2. `ClubExplorePage.tsx` 토글 핸들러**

```tsx
const toggleDay = (day: ClubDayOfWeek) => {
  const current = params.activeDays;
  const next = current.includes(day)
    ? current.filter(d => d !== day)
    : [...current, day];
  updateParams({ activeDays: next, page: 1 });
};
```

기존 disabled 버튼 마크업의 `disabled`, `title="준비 중"`, `opacity-60 cursor-not-allowed` 클래스 제거 + active 상태 스타일링 추가. 안내 `<p>` 삭제.

**5-2-3. 액티브 필터 칩**

`activeDays.length > 0 && activeDays.length < 7` 일 때만 표시:

```tsx
{params.activeDays.length > 0 && params.activeDays.length < 7 && (
  <ActiveFilterChip
    label={`요일: ${[...params.activeDays].sort((l, r) => ORDER.indexOf(l) - ORDER.indexOf(r)).map(dayLabel).join('·')}`}
    variant="soft"
    onRemove={() => updateParams({ activeDays: [], page: 1 })}
  />
)}
```

---

## 6. 테스트 계획

### 6-1. Backend (`ClubControllerTest` / `ClubRepositoryImplTest`)
- 단일 요일 — `?activeDays=MONDAY` → 월요일 포함 동아리만
- 다중 요일 OR — `?activeDays=MONDAY&activeDays=WEDNESDAY` → 월 또는 수 포함. 월·수 둘 다 있는 동아리는 1번만 나옴 (중복 없음)
- 결과 0건 — 일요일만 활동하는 동아리 없을 때 빈 페이지 정상 반환
- `active_days` NULL 인 동아리는 필터 적용 시 제외, 미적용 시 포함
- 잘못된 enum (`?activeDays=MOONDAY`) → 400
- 7개 전체 선택 → 미적용과 동일 결과셋 (NULL 동아리 포함)
- 다른 필터와 AND 결합 — `category=SPORTS & activeDays=MONDAY` → 스포츠 ∩ 월요일

### 6-2. Frontend (`apps/web/test/clubs/active-days-filter.test.tsx` 신규)
- 토글 클릭 → URL `activeDays` 쿼리 갱신
- 같은 요일 두 번 클릭 → 해제
- 7개 모두 선택 → URL 에서 파라미터 자체 제거 (`toApiParams` 가 `undefined` 반환)
- URL 직접 접근 (`?activeDays=MONDAY&activeDays=WEDNESDAY`) → 초기 렌더에 두 버튼 active
- 잘못된 값 (`?activeDays=BANANA`) → 화이트리스트 필터링되어 무시
- 초기화 버튼 → activeDays 비워짐
- 활성 필터 칩에 `요일: 월·수` 노출, X 클릭 시 해제

### 6-3. 픽스처
- 기존 `ClubFixture` 류에 `withActiveDays(DayOfWeek...)` 빌더 헬퍼 없으면 추가

---

## 7. Deferred Decisions

설계 검토 단계에서 결정해야 할 항목.

### 7-1. HQL 함수 등록 방식

| 옵션 | 변경 | 권장 |
|---|---|---|
| **A1** `array_overlap_csv(csv, csv)` 신규 등록 | `PostgresFunctionContributor` 한 줄 추가 | ⭐ 기본안 |
| A2 `string_to_array` HQL 등록 + 중첩 호출 | `string_to_array` 등록 + 호출부 nested function | 호출부 가독성 ↓ |
| A3 변경 없음, raw SQL 템플릿 우회 시도 | `Expressions.booleanTemplate` 에 raw SQL 직접 | Hibernate dialect 미등록 함수 인식 여부 불확실, 실측 필요 |

**현 시점 권장: A1.** 1줄 추가로 기존 `array_overlap_text` 와 대칭. spec 리뷰 시 사용자 확정.

### 7-2. 7개 전체 선택 정규화 책임

**결정: 프론트·백 양쪽 모두.**

- Frontend `toApiParams`: 0개 또는 7개 → `undefined` (URL/네트워크 최적화)
- Backend `ClubSearchCondition.effectiveActiveDays()`: 0개·`null`·7개 → `null` (단일 진실 소스)

근거: 기존 `effectiveRecruitmentStatus()` 가 동일 패턴 (프론트는 보정값 보내고 백엔드도 보정 로직 보유). defense in depth.

---

## 8. PR 분할 전략

**API 1개 = PR 1개** 원칙.

```
develop
  └─ feat/{이슈}-clubs-active-days-filter-api   (backend)
       └─ PostgresFunctionContributor (A1) + ClubApi + ClubController
       └─ ClubSearchCondition + ClubRepositoryImpl + 테스트
  └─ feat/{이슈}-clubs-active-days-filter-ui    (frontend, BE 머지 후)
       └─ types + api client + exploreParams
       └─ ClubExplorePage UI 활성화 + dayLabel + 테스트
```

---

## 9. 잠재 리스크 / 주의사항

1. **HQL 함수 옵션 (A1) 미채택 시** — A2/A3 선택 시 PR 범위 변동. A1 권장 (가장 변경량 적음).
2. **`active_days` 가 빈 문자열인 레거시 데이터** — 현재 엔티티 `getActiveDays()` 는 `blank` 도 빈 Set 으로 처리. PG `string_to_array('', ',')` 는 `{""}` 한 원소 배열을 반환하므로 overlap 결과 오작동 가능성. 안전하게 빈 문자열 방어:
   ```sql
   (string_to_array(nullif(?1, ''), ',') && string_to_array(?2, ','))
   ```
   `nullif` 적용 시 `null && ...` → `null` → false 처리되어 의도와 일치. **A1 등록 시 `nullif` 포함 권장.**
3. **CSV 저장의 의미론적 한계** — 별도 후속 이슈로 트래킹 가치. 본 PR 범위 외.
4. **DayOfWeek enum import 라인** — `java.time.DayOfWeek` 와 자체 enum 혼동 주의. 본 도메인은 `java.time.DayOfWeek` 사용 중 (`Club.java:11`).
5. **칩 표시 일관성** — 7개 다 선택해도 칩 안 보이게 (필터 미적용과 동일) 처리. 0개일 때도 동일.
6. **테스트 격리** — Repository 테스트에서 `active_days` 가 NULL/빈/세팅 케이스를 모두 픽스처로 만들어 NULL 제외 동작 확인 필수.