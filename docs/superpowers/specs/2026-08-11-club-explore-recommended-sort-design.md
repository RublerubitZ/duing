# 동아리 탐색 「추천순」 정렬 설계 (2026-08-11)

## 목표

`/clubs` 탐색의 기본 정렬 RECENT 를 RECOMMENDED(추천순)로 교체한다.
핵심: 모집 상태 3그룹의 절대 우선순위 + 그룹 내부는 1시간 단위 deterministic random(70%) + 활동점수(30%).

## 정렬 정의

```
ORDER BY
  1. statusPriority ASC        -- 1=모집중(OPEN), 2=상시모집(ALWAYS_OPEN), 3=기타(예정·마감·없음)
  2. finalScore DESC
  3. club.id ASC               -- deterministic tie-breaker
```

- statusPriority 는 동아리의 모든 모집에 대해 `MIN(CASE)` — `RecruitmentDisplayStatus.resolve()` 와 같은 판정:
  - `OPEN ∧ startDate ≤ today ∧ endDate IS NULL` → 2 (ALWAYS_OPEN)
  - `OPEN ∧ startDate ≤ today ∧ endDate ≥ today` → 1 (OPEN)
  - 그 외(UPCOMING·CLOSED·만료) → 3, 모집 없음 → COALESCE(3)
- 그룹 3 내부에서 예정/마감/없음의 하위 우선순위는 **두지 않는다** (요구 §3).
- 마감 임박순·등록순 보조 정렬은 전부 제거 (요구 §4).

## finalScore

```
clubShuffle     = hourly_shuffle(club.id::text,   hourBucket)   ∈ [0,1]
categoryShuffle = hourly_shuffle(club.category,   hourBucket)   ∈ [0,1]
randomScore     = clubShuffle*0.75 + categoryShuffle*0.25
activityScore   = COALESCE((SELECT activity_score FROM club_metric WHERE club_id=club.id), 0)  ∈ [0,1]
finalScore      = randomScore*0.7 + activityScore*0.3
```

- 가중치는 `ClubRecommendationPolicy` 한 곳에서만 관리한다.
- **카테고리 순환**(요구 §8): categoryShuffle 이 시간마다 카테고리 전체에 균일 보너스를 줘 특정 카테고리가 그 시간대 상단에 유리해진다. 카테고리 필터가 걸리면 categoryShuffle 은 결과 집합 안에서 상수가 되어 **자동으로 순환이 무효화**된다 — 별도 분기 불필요.

## hourly_shuffle (deterministic random)

`PostgresFunctionContributor` 에 등록하는 SQL 패턴 (기존 array_overlap_* 전례):

```sql
((('x' || substr(md5(?1 || ':' || ?2), 1, 8))::bit(32)::int & 2147483647) / 2147483647.0)
```

- md5 는 PG 버전 무관 결정적 → 같은 (입력, bucket) 이면 항상 같은 값. `ORDER BY RANDOM()` 금지 요구 충족.
- 같은 hour bucket 동안 page 0/1/2 가 동일 기준으로 정렬 → OFFSET 페이지네이션 안정 (요구 §15).
- 테스트는 같은 식을 Java 로 복제(md5 hex 앞 8자 → int & 0x7FFFFFFF / 2147483647.0)해 SQL↔Java 동치 검증.

## hourBucket

`yyyyMMddHH`, 기존 `seoulClock`(Asia/Seoul) 기준. `ClubRecommendationPolicy.hourBucket(LocalDateTime)` 헬퍼로 계산 — 새 타임존 로직을 만들지 않는다 (요구 §6·§18).

## club_metric

```sql
CREATE TABLE club_metric (
    club_id           BIGINT PRIMARY KEY REFERENCES club(id),
    favorite_count    INT NOT NULL DEFAULT 0,
    application_count INT NOT NULL DEFAULT 0,
    last_activity_at  TIMESTAMP,
    activity_score    DOUBLE PRECISION NOT NULL DEFAULT 0,
    computed_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
```

- rank_score 별도 저장은 하지 않는다 — random 성분이 시간마다 바뀌므로 저장 가치가 없고, activity_score 만 저장하면 정렬식이 단일 서브쿼리로 끝난다 (요구 §10 판단 위임분).
- 갱신: `ClubMetricRefreshJob` — **매시 정각**(Asia/Seoul) + 기동 직후 1회. `duing.club.metric.enabled` (기본 false, prod true), `ClubMetricJobConfig` 가 자체 `@EnableScheduling` 으로 스케줄러를 켠다(잡 격리 컨벤션).
  - 정각인 이유: activity_score 는 전체 최댓값 정규화라 재계산 시 전 동아리 점수가 함께 움직인다. bucket 이 바뀌며 어차피 전면 reshuffle 되는 정각에 맞춰, **bucket 중간의 두 번째 순서 변동 지점을 만들지 않는다** (적대적 리뷰 반영).
  - 집계는 ACTIVE 동아리만 — 비공개 동아리가 정규화 max 를 쥐는 왜곡 방지.
  - recency 비교·computed_at 은 created_at 과 같은 regime(JVM 기본 타임존, prod=UTC-naive) — seoulClock 을 섞지 않는다(감사 타임스탬프 함정).
