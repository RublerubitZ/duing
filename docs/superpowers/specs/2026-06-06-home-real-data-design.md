# 홈 화면 Mock 제거 — 실데이터 전환

작성일: 2026-06-06
도메인: 학생 랜딩(`/`) — `HomeHero` 추천 검색어 / `Categories` / `FeaturedClubs` / `RecruitmentTicker`

---

## 1. 배경 & 목표

`/` 메인 랜딩 페이지는 첫 인상을 결정하는 면인데 4개 섹션이 `app/_mocks.ts` 의 정적 데이터에 묶여 있다.

| 섹션 | 현재 의존 |
|---|---|
| `HomeHero` 통계 (totalCount, recruitingCount) | ✅ 이미 실데이터 (`fetchClubStats`) |
| `HomeHero` 추천 검색어 | 5개 하드코딩 |
| `HomeHero.HeroCardStack` (오른쪽 일러스트) | 트레몰로/두잉코드/STAT 하드코딩 |
| `BannerCarousel` | `landingBanners` 4개 |
| `RecruitmentTicker` | `recruitmentTickers` 5개 |
| `Categories` | `landingCategories` 8개 (counts 포함) |
| `FeaturedClubs` | `featuredClubs` 4개 |

홈 Categories 의 분류 체계 (학술/음악/운동/IT/공연/봉사/문화/창업) 가 탐색 페이지의 실제 `ClubCategory` enum (학술/문화/예술/운동/봉사/종교/취미/기타) 과 **불일치** — 사용자가 홈에서 "IT" 를 누르면 탐색 페이지에서 매칭되는 카테고리가 없어 실제로는 작동하지 않는 데드 링크.

**목표**: 4개 섹션을 실데이터로 전환하고 홈↔탐색 카테고리 체계를 정합화한다.

**역할 분리**:
- **Categories** = 도메인 분류 (`ClubCategory` enum 8개)
- **추천 검색어** = 자주 찾는 자유 키워드 (편집자 큐레이션)

---

## 2. 범위

### In scope
- BE: `ClubSortOption.POPULAR` enum 값 + `applySort(POPULAR)` 정렬 스펙
- BE: Swagger 갱신
- FE: `FeaturedClubs` — `?sort=POPULAR&recruitmentStatus=AVAILABLE&size=4` 실데이터
- FE: `RecruitmentTicker` — `?recruitmentStatus=AVAILABLE&sort=DEADLINE_SOON&size=8` 실데이터 + d-Day 계산 + 상시모집 제외
- FE: `Categories` — 정적 8 enum + 한글 라벨 + URL = enum 값
- FE: `HomeHero` 추천 검색어 키워드 갱신 (개발 / 공모전 / 봉사 / 축구 / 창업)
- FE: `_mocks.ts` 에서 `landingCategories`, `featuredClubs`, `recruitmentTickers` 제거. `LandingCategory` / `FeaturedClub` / `RecruitmentTicker` 타입도 함께 제거.
- 테스트: §6

### Out of scope (별도 후속 라운드)
- `HomeHero.HeroCardStack` 의 카드 일러스트 — 본 라운드는 데모성 일러스트로 유지.
- `BannerCarousel` 의 이벤트 배너 — 이벤트 도메인이 아직 없음.
- 추천 검색어 어드민 설정 / 검색 통계 기반 자동 생성 — MVP 범위 외.
- favorite/application 카운트 비정규화 컬럼 — MVP 규모는 subquery 로 충분.
- 빈 상태(empty state) 카드 디자인 — 본 라운드는 섹션 자체를 숨김.

---

## 3. POPULAR 정렬 정의

`ClubSortOption.POPULAR` 의 정렬 우선순위:

| Tier | 키 | 방향 | NULL/0 처리 |
|---|---|---|---|
| 1 | 활성 모집의 지원자 수 합 (`COUNT(application)`) | DESC | 0 으로 자연 후순위 (COUNT 는 NULL 미반환) |
| 2 | 즐겨찾기 수 (`COUNT(clubFavorite)`) | DESC | 0 으로 자연 후순위 (동일) |
| 3 | 가장 최근 활성 모집의 시작일 (`MAX(startDate)`) | DESC | NULL → NULLS LAST (활성 모집 없으면 NULL) |
| 4 | `club.createdAt` | DESC | — (최종 tiebreak) |

### 정의

- **활성 모집** = `recruitment.status = OPEN` AND `start_date <= CURRENT_DATE` AND `(end_date IS NULL OR end_date >= CURRENT_DATE)` (기존 `RecruitmentStatusFilter.AVAILABLE` 와 동일 조건)
- **활성 모집의 지원자 수** = 위 조건을 만족하는 recruitment 들에 속한 모든 `Application` 카운트
- **즐겨찾기 수** = `club_favorite.club_id = club.id` 카운트
- `@SQLRestriction("deleted_at IS NULL")` 가 `Recruitment`·`Application` 엔티티 모두에 적용되어 있어 QueryDSL `JPAExpressions.from(...)` 서브쿼리에도 자동 반영됨 (기존 `tagsOverlap` / `recruitmentStatusFilter` 와 동일 패턴). 직접 `deleted_at` 조건 명시 불필요.

### 운영 시나리오

- 활성 모집이 여러 개인 동아리 → 지원자 수는 합산, 시작일은 MAX
- 활성 모집이 없는 동아리 → tier 1·3 NULL → NULLS LAST 로 후순위. tier 2(favoriteCount) 가 사실상 정렬 기준
- → POPULAR 단독 호출 시 결과에 활성 모집 없는 동아리도 포함 (정렬 후순위)
- → `?sort=POPULAR&recruitmentStatus=AVAILABLE` 조합 → "현재 모집 중 + 인기순" 이 FeaturedClubs 의 실제 사용 패턴

### 성능

MVP 규모(클럽 수백·application 수천)에서 OrderBy 절의 correlated subquery 3개는 ms 단위로 끝남. 추후 트래픽·데이터 폭증 시 `favorite_count` / `application_count` 비정규화 가능 — 본 라운드는 subquery 로 시작.

---

## 4. API 명세

**신규 API 없음.** 기존 `GET /clubs` 의 `sort` 파라미터에 `POPULAR` 값 1개 추가.

```
GET /clubs?sort=POPULAR&recruitmentStatus=AVAILABLE&size=4     ← FeaturedClubs
GET /clubs?recruitmentStatus=AVAILABLE&sort=DEADLINE_SOON&size=8 ← RecruitmentTicker
```

Swagger 갱신:
- `sort` 파라미터 설명에 `POPULAR` 추가
- 설명문: `"정렬 옵션 (DEADLINE_SOON / RECENT / ALPHABETICAL / POPULAR). 미지정 시 RECENT. POPULAR 는 활성 모집 지원자수 → 즐겨찾기수 → 모집 시작일."`

---

## 5. 구현 계획

### 5-1. Backend (PR-A)

| 파일 | 변경 |
|---|---|
| `domain/club/service/dto/query/ClubSortOption.java` | `POPULAR` enum 값 + Javadoc |
| `domain/club/api/ClubApi.java` | Swagger 설명 갱신 |
| `domain/club/repository/ClubRepositoryImpl.java` | `applySort()` switch 에 `POPULAR` case 추가 — 4-tier `OrderSpecifier<?>[]` |
| `domain/club/service/ClubSearchPopularSortTest.java` (신규) | TDD 시나리오 5개 (§6 참조) |

**5-1-1. `ClubSortOption`**

```java
public enum ClubSortOption {
    DEADLINE_SOON,
    RECENT,
    ALPHABETICAL,
    /**
     * 인기순. 다음 우선순위로 정렬:
     * 1) 활성 모집 지원자수 합 DESC
     * 2) 즐겨찾기 수 DESC
     * 3) 가장 최근 활성 모집의 시작일 DESC
     * 4) club.createdAt DESC (최종 tiebreak)
     * 활성 모집이 없는 동아리는 1·3 tier 가 NULL → NULLS LAST 로 후순위.
     * "현재 모집 중인 동아리 중 인기순" 사용 시 {@code recruitmentStatus=AVAILABLE} 와 조합.
     */
    POPULAR
}
```

**5-1-2. `ClubRepositoryImpl.applySort(POPULAR)` 스니펫**

기존 `RECENT` 케이스의 `JPAExpressions.select(...).from(recruitment).where(...)` 패턴 그대로 차용.