- 집계 소스 (전부 deleted_at IS NULL):
  - favorite_count: club_favorite
  - application_count: application ⨝ recruitment (동아리 전체 모집의 누적 지원)
  - last_activity_at: club_photo ∪ club_hero_activity ∪ club_event ∪ recruitment 의 MAX(created_at)
  - notice 는 총동연 발신 구조(notice_target_club)라 동아리 자체 활동 신호로 보지 않는다 — 제외.

### activity_score (0~1 정규화, 로그 스케일)

```
favNorm   = ln(1+fav) / ln(1+maxFav)          (maxFav=0 이면 0)
appNorm   = ln(1+app) / ln(1+maxApp)
recency   = clamp(1 - daysSince(lastActivityAt)/90, 0, 1)   (없으면 0)
activity_score = favNorm*0.4 + appNorm*0.4 + recency*0.2
```

로그 스케일 + max 정규화로 극단값(찜 100 vs 1)이 압도하지 못한다 (요구 §11). 배치 시점에 전체 재계산.
metric 행이 없는 동아리(배치 전 신규)는 COALESCE 0 — fail-open.

## RECENT 처리 (전환기 결정)

- 사용처 조사 결과: `ClubSortOption.RECENT` 는 탐색 FE 만 사용 (홈은 POPULAR/DEADLINE_SOON, admin 은 별도 정렬).
- **enum 에서 즉시 삭제하지 않고 deprecated alias 로 유지** — 배포 전환기의 stale FE 번들이 `sort=RECENT` 를 항상 명시 전송(toApiParams)하므로, enum 삭제 시 바인딩 실패 400 으로 탐색 전체가 깨진다.
- alias 동작 = RECOMMENDED 와 동일 (기존 RECENT 정렬 블록은 삭제). 다음 릴리스에서 enum 제거 후속.
- 기본값: `sortOptionOrDefault()` → RECOMMENDED.
- POPULAR 는 홈 `fetchPopularClubs` 가 사용 중 — 유지, 변경 없음 (요구 §17).

## Cache-Control (요구 §16)

- `favorite=true` → `no-store`
- 그 외 → `public, max-age=60` (FacilityController.publicCache 전례). 응답은 쿼리스트링+시간에만 의존하므로 사용자별 오염 없음. 60s ≪ 1h bucket 이라 순환 체감 훼손 없음.
- 수용한 트레이드오프: 정각 직전에 캐시된 페이지와 직후 요청한 페이지의 순서 불일치가 최대 60초 지속될 수 있다(사용자당 시간당 1회 이하). `ClubSummaryResponse` 에 사용자별 필드를 추가하려면 이 캐시 정책부터 바꿔야 한다(컨트롤러 주석 가드).

## FE

- `SortKey`: `RECOMMENDED | DEADLINE_SOON | ALPHABETICAL`, 기본 RECOMMENDED. URL `sort=RECENT` 는 RECOMMENDED 로 파싱(CULTURE→CREATION 전례).
- 라벨: 추천순 / 마감 임박순 / 가나다순 (모바일: 추천순/마감순/가나다순). "최근 등록순" 제거.
- `index===0 && page===1` "추천" 배지 제거 (ClubListItem prop 포함).
- 모바일 "지금 N곳 모집 중": 현재 필터 조건에 `recruitmentStatus=AVAILABLE, size=1` 을 겹친 count 쿼리의 totalElements 로 교체 — 페이지 무관 안정.

## 인덱스 (요구 §22)

- club_metric PK 외 신규 인덱스 없음. dev/prod 동아리 수십 건 규모에서 club Seq Scan 이 최적 — central_club/college/created_at 인덱스는 현 규모에서 불필요(§22 의 "선택도 없는 인덱스 금지" 취지). EXPLAIN 으로 기존 대비 악화 없음을 확인해 근거를 남긴다.

## EXPLAIN 실측 (dev DB, club 21건, 2026-08-11)

| 케이스 | Execution | Buffers | 비고 |
|---|---|---|---|
| 기존 RECENT 기본 정렬 | 1.77 ms | 133 | SubPlan 4개 (baseline) |
| RECOMMENDED 기본 | 0.54 ms (warm) | 97 | SubPlan 2개 (priority + metric) |
| + recruitmentStatus=AVAILABLE | 2.37 ms | 47 | EXISTS 가 idx_recruitment_status 활용 |
| + category | 0.94 ms | 17 | idx_club_category Bitmap |
| + keyword | 0.43 ms | 32 | Seq Scan (LIKE, 기존과 동일) |
| + OFFSET 40 (page 2) | 0.54 ms | 97 | 동일 정렬 기준 재사용 |

정렬 서브쿼리 4개 → 2개, 버퍼 133 → 97 — 기존 대비 악화 없음(개선). 신규 인덱스 불필요 판단 유지.

## Out of Scope

- 개인화·협업 필터링·조회수 수집·CTR 로깅 (요구 §25)
- RECENT enum 물리 제거 (전환기 이후 후속)
- 상세 페이지·홈 정렬 변경 (POPULAR/DEADLINE_SOON 유지)
- club_metric 의 고아 행 정리 배치
- `schema.d.ts` 전체 재생성 (sort 유니언만 수기 동기화, 후속 gen:api)