```java
case POPULAR -> {
    LocalDate today = LocalDate.now();

    // tier 1: 활성 모집들의 application 수 합
    var applicationCount = JPAExpressions.select(application.count())
            .from(application)
            .join(application.recruitment, recruitment)
            .where(recruitment.club.eq(club),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.startDate.loe(today),
                    recruitment.endDate.isNull().or(recruitment.endDate.goe(today)));

    // tier 2: 즐겨찾기 수
    var favoriteCount = JPAExpressions.select(clubFavorite.count())
            .from(clubFavorite)
            .where(clubFavorite.club.eq(club));

    // tier 3: 가장 최근 활성 모집의 시작일
    var latestActiveStart = JPAExpressions.select(recruitment.startDate.max())
            .from(recruitment)
            .where(recruitment.club.eq(club),
                    recruitment.status.eq(RecruitmentStatus.OPEN),
                    recruitment.startDate.loe(today),
                    recruitment.endDate.isNull().or(recruitment.endDate.goe(today)));

    // tier 1·2 는 COUNT 가 0 반환 → DESC 정렬 시 자연스럽게 후순위.
    // tier 3 만 활성 모집 부재 시 NULL 가능 → NULLS LAST 명시.
    yield new OrderSpecifier<?>[]{
            new OrderSpecifier<>(Order.DESC, applicationCount),
            new OrderSpecifier<>(Order.DESC, favoriteCount),
            new OrderSpecifier<>(Order.DESC, latestActiveStart, OrderSpecifier.NullHandling.NullsLast),
            club.createdAt.desc()
    };
}
```

`QClubFavorite` 와 `QApplication` import 필요. 기존 import 패턴 따름 (`static com.duing...QClubFavorite.clubFavorite`).

### 5-2. Frontend — FeaturedClubs + RecruitmentTicker (PR-B, PR-A 머지 후)

**5-2-1. `FeaturedClubs.tsx`**
- `import { featuredClubs } from '../../_mocks'` 제거
- 서버 컴포넌트로 유지 (이미 server component)
- 페이지 컴포넌트나 섹션 컴포넌트에서 `fetchClubStats` 와 동일 패턴으로 `createApiClient` 사용
- `clubs.list({ sort: 'POPULAR', recruitmentStatus: 'AVAILABLE', size: 4 })` 호출
- 반환된 `ClubSummary[]` → 카드 마크업으로 매핑
  - 카드의 색상·이모지·`spots`·`deadline` 같은 기존 mock 전용 시각 필드는 BE 응답에 없음 — 가능한 대체:
    - 아바타: `logoUrl` 있으면 `<img>`, 없으면 카테고리 이모지 fallback (기존 `clubAdapter` / `ClubCard` 의 fallback 패턴 검토 후 재사용)
    - 색상 그라데이션: 카테고리별 정적 매핑 또는 단색
    - `gen`(N기) / `spots`(모집 정원) / `members`(인원수): BE 응답에 없음 → 표시 제거 또는 `activeRecruitment.endDate` 기반 마감일 표시로 대체
- **0건 시: 섹션 자체를 렌더하지 않음** (return null)

**5-2-2. `RecruitmentTicker.tsx`**
- `import { recruitmentTickers } from '../../_mocks'` 제거
- 서버 컴포넌트 전환
- `clubs.list({ recruitmentStatus: 'AVAILABLE', sort: 'DEADLINE_SOON', size: 8 })` 호출
- 결과에서 `item.activeRecruitment?.endDate === null` 항목 필터 (상시모집은 마감일 없음)
- d-Day 계산:
  ```ts
  function computeDday(endDate: string, today: Date): string {
    const end = new Date(`${endDate}T00:00:00`);
    const diff = Math.round((end.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return 'D-day';
    if (diff > 0) return `D-${diff}`;
    return 'D+' + Math.abs(diff); // 안전망. AVAILABLE 필터로 거의 발생 안 함.
  }
  ```
  순수 함수로 분리해 단위 테스트.
- **0건 시 (필터 후): 섹션 자체를 렌더하지 않음**

**5-2-3. `_mocks.ts` 정리 (PR-B 단계)**
- `featuredClubs` export 제거 + `FeaturedClub` 타입 제거
- `recruitmentTickers` export 제거 + `RecruitmentTicker` 타입 제거
- `landingBanners` / `LandingBanner` 는 `BannerCarousel` 이 계속 사용 → 유지
- `landingCategories` 는 PR-C 에서 정리 (이 PR 에서는 건드리지 않음)

### 5-3. Frontend — Categories + 추천 검색어 (PR-C, PR-B 와 병렬 가능)

**5-3-1. `Categories.tsx`**
- `import { landingCategories, type LandingCategory } from '../../_mocks'` 제거
- 정적 카테고리 메타 신규: `app/_lib/homeCategories.ts` 에 정의:

  ```ts
  import type { ClubCategory } from '@duing/types';

  export type HomeCategoryMeta = {
    value: ClubCategory;        // 'ACADEMIC' | ...
    label: string;              // '학술' | ...
    index: string;              // '01' ...
    accent: string;
    fallbackBg: string;
    imageSrc: string;
  };

  export const HOME_CATEGORIES: ReadonlyArray<HomeCategoryMeta> = [
    { value: 'ACADEMIC',  label: '학술', index: '01', accent: '#5b7e4d', fallbackBg: '#1e2e1a', imageSrc: '/categories/cat-01-academic.png' },
    { value: 'CULTURE',   label: '문화', index: '02', accent: '#6b7e3e', fallbackBg: '#1e2614', imageSrc: '/categories/cat-07-culture.png' },
    { value: 'ART',       label: '예술', index: '03', accent: '#7d4f87', fallbackBg: '#221428', imageSrc: '/categories/cat-02-music.png' },
    { value: 'SPORTS',    label: '운동', index: '04', accent: '#c47a3b', fallbackBg: '#2e1e0e', imageSrc: '/categories/cat-03-sport.png' },
    { value: 'VOLUNTEER', label: '봉사', index: '05', accent: '#b88b3b', fallbackBg: '#28200e', imageSrc: '/categories/cat-06-volunteer.png' },
    { value: 'RELIGION',  label: '종교', index: '06', accent: '#a85e5e', fallbackBg: '#281414', imageSrc: '/categories/cat-05-perform.png' },
    { value: 'HOBBY',     label: '취미', index: '07', accent: '#4d6b8a', fallbackBg: '#121e2a', imageSrc: '/categories/cat-04-it.png' },
    { value: 'OTHER',     label: '기타', index: '08', accent: '#3e7a73', fallbackBg: '#0e2422', imageSrc: '/categories/cat-08-startup.png' },
  ];
  ```

  > **이미지 매핑 주의**: 기존 8개 이미지는 학술/음악/운동/IT/공연/봉사/문화/창업 기준. 실제 enum 과 대응이 정확히 1:1 이 아님 (음악→예술, IT→취미, 공연→종교, 창업→기타 등은 의미 매핑). spec 리뷰 시 디자이너 확인 또는 임시 매핑 유지 결정 필요.

- `Categories.tsx` 에서 `HOME_CATEGORIES.map(...)` 으로 변경
- 링크 URL: `` `/clubs?category=${category.value}` `` (한글 라벨 인코딩 ❌ → enum 값 그대로)
- "{count}개 동아리" 문구 → "둘러보기" CTA 텍스트로 치환 (또는 카테고리 라벨만)

**5-3-2. `HomeHero.tsx` 추천 검색어**
- `SUGGESTED_QUERIES` 상수만 갱신:
  ```ts
  const SUGGESTED_QUERIES: ReadonlyArray<string> = [
    '개발',
    '공모전',
    '봉사',
    '축구',
    '창업',
  ];
  ```

**5-3-3. `_mocks.ts` 정리 (PR-C 단계)**
- `landingCategories` export 제거 + `LandingCategory` 타입 제거

---

## 6. 테스트 계획

### 6-1. Backend (`ClubSearchPopularSortTest.java`)

- `applicationCount` 동률 → `favoriteCount` tiebreak 확인
- `favoriteCount` 동률 → 최근 활성 모집 startDate tiebreak 확인
- 활성 모집 없는 클럽: tier 1 = 0 → 활성 모집 있는 클럽 뒤로 자연 정렬됨 (그 클럽이 favoriteCount 더 많아도 활성 모집 있는 클럽 뒤)
- 활성 모집 없고 favoriteCount=0 인 클럽: tier 3 NULL → NULLS LAST 로 가장 뒤 (createdAt 으로 최종 정렬)
- `recruitmentStatus=AVAILABLE` 와 조합 시 활성 모집 없는 클럽은 결과에서 완전히 빠지는지 확인 (FeaturedClubs 사용 패턴)
- 활성 모집이 2개인 클럽 → application 합산 검증 (모집 A 3건 + 모집 B 2건 → 5건)
- 회귀: 기존 `DEADLINE_SOON` / `RECENT` / `ALPHABETICAL` 정렬에 영향 없음

### 6-2. Frontend

**단위 (Vitest)**
- `computeDday` 순수 함수 — 미래 D-3, 당일 D-day, null endDate 입력 → 호출 측에서 사전 필터되므로 함수에 닿지 않음을 별도 테스트
- `Categories` — 8개 enum 모두 렌더, 각 링크 URL 이 enum 값 (`/clubs?category=ACADEMIC`) 사용
- `HOME_CATEGORIES` 정적 검증 — 8개, `ClubCategory` enum 과 1:1, 중복 없음

**통합 (Vitest + MSW or fetch mock)**
- `FeaturedClubs` — 4건 응답 → 4개 카드 렌더
- `FeaturedClubs` — 0건 응답 → 섹션 자체 미렌더
- `RecruitmentTicker` — 상시모집 1건 포함 8건 응답 → 필터 후 7건 렌더
- `RecruitmentTicker` — 필터 후 0건 → 섹션 자체 미렌더

**API 실패 처리**
- 서버 컴포넌트에서 fetch 실패 시 throw → Next.js error boundary 가 잡음 (전체 페이지 fallback)
- `HomeHero.fetchClubStats` 의 try/catch 폴백 패턴은 통계 표시 전용 — 콘텐츠 섹션에는 적용하지 않음 (잘못된 데이터 노출 방지)

---

## 7. PR 분할 전략

```
develop
  ├─ feat/clubs-popular-sort                   (PR-A · BE-only)
  │    └─ ClubSortOption.POPULAR + applySort(POPULAR) + 테스트
  │
  ├─ feat/home-featured-and-ticker             (PR-B · FE-only, PR-A 머지 후)
  │    └─ FeaturedClubs + RecruitmentTicker 실데이터
  │    └─ _mocks.ts 에서 featuredClubs / recruitmentTickers 제거
  │
  └─ feat/home-categories-and-hero-queries     (PR-C · FE-only, PR-A·B 와 병렬)
       └─ Categories 실 enum 정합화 + URL = enum 값
       └─ HOME_CATEGORIES 상수 / homeCategories.ts 신규
       └─ HomeHero 추천 검색어 5개 갱신
       └─ _mocks.ts 에서 landingCategories 제거
```

PR-C 는 BE 변경에 의존하지 않으므로 PR-A·B 와 무관하게 진행 가능.

---

## 8. 잠재 리스크 / 주의사항

1. **`ClubSummary` ↔ 기존 카드 마크업 간극** — 기존 mock 카드는 `gen/spots/members/avatar/color/recruit/scope` 등 BE 응답에 없는 필드 의존. 매핑 누락 시 빈 칸 또는 어색한 표시 가능. 카드 마크업의 어느 정보를 빼고 어느 정보를 매핑할지 PR-B 구현 단계에서 확정. 디자이너 확인 권장.

2. **카테고리 이미지 매핑** — 기존 8장 이미지(`cat-01-academic.png` ~ `cat-08-startup.png`)는 옛 분류 체계(학술/음악/운동/IT/공연/봉사/문화/창업) 기준. 새 enum (학술/문화/예술/운동/봉사/종교/취미/기타) 매핑 시 의미가 약간 어긋남 (예: "예술" 카테고리에 "음악" 이미지). PR-C 에서 임시 매핑 유지 + 후속 라운드에 디자이너 작업으로 교체 권장.

3. **POPULAR 정렬 성능 모니터링** — Subquery 3개 NULLS LAST 정렬. EXPLAIN 으로 확인 권장하나 MVP 규모는 안전. 추후 비정규화 시 invalidation 전략 별도 설계 필요.

4. **0건 시 섹션 숨김 정책의 일관성** — 본 라운드에서 FeaturedClubs / RecruitmentTicker 모두 0건이면 `BannerCarousel` ↔ `Categories` 사이가 휑해짐. 디자인적 갭은 의도된 절제 — 후속 라운드에서 empty-state 카드 도입 여지.

5. **`HeroCardStack` 의 추후 정합화** — 본 라운드 Out of scope. 사용자가 직후 후속 라운드로 진행 의사를 표명함. 구현 시 같은 `POPULAR` 정렬 + size 3 패턴 재사용 가능.

6. **`BannerCarousel` 이벤트 도메인 부재** — 본 라운드 Out of scope. 후속 라운드에서 이벤트 도메인(`AdminNotice` 의 카테고리 확장 또는 별도 `Event` 도메인) 설계 필요.

7. **카테고리 클릭 URL 변경 영향도** — 현재 `/clubs?category=음악` 같은 한글 URL 은 사실상 작동 안 함(BE enum 매치 실패). PR-C 가 이 dead-link 를 enum 값으로 교정. 외부에서 한글 URL 을 북마크/공유한 사용자는 없음으로 가정 (현재 깨진 동작).
