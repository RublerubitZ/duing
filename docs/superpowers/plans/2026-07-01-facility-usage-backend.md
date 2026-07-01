# Facility Usage Crawling & Query (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 대구대 학생회관 공용시설 예약 이용현황을 스케줄러/온디맨드로 크롤링해 Duing DB(캐시)에 원자적으로 박제하고, 공개 REST API로 상태(현재사용/다음예약)를 조회 시점 계산해 제공한다.

**Architecture:** `domain/facility/` DDD 패키지 — Crawler(HTTP만: Jsoup GET + RestClient POST, spring-retry) → Parser(HTML/JSON 변환) → Service(수집 오케스트레이션·원자적 스냅샷 교체·single-flight·상태계산·slot 병합) → Repository(JPA) → Controller(공개 GET). 사용자는 Duing DB만 조회하고 학교 서버는 스케줄러(10분) + 온디맨드 single-flight fetch만 접근한다. 학교 응답 실패 시 기존 스냅샷을 절대 삭제하지 않는다(fail-safe).

**Tech Stack:** Spring Boot 3.4 / Java 21, Flyway(Postgres), JPA/Hibernate 6, QueryDSL(미사용 예정), Jsoup 1.18.3, Jackson, spring-retry, RestClient, JUnit5 + Mockito + MockRestServiceServer + Testcontainers + RestAssured.

---

## File Structure

**신규 생성 (main)**
- `backend/src/main/java/com/duing/domain/facility/converter/YearMonthAttributeConverter.java` — `java.time.YearMonth` ↔ `VARCHAR(7)` JPA 컨버터
- `backend/src/main/java/com/duing/domain/facility/entity/ReservationStatus.java` — 응답 전용 상태 enum(UPCOMING/USING/FINISHED, 미영속)
- `backend/src/main/java/com/duing/domain/facility/entity/DataSource.java` — 조회 소스 enum(CACHE/LIVE_FETCH/STALE_CACHE)
- `backend/src/main/java/com/duing/domain/facility/entity/FetchStatus.java` — 수집 결과 enum(SUCCESS/PARTIAL/FAILED)
- `backend/src/main/java/com/duing/domain/facility/entity/CrawlSource.java` — 수집 경로 enum(SCHEDULER/ON_DEMAND)
- `backend/src/main/java/com/duing/domain/facility/entity/Facility.java` — 캐시된 시설(archived_at, hard delete 안 씀)
- `backend/src/main/java/com/duing/domain/facility/entity/FacilityReservation.java` — 월별 예약 스냅샷 행(원본 1시간 슬롯)
- `backend/src/main/java/com/duing/domain/facility/entity/FacilityMonthSnapshot.java` — 월 캐시 메타(빈 달 문제 해결)
- `backend/src/main/java/com/duing/domain/facility/repository/FacilityRepository.java`
- `backend/src/main/java/com/duing/domain/facility/repository/FacilityReservationRepository.java`
- `backend/src/main/java/com/duing/domain/facility/repository/FacilityMonthSnapshotRepository.java`
- `backend/src/main/java/com/duing/domain/facility/config/FacilityCrawlerProperties.java` — `@ConfigurationProperties(prefix="duing.facility.crawler")` record
- `backend/src/main/java/com/duing/domain/facility/config/FacilitySchoolClientConfig.java` — RestClient 빈 + `@EnableRetry` + `@EnableConfigurationProperties`
- `backend/src/main/java/com/duing/domain/facility/config/FacilityCrawlerJobConfig.java` — `@EnableScheduling @ConditionalOnProperty`
- `backend/src/main/java/com/duing/domain/facility/crawler/SchoolFacilityClient.java` — HTTP만(Jsoup GET / RestClient POST + `@Retryable`)
- `backend/src/main/java/com/duing/domain/facility/crawler/exception/FacilityClientException.java` — 클라이언트 예외(재시도/비재시도 구분)
- `backend/src/main/java/com/duing/domain/facility/parser/ParsedFacility.java` — 파서 산출 record
- `backend/src/main/java/com/duing/domain/facility/parser/ParsedReservation.java` — 파서 산출 record
- `backend/src/main/java/com/duing/domain/facility/parser/FacilityListParser.java` — Document → List<ParsedFacility>
- `backend/src/main/java/com/duing/domain/facility/parser/ReservationParser.java` — JsonNode → List<ParsedReservation>
- `backend/src/main/java/com/duing/domain/facility/service/SlotMerger.java` — 연속 슬롯 병합 순수 함수 + MergedSlot record
- `backend/src/main/java/com/duing/domain/facility/service/FacilitySyncService.java` — 시설 목록 reconcile
- `backend/src/main/java/com/duing/domain/facility/service/FacilitySnapshotWriter.java` — `@Transactional` 원자적 교체 + 메타 upsert
- `backend/src/main/java/com/duing/domain/facility/service/FacilityCrawlService.java` — 수집 오케스트레이션 + single-flight + TTL
- `backend/src/main/java/com/duing/domain/facility/service/FacilityUsageService.java` — 조회 조립 + 상태계산(Asia/Seoul) 인터페이스
- `backend/src/main/java/com/duing/domain/facility/service/GeneralFacilityUsageService.java` — 위 인터페이스 구현체(`backend/CLAUDE.md` Service 컨벤션)
- `backend/src/main/java/com/duing/domain/facility/scheduler/FacilityCrawlScheduler.java` — `@Scheduled` 예약(10분)/시설목록(1일) + overlap guard
- `backend/src/main/java/com/duing/domain/facility/service/dto/query/CrawlSummary.java` — 구조화 로그용 결과 record
- `backend/src/main/java/com/duing/domain/facility/service/dto/query/ReservationSlot.java` — 상태 계산 후 슬롯 record(내부)
- `backend/src/main/java/com/duing/domain/facility/service/dto/query/FacilityUsageItem.java` — 시설 슬라이스 record(내부)
- `backend/src/main/java/com/duing/domain/facility/service/dto/query/FacilityUsageResult.java` — 조회 결과 집합 record(내부)
- `backend/src/main/java/com/duing/domain/facility/controller/dto/response/FacilitySummaryResponse.java` — 목록 응답 record
- `backend/src/main/java/com/duing/domain/facility/controller/dto/response/FacilityUsageResponse.java` — 이용현황 응답 record
- `backend/src/main/java/com/duing/domain/facility/controller/dto/response/FacilityDetailResponse.java` — 단일 시설 상세 응답 record
- `backend/src/main/java/com/duing/domain/facility/exception/FacilityException.java` — 도메인 예외(부모 + inner)
- `backend/src/main/java/com/duing/domain/facility/api/FacilityApi.java` — Swagger 인터페이스
- `backend/src/main/java/com/duing/domain/facility/controller/FacilityController.java` — REST 구현

**신규 생성 (migration/resources)**
- `backend/src/main/resources/db/migration/V69__create_facility.sql`
- `backend/src/main/resources/db/migration/V70__create_facility_reservation.sql`
- `backend/src/main/resources/db/migration/V71__create_facility_month_snapshot.sql`
- `backend/src/test/resources/facility/room_detail.html` — 시설 탭 목록 픽스처
- `backend/src/test/resources/facility/room_data_list_room4.json` — 예약 있음 픽스처
- `backend/src/test/resources/facility/room_data_list_room1_empty.json` — `200 + []` 픽스처
- `backend/src/test/resources/facility/room_data_list_room143.json` — 예약 픽스처

**신규 생성 (test)**
- `backend/src/test/java/com/duing/domain/facility/converter/YearMonthAttributeConverterTest.java`
- `backend/src/test/java/com/duing/domain/facility/parser/FacilityListParserTest.java`
- `backend/src/test/java/com/duing/domain/facility/parser/ReservationParserTest.java`
- `backend/src/test/java/com/duing/domain/facility/service/SlotMergerTest.java`
- `backend/src/test/java/com/duing/domain/facility/crawler/SchoolFacilityClientRetryTest.java`
- `backend/src/test/java/com/duing/domain/facility/service/FacilitySyncServiceTest.java`
- `backend/src/test/java/com/duing/domain/facility/service/FacilityCrawlServiceTest.java`
- `backend/src/test/java/com/duing/domain/facility/service/FacilityUsageServiceTest.java`
- `backend/src/test/java/com/duing/domain/facility/scheduler/FacilityCrawlSchedulerTest.java`
- `backend/src/test/java/com/duing/domain/facility/FacilityUsageAcceptanceTest.java`

**수정**
- `backend/build.gradle.kts` — spring-retry + spring-boot-starter-aop 의존성 추가
- `backend/src/main/resources/application.yml` — `duing.facility.crawler.*` 기본값(enabled false)
- `backend/src/main/resources/application-prod.yml` — enabled `${DUING_FACILITY_CRAWLER_ENABLED:true}`
- `backend/src/test/resources/application.yml` — 테스트용 facility crawler 블록(enabled false)
- `backend/src/main/java/com/duing/global/config/SecurityConfig.java` — `/api/v1/facilities` GET permitAll
- `backend/src/test/java/com/duing/common/IntegrationTestBase.java` — TRUNCATE 목록에 facility 테이블 3개 추가

---

### Task 1: 빌드 의존성 — spring-retry + AOP 추가

**Files:**
- Modify: `backend/build.gradle.kts`

- [ ] `backend/build.gradle.kts` 의 `dependencies { ... }` 블록에서 JWT 의존성 아래(48행 근처) 다음을 추가한다. Jsoup(51행)·Jackson(spring-boot-starter-web 전이)·Sentry 는 이미 존재하므로 추가하지 않는다.

```kotlin
    // spring-retry — SchoolFacilityClient 룸 단위 재시도(@Retryable, 총 4회 / 0.5·1·2초 / 5xx·네트워크·타임아웃만).
    // @Retryable 은 AOP 프록시로 동작하므로 spring-boot-starter-aop 가 필요하다. 버전은 Spring Boot BOM 이 관리한다.
    implementation("org.springframework.retry:spring-retry")
    implementation("org.springframework.boot:spring-boot-starter-aop")
```

- [ ] 의존성 해석(다운로드) 검증: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew dependencies --configuration compileClasspath -q > /dev/null && echo RESOLVED_OK` → 기대 출력 `RESOLVED_OK` (실패 시 BUILD FAILED). Jsoup 존재 재확인: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew dependencies --configuration compileClasspath | grep -E "jsoup|spring-retry|spring-boot-starter-aop"` → `org.jsoup:jsoup`, `org.springframework.retry:spring-retry`, `spring-boot-starter-aop` 세 줄이 보여야 한다.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/build.gradle.kts && git commit -m "build(backend): 시설 크롤러 재시도용 spring-retry·AOP 의존성 추가"
```

---

### Task 2: 실측 Fixture 박제

시설 파서 회귀 테스트의 입력이다. **1순위: 실 서버에서 curl 로 재수집.** 접근 차단 시 아래 hand-authored 폴백을 그대로 저장한다(구조·room_seq 매핑은 §2.1/§2.2 실측 확정치).

**Files:**
- Create: `backend/src/test/resources/facility/room_detail.html`
- Create: `backend/src/test/resources/facility/room_data_list_room4.json`
- Create: `backend/src/test/resources/facility/room_data_list_room1_empty.json`
- Create: `backend/src/test/resources/facility/room_data_list_room143.json`

- [ ] 디렉터리 생성: `mkdir -p /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/test/resources/facility`
- [ ] (1순위) 실 HTML 재수집 시도:

```bash
curl -sS -A "Mozilla/5.0 (compatible; DuingFacilityBot/1.0)" \
  "https://www.daegu.ac.kr/room/detail" \
  -o /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/test/resources/facility/room_detail.html
```

성공하면 `grep -c 'id="room_' .../room_detail.html` 이 10 이상인지 확인. 차단되면 다음 폴백 HTML을 저장한다(파서는 `li[id^=room_]` 만 읽으므로 나머지 마크업은 최소화). **`room_seq` 매핑은 §2.1 실측(불연속·비단조)**: 1/2/3=커뮤니티룸(1)(1503호)/(2)(1527호)/(3)(1425호), 4=공동연습실(1)(2105), 6=공동연습실(3)(2109), 82=공동연습실(2)(2107), 102=공동연습실(4)(1506호), 22=빛광장, 41=자유광장(노천강당), 143=웅지관 강당. (공동연습실 번호가 room_seq 순서와 일치하지 않음에 주의)

- [ ] `room_detail.html` (폴백) 내용:

```html
<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>학생회관 시설</title></head>
<body>
<ul class="room_tab">
  <li class="fst active" id="room_1"><a onclick="tab_menu2(1);" href="#none">커뮤니티룸(1)(1503호)</a><h3 class="heading_title">커뮤니티룸(1)(1503호)</h3></li>
  <li id="room_2"><a onclick="tab_menu2(2);" href="#none">커뮤니티룸(2)(1527호)</a><h3 class="heading_title">커뮤니티룸(2)(1527호)</h3></li>
  <li id="room_3"><a onclick="tab_menu2(3);" href="#none">커뮤니티룸(3)(1425호)</a><h3 class="heading_title">커뮤니티룸(3)(1425호)</h3></li>
  <li id="room_4"><a onclick="tab_menu2(4);" href="#none">공동연습실(1)(2105)</a><h3 class="heading_title">공동연습실(1)(2105)</h3></li>
  <li id="room_6"><a onclick="tab_menu2(6);" href="#none">공동연습실(3)(2109)</a><h3 class="heading_title">공동연습실(3)(2109)</h3></li>
  <li id="room_22"><a onclick="tab_menu2(22);" href="#none">빛광장</a><h3 class="heading_title">빛광장</h3></li>
  <li id="room_41"><a onclick="tab_menu2(41);" href="#none">자유광장(노천강당)</a><h3 class="heading_title">자유광장(노천강당)</h3></li>
  <li id="room_82"><a onclick="tab_menu2(82);" href="#none">공동연습실(2)(2107)</a><h3 class="heading_title">공동연습실(2)(2107)</h3></li>
  <li id="room_102"><a onclick="tab_menu2(102);" href="#none">공동연습실(4)(1506호)</a><h3 class="heading_title">공동연습실(4)(1506호)</h3></li>
  <li id="room_143"><a onclick="tab_menu2(143);" href="#none">웅지관 강당</a><h3 class="heading_title">웅지관 강당</h3></li>
</ul>
</body></html>
```

- [ ] **JSON 픽스처는 아래 크래프트 내용을 그대로 저장한다(라이브 curl 로 덮어쓰지 말 것).** Task 11 테스트가 실데이터에 없는 특정 케이스에 의존하기 때문이다 — 라이브 실 JSON(고정관념 09-10·19-20 뿐)로 덮으면 Task 11 의 `parsesRoom4`(size=4, seq [18134,18135,18140,18141]) 가 깨진다. room4 크래프트는 파서 검증 네 케이스를 포함한다: (a) dept 꼬리 시간표기 정리 대상 `고정관념(9:00~20:00)`, (b) 비인접 두 슬롯(09-10 · 19-20), (c) 인접 두 슬롯(09-10 · 10-11) 동일 단체(병합 대상), (d) `schedule_seq` 중복 1건(distinct 검증). (참고: 구조 확인용 라이브 조회는 `curl -sS -X POST https://www.daegu.ac.kr/room/data/list -H "X-Requested-With: XMLHttpRequest" --data "room_seq=4&schedule_date=2026-07"` 로 가능하나 픽스처로는 쓰지 않는다.)

- [ ] `room_data_list_room4.json` (폴백):

```json
[
  { "schedule_seq": "18134", "schedule_dept": "고정관념(9:00~20:00)", "schedule_date": "01", "schedule_time": "09:00~10:00", "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null },
  { "schedule_seq": "18135", "schedule_dept": "고정관념(9:00~20:00)", "schedule_date": "01", "schedule_time": "19:00~20:00", "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null },
  { "schedule_seq": "18140", "schedule_dept": "댄스동아리", "schedule_date": "02", "schedule_time": "09:00~10:00", "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null },
  { "schedule_seq": "18141", "schedule_dept": "댄스동아리", "schedule_date": "02", "schedule_time": "10:00~11:00", "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null },
  { "schedule_seq": "18141", "schedule_dept": "댄스동아리", "schedule_date": "02", "schedule_time": "10:00~11:00", "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null }
]
```

- [ ] `room_data_list_room1_empty.json` (`200 + []` 정상 응답):

```json
[]
```

- [ ] `room_data_list_room143.json` (폴백):

```json
[
  { "schedule_seq": "20501", "schedule_dept": "총학생회", "schedule_date": "15", "schedule_time": "13:00~14:00", "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null }
]
```

- [ ] 검증: `ls -1 /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/test/resources/facility/` → 4개 파일. `python3 -c "import json,sys; [json.load(open(f)) for f in sys.argv[1:]]" .../room_data_list_room4.json .../room_data_list_room1_empty.json .../room_data_list_room143.json && echo JSON_OK` → `JSON_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/test/resources/facility && git commit -m "test(backend): 시설 크롤 파서 회귀용 실측 HTML·JSON 픽스처 박제"
```

---

### Task 3: Flyway 마이그레이션 V69/V70/V71

현재 최신은 V68(`V68__fee_policy_target_type.sql`). 신규 테이블은 §4 DDL 정확히 따르고, **V59 정책상 신규 public 테이블은 RLS 를 켜야 한다**(`RowLevelSecurityMigrationTest` 가 RLS 없는 테이블을 발견하면 빌드를 실패시킨다). 타임스탬프는 §4대로 plain `TIMESTAMP DEFAULT NOW()`(BaseEntity `LocalDateTime` 매핑과 정합).

**Files:**
- Create: `backend/src/main/resources/db/migration/V69__create_facility.sql`
- Create: `backend/src/main/resources/db/migration/V70__create_facility_reservation.sql`
- Create: `backend/src/main/resources/db/migration/V71__create_facility_month_snapshot.sql`

- [ ] 현재 최신 버전 재확인: `ls -1 /Users/ksy/Desktop/BASIC/Coding/Duing/backend/src/main/resources/db/migration/ | sort -V | tail -1` → `V68__fee_policy_target_type.sql` 여야 한다.
- [ ] `V69__create_facility.sql`:

```sql
-- 학생회관 공용시설 캐시 목록. room_seq 는 학교 외부키(내부 매핑 전용, API 미노출)로 UNIQUE.
-- soft-delete(deleted_at) 는 이 도메인에서 미사용 — 도메인 아카이브는 archived_at 으로 표현한다(하드삭제 금지).
-- 신규 public 테이블은 RLS 를 켠다(V59 정책 준수, RowLevelSecurityMigrationTest 가드).
CREATE TABLE facility (
    id          BIGSERIAL PRIMARY KEY,
    room_seq    INT          NOT NULL UNIQUE,
    room_name   VARCHAR(100) NOT NULL,
    location    VARCHAR(100),
    sort_order  INT          NOT NULL DEFAULT 0,
    archived_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP
);
CREATE INDEX idx_facility_archived_at ON facility (archived_at);
ALTER TABLE facility ENABLE ROW LEVEL SECURITY;
```

- [ ] `V70__create_facility_reservation.sql`:

```sql
-- 월별 예약 스냅샷. 원본 1시간 슬롯을 그대로 저장하고 병합은 조회 시 SlotMerger 로 수행한다.
-- schedule_seq 는 학교 전역 자연키 → UNIQUE 로 중복 방지. FK 는 ON DELETE 없음(무결성 보존).
-- year_month 는 VARCHAR(7)('YYYY-MM'), 엔티티는 YearMonth 컨버터로 매핑한다.
CREATE TABLE facility_reservation (
    id                BIGSERIAL PRIMARY KEY,
    facility_id       BIGINT       NOT NULL REFERENCES facility(id),
    schedule_seq      BIGINT       NOT NULL UNIQUE,
    year_month        VARCHAR(7)   NOT NULL,
    reservation_date  DATE         NOT NULL,
    start_time        TIME         NOT NULL,
    end_time          TIME         NOT NULL,
    organization_name VARCHAR(200) NOT NULL,
    crawled_at        TIMESTAMP    NOT NULL,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMP
);
CREATE INDEX idx_facility_reservation_lookup
    ON facility_reservation (facility_id, year_month, reservation_date);
ALTER TABLE facility_reservation ENABLE ROW LEVEL SECURITY;
```

- [ ] `V71__create_facility_month_snapshot.sql`:

```sql
-- 월 캐시 메타(빈 달 문제 해결). crawled_at = 해당 월 '마지막 성공' 수집 시각(stale/TTL 기준, lastUpdatedAt 출처).
-- fetch_status/last_error = '마지막 시도' 결과. 전체 실패(FAILED) 시 crawled_at 은 건드리지 않아 stale 기준을 보존한다.
CREATE TABLE facility_month_snapshot (
    id           BIGSERIAL PRIMARY KEY,
    year_month   VARCHAR(7)   NOT NULL UNIQUE,
    crawled_at   TIMESTAMP    NOT NULL,
    source       VARCHAR(20)  NOT NULL,
    fetch_status VARCHAR(20)  NOT NULL,
    last_error   VARCHAR(500),
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP
);
ALTER TABLE facility_month_snapshot ENABLE ROW LEVEL SECURITY;
```

- [ ] Flyway/RLS 검증(엔티티 아직 없음 → ddl-auto=validate 실패 방지를 위해 RLS 테스트만 지정 실행):
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.global.RowLevelSecurityMigrationTest"` → 기대 `BUILD SUCCESSFUL`. (Testcontainers 가 V69~V71 을 적용하고 세 테이블 모두 RLS 켜짐을 확인한다.)
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/resources/db/migration/V69__create_facility.sql backend/src/main/resources/db/migration/V70__create_facility_reservation.sql backend/src/main/resources/db/migration/V71__create_facility_month_snapshot.sql && git commit -m "feat(backend): 시설·예약 스냅샷·월 메타 테이블 마이그레이션(V69~V71)"
```

---

### Task 4: YearMonthAttributeConverter + 단위 테스트

`java.time.YearMonth` ↔ `VARCHAR(7)`('YYYY-MM'). 코드베이스에 기존 컨버터가 없으므로 신규. 네이티브 쿼리는 컨버터를 우회하므로(문자열 바인딩) 이 도메인은 delete 를 JPQL 로 작성해 컨버터가 적용되게 한다.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/converter/YearMonthAttributeConverter.java`
- Test: `backend/src/test/java/com/duing/domain/facility/converter/YearMonthAttributeConverterTest.java`

- [ ] 실패 테스트 작성 `YearMonthAttributeConverterTest.java`:

```java
package com.duing.domain.facility.converter;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.YearMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class YearMonthAttributeConverterTest {

    private final YearMonthAttributeConverter converter = new YearMonthAttributeConverter();

    @Test
    @DisplayName("YearMonth 를 YYYY-MM 문자열로 저장하고 null 은 null 로 보존한다")
    void convertToDatabaseColumn() {
        assertThat(converter.convertToDatabaseColumn(YearMonth.of(2026, 7))).isEqualTo("2026-07");
        assertThat(converter.convertToDatabaseColumn(YearMonth.of(2026, 12))).isEqualTo("2026-12");
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
    }

    @Test
    @DisplayName("YYYY-MM 문자열을 YearMonth 로 복원하고 null 은 null 로 보존한다")
    void convertToEntityAttribute() {
        assertThat(converter.convertToEntityAttribute("2026-07")).isEqualTo(YearMonth.of(2026, 7));
        assertThat(converter.convertToEntityAttribute("2026-12")).isEqualTo(YearMonth.of(2026, 12));
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }
}
```

- [ ] 실행 → FAIL 확인(컴파일 에러: 클래스 없음):
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.converter.YearMonthAttributeConverterTest"` → 기대 `BUILD FAILED` (컴파일 실패).
- [ ] 구현 `YearMonthAttributeConverter.java`:

```java
package com.duing.domain.facility.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;

/**
 * {@link YearMonth} ↔ {@code VARCHAR(7)}('YYYY-MM') JPA 컨버터.
 *
 * <p>엔티티 필드에 {@code @Convert(converter = YearMonthAttributeConverter.class)} 로 명시 적용한다.
 * JPQL 파라미터 바인딩에는 컨버터가 적용되지만 네이티브 쿼리는 우회하므로, 이 도메인의 벌크 삭제는
 * JPQL(@Modifying @Query)로 작성해 YearMonth 파라미터가 문자열로 변환되게 한다.
 */
@Converter
public class YearMonthAttributeConverter implements AttributeConverter<YearMonth, String> {

    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("yyyy-MM");

    @Override
    public String convertToDatabaseColumn(YearMonth attribute) {
        return attribute == null ? null : attribute.format(FORMAT);
    }

    @Override
    public YearMonth convertToEntityAttribute(String dbData) {
        return dbData == null ? null : YearMonth.parse(dbData, FORMAT);
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.converter.YearMonthAttributeConverterTest"` → 기대 `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/converter backend/src/test/java/com/duing/domain/facility/converter && git commit -m "feat(backend): YearMonth VARCHAR(7) JPA 컨버터"
```

---

### Task 5: Enums (ReservationStatus / DataSource / FetchStatus / CrawlSource)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/entity/ReservationStatus.java`
- Create: `backend/src/main/java/com/duing/domain/facility/entity/DataSource.java`
- Create: `backend/src/main/java/com/duing/domain/facility/entity/FetchStatus.java`
- Create: `backend/src/main/java/com/duing/domain/facility/entity/CrawlSource.java`

- [ ] `ReservationStatus.java` (응답 전용 — 예약 엔티티에 영속하지 않는다):

```java
package com.duing.domain.facility.entity;

/** 예약 슬롯의 조회 시점 상태. 응답 전용이며 DB 에 저장하지 않는다(Asia/Seoul 기준 계산). */
public enum ReservationStatus {
    UPCOMING,
    USING,
    FINISHED
}
```

- [ ] `DataSource.java`:

```java
package com.duing.domain.facility.entity;

/** 이용현황 응답의 데이터 출처. CACHE=캐시만 / LIVE_FETCH=이번 요청이 온디맨드 수집 / STALE_CACHE=라이브 실패 후 옛 캐시. */
public enum DataSource {
    CACHE,
    LIVE_FETCH,
    STALE_CACHE
}
```

- [ ] `FetchStatus.java`:

```java
package com.duing.domain.facility.entity;

/** 월 수집 시도 결과. SUCCESS=전 룸 성공 / PARTIAL=일부 룸 실패 / FAILED=전 룸 실패. */
public enum FetchStatus {
    SUCCESS,
    PARTIAL,
    FAILED
}
```

- [ ] `CrawlSource.java`:

```java
package com.duing.domain.facility.entity;

/** 월 스냅샷을 마지막으로 채운 경로. */
public enum CrawlSource {
    SCHEDULER,
    ON_DEMAND
}
```

- [ ] 컴파일 검증: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava -q && echo COMPILE_OK` → `COMPILE_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/entity && git commit -m "feat(backend): 시설 도메인 enum(ReservationStatus·DataSource·FetchStatus·CrawlSource)"
```

---

### Task 6: 엔티티 (Facility / FacilityReservation / FacilityMonthSnapshot)

`BaseEntity` 상속(`created_at/updated_at/deleted_at`). **이 도메인은 `@SQLDelete`/`@SQLRestriction` 을 쓰지 않는다** — 시설 아카이브는 `archived_at`, 예약은 하드 삭제(스냅샷 교체). `findAll()` 이 아카이브 포함 전체를 반환해야 reconcile 이 가능하므로 soft-delete 미적용이 필수다. 예약의 시설 참조는 벌크 교체·조회 편의를 위해 `Long facilityId`(ClubEvent 의 `Long clubId` 선례) 로 둔다.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/entity/Facility.java`
- Create: `backend/src/main/java/com/duing/domain/facility/entity/FacilityReservation.java`
- Create: `backend/src/main/java/com/duing/domain/facility/entity/FacilityMonthSnapshot.java`

- [ ] `Facility.java`:

```java
package com.duing.domain.facility.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Facility extends BaseEntity {

    @Column(name = "room_seq", nullable = false, unique = true)
    private Integer roomSeq;

    @Column(name = "room_name", nullable = false, length = 100)
    private String roomName;

    @Column(name = "location", length = 100)
    private String location;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "archived_at")
    private LocalDateTime archivedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private Facility(Integer roomSeq, String roomName, String location, Integer sortOrder) {
        this.roomSeq = roomSeq;
        this.roomName = roomName;
        this.location = location;
        this.sortOrder = sortOrder;
    }

    public static Facility create(Integer roomSeq, String roomName, String location, Integer sortOrder) {
        return Facility.builder()
                .roomSeq(roomSeq)
                .roomName(roomName)
                .location(location)
                .sortOrder(sortOrder)
                .build();
    }

    /** 학교 목록 기준 이름/위치/순서를 갱신한다. 변경이 있으면 true 를 반환한다(reconcile 로그용). */
    public boolean updateDetails(String newRoomName, String newLocation, Integer newSortOrder) {
        boolean changed = !Objects.equals(this.roomName, newRoomName)
                || !Objects.equals(this.location, newLocation)
                || !Objects.equals(this.sortOrder, newSortOrder);
        this.roomName = newRoomName;
        this.location = newLocation;
        this.sortOrder = newSortOrder;
        return changed;
    }

    /** 학교 목록에서 사라진 시설을 아카이브한다(하드삭제 금지). */
    public void archive(LocalDateTime now) {
        this.archivedAt = now;
    }

    /** 학교 목록에 재등장한 시설의 아카이브를 해제한다. */
    public void restore() {
        this.archivedAt = null;
    }

    public boolean isArchived() {
        return this.archivedAt != null;
    }
}
```

- [ ] `FacilityReservation.java`:

```java
package com.duing.domain.facility.entity;

import com.duing.domain.facility.converter.YearMonthAttributeConverter;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility_reservation")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityReservation extends BaseEntity {

    @Column(name = "facility_id", nullable = false)
    private Long facilityId;

    @Column(name = "schedule_seq", nullable = false, unique = true)
    private Long scheduleSeq;

    @Convert(converter = YearMonthAttributeConverter.class)
    @Column(name = "year_month", nullable = false, length = 7)
    private YearMonth yearMonth;

    @Column(name = "reservation_date", nullable = false)
    private LocalDate reservationDate;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "organization_name", nullable = false, length = 200)
    private String organizationName;

    @Column(name = "crawled_at", nullable = false)
    private LocalDateTime crawledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityReservation(Long facilityId, Long scheduleSeq, YearMonth yearMonth, LocalDate reservationDate,
                                LocalTime startTime, LocalTime endTime, String organizationName, LocalDateTime crawledAt) {
        this.facilityId = facilityId;
        this.scheduleSeq = scheduleSeq;
        this.yearMonth = yearMonth;
        this.reservationDate = reservationDate;
        this.startTime = startTime;
        this.endTime = endTime;
        this.organizationName = organizationName;
        this.crawledAt = crawledAt;
    }

    public static FacilityReservation create(Long facilityId, Long scheduleSeq, YearMonth yearMonth,
                                             LocalDate reservationDate, LocalTime startTime, LocalTime endTime,
                                             String organizationName, LocalDateTime crawledAt) {
        return FacilityReservation.builder()
                .facilityId(facilityId)
                .scheduleSeq(scheduleSeq)
                .yearMonth(yearMonth)
                .reservationDate(reservationDate)
                .startTime(startTime)
                .endTime(endTime)
                .organizationName(organizationName)
                .crawledAt(crawledAt)
                .build();
    }
}
```

- [ ] `FacilityMonthSnapshot.java`:

```java
package com.duing.domain.facility.entity;

import com.duing.domain.facility.converter.YearMonthAttributeConverter;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.time.YearMonth;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility_month_snapshot")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityMonthSnapshot extends BaseEntity {

    private static final int MAX_ERROR_LENGTH = 500;

    @Convert(converter = YearMonthAttributeConverter.class)
    @Column(name = "year_month", nullable = false, unique = true, length = 7)
    private YearMonth yearMonth;

    @Column(name = "crawled_at", nullable = false)
    private LocalDateTime crawledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private CrawlSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "fetch_status", nullable = false, length = 20)
    private FetchStatus fetchStatus;

    @Column(name = "last_error", length = MAX_ERROR_LENGTH)
    private String lastError;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityMonthSnapshot(YearMonth yearMonth, LocalDateTime crawledAt, CrawlSource source,
                                  FetchStatus fetchStatus, String lastError) {
        this.yearMonth = yearMonth;
        this.crawledAt = crawledAt;
        this.source = source;
        this.fetchStatus = fetchStatus;
        this.lastError = lastError;
    }

    public static FacilityMonthSnapshot create(YearMonth yearMonth, LocalDateTime crawledAt, CrawlSource source,
                                               FetchStatus fetchStatus, String lastError) {
        return FacilityMonthSnapshot.builder()
                .yearMonth(yearMonth)
                .crawledAt(crawledAt)
                .source(source)
                .fetchStatus(fetchStatus)
                .lastError(truncate(lastError))
                .build();
    }

    /** 성공/부분성공: crawled_at 갱신(마지막 성공 시각), fetch_status/last_error 기록. */
    public void recordSuccessful(LocalDateTime crawledAt, CrawlSource source, FetchStatus fetchStatus, String lastError) {
        this.crawledAt = crawledAt;
        this.source = source;
        this.fetchStatus = fetchStatus;
        this.lastError = truncate(lastError);
    }

    /** 전체 실패: crawled_at 은 보존(stale/TTL 기준 유지), fetch_status=FAILED·last_error 만 기록. */
    public void recordFailure(CrawlSource source, String lastError) {
        this.source = source;
        this.fetchStatus = FetchStatus.FAILED;
        this.lastError = truncate(lastError);
    }

    private static String truncate(String error) {
        if (error == null) {
            return null;
        }
        return error.length() <= MAX_ERROR_LENGTH ? error : error.substring(0, MAX_ERROR_LENGTH);
    }
}
```

- [ ] 스키마-엔티티 정합 검증(`ddl-auto=validate`): `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.global.RowLevelSecurityMigrationTest"` → 기대 `BUILD SUCCESSFUL` (컨텍스트가 뜨면 세 엔티티가 V69~V71 스키마와 검증 통과함을 의미).
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/entity/Facility.java backend/src/main/java/com/duing/domain/facility/entity/FacilityReservation.java backend/src/main/java/com/duing/domain/facility/entity/FacilityMonthSnapshot.java && git commit -m "feat(backend): 시설·예약·월메타 JPA 엔티티(archived_at·YearMonth 컨버터)"
```

---

### Task 7: 리포지토리 3종

단순 조건 조회는 파생 쿼리, 벌크 삭제는 JPQL(`@Modifying`)로 작성해 YearMonth 컨버터가 적용되게 한다(네이티브 금지).

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/repository/FacilityRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facility/repository/FacilityReservationRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facility/repository/FacilityMonthSnapshotRepository.java`

- [ ] `FacilityRepository.java`:

```java
package com.duing.domain.facility.repository;

import com.duing.domain.facility.entity.Facility;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilityRepository extends JpaRepository<Facility, Long> {

    /** 활성(미아카이브) 시설을 노출 순서대로 조회한다(공개 API·수집 대상). */
    List<Facility> findByArchivedAtIsNullOrderBySortOrderAsc();

    /** reconcile 시 room_seq 로 기존 시설(아카이브 포함)을 찾는다. */
    Optional<Facility> findByRoomSeq(Integer roomSeq);
}
```

- [ ] `FacilityReservationRepository.java`:

```java
package com.duing.domain.facility.repository;

import com.duing.domain.facility.entity.FacilityReservation;
import java.time.YearMonth;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilityReservationRepository extends JpaRepository<FacilityReservation, Long> {

    /** 이용현황 조립용 — 여러 시설의 특정 월 예약을 한 번에 로드한다. */
    List<FacilityReservation> findByFacilityIdInAndYearMonth(Collection<Long> facilityIds, YearMonth yearMonth);

    /** 특정 시설의 특정 월 예약(디버깅·테스트). */
    List<FacilityReservation> findByFacilityIdAndYearMonth(Long facilityId, YearMonth yearMonth);

    /**
     * 원자적 스냅샷 교체의 delete 단계. JPQL 이므로 YearMonth 컨버터가 파라미터에 적용된다(네이티브 금지).
     * clearAutomatically 로 영속성 컨텍스트를 비워 직후 insert 와의 불일치를 방지한다.
     */
    @Modifying(clearAutomatically = true)
    @Query("""
            DELETE FROM FacilityReservation r
            WHERE r.facilityId = :facilityId
              AND r.yearMonth IN :yearMonths
            """)
    void deleteByFacilityIdAndYearMonthIn(@Param("facilityId") Long facilityId,
                                          @Param("yearMonths") Collection<YearMonth> yearMonths);
}
```

- [ ] `FacilityMonthSnapshotRepository.java`:

```java
package com.duing.domain.facility.repository;

import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import java.time.YearMonth;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilityMonthSnapshotRepository extends JpaRepository<FacilityMonthSnapshot, Long> {

    Optional<FacilityMonthSnapshot> findByYearMonth(YearMonth yearMonth);
}
```

- [ ] 컴파일 검증: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava -q && echo COMPILE_OK` → `COMPILE_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/repository && git commit -m "feat(backend): 시설 도메인 리포지토리 3종(활성목록·월 예약·월 메타)"
```

---

### Task 8: 설정 — Properties / RestClient 빈(@EnableRetry) / Job 토글 / yml

`FacilitySchoolClientConfig` 는 **온디맨드 수집이 모든 환경에서 동작해야 하므로 `@ConditionalOnProperty` 로 게이트하지 않는다**(BankApiClientConfig 선례). 스케줄러만 `FacilityCrawlerJobConfig` 로 토글한다.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/config/FacilityCrawlerProperties.java`
- Create: `backend/src/main/java/com/duing/domain/facility/config/FacilitySchoolClientConfig.java`
- Create: `backend/src/main/java/com/duing/domain/facility/config/FacilityCrawlerJobConfig.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-prod.yml`
- Modify: `backend/src/test/resources/application.yml`

- [ ] `FacilityCrawlerProperties.java`:

```java
package com.duing.domain.facility.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 학생회관 시설 크롤러 설정. baseUrl·경로·타임아웃·재시도·룸 간격을 담는다.
 * 재시도(retryMaxAttempts/retryBackoffMillis)는 {@code @Retryable} 의 maxAttemptsExpression/
 * delayExpression 이 이 프로퍼티 키를 SpEL 로 참조한다(§5.3: 총 4회 / 0.5·1·2초).
 */
@Validated
@ConfigurationProperties(prefix = "duing.facility.crawler")
public record FacilityCrawlerProperties(
        @NotBlank String baseUrl,
        @NotBlank String listPath,
        @NotBlank String dataPath,
        @NotBlank String userAgent,
        @Positive int connectTimeoutMillis,
        @Positive int readTimeoutMillis,
        @Positive int retryMaxAttempts,
        @Positive int retryBackoffMillis,
        @Positive int roomDelayMillis,
        boolean enabled
) {}
```

- [ ] `FacilitySchoolClientConfig.java`:

```java
package com.duing.domain.facility.config;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.web.client.RestClient;

/**
 * 시설 크롤러 RestClient 빈 + spring-retry 활성화.
 *
 * <p>{@link com.duing.global.config.BankApiClientConfig} 패턴을 따라 SimpleClientHttpRequestFactory
 * 로 connect/read 타임아웃을 고정한다(§3: connect 3s / read 5s). 온디맨드 조회는 스케줄러 토글과
 * 무관하게 동작해야 하므로 이 설정은 @ConditionalOnProperty 로 게이트하지 않는다.
 *
 * <p>{@link EnableRetry} 는 {@code SchoolFacilityClient#fetchReservations} 의 @Retryable AOP 를 켠다.
 */
@Configuration
@EnableRetry
@EnableConfigurationProperties(FacilityCrawlerProperties.class)
public class FacilitySchoolClientConfig {

    @Bean
    public RestClient facilitySchoolRestClient(FacilityCrawlerProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(properties.connectTimeoutMillis()));
        requestFactory.setReadTimeout(Duration.ofMillis(properties.readTimeoutMillis()));
        return RestClient.builder()
                .baseUrl(properties.baseUrl())
                .requestFactory(requestFactory)
                .build();
    }
}
```

- [ ] `FacilityCrawlerJobConfig.java`:

```java
package com.duing.domain.facility.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 시설 예약/목록 크롤 스케줄러를 활성화하는 설정.
 * {@code duing.facility.crawler.enabled=true}(운영 기본 true, 로컬/테스트 false)일 때만 스케줄링이 켜진다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.facility.crawler", name = "enabled", havingValue = "true")
public class FacilityCrawlerJobConfig {}
```

- [ ] `application.yml` 의 `duing:` 블록 하위(`public-activity:` 다음)에 추가:

```yaml
  facility:
    crawler:
      # 시설 예약 크롤 스케줄러(10분)/시설목록 동기화(1일). 로컬/테스트 기본 비활성 —
      # 운영에서 DUING_FACILITY_CRAWLER_ENABLED=true(application-prod.yml)로 활성화한다.
      # 온디맨드 조회(FacilitySchoolClientConfig)는 이 토글과 무관하게 항상 동작한다.
      enabled: ${DUING_FACILITY_CRAWLER_ENABLED:false}
      base-url: ${DUING_FACILITY_BASE_URL:https://www.daegu.ac.kr}
      list-path: /room/detail
      data-path: /room/data/list
      user-agent: ${DUING_FACILITY_USER_AGENT:Mozilla/5.0 (compatible; DuingFacilityBot/1.0)}
      connect-timeout-millis: 3000
      read-timeout-millis: 5000
      retry-max-attempts: 4
      retry-backoff-millis: 500
      room-delay-millis: 100
```

- [ ] `application-prod.yml` 의 `duing:` 블록 하위에 운영 오버라이드 추가(스케줄러를 운영에서 기본 활성):

```yaml
  # 시설 크롤 스케줄러 — 운영에서는 항상 켠다. 별도 env 셋업 누락으로 조용히 꺼지는 사고를 막는다.
  # 끄고 싶으면 DUING_FACILITY_CRAWLER_ENABLED=false 로 오버라이드한다.
  facility:
    crawler:
      enabled: ${DUING_FACILITY_CRAWLER_ENABLED:true}
```

- [ ] `backend/src/test/resources/application.yml` 의 `duing:` 블록 하위(`public-activity:` 다음)에 추가(테스트는 스케줄러 비활성·외부 호출 금지, @Validated 충족 위해 전체 키 명시):

```yaml
  facility:
    crawler:
      enabled: false
      # 테스트 전용 더미 baseUrl — 온디맨드 fetch 는 신선한 스냅샷을 시드해 캐시히트로 우회하므로 실제 호출 없음.
      base-url: http://localhost:0/facility-stub
      list-path: /room/detail
      data-path: /room/data/list
      user-agent: DuingFacilityTest/1.0
      connect-timeout-millis: 500
      read-timeout-millis: 500
      retry-max-attempts: 4
      retry-backoff-millis: 1
      room-delay-millis: 1
```

- [ ] 컨텍스트 기동 검증(프로퍼티 바인딩·빈 등록): `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.global.RowLevelSecurityMigrationTest"` → 기대 `BUILD SUCCESSFUL` (facility 프로퍼티 미충족이면 컨텍스트 로드 실패).
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/config backend/src/main/resources/application.yml backend/src/main/resources/application-prod.yml backend/src/test/resources/application.yml && git commit -m "feat(backend): 시설 크롤러 프로퍼티·RestClient(@EnableRetry)·스케줄 토글 설정"
```

---

### Task 9: SchoolFacilityClient (HTTP만) + 재시도 분류 테스트

Crawler 계층은 HTTP 만 담당한다. `fetchRoomListHtml()` 은 Jsoup GET(1일 1회, 재시도 없음), `fetchReservations(roomSeq, YearMonth)` 은 RestClient POST(폼) + `@Retryable`. `.retrieve()`(4xx/5xx throw) 대신 `.exchange()` 로 상태코드를 직접 판정한다. **5xx·네트워크·타임아웃 → `FacilityFetchException`(재시도), 4xx → `FacilityBadResponseException`(비재시도).** `@Retryable(retryFor=FacilityFetchException.class)` 이므로 4xx 는 재시도되지 않는다.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/crawler/exception/FacilityClientException.java`
- Create: `backend/src/main/java/com/duing/domain/facility/crawler/SchoolFacilityClient.java`
- Test: `backend/src/test/java/com/duing/domain/facility/crawler/SchoolFacilityClientRetryTest.java`

- [ ] `FacilityClientException.java` (공통 부모 + 재시도/비재시도 구분):

```java
package com.duing.domain.facility.crawler.exception;

/**
 * 크롤러 계층 내부 예외(HTTP 실패 분류 전용). 컨트롤러/사용자에게 노출되지 않고 크롤 서비스가 부모 타입으로
 * 잡아 "룸 실패"로 처리하므로, HttpStatus 를 싣는 도메인 예외(ApplicationException)가 아니라 RuntimeException 을 상속한다.
 * 재시도 여부만 하위 타입으로 구분한다 — @Retryable 은 {@link FacilityFetchException} 에만 반응한다.
 */
public class FacilityClientException extends RuntimeException {

    public FacilityClientException(String message) {
        super(message);
    }

    public FacilityClientException(String message, Throwable cause) {
        super(message, cause);
    }

    /** 네트워크 오류·Timeout·HTTP 5xx — 재시도 대상. */
    public static class FacilityFetchException extends FacilityClientException {
        public FacilityFetchException(String message) {
            super(message);
        }

        public FacilityFetchException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** HTTP 4xx·JSON 형식 오류 — 재시도 안 함(즉시 룸 실패). */
    public static class FacilityBadResponseException extends FacilityClientException {
        public FacilityBadResponseException(String message) {
            super(message);
        }
    }
}
```

- [ ] `SchoolFacilityClient.java`:

```java
package com.duing.domain.facility.crawler;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityBadResponseException;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 학생회관 시설 학교 서버 HTTP 클라이언트(HTTP 만 담당, 파싱은 Parser 계층).
 *
 * <p>시설 목록은 정적 HTML(Jsoup GET), 예약은 월 단위 JSON(RestClient POST 폼)이다.
 * 예약 fetch 는 룸 단위 재시도(총 4회 / 0.5·1·2초)를 적용하되 5xx·네트워크·타임아웃만 재시도하고
 * 4xx 는 재시도하지 않는다(§5.3). .exchange() 로 상태코드를 직접 판정해 재시도 예외를 분류한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SchoolFacilityClient {

    private static final DateTimeFormatter YEAR_MONTH = DateTimeFormatter.ofPattern("yyyy-MM");

    private final RestClient facilitySchoolRestClient;
    private final FacilityCrawlerProperties properties;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    /** 시설 탭 목록 HTML(GET). 1일 1회 호출이며 실패는 상위(동기화 잡)가 스킵 처리한다. */
    public Document fetchRoomListHtml() {
        try {
            return Jsoup.connect(properties.baseUrl() + properties.listPath())
                    .userAgent(properties.userAgent())
                    .timeout(properties.readTimeoutMillis())
                    .get();
        } catch (IOException networkFailure) {
            // URL/상태만 로깅(PII·학교 민감정보 금지).
            log.warn("시설 목록 HTML fetch 실패: path={}", properties.listPath());
            throw new FacilityFetchException("시설 목록 HTML fetch 실패", networkFailure);
        }
    }

    /**
     * 특정 룸·월 예약 JSON 배열(POST). 상태코드를 먼저 판정하고 2xx 일 때만 본문을 파싱한다.
     * 5xx·네트워크·타임아웃 → FacilityFetchException(재시도), 4xx·비 JSON/깨진 본문 → FacilityBadResponseException(비재시도).
     * 본문을 상태 판정 전에 파싱하지 않으므로 4xx HTML 응답이 재시도되거나 파싱 예외가 예외 계층 밖으로 새지 않는다.
     */
    @Retryable(
            retryFor = FacilityFetchException.class,
            maxAttemptsExpression = "${duing.facility.crawler.retry-max-attempts}",
            backoff = @Backoff(
                    delayExpression = "${duing.facility.crawler.retry-backoff-millis}",
                    multiplier = 2))
    public JsonNode fetchReservations(int roomSeq, YearMonth yearMonth) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("room_seq", String.valueOf(roomSeq));
        form.add("schedule_date", yearMonth.format(YEAR_MONTH));
        try {
            return facilitySchoolRestClient.post()
                    .uri(properties.dataPath())
                    .header("X-Requested-With", "XMLHttpRequest")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .exchange((request, response) -> classify(roomSeq, response));
        } catch (RestClientException networkOrTimeout) {
            // 연결 실패·읽기 타임아웃 등 — 재시도 대상. (FacilityClientException 은 RestClientException 이 아니므로 여기 안 걸리고 그대로 전파된다.)
            log.warn("시설 예약 fetch 네트워크 실패: roomSeq={}, yearMonth={}", roomSeq, yearMonth.format(YEAR_MONTH));
            throw new FacilityFetchException("시설 예약 fetch 네트워크 실패", networkOrTimeout);
        }
    }

    /** 상태코드 우선 판정 후 2xx 에서만 JSON 배열로 파싱한다. 단일 인자 exchange 콜백이라 close=true 로 응답이 닫힌다. */
    private JsonNode classify(int roomSeq, ClientHttpResponse response) {
        HttpStatusCode status;
        try {
            status = response.getStatusCode();
        } catch (IOException statusReadError) {
            log.warn("시설 예약 응답 상태 판독 실패: roomSeq={}", roomSeq);
            throw new FacilityFetchException("시설 예약 응답 상태 판독 실패", statusReadError); // 재시도
        }
        if (status.is5xxServerError()) {
            log.warn("시설 예약 fetch 5xx: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityFetchException("시설 예약 fetch 5xx: " + status.value()); // 재시도
        }
        if (!status.is2xxSuccessful()) {
            log.warn("시설 예약 fetch 4xx: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityBadResponseException("시설 예약 fetch 4xx: " + status.value()); // 비재시도
        }
        JsonNode body;
        try {
            body = objectMapper.readTree(response.getBody());
        } catch (IOException malformed) {
            // 2xx 인데 HTML/깨진 JSON(세션만료·차단 페이지 등) — 비재시도, 예외 계층 안에 유지.
            log.warn("시설 예약 응답 JSON 파싱 실패: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityBadResponseException("시설 예약 응답 JSON 파싱 실패");
        }
        if (body == null || !body.isArray()) {
            log.warn("시설 예약 응답이 JSON 배열이 아님: roomSeq={}, status={}", roomSeq, status.value());
            throw new FacilityBadResponseException("시설 예약 응답 형식 오류");
        }
        return body;
    }
}
```

- [ ] 실패 테스트 작성 `SchoolFacilityClientRetryTest.java`. `@ExtendWith(SpringExtension.class)` + `@ContextConfiguration` 로 최소 컨텍스트(부트 오토컨피그·DB 없음)에서 `@EnableRetry` 프록시를 켠다. MockRestServiceServer 를 RestClient.Builder 에 바인딩(ResendEmailSenderTest 패턴)하되, 빌더에 팩토리를 심은 뒤 RestClient 를 빌드하도록 빈 순서를 강제한다:

```java
package com.duing.domain.facility.crawler;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityBadResponseException;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.YearMonth;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = SchoolFacilityClientRetryTest.RetryTestConfig.class)
@TestPropertySource(properties = {
        "duing.facility.crawler.retry-max-attempts=4",
        "duing.facility.crawler.retry-backoff-millis=1" // 테스트 가속(0.5s 실대기 회피)
})
class SchoolFacilityClientRetryTest {

    @Autowired SchoolFacilityClient client;
    @Autowired MockRestServiceServer mockServer;

    @AfterEach
    void resetServer() {
        mockServer.reset();
    }

    @Test
    @DisplayName("5xx 응답은 총 4회(초기 1 + 재시도 3)까지 재시도한 뒤 FacilityFetchException 을 던진다")
    void serverErrorRetriesFourTimes() {
        mockServer.expect(ExpectedCount.times(4), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityFetchException.class);
        mockServer.verify(); // 정확히 4회 요청 수신을 단언
    }

    @Test
    @DisplayName("4xx 응답은 재시도하지 않고 단 1회 요청 후 FacilityBadResponseException 을 던진다")
    void clientErrorNotRetried() {
        mockServer.expect(ExpectedCount.times(1), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityBadResponseException.class);
        mockServer.verify(); // 재시도 없이 1회만
    }

    @Test
    @DisplayName("4xx 응답 본문이 HTML(비 JSON)이어도 재시도 없이 1회만 요청하고 FacilityBadResponseException 을 던진다")
    void clientErrorWithHtmlBodyNotRetried() {
        mockServer.expect(ExpectedCount.times(1), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.TEXT_HTML).body("<html>error</html>"));

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityBadResponseException.class);
        mockServer.verify(); // 4xx = 비재시도, 1회만
    }

    @Test
    @DisplayName("200 이지만 본문이 HTML/깨진 JSON 이면 재시도 없이 FacilityBadResponseException(파싱 실패)을 던진다")
    void malformedOkBodyNotRetried() {
        mockServer.expect(ExpectedCount.times(1), requestTo("https://school.test/room/data/list"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.OK).contentType(MediaType.TEXT_HTML).body("<html>blocked</html>"));

        assertThatThrownBy(() -> client.fetchReservations(4, YearMonth.of(2026, 7)))
                .isInstanceOf(FacilityBadResponseException.class);
        mockServer.verify(); // 파싱 실패도 계층 안에서 비재시도
    }

    @Configuration
    @EnableRetry
    static class RetryTestConfig {

        @Bean
        RestClient.Builder facilityBuilder() {
            return RestClient.builder().baseUrl("https://school.test");
        }

        // 빌더에 mock 팩토리를 심는다. facilitySchoolRestClient 가 이 빈에 의존하므로 바인딩 후 build 된다.
        @Bean
        MockRestServiceServer mockServer(RestClient.Builder facilityBuilder) {
            return MockRestServiceServer.bindTo(facilityBuilder).build();
        }

        @Bean
        RestClient facilitySchoolRestClient(RestClient.Builder facilityBuilder, MockRestServiceServer mockServer) {
            return facilityBuilder.build();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        FacilityCrawlerProperties facilityCrawlerProperties() {
            return new FacilityCrawlerProperties(
                    "https://school.test", "/room/detail", "/room/data/list",
                    "DuingFacilityTest/1.0", 500, 500, 4, 1, 1, false);
        }

        @Bean
        SchoolFacilityClient schoolFacilityClient(RestClient facilitySchoolRestClient,
                                                  FacilityCrawlerProperties props, ObjectMapper objectMapper) {
            return new SchoolFacilityClient(facilitySchoolRestClient, props, objectMapper);
        }
    }
}
```

- [ ] 실행 → FAIL(먼저 클래스 미존재로 컴파일 실패였다면 구현 후) 후 PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.crawler.SchoolFacilityClientRetryTest"` → 구현 전 `BUILD FAILED`, 구현 후 `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/crawler backend/src/test/java/com/duing/domain/facility/crawler && git commit -m "feat(backend): 시설 학교 HTTP 클라이언트(@Retryable 5xx만 재시도·4xx 제외)"
```

---

### Task 10: FacilityListParser + fixture 회귀 테스트

`Document → List<ParsedFacility>`. `li[id^=room_]` 순회, id 에서 room_seq, 앵커 텍스트에서 이름. 위치 분리 규칙(§2.1): 마지막 괄호 그룹이 `\d+호?`(숫자+호 또는 순수 숫자)면 location 분리, 아니면 전체가 roomName(`자유광장(노천강당)` 미분리, `빛광장` location null).

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/parser/ParsedFacility.java`
- Create: `backend/src/main/java/com/duing/domain/facility/parser/FacilityListParser.java`
- Test: `backend/src/test/java/com/duing/domain/facility/parser/FacilityListParserTest.java`

- [ ] `ParsedFacility.java`:

```java
package com.duing.domain.facility.parser;

/** 시설 목록 파싱 산출물. sortOrder 는 탭 노출 순서(0-based). location 은 없을 수 있다(null). */
public record ParsedFacility(int roomSeq, String roomName, String location, int sortOrder) {}
```

- [ ] 실패 테스트 `FacilityListParserTest.java`:

```java
package com.duing.domain.facility.parser;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityListParserTest {

    private final FacilityListParser parser = new FacilityListParser();

    private Document loadFixture() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/facility/room_detail.html")) {
            String html = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            return Jsoup.parse(html);
        }
    }

    @Test
    @DisplayName("실측 HTML 에서 10개 시설을 room_seq·이름·위치로 파싱한다(불연속 room_seq 포함)")
    void parsesTenFacilities() throws IOException {
        List<ParsedFacility> facilities = parser.parse(loadFixture());

        assertThat(facilities).hasSize(10);
        assertThat(facilities).extracting(ParsedFacility::roomSeq)
                .containsExactly(1, 2, 3, 4, 6, 22, 41, 82, 102, 143);
    }

    @Test
    @DisplayName("room_seq 4 는 공동연습실(1)/2105 로, 커뮤니티룸(1) 은 1503호 로 위치가 분리된다")
    void splitsRoomNameAndLocation() throws IOException {
        Map<Integer, ParsedFacility> byRoomSeq = parser.parse(loadFixture()).stream()
                .collect(Collectors.toMap(ParsedFacility::roomSeq, Function.identity()));

        assertThat(byRoomSeq.get(4).roomName()).isEqualTo("공동연습실(1)");
        assertThat(byRoomSeq.get(4).location()).isEqualTo("2105");
        assertThat(byRoomSeq.get(1).roomName()).isEqualTo("커뮤니티룸(1)");
        assertThat(byRoomSeq.get(1).location()).isEqualTo("1503호");
        // sortOrder 는 탭 순서(첫 탭 = 0)
        assertThat(byRoomSeq.get(1).sortOrder()).isZero();
    }

    @Test
    @DisplayName("위치가 없는 시설(빛광장)은 location=null 이고 자유광장(노천강당)은 괄호를 분리하지 않는다")
    void nullLocationAndNoSplitForNonNumericParen() throws IOException {
        Map<Integer, ParsedFacility> byRoomSeq = parser.parse(loadFixture()).stream()
                .collect(Collectors.toMap(ParsedFacility::roomSeq, Function.identity()));

        assertThat(byRoomSeq.get(22).roomName()).isEqualTo("빛광장");
        assertThat(byRoomSeq.get(22).location()).isNull();
        assertThat(byRoomSeq.get(41).roomName()).isEqualTo("자유광장(노천강당)");
        assertThat(byRoomSeq.get(41).location()).isNull();
        // room_82/102 는 공동연습실(2)/(4) — 실측 매핑(번호가 room_seq 순서와 불일치) 고정
        assertThat(byRoomSeq.get(82).roomName()).isEqualTo("공동연습실(2)");
        assertThat(byRoomSeq.get(82).location()).isEqualTo("2107");
        assertThat(byRoomSeq.get(102).roomName()).isEqualTo("공동연습실(4)");
        assertThat(byRoomSeq.get(102).location()).isEqualTo("1506호");
    }
}
```

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.parser.FacilityListParserTest"` → `BUILD FAILED`.
- [ ] 구현 `FacilityListParser.java`:

```java
package com.duing.domain.facility.parser;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.stereotype.Component;

/**
 * 시설 탭 목록 HTML → List&lt;ParsedFacility&gt;. {@code li[id^=room_]} 만 읽는다.
 *
 * <p>위치 분리 규칙(§2.1): 이름 문자열의 마지막 괄호 그룹이 {@code \d+호?}(숫자+선택적 '호', 순수 숫자 포함)
 * 이면 location 으로 분리하고, 그 외(예: '자유광장(노천강당)')는 전체를 roomName 으로 둔다. 괄호가 없으면
 * location 은 null.
 */
@Slf4j
@Component
public class FacilityListParser {

    private static final String ROOM_ID_PREFIX = "room_";
    private static final Pattern TRAILING_PAREN = Pattern.compile("\\(([^()]*)\\)\\s*$");
    private static final Pattern LOCATION_CONTENT = Pattern.compile("\\d+호?");

    public List<ParsedFacility> parse(Document document) {
        List<ParsedFacility> result = new ArrayList<>();
        int sortOrder = 0;
        for (Element li : document.select("li[id^=" + ROOM_ID_PREFIX + "]")) {
            Integer roomSeq = parseRoomSeq(li.id());
            if (roomSeq == null) {
                continue; // room_ 뒤가 숫자가 아니면 시설 탭이 아님 — 스킵
            }
            String fullName = extractName(li);
            if (fullName.isBlank()) {
                continue;
            }
            ParsedFacility facility = split(roomSeq, fullName, sortOrder);
            result.add(facility);
            sortOrder++;
        }
        return result;
    }

    private Integer parseRoomSeq(String id) {
        String seqText = id.substring(ROOM_ID_PREFIX.length());
        try {
            return Integer.parseInt(seqText.trim());
        } catch (NumberFormatException notNumeric) {
            return null;
        }
    }

    private String extractName(Element li) {
        Element anchor = li.selectFirst("a");
        if (anchor != null && !anchor.text().isBlank()) {
            return anchor.text().trim();
        }
        Element heading = li.selectFirst("h3");
        return heading == null ? "" : heading.text().trim();
    }

    private ParsedFacility split(int roomSeq, String fullName, int sortOrder) {
        Matcher matcher = TRAILING_PAREN.matcher(fullName);
        if (matcher.find()) {
            String content = matcher.group(1).trim();
            if (LOCATION_CONTENT.matcher(content).matches()) {
                String roomName = fullName.substring(0, matcher.start()).trim();
                return new ParsedFacility(roomSeq, roomName, content, sortOrder);
            }
        }
        return new ParsedFacility(roomSeq, fullName, null, sortOrder);
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.parser.FacilityListParserTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/parser/ParsedFacility.java backend/src/main/java/com/duing/domain/facility/parser/FacilityListParser.java backend/src/test/java/com/duing/domain/facility/parser/FacilityListParserTest.java && git commit -m "feat(backend): 시설 목록 HTML 파서(room_seq·이름·위치 분리)"
```

---

### Task 11: ReservationParser + fixture 회귀 테스트

`JsonNode(배열) + YearMonth → List<ParsedReservation>`. `schedule_seq→long`, `schedule_date(일)+YearMonth→LocalDate`, `schedule_time '19:00~20:00'→start/end LocalTime`, dept 꼬리 시간표기 제거(§6.2), `scheduleSeq` distinct. 파싱 불가 원소는 건너뛴다(배치 크래시 방지, BankApiHttpClient 선례).

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/parser/ParsedReservation.java`
- Create: `backend/src/main/java/com/duing/domain/facility/parser/ReservationParser.java`
- Test: `backend/src/test/java/com/duing/domain/facility/parser/ReservationParserTest.java`

- [ ] `ParsedReservation.java`:

```java
package com.duing.domain.facility.parser;

import java.time.LocalDate;
import java.time.LocalTime;

/** 예약 JSON 파싱 산출물(원본 1시간 슬롯). organizationName 은 꼬리 시간표기가 제거된 상태. */
public record ParsedReservation(long scheduleSeq, LocalDate reservationDate, LocalTime startTime,
                                LocalTime endTime, String organizationName) {}
```

- [ ] 실패 테스트 `ReservationParserTest.java`:

```java
package com.duing.domain.facility.parser;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReservationParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ReservationParser parser = new ReservationParser();

    private JsonNode loadFixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/facility/" + name)) {
            return objectMapper.readTree(in);
        }
    }

    @Test
    @DisplayName("room4 픽스처: 중복 schedule_seq 를 distinct 하고 dept 꼬리 시간표기를 제거하며 date/time 을 조립한다")
    void parsesRoom4() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room4.json"), YearMonth.of(2026, 7));

        // schedule_seq 18141 중복 1건 제거 → 4건
        assertThat(reservations).hasSize(4);
        assertThat(reservations).extracting(ParsedReservation::scheduleSeq)
                .containsExactlyInAnyOrder(18134L, 18135L, 18140L, 18141L);

        ParsedReservation first = reservations.stream().filter(r -> r.scheduleSeq() == 18134L).findFirst().orElseThrow();
        assertThat(first.organizationName()).isEqualTo("고정관념"); // "(9:00~20:00)" 제거
        assertThat(first.reservationDate()).isEqualTo(LocalDate.of(2026, 7, 1)); // date "01" + 2026-07
        assertThat(first.startTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(first.endTime()).isEqualTo(LocalTime.of(10, 0));
    }

    @Test
    @DisplayName("빈 배열(200+[]) 픽스처는 빈 목록으로 파싱된다")
    void parsesEmptyArray() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room1_empty.json"), YearMonth.of(2026, 7));
        assertThat(reservations).isEmpty();
    }

    @Test
    @DisplayName("room143 픽스처의 예약을 파싱한다")
    void parsesRoom143() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room143.json"), YearMonth.of(2026, 7));
        assertThat(reservations).hasSize(1);
        assertThat(reservations.get(0).organizationName()).isEqualTo("총학생회");
        assertThat(reservations.get(0).reservationDate()).isEqualTo(LocalDate.of(2026, 7, 15));
    }
}
```

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.parser.ReservationParserTest"` → `BUILD FAILED`.
- [ ] 구현 `ReservationParser.java`:

```java
package com.duing.domain.facility.parser;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 예약 JSON 배열 → List&lt;ParsedReservation&gt;. schedule_seq distinct, dept 꼬리 시간표기 제거(§6.2),
 * schedule_date(일) + YearMonth → LocalDate, schedule_time '19:00~20:00' → start/end LocalTime.
 * 파싱 불가 원소는 건너뛴다(사유별 건수만 로깅, 배치 크래시 방지).
 */
@Slf4j
@Component
public class ReservationParser {

    // 꼬리 시간표기만 제거: "고정관념(9:00~20:00)" → "고정관념". 그 외 괄호는 보존.
    private static final Pattern TRAILING_TIME = Pattern.compile("\\s*\\(\\d{1,2}:\\d{2}\\s*~\\s*\\d{1,2}:\\d{2}\\)\\s*$");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("H:mm");
    private static final String TIME_SEPARATOR = "~";

    public List<ParsedReservation> parse(JsonNode arrayNode, YearMonth yearMonth) {
        // LinkedHashMap: schedule_seq 로 distinct 하되 최초 입력 순서를 보존한다.
        Map<Long, ParsedReservation> bySeq = new LinkedHashMap<>();
        if (arrayNode == null || !arrayNode.isArray()) {
            return new ArrayList<>();
        }
        int skipped = 0;
        for (JsonNode element : arrayNode) {
            ParsedReservation reservation = parseElement(element, yearMonth);
            if (reservation == null) {
                skipped++;
                continue;
            }
            bySeq.putIfAbsent(reservation.scheduleSeq(), reservation);
        }
        if (skipped > 0) {
            log.warn("시설 예약 파싱 건너뜀: yearMonth={}, skipped={}", yearMonth, skipped);
        }
        return new ArrayList<>(bySeq.values());
    }

    private ParsedReservation parseElement(JsonNode element, YearMonth yearMonth) {
        String seqText = element.path("schedule_seq").asText("");
        String dateText = element.path("schedule_date").asText("");
        String timeText = element.path("schedule_time").asText("");
        String deptText = element.path("schedule_dept").asText("");
        if (seqText.isBlank() || dateText.isBlank() || timeText.isBlank()) {
            return null;
        }
        try {
            long scheduleSeq = Long.parseLong(seqText.trim());
            LocalDate reservationDate = yearMonth.atDay(Integer.parseInt(dateText.trim()));
            String[] slot = timeText.split(TIME_SEPARATOR);
            if (slot.length != 2) {
                return null;
            }
            LocalTime start = LocalTime.parse(slot[0].trim(), TIME);
            LocalTime end = LocalTime.parse(slot[1].trim(), TIME);
            String organization = TRAILING_TIME.matcher(deptText.trim()).replaceAll("").trim();
            return new ParsedReservation(scheduleSeq, reservationDate, start, end, organization);
        } catch (NumberFormatException | DateTimeException malformed) {
            return null; // 개별 원소 오류는 스킵(내용은 로깅하지 않음)
        }
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.parser.ReservationParserTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/parser/ParsedReservation.java backend/src/main/java/com/duing/domain/facility/parser/ReservationParser.java backend/src/test/java/com/duing/domain/facility/parser/ReservationParserTest.java && git commit -m "feat(backend): 예약 JSON 파서(dept 정리·date 조립·distinct)"
```

---

### Task 12: SlotMerger(순수 함수) + 4조건 테스트

정렬 후 **① 같은 시설(호출부가 시설별로 스코프) ② 같은 날짜 ③ 같은 단체 ④ 이전 end == 다음 start** 를 모두 만족할 때만 병합. 비인접(`고정관념` 09-10·19-20) 분리, 다른 단체·다른 날짜 미병합, 체인(09-12) 병합.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/service/SlotMerger.java`
- Test: `backend/src/test/java/com/duing/domain/facility/service/SlotMergerTest.java`

- [ ] 실패 테스트 `SlotMergerTest.java`:

```java
package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.service.SlotMerger.MergedSlot;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SlotMergerTest {

    private final SlotMerger merger = new SlotMerger();
    private final LocalDate day = LocalDate.of(2026, 7, 1);

    private ParsedReservation slot(long seq, String org, int startHour, int endHour) {
        return new ParsedReservation(seq, day, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), org);
    }

    @Test
    @DisplayName("같은 날짜·단체의 인접 슬롯 09-10·10-11·11-12 는 09-12 하나로 병합된다")
    void mergesAdjacentSameOrgChain() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "댄스동아리", 9, 10), slot(2, "댄스동아리", 10, 11), slot(3, "댄스동아리", 11, 12)));
        assertThat(merged).hasSize(1);
        assertThat(merged.get(0).start()).isEqualTo(LocalTime.of(9, 0));
        assertThat(merged.get(0).end()).isEqualTo(LocalTime.of(12, 0));
        assertThat(merged.get(0).organization()).isEqualTo("댄스동아리");
    }

    @Test
    @DisplayName("같은 단체라도 비인접(09-10·19-20)이면 병합되지 않고 2건으로 유지된다")
    void keepsNonAdjacentSplit() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "고정관념", 9, 10), slot(2, "고정관념", 19, 20)));
        assertThat(merged).extracting(MergedSlot::start, MergedSlot::end)
                .containsExactly(tuple(LocalTime.of(9, 0), LocalTime.of(10, 0)),
                        tuple(LocalTime.of(19, 0), LocalTime.of(20, 0)));
    }

    @Test
    @DisplayName("인접하지만 단체가 다르면 병합되지 않는다")
    void doesNotMergeDifferentOrg() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "A동아리", 9, 10), slot(2, "B동아리", 10, 11)));
        assertThat(merged).hasSize(2);
    }

    @Test
    @DisplayName("같은 단체·인접 시각이라도 날짜가 다르면 병합되지 않는다")
    void doesNotMergeDifferentDate() {
        ParsedReservation d1 = new ParsedReservation(1, LocalDate.of(2026, 7, 1), LocalTime.of(23, 0), LocalTime.of(23, 59), "A");
        ParsedReservation d2 = new ParsedReservation(2, LocalDate.of(2026, 7, 2), LocalTime.of(9, 0), LocalTime.of(10, 0), "A");
        assertThat(merger.merge(List.of(d1, d2))).hasSize(2);
    }
}
```

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.SlotMergerTest"` → `BUILD FAILED`.
- [ ] 구현 `SlotMerger.java`:

```java
package com.duing.domain.facility.service;

import com.duing.domain.facility.parser.ParsedReservation;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * 한 시설의 예약 슬롯을 연속 병합하는 순수 함수(§6.1). 조건 ①(같은 시설)은 호출부가 시설별로
 * 스코프하므로 여기서는 ②날짜 ③단체 ④인접(prev.end == next.start)만 검사한다.
 */
@Component
public class SlotMerger {

    /** 병합된 슬롯(조회 시점 상태는 상위에서 계산). */
    public record MergedSlot(LocalDate date, LocalTime start, LocalTime end, String organization) {}

    private static final Comparator<ParsedReservation> ORDER =
            Comparator.comparing(ParsedReservation::reservationDate)
                    .thenComparing(ParsedReservation::startTime);

    public List<MergedSlot> merge(List<ParsedReservation> reservations) {
        List<MergedSlot> result = new ArrayList<>();
        List<ParsedReservation> sorted = reservations.stream().sorted(ORDER).toList();
        for (ParsedReservation reservation : sorted) {
            MergedSlot last = result.isEmpty() ? null : result.get(result.size() - 1);
            if (last != null && isMergeable(last, reservation)) {
                result.set(result.size() - 1,
                        new MergedSlot(last.date(), last.start(), reservation.endTime(), last.organization()));
            } else {
                result.add(new MergedSlot(reservation.reservationDate(), reservation.startTime(),
                        reservation.endTime(), reservation.organizationName()));
            }
        }
        return result;
    }

    private boolean isMergeable(MergedSlot last, ParsedReservation next) {
        return last.date().equals(next.reservationDate())
                && Objects.equals(last.organization(), next.organizationName())
                && last.end().equals(next.startTime());
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.SlotMergerTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/service/SlotMerger.java backend/src/test/java/com/duing/domain/facility/service/SlotMergerTest.java && git commit -m "feat(backend): 연속 슬롯 병합 SlotMerger(4조건 순수 함수)"
```

---

### Task 13: FacilitySyncService (시설 목록 reconcile) + 테스트

`fetchRoomListHtml → FacilityListParser → reconcile`: 신규 생성, 기존은 이름/위치/순서 변경 시 수정 + 아카이브면 복구, 파싱 목록에 없어진 기존 시설은 `archived_at=now`(하드삭제 금지). `@Transactional`. 시각은 주입된 `Clock`(seoulClock).

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/service/FacilitySyncService.java`
- Test: `backend/src/test/java/com/duing/domain/facility/service/FacilitySyncServiceTest.java`

- [ ] 실패 테스트 `FacilitySyncServiceTest.java` (Mockito 단위 테스트):

```java
package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.parser.FacilityListParser;
import com.duing.domain.facility.parser.ParsedFacility;
import com.duing.domain.facility.repository.FacilityRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.jsoup.nodes.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilitySyncServiceTest {

    @Mock SchoolFacilityClient client;
    @Mock FacilityListParser listParser;
    @Mock FacilityRepository facilityRepository;

    FacilitySyncService service;
    final Clock clock = Clock.fixed(Instant.parse("2026-07-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    @BeforeEach
    void setUp() {
        service = new FacilitySyncService(client, listParser, facilityRepository, clock);
        when(client.fetchRoomListHtml()).thenReturn(new Document("https://school.test"));
    }

    @Test
    @DisplayName("신규 room_seq 는 새 시설로 저장된다")
    void createsNewFacility() {
        when(listParser.parse(any())).thenReturn(List.of(new ParsedFacility(4, "공동연습실(1)", "2105", 0)));
        when(facilityRepository.findAll()).thenReturn(List.of());
        when(facilityRepository.findByRoomSeq(4)).thenReturn(Optional.empty());

        service.sync();

        org.mockito.Mockito.verify(facilityRepository).save(org.mockito.ArgumentMatchers.argThat(
                saved -> saved.getRoomSeq() == 4 && saved.getRoomName().equals("공동연습실(1)")));
    }

    @Test
    @DisplayName("기존 시설의 이름/위치가 바뀌면 수정되고 아카이브 상태면 복구된다")
    void updatesAndRestores() {
        Facility existing = Facility.create(4, "공동연습실(1)", "2105", 0);
        existing.archive(java.time.LocalDateTime.now(clock)); // 아카이브 상태
        when(facilityRepository.findByRoomSeq(4)).thenReturn(Optional.of(existing));
        when(facilityRepository.findAll()).thenReturn(List.of(existing));
        when(listParser.parse(any())).thenReturn(List.of(new ParsedFacility(4, "공동연습실(1)", "2105-1", 0)));

        service.sync();

        assertThat(existing.getLocation()).isEqualTo("2105-1");
        assertThat(existing.isArchived()).isFalse();
    }

    @Test
    @DisplayName("파싱 목록에 없어진 기존 시설은 archived_at 이 설정된다(하드삭제 금지)")
    void archivesRemoved() {
        Facility stale = Facility.create(99, "폐지시설", null, 0);
        when(facilityRepository.findAll()).thenReturn(List.of(stale));
        when(listParser.parse(any())).thenReturn(List.of(new ParsedFacility(4, "공동연습실(1)", "2105", 0)));
        when(facilityRepository.findByRoomSeq(4)).thenReturn(Optional.empty());

        service.sync();

        assertThat(stale.isArchived()).isTrue();
    }
}
```

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilitySyncServiceTest"` → `BUILD FAILED`.
- [ ] 구현 `FacilitySyncService.java`:

```java
package com.duing.domain.facility.service;

import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.parser.FacilityListParser;
import com.duing.domain.facility.parser.ParsedFacility;
import com.duing.domain.facility.repository.FacilityRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시설 목록 동기화(1일 1회). 학교 탭 목록을 파싱해 DB 를 reconcile 한다: 신규 생성, 이름/위치/순서 변경 수정,
 * 아카이브 복구, 없어진 시설 아카이브(하드삭제 금지). archived_at 만 다루므로 findAll() 이 아카이브 포함
 * 전체를 반환하는 것에 의존한다(이 도메인은 @SQLRestriction 미사용).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FacilitySyncService {

    private final SchoolFacilityClient client;
    private final FacilityListParser listParser;
    private final FacilityRepository facilityRepository;
    private final Clock clock;

    @Transactional
    public void sync() {
        Document document = client.fetchRoomListHtml();
        List<ParsedFacility> parsed = listParser.parse(document);
        if (parsed.isEmpty()) {
            log.warn("시설 목록 동기화 스킵: 파싱 결과 0건(학교 응답 이상 가능)");
            return;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        Set<Integer> seenRoomSeqs = new HashSet<>();
        int created = 0;
        int updated = 0;

        for (ParsedFacility item : parsed) {
            seenRoomSeqs.add(item.roomSeq());
            Optional<Facility> existing = facilityRepository.findByRoomSeq(item.roomSeq());
            if (existing.isEmpty()) {
                facilityRepository.save(
                        Facility.create(item.roomSeq(), item.roomName(), item.location(), item.sortOrder()));
                created++;
                continue;
            }
            Facility facility = existing.get();
            boolean changed = facility.updateDetails(item.roomName(), item.location(), item.sortOrder());
            if (facility.isArchived()) {
                facility.restore();
                changed = true;
            }
            if (changed) {
                updated++;
            }
        }

        int archived = 0;
        for (Facility facility : facilityRepository.findAll()) {
            if (!seenRoomSeqs.contains(facility.getRoomSeq()) && !facility.isArchived()) {
                facility.archive(now);
                archived++;
            }
        }
        log.info("Facility Sync 완료 created={} updated={} archived={} total={}",
                created, updated, archived, parsed.size());
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilitySyncServiceTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/service/FacilitySyncService.java backend/src/test/java/com/duing/domain/facility/service/FacilitySyncServiceTest.java && git commit -m "feat(backend): 시설 목록 reconcile 동기화(생성·수정·아카이브·복구)"
```

---

### Task 14: FacilitySnapshotWriter (@Transactional 원자적 교체 + 메타 upsert)

트랜잭션 경계를 별도 빈으로 분리한다 — 오케스트레이터(`FacilityCrawlService`)가 파싱·검증을 트랜잭션 **밖**에서 한 뒤, 이 빈의 `@Transactional` 메서드로 `delete → insert` 를 원자적으로 수행한다(self-invocation 프록시 우회 문제 회피). 예외는 트랜잭션 진입 전에 발생하므로 기존 스냅샷은 삭제되지 않는다(fail-safe).

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/service/FacilitySnapshotWriter.java`

- [ ] 구현 `FacilitySnapshotWriter.java` (다음 Task 의 오케스트레이터 테스트에서 mock 되므로 이 Task 는 컴파일만 검증):

```java
package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 원자적 스냅샷 교체와 월 메타 upsert 의 트랜잭션 경계. 오케스트레이터에서 분리해 프록시 self-invocation 을 피한다. */
@Component
@RequiredArgsConstructor
public class FacilitySnapshotWriter {

    private final FacilityReservationRepository reservationRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;

    /**
     * 한 시설의 지정 월들을 원자적으로 교체한다(delete → insert). {@code 200 + []} 는 빈 리스트로 들어와
     * 빈 스냅샷으로 교체된다(취소된 예약 유령 방지). schedule_seq unique 충돌 시 트랜잭션이 롤백되어
     * 호출부가 fail-safe(기존 유지)로 처리한다.
     */
    @Transactional
    public void replaceReservations(Long facilityId, List<YearMonth> months,
                                    Map<YearMonth, List<ParsedReservation>> fetchedByMonth, LocalDateTime crawledAt) {
        reservationRepository.deleteByFacilityIdAndYearMonthIn(facilityId, months);
        List<FacilityReservation> toInsert = new ArrayList<>();
        for (YearMonth yearMonth : months) {
            for (ParsedReservation reservation : fetchedByMonth.getOrDefault(yearMonth, List.of())) {
                toInsert.add(FacilityReservation.create(
                        facilityId, reservation.scheduleSeq(), yearMonth, reservation.reservationDate(),
                        reservation.startTime(), reservation.endTime(), reservation.organizationName(), crawledAt));
            }
        }
        if (!toInsert.isEmpty()) {
            reservationRepository.saveAll(toInsert);
        }
    }

    /** 성공/부분성공 월 메타 upsert — crawled_at(마지막 성공 시각) 갱신. */
    @Transactional
    public void recordSuccessfulMeta(YearMonth yearMonth, FetchStatus status, LocalDateTime crawledAt,
                                     CrawlSource source, String lastError) {
        snapshotRepository.findByYearMonth(yearMonth).ifPresentOrElse(
                snapshot -> snapshot.recordSuccessful(crawledAt, source, status, lastError),
                () -> snapshotRepository.save(FacilityMonthSnapshot.create(yearMonth, crawledAt, source, status, lastError)));
    }

    /**
     * 전체 실패 월 메타 — 기존 메타가 있으면 crawled_at 보존한 채 FAILED·last_error 만 기록.
     * 기존 메타가 없으면(콜드+실패) 메타를 만들지 않는다(crawled_at NOT NULL, 성공 시각 없음) → 조회 시 콜드=stale.
     */
    @Transactional
    public void recordFailureMeta(YearMonth yearMonth, CrawlSource source, String lastError) {
        snapshotRepository.findByYearMonth(yearMonth).ifPresent(snapshot -> snapshot.recordFailure(source, lastError));
    }
}
```

- [ ] 컴파일 검증: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava -q && echo COMPILE_OK` → `COMPILE_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/service/FacilitySnapshotWriter.java && git commit -m "feat(backend): 원자적 스냅샷 교체·월 메타 upsert 트랜잭션 라이터"
```

---

### Task 15: FacilityCrawlService — 수집 오케스트레이션 + Fail-safe + 구조화 로그

per-facility 로 대상 월들을 fetch(재시도 포함)→파싱→검증(트랜잭션 밖)→성공 월만 원자적 교체. **HTTP-200 빈 배열 → 빈 스냅샷 교체; timeout/network/5xx/파싱 예외 → 기존 스냅샷 유지(교체 호출 자체를 하지 않음).** 룸 실패는 격리. 월 메타 SUCCESS/PARTIAL/FAILED 갱신. §9 구조화 로그 + Sentry breadcrumb.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/service/dto/query/CrawlSummary.java`
- Create: `backend/src/main/java/com/duing/domain/facility/service/FacilityCrawlService.java`
- Test: `backend/src/test/java/com/duing/domain/facility/service/FacilityCrawlServiceTest.java`

- [ ] `CrawlSummary.java`:

```java
package com.duing.domain.facility.service.dto.query;

import com.duing.domain.facility.entity.FetchStatus;
import java.time.Duration;
import java.util.List;

/** 크롤 1사이클 결과(구조화 로그·온디맨드 판정용). failedRooms 는 어느 월이든 실패한 room_seq 목록. */
public record CrawlSummary(FetchStatus status, int totalRooms, int succeededRooms, int reservations,
                           List<Integer> failedRooms, Duration duration) {}
```

- [ ] 실패 테스트 `FacilityCrawlServiceTest.java` (Mockito):

```java
package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.crawler.exception.FacilityClientException.FacilityFetchException;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ReservationParser;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilityCrawlServiceTest {

    @Mock FacilityRepository facilityRepository;
    @Mock FacilityMonthSnapshotRepository snapshotRepository;
    @Mock SchoolFacilityClient client;
    @Mock ReservationParser reservationParser;
    @Mock FacilitySnapshotWriter snapshotWriter;

    FacilityCrawlService service;
    final Clock clock = Clock.fixed(Instant.parse("2026-07-01T00:00:00Z"), ZoneId.of("Asia/Seoul"));
    final ObjectMapper objectMapper = new ObjectMapper();
    final YearMonth july = YearMonth.of(2026, 7);

    private FacilityCrawlerProperties props() {
        return new FacilityCrawlerProperties("http://x", "/room/detail", "/room/data/list",
                "UA", 500, 500, 4, 1, 1, false);
    }

    @BeforeEach
    void setUp() {
        service = new FacilityCrawlService(facilityRepository, snapshotRepository, client,
                reservationParser, snapshotWriter, props(), clock);
    }

    @Test
    @DisplayName("HTTP 200 빈 배열은 빈 스냅샷으로 교체하고 월 메타를 SUCCESS 로 기록한다")
    void emptyArrayReplacesWithEmpty() {
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(client.fetchReservations(anyInt(), eq(july))).thenReturn(objectMapper.createArrayNode());
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        verify(snapshotWriter, times(1)).replaceReservations(any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordSuccessfulMeta(eq(july), eq(FetchStatus.SUCCESS), any(), any(), any());
        assertThat(summary.failedRooms()).isEmpty();
    }

    @Test
    @DisplayName("fetch 실패(5xx 소진)는 스냅샷을 교체하지 않고 월 메타를 실패로 기록한다(기존 유지)")
    void fetchFailurePreservesSnapshot() {
        Facility facility = Facility.create(6, "공동연습실(2)", "2106", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(client.fetchReservations(anyInt(), eq(july))).thenThrow(new FacilityFetchException("5xx"));

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        verify(snapshotWriter, never()).replaceReservations(any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordFailureMeta(eq(july), any(), any());
        assertThat(summary.failedRooms()).containsExactly(6);
        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
    }

    @Test
    @DisplayName("일부 룸만 실패하면 성공 룸은 교체되고 월 메타는 PARTIAL 로 기록된다(룸 격리)")
    void partialFailureIsolatesRooms() {
        Facility ok = Facility.create(4, "공동연습실(1)", "2105", 0);
        Facility bad = Facility.create(6, "공동연습실(2)", "2106", 1);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(ok, bad));
        when(client.fetchReservations(eq(4), eq(july))).thenReturn(objectMapper.createArrayNode());
        when(client.fetchReservations(eq(6), eq(july))).thenThrow(new FacilityFetchException("timeout"));
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        verify(snapshotWriter, times(1)).replaceReservations(any(), any(), any(), any()); // ok 만
        verify(snapshotWriter, times(1)).recordSuccessfulMeta(eq(july), eq(FetchStatus.PARTIAL), any(), any(), any());
        assertThat(summary.failedRooms()).containsExactly(6);
        assertThat(summary.succeededRooms()).isEqualTo(1);
        assertThat(summary.status()).isEqualTo(FetchStatus.PARTIAL);
    }

    @Test
    @DisplayName("fetch 는 성공했지만 스냅샷 쓰기가 실패하면 그 달을 성공으로 집계하지 않고 실패 메타로 기록한다(C1)")
    void writeFailureIsNotCountedAsSuccess() {
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(client.fetchReservations(anyInt(), eq(july))).thenReturn(objectMapper.createArrayNode());
        when(reservationParser.parse(any(), eq(july))).thenReturn(List.of());
        doThrow(new org.springframework.dao.DataIntegrityViolationException("schedule_seq 충돌"))
                .when(snapshotWriter).replaceReservations(any(), any(), any(), any());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        // 쓰기 실패 → 성공 메타 기록 금지, 실패 메타로 crawled_at 보존
        verify(snapshotWriter, never()).recordSuccessfulMeta(any(), any(), any(), any(), any());
        verify(snapshotWriter, times(1)).recordFailureMeta(eq(july), any(), any());
        assertThat(summary.failedRooms()).containsExactly(4);
        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
    }

    @Test
    @DisplayName("활성 시설이 하나도 없으면 크롤 결과는 FAILED 다(C2)")
    void emptyFacilitiesIsFailed() {
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of());

        CrawlSummary summary = service.crawlAndReplace(List.of(july), CrawlSource.SCHEDULER);

        assertThat(summary.status()).isEqualTo(FetchStatus.FAILED);
        assertThat(summary.totalRooms()).isZero();
    }
}
```

> `writeFailureIsNotCountedAsSuccess`/`emptyFacilitiesIsFailed` 는 `static org.mockito.Mockito.doThrow` 를 추가로 import 한다.

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilityCrawlServiceTest"` → `BUILD FAILED`.
- [ ] 구현 `FacilityCrawlService.java` (Task 16 에서 single-flight 메서드를 같은 클래스에 추가한다):

```java
package com.duing.domain.facility.service;

import com.duing.domain.facility.config.FacilityCrawlerProperties;
import com.duing.domain.facility.crawler.SchoolFacilityClient;
import com.duing.domain.facility.crawler.exception.FacilityClientException;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.parser.ReservationParser;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import com.fasterxml.jackson.databind.JsonNode;
import io.sentry.Sentry;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 시설 예약 수집 오케스트레이션 + 원자적 스냅샷 교체(fail-safe) + 온디맨드 single-flight(Task 16).
 * fetch·파싱·검증은 트랜잭션 밖에서 하고 성공한 월만 {@link FacilitySnapshotWriter} 로 원자 교체한다.
 * 룸 실패는 격리되어 다른 룸에 영향이 없고, 실패한 (시설,월)은 기존 스냅샷을 유지한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FacilityCrawlService {

    private final FacilityRepository facilityRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;
    private final SchoolFacilityClient client;
    private final ReservationParser reservationParser;
    private final FacilitySnapshotWriter snapshotWriter;
    private final FacilityCrawlerProperties properties;
    private final Clock clock;

    public CrawlSummary crawlAndReplace(List<YearMonth> months, CrawlSource source) {
        long startNanos = System.nanoTime();
        LocalDateTime crawledAt = LocalDateTime.now(clock);
        List<Facility> facilities = facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc();

        Map<YearMonth, Integer> reservationCount = new LinkedHashMap<>();
        Map<YearMonth, Boolean> anySuccess = new LinkedHashMap<>();
        Map<YearMonth, Boolean> anyFailure = new LinkedHashMap<>();
        for (YearMonth month : months) {
            reservationCount.put(month, 0);
            anySuccess.put(month, false);
            anyFailure.put(month, false);
        }
        List<Integer> failedRooms = new ArrayList<>();
        String lastError = null;

        boolean firstRoom = true;
        for (Facility facility : facilities) {
            if (!firstRoom) {
                sleepBetweenRooms();
            }
            firstRoom = false;

            Map<YearMonth, List<ParsedReservation>> fetchedByMonth = new LinkedHashMap<>();
            boolean roomFailed = false;
            for (YearMonth month : months) {
                try {
                    JsonNode body = client.fetchReservations(facility.getRoomSeq(), month);
                    List<ParsedReservation> parsed = reservationParser.parse(body, month);
                    fetchedByMonth.put(month, parsed);
                } catch (FacilityClientException fetchFailure) {
                    roomFailed = true;
                    anyFailure.put(month, true);
                    lastError = summarize(fetchFailure);
                }
            }
            if (!fetchedByMonth.isEmpty()) {
                try {
                    snapshotWriter.replaceReservations(
                            facility.getId(), new ArrayList<>(fetchedByMonth.keySet()), fetchedByMonth, crawledAt);
                    // 영속 성공 후에만 성공으로 집계한다 — 쓰기 실패(유니크 충돌 등)를 성공으로 오집계해
                    // crawled_at 을 갱신(신선 처리)하고 옛 스냅샷을 최신인 양 서빙하는 것을 막는다(C1).
                    fetchedByMonth.forEach((month, reservations) -> {
                        anySuccess.put(month, true);
                        reservationCount.merge(month, reservations.size(), Integer::sum);
                    });
                } catch (RuntimeException replaceFailure) {
                    // schedule_seq unique 충돌 등 — fail-safe: 해당 시설 기존 스냅샷 유지, 다음 주기에 정합.
                    roomFailed = true;
                    fetchedByMonth.keySet().forEach(month -> anyFailure.put(month, true));
                    lastError = summarize(replaceFailure);
                    log.warn("시설 스냅샷 교체 실패(기존 유지): roomSeq={}", facility.getRoomSeq());
                }
            }
            if (roomFailed) {
                failedRooms.add(facility.getRoomSeq());
            }
        }

        for (YearMonth month : months) {
            if (Boolean.TRUE.equals(anySuccess.get(month))) {
                FetchStatus status = Boolean.TRUE.equals(anyFailure.get(month)) ? FetchStatus.PARTIAL : FetchStatus.SUCCESS;
                snapshotWriter.recordSuccessfulMeta(month, status, crawledAt, source,
                        status == FetchStatus.PARTIAL ? lastError : null);
            } else {
                snapshotWriter.recordFailureMeta(month, source, lastError);
            }
        }

        int totalReservations = reservationCount.values().stream().mapToInt(Integer::intValue).sum();
        FetchStatus overall;
        if (facilities.isEmpty()) {
            overall = FetchStatus.FAILED; // 활성 시설이 없으면 수집 대상이 없음(콜드/오설정)
        } else if (failedRooms.isEmpty()) {
            overall = FetchStatus.SUCCESS;
        } else if (failedRooms.size() >= facilities.size()) {
            overall = FetchStatus.FAILED;
        } else {
            overall = FetchStatus.PARTIAL;
        }
        CrawlSummary summary = new CrawlSummary(overall, facilities.size(), facilities.size() - failedRooms.size(),
                totalReservations, failedRooms, Duration.ofNanos(System.nanoTime() - startNanos));
        logSummary(summary);
        return summary;
    }

    private void sleepBetweenRooms() {
        try {
            Thread.sleep(properties.roomDelayMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private String summarize(Throwable throwable) {
        // method/status 수준만 — PII·학교 민감정보 금지(예외 메시지는 status/code 수준으로 구성됨).
        return throwable.getClass().getSimpleName() + ": " + throwable.getMessage();
    }

    private void logSummary(CrawlSummary summary) {
        String base = String.format("Facility Crawl %s rooms=%d/%d reservations=%d duration=%.1fs",
                summary.status(), summary.succeededRooms(), summary.totalRooms(), summary.reservations(),
                summary.duration().toMillis() / 1000.0);
        if (summary.failedRooms().isEmpty()) {
            log.info(base);
            Sentry.addBreadcrumb(base);
        } else {
            String withFailed = base + " failedRooms=" + summary.failedRooms();
            log.warn(withFailed);
            Sentry.addBreadcrumb(withFailed);
        }
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilityCrawlServiceTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/service/dto/query/CrawlSummary.java backend/src/main/java/com/duing/domain/facility/service/FacilityCrawlService.java backend/src/test/java/com/duing/domain/facility/service/FacilityCrawlServiceTest.java && git commit -m "feat(backend): 시설 수집 오케스트레이션·원자적 교체·fail-safe·구조화 로그"
```

---

### Task 16: 온디맨드 single-flight + TTL (FacilityCrawlService 확장) + 동시성 테스트

같은 `FacilityCrawlService` 에 `ensureFresh(YearMonth)` 를 추가한다. TTL: 현재월·다음월=10분 / 그 외=24시간. `ConcurrentHashMap<YearMonth, ReentrantLock>` + 더블체크로 동시 미스 N건을 fetch 1회로 수렴시킨다.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facility/service/FacilityCrawlService.java`
- Test: `backend/src/test/java/com/duing/domain/facility/service/FacilityCrawlServiceTest.java` (테스트 추가)

- [ ] `FacilityCrawlService` 에 필드·메서드 추가. import 에 다음을 더한다: `com.duing.domain.facility.entity.DataSource`, `com.duing.domain.facility.entity.FacilityMonthSnapshot`, `java.util.concurrent.ConcurrentHashMap`, `java.util.concurrent.locks.ReentrantLock`. 클래스 필드와 메서드:

```java
    private static final int CURRENT_NEXT_TTL_MINUTES = 10;
    private static final int OTHER_TTL_HOURS = 24;

    // 월별 single-flight 락. 키는 Task 17 의 ±12개월 조회 범위로 제한되므로 사실상 소수(최대 ~25)로 유지된다.
    private final ConcurrentHashMap<YearMonth, ReentrantLock> monthLocks = new ConcurrentHashMap<>();

    /**
     * 온디맨드 조회 신선도 보장(§5.5). 신선하면 CACHE, 만료/미캐시면 single-flight 락으로 그 월을
     * 전 시설 fetch·교체 후 LIVE_FETCH(성공)/STALE_CACHE(라이브 실패, 옛 캐시 또는 콜드)를 반환한다.
     */
    public DataSource ensureFresh(YearMonth yearMonth) {
        if (isFresh(yearMonth)) {
            return DataSource.CACHE;
        }
        ReentrantLock lock = monthLocks.computeIfAbsent(yearMonth, key -> new ReentrantLock());
        lock.lock();
        try {
            if (isFresh(yearMonth)) {
                return DataSource.CACHE; // 더블체크: 대기 중 다른 스레드가 채웠다면 fetch 생략
            }
            CrawlSummary summary = crawlAndReplace(List.of(yearMonth), CrawlSource.ON_DEMAND);
            return summary.succeededRooms() > 0 ? DataSource.LIVE_FETCH : DataSource.STALE_CACHE;
        } finally {
            lock.unlock();
        }
    }

    private boolean isFresh(YearMonth yearMonth) {
        return snapshotRepository.findByYearMonth(yearMonth)
                .map(snapshot -> Duration.between(snapshot.getCrawledAt(), LocalDateTime.now(clock))
                        .compareTo(ttl(yearMonth)) < 0)
                .orElse(false);
    }

    private Duration ttl(YearMonth yearMonth) {
        YearMonth current = YearMonth.now(clock);
        if (yearMonth.equals(current) || yearMonth.equals(current.plusMonths(1))) {
            return Duration.ofMinutes(CURRENT_NEXT_TTL_MINUTES);
        }
        return Duration.ofHours(OTHER_TTL_HOURS);
    }
```

- [ ] `FacilityCrawlServiceTest` 에 신선도·single-flight 테스트를 추가한다(파일 상단 import 에 `java.time.LocalDateTime`, `java.util.Optional`, `java.util.concurrent.CountDownLatch`, `java.util.concurrent.ExecutorService`, `java.util.concurrent.Executors`, `java.util.concurrent.TimeUnit`, `java.util.concurrent.atomic.AtomicInteger`, `java.util.concurrent.atomic.AtomicReference`, `com.duing.domain.facility.entity.CrawlSource` 이미 존재, `com.duing.domain.facility.entity.DataSource`, `com.duing.domain.facility.entity.FacilityMonthSnapshot`, `com.duing.domain.facility.entity.FetchStatus` 이미 존재, `static org.mockito.Mockito.doAnswer`):

```java
    @Test
    @DisplayName("신선한 스냅샷(현재월·10분 TTL 이내)이 있으면 fetch 없이 CACHE 를 반환한다")
    void freshSnapshotServesCache() {
        YearMonth current = YearMonth.now(clock);
        FacilityMonthSnapshot fresh = FacilityMonthSnapshot.create(
                current, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null);
        when(snapshotRepository.findByYearMonth(current)).thenReturn(Optional.of(fresh));

        assertThat(service.ensureFresh(current)).isEqualTo(DataSource.CACHE);
        verify(facilityRepository, never()).findByArchivedAtIsNullOrderBySortOrderAsc();
    }

    @Test
    @DisplayName("동시 미스 2건은 single-flight 락으로 학교 fetch 1회로 수렴한다")
    void concurrentMissesCollapseToSingleFetch() throws InterruptedException {
        YearMonth current = YearMonth.now(clock);
        Facility facility = Facility.create(4, "공동연습실(1)", "2105", 0);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));

        AtomicReference<FacilityMonthSnapshot> stored = new AtomicReference<>(null);
        when(snapshotRepository.findByYearMonth(current))
                .thenAnswer(invocation -> Optional.ofNullable(stored.get()));

        AtomicInteger fetchCount = new AtomicInteger();
        when(client.fetchReservations(anyInt(), eq(current))).thenAnswer(invocation -> {
            fetchCount.incrementAndGet();
            Thread.sleep(200); // 첫 스레드가 락을 쥐고 있는 동안 둘째가 대기하도록
            return objectMapper.createArrayNode();
        });
        when(reservationParser.parse(any(), eq(current))).thenReturn(List.of());
        // 성공 메타 기록 시 스냅샷이 신선해지도록 상태를 채운다 → 둘째 스레드의 더블체크가 CACHE 로 빠진다.
        doAnswer(invocation -> {
            stored.set(FacilityMonthSnapshot.create(current, LocalDateTime.now(clock),
                    CrawlSource.ON_DEMAND, FetchStatus.SUCCESS, null));
            return null;
        }).when(snapshotWriter).recordSuccessfulMeta(eq(current), any(), any(), any(), any());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        Runnable task = () -> {
            ready.countDown();
            try {
                go.await();
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            service.ensureFresh(current);
        };
        pool.submit(task);
        pool.submit(task);
        ready.await();
        go.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(5, TimeUnit.SECONDS)).isTrue();

        assertThat(fetchCount.get()).isEqualTo(1); // 동시 미스가 fetch 1회로 수렴
    }
```

- [ ] 실행 → FAIL(신규 메서드 미존재) 후 PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilityCrawlServiceTest"` → 구현 전 `BUILD FAILED`, 구현 후 `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/service/FacilityCrawlService.java backend/src/test/java/com/duing/domain/facility/service/FacilityCrawlServiceTest.java && git commit -m "feat(backend): 온디맨드 single-flight·TTL 신선도 보장(동시 미스 1회 수렴)"
```

---

### Task 17: FacilityUsageService — 조회 조립 + 상태계산(Asia/Seoul) + 월 범위 제한

`ensureFresh` 로 신선도 보장 후 시설 + 예약을 로드해 `SlotMerger` 병합, 주입된 `Clock`(seoulClock, Asia/Seoul) 기준으로 status/isUsingNow/currentReservation/nextReservation 을 계산한다. `lastUpdatedAt`(crawled_at → +09:00)·stale·source 를 조립한다. 월 범위 `현재월 ±12개월` 초과는 400. **테스트는 하드코딩 미래 절대날짜 금지 — 고정 Clock + 상대날짜.**

컨트롤러 대면 도메인 서비스는 `backend/CLAUDE.md` 컨벤션(`{Domain}Service` 인터페이스 + `General{Domain}Service` 구현체, `PublicActivityService`/`GeneralPublicActivityService` 선례)에 따라 인터페이스 + `GeneralFacilityUsageService` 구현체로 분리한다.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/service/dto/query/ReservationSlot.java`
- Create: `backend/src/main/java/com/duing/domain/facility/service/dto/query/FacilityUsageItem.java`
- Create: `backend/src/main/java/com/duing/domain/facility/service/dto/query/FacilityUsageResult.java`
- Create: `backend/src/main/java/com/duing/domain/facility/exception/FacilityException.java`
- Create: `backend/src/main/java/com/duing/domain/facility/service/FacilityUsageService.java` (인터페이스)
- Create: `backend/src/main/java/com/duing/domain/facility/service/GeneralFacilityUsageService.java` (구현체)
- Test: `backend/src/test/java/com/duing/domain/facility/service/FacilityUsageServiceTest.java`

- [ ] `ReservationSlot.java`:

```java
package com.duing.domain.facility.service.dto.query;

import com.duing.domain.facility.entity.ReservationStatus;
import java.time.LocalDate;
import java.time.LocalTime;

/** 병합·상태계산이 끝난 예약 슬롯(내부 query DTO). */
public record ReservationSlot(LocalDate date, LocalTime start, LocalTime end, String organization,
                              ReservationStatus status) {}
```

- [ ] `FacilityUsageItem.java`:

```java
package com.duing.domain.facility.service.dto.query;

import java.util.List;

/** 시설 1건의 이용현황 슬라이스(내부 query DTO). room_seq 는 포함하지 않는다. */
public record FacilityUsageItem(Long facilityId, String roomName, String location, boolean isUsingNow,
                                ReservationSlot currentReservation, ReservationSlot nextReservation,
                                List<ReservationSlot> reservations) {}
```

- [ ] `FacilityUsageResult.java`:

```java
package com.duing.domain.facility.service.dto.query;

import com.duing.domain.facility.entity.DataSource;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;

/** 이용현황 조회 결과 집합(내부 query DTO). crawledAt 이 null 이면 콜드(성공 수집 이력 없음). */
public record FacilityUsageResult(YearMonth yearMonth, LocalDateTime crawledAt, DataSource source, boolean stale,
                                  List<FacilityUsageItem> facilities) {}
```

- [ ] `FacilityException.java`:

```java
package com.duing.domain.facility.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FacilityException extends ApplicationException {

    protected FacilityException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 조회 가능한 월 범위(현재월 ±12개월)를 벗어난 요청 — enumeration abuse 방지. */
    public static class MonthOutOfRangeException extends FacilityException {
        private static final String MESSAGE = "조회할 수 없는 월입니다. 현재월 기준 ±12개월 범위만 조회할 수 있습니다.";

        public MonthOutOfRangeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** 존재하지 않거나 아카이브된 시설 상세 요청. */
    public static class FacilityNotFoundException extends FacilityException {
        private static final String MESSAGE = "시설을 찾을 수 없습니다.";

        public FacilityNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }
}
```

- [ ] 실패 테스트 `FacilityUsageServiceTest.java`:

```java
package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.entity.ReservationStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.dto.query.FacilityUsageItem;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilityUsageServiceTest {

    @Mock FacilityCrawlService crawlService;
    @Mock FacilityRepository facilityRepository;
    @Mock FacilityReservationRepository reservationRepository;
    @Mock FacilityMonthSnapshotRepository snapshotRepository;

    FacilityUsageService service;
    final SlotMerger slotMerger = new SlotMerger();
    // 2026-07-15 14:00 Asia/Seoul (05:00Z). 상대날짜 계산의 기준 — 하드코딩 미래 절대날짜 아님(고정 Clock).
    final Clock clock = Clock.fixed(Instant.parse("2026-07-15T05:00:00Z"), ZoneId.of("Asia/Seoul"));
    final YearMonth july = YearMonth.of(2026, 7);
    final LocalDate today = LocalDate.of(2026, 7, 15);

    @BeforeEach
    void setUp() {
        service = new GeneralFacilityUsageService(crawlService, facilityRepository, reservationRepository,
                snapshotRepository, slotMerger, clock);
    }

    // BaseEntity.id 는 setter 가 없어 리플렉션으로 주입(단위 테스트 전용).
    private Facility facilityWithId(long id, int roomSeq, String name, String location) throws Exception {
        Facility facility = Facility.create(roomSeq, name, location, 0);
        Field idField = facility.getClass().getSuperclass().getDeclaredField("id");
        idField.setAccessible(true);
        idField.set(facility, id);
        return facility;
    }

    private FacilityReservation reservation(long facilityId, long seq, LocalDate date, int startHour, int endHour, String org) {
        return FacilityReservation.create(facilityId, seq, july, date,
                LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), org, LocalDateTime.now(clock));
    }

    @Test
    @DisplayName("현재 시각을 포함하는 예약은 USING·isUsingNow=true·currentReservation 으로 계산되고 다음 예약은 가장 이른 미래로 선택된다")
    void computesUsingAndNext() throws Exception {
        Facility facility = facilityWithId(1L, 4, "공동연습실(1)", "2105");
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(reservationRepository.findByFacilityIdInAndYearMonth(any(), eq(july))).thenReturn(List.of(
                reservation(1L, 10, today, 9, 10, "아침동아리"),       // 09-10 과거 → FINISHED
                reservation(1L, 11, today, 13, 15, "댄스동아리"),      // 13-15 (14:00 포함) → USING
                reservation(1L, 12, today, 16, 17, "저녁동아리"),      // 오늘 16-17 → 다음 예약 후보(더 이름)
                reservation(1L, 13, today.plusDays(1), 16, 17, "내일동아리"))); // 내일 16-17 → 후순위
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.of(FacilityMonthSnapshot.create(
                july, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null)));

        FacilityUsageResult result = service.getUsage(july);

        FacilityUsageItem item = result.facilities().get(0);
        assertThat(item.isUsingNow()).isTrue();
        assertThat(item.currentReservation().status()).isEqualTo(ReservationStatus.USING);
        assertThat(item.currentReservation().start()).isEqualTo(LocalTime.of(13, 0));
        assertThat(item.nextReservation().start()).isEqualTo(LocalTime.of(16, 0));
        assertThat(item.nextReservation().date()).isEqualTo(today); // 오늘 16시가 내일 16시보다 이르다
        assertThat(item.reservations()).extracting(slot -> slot.status())
                .contains(ReservationStatus.FINISHED, ReservationStatus.USING, ReservationStatus.UPCOMING);
        assertThat(result.source()).isEqualTo(DataSource.CACHE);
        assertThat(result.stale()).isFalse();
        assertThat(result.crawledAt()).isEqualTo(LocalDateTime.now(clock));
    }

    @Test
    @DisplayName("오늘 사용 중 예약이 없으면 isUsingNow=false·currentReservation=null 이다")
    void noCurrentWhenNotUsing() throws Exception {
        Facility facility = facilityWithId(1L, 4, "공동연습실(1)", "2105");
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of(facility));
        when(reservationRepository.findByFacilityIdInAndYearMonth(any(), eq(july))).thenReturn(List.of(
                reservation(1L, 10, today, 9, 10, "아침동아리"))); // 과거만
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.of(FacilityMonthSnapshot.create(
                july, LocalDateTime.now(clock), CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null)));

        FacilityUsageItem item = service.getUsage(july).facilities().get(0);
        assertThat(item.isUsingNow()).isFalse();
        assertThat(item.currentReservation()).isNull();
        assertThat(item.nextReservation()).isNull();
    }

    @Test
    @DisplayName("현재월 기준 +13개월 조회는 MonthOutOfRangeException(400)이다")
    void rejectsOutOfWindow() {
        assertThatThrownBy(() -> service.getUsage(july.plusMonths(13)))
                .isInstanceOf(FacilityException.MonthOutOfRangeException.class);
    }

    @Test
    @DisplayName("yearMonth 가 null 이면 현재월로 조회한다")
    void defaultsToCurrentMonth() throws Exception {
        when(crawlService.ensureFresh(july)).thenReturn(DataSource.CACHE);
        // 시설 목록이 비어있으면 구현체가 reservationRepository 조회를 생략하므로(빈 facilityIds 단락)
        // 그 스텁은 두지 않는다(strict stubbing 시 UnnecessaryStubbingException).
        when(facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc()).thenReturn(List.of());
        when(snapshotRepository.findByYearMonth(july)).thenReturn(Optional.empty());

        FacilityUsageResult result = service.getUsage(null);
        assertThat(result.yearMonth()).isEqualTo(july);
        assertThat(result.crawledAt()).isNull();
        assertThat(result.stale()).isTrue(); // 콜드(성공 이력 없음)
    }
}
```

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilityUsageServiceTest"` → `BUILD FAILED`.
- [ ] 인터페이스 `FacilityUsageService.java` (`backend/CLAUDE.md`: `{Domain}Service` 인터페이스 + `General{Domain}Service` 구현체, `PublicActivityService`/`GeneralPublicActivityService` 선례):

```java
package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import java.time.YearMonth;
import java.util.List;

/** 시설 이용현황 조회(공개 API 용). 조회 시점 상태계산은 구현체가 담당한다. */
public interface FacilityUsageService {

    /** §7.1 활성 시설 목록(가벼움). */
    List<Facility> getActiveFacilities();

    /** §7.2 이용현황. yearMonth 가 null 이면 현재월. 범위 초과는 400. */
    FacilityUsageResult getUsage(YearMonth requestedMonth);

    /** §7.3 단일 시설 상세 — usage 의 시설 1건 슬라이스. */
    FacilityUsageResult getDetail(Long facilityId, YearMonth requestedMonth);
}
```

- [ ] 구현 `GeneralFacilityUsageService.java`:

```java
package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.ReservationStatus;
import com.duing.domain.facility.exception.FacilityException;
import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import com.duing.domain.facility.service.SlotMerger.MergedSlot;
import com.duing.domain.facility.service.dto.query.FacilityUsageItem;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import com.duing.domain.facility.service.dto.query.ReservationSlot;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이용현황 조회 조립 + 조회 시점 상태계산(Asia/Seoul). 저장된 reservation_date(DATE)+time(TIME)(KST 벽시계)을
 * LocalDateTime.now(seoulClock) 와 비교하므로 JVM 타임존(prod=UTC)과 무관하게 정확하다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilityUsageService implements FacilityUsageService {

    private static final int MONTH_WINDOW = 12;
    private static final int CURRENT_NEXT_TTL_MINUTES = 10;
    private static final int OTHER_TTL_HOURS = 24;

    private final FacilityCrawlService crawlService;
    private final FacilityRepository facilityRepository;
    private final FacilityReservationRepository reservationRepository;
    private final FacilityMonthSnapshotRepository snapshotRepository;
    private final SlotMerger slotMerger;
    private final Clock clock;

    /** §7.1 활성 시설 목록(가벼움). */
    @Override
    public List<Facility> getActiveFacilities() {
        return facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc();
    }

    /** §7.2 이용현황. yearMonth 가 null 이면 현재월. 범위 초과는 400. */
    @Override
    public FacilityUsageResult getUsage(YearMonth requestedMonth) {
        YearMonth yearMonth = (requestedMonth == null) ? YearMonth.now(clock) : requestedMonth;
        assertWithinWindow(yearMonth);
        DataSource source = crawlService.ensureFresh(yearMonth);
        List<FacilityUsageItem> items = assemble(yearMonth, facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc());
        return buildResult(yearMonth, source, items);
    }

    /** §7.3 단일 시설 상세 — usage 의 시설 1건 슬라이스. */
    @Override
    public FacilityUsageResult getDetail(Long facilityId, YearMonth requestedMonth) {
        YearMonth yearMonth = (requestedMonth == null) ? YearMonth.now(clock) : requestedMonth;
        assertWithinWindow(yearMonth);
        Facility facility = facilityRepository.findByArchivedAtIsNullOrderBySortOrderAsc().stream()
                .filter(candidate -> candidate.getId().equals(facilityId))
                .findFirst()
                .orElseThrow(FacilityException.FacilityNotFoundException::new);
        DataSource source = crawlService.ensureFresh(yearMonth);
        List<FacilityUsageItem> items = assemble(yearMonth, List.of(facility));
        return buildResult(yearMonth, source, items);
    }

    private void assertWithinWindow(YearMonth yearMonth) {
        YearMonth current = YearMonth.now(clock);
        long months = Math.abs(ChronoUnit.MONTHS.between(current, yearMonth));
        if (months > MONTH_WINDOW) {
            throw new FacilityException.MonthOutOfRangeException();
        }
    }

    private List<FacilityUsageItem> assemble(YearMonth yearMonth, List<Facility> facilities) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Long> facilityIds = facilities.stream().map(Facility::getId).toList();
        Map<Long, List<FacilityReservation>> byFacility = facilityIds.isEmpty()
                ? Map.of()
                : reservationRepository.findByFacilityIdInAndYearMonth(facilityIds, yearMonth).stream()
                        .collect(Collectors.groupingBy(FacilityReservation::getFacilityId));

        List<FacilityUsageItem> items = new ArrayList<>();
        for (Facility facility : facilities) {
            List<ParsedReservation> raw = byFacility.getOrDefault(facility.getId(), List.of()).stream()
                    .map(row -> new ParsedReservation(row.getScheduleSeq(), row.getReservationDate(),
                            row.getStartTime(), row.getEndTime(), row.getOrganizationName()))
                    .toList();
            List<ReservationSlot> slots = slotMerger.merge(raw).stream()
                    .map(merged -> toSlot(merged, now))
                    .sorted(Comparator.comparing(ReservationSlot::date).thenComparing(ReservationSlot::start))
                    .toList();
            ReservationSlot current = slots.stream()
                    .filter(slot -> slot.status() == ReservationStatus.USING)
                    .findFirst().orElse(null);
            ReservationSlot next = slots.stream()
                    .filter(slot -> slot.status() == ReservationStatus.UPCOMING)
                    .min(Comparator.comparing((ReservationSlot slot) -> slot.date().atTime(slot.start())))
                    .orElse(null);
            items.add(new FacilityUsageItem(facility.getId(), facility.getRoomName(), facility.getLocation(),
                    current != null, current, next, slots));
        }
        return items;
    }

    private ReservationSlot toSlot(MergedSlot merged, LocalDateTime now) {
        LocalDateTime start = merged.date().atTime(merged.start());
        LocalDateTime end = merged.date().atTime(merged.end());
        ReservationStatus status;
        if (now.isBefore(start)) {
            status = ReservationStatus.UPCOMING;
        } else if (now.isBefore(end)) {
            status = ReservationStatus.USING;
        } else {
            status = ReservationStatus.FINISHED;
        }
        return new ReservationSlot(merged.date(), merged.start(), merged.end(), merged.organization(), status);
    }

    private FacilityUsageResult buildResult(YearMonth yearMonth, DataSource source, List<FacilityUsageItem> items) {
        Optional<FacilityMonthSnapshot> snapshot = snapshotRepository.findByYearMonth(yearMonth);
        LocalDateTime crawledAt = snapshot.map(FacilityMonthSnapshot::getCrawledAt).orElse(null);
        boolean stale = isStale(yearMonth, crawledAt, source);
        return new FacilityUsageResult(yearMonth, crawledAt, source, stale, items);
    }

    private boolean isStale(YearMonth yearMonth, LocalDateTime crawledAt, DataSource source) {
        if (source == DataSource.STALE_CACHE || crawledAt == null) {
            return true;
        }
        Duration ttl = ttl(yearMonth);
        return Duration.between(crawledAt, LocalDateTime.now(clock)).compareTo(ttl) > 0;
    }

    private Duration ttl(YearMonth yearMonth) {
        YearMonth current = YearMonth.now(clock);
        if (yearMonth.equals(current) || yearMonth.equals(current.plusMonths(1))) {
            return Duration.ofMinutes(CURRENT_NEXT_TTL_MINUTES);
        }
        return Duration.ofHours(OTHER_TTL_HOURS);
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.service.FacilityUsageServiceTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/service/dto/query/ReservationSlot.java backend/src/main/java/com/duing/domain/facility/service/dto/query/FacilityUsageItem.java backend/src/main/java/com/duing/domain/facility/service/dto/query/FacilityUsageResult.java backend/src/main/java/com/duing/domain/facility/exception/FacilityException.java backend/src/main/java/com/duing/domain/facility/service/FacilityUsageService.java backend/src/main/java/com/duing/domain/facility/service/GeneralFacilityUsageService.java backend/src/test/java/com/duing/domain/facility/service/FacilityUsageServiceTest.java && git commit -m "feat(backend): 이용현황 조회 조립·상태계산(Asia/Seoul)·월 범위 제한"
```

---

### Task 18: FacilityCrawlScheduler — @Scheduled + 중복 실행 방지

`@ConditionalOnProperty(prefix="duing.facility.crawler", name="enabled", havingValue="true")`. 예약 잡(10분, `cron="0 */10 * * * *"`, zone Asia/Seoul)은 현재월+다음월을 크롤. 시설목록 잡(1일). `AtomicBoolean.compareAndSet` 로 in-JVM 겹침 방지(진행 중이면 skip+로그). 구조화 로그·Sentry breadcrumb 는 `FacilityCrawlService` 가 담당하므로 스케줄러는 overlap guard + 호출만.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/scheduler/FacilityCrawlScheduler.java`
- Test: `backend/src/test/java/com/duing/domain/facility/scheduler/FacilityCrawlSchedulerTest.java`

- [ ] 실패 테스트 `FacilityCrawlSchedulerTest.java` (Mockito, overlap guard 검증):

```java
package com.duing.domain.facility.scheduler;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facility.service.FacilitySyncService;
import com.duing.domain.facility.service.dto.query.CrawlSummary;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class FacilityCrawlSchedulerTest {

    @Mock FacilityCrawlService crawlService;
    @Mock FacilitySyncService syncService;

    final Clock clock = Clock.fixed(Instant.parse("2026-07-15T05:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Test
    @DisplayName("예약 잡은 현재월+다음월을 SCHEDULER 소스로 크롤한다")
    void reservationJobCrawlsCurrentAndNextMonth() {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, clock);
        when(crawlService.crawlAndReplace(anyList(), any())).thenReturn(
                new CrawlSummary(FetchStatus.SUCCESS, 10, 10, 100, List.of(), Duration.ofSeconds(1)));

        scheduler.runReservationCrawl();

        verify(crawlService).crawlAndReplace(
                List.of(java.time.YearMonth.of(2026, 7), java.time.YearMonth.of(2026, 8)), CrawlSource.SCHEDULER);
    }

    @Test
    @DisplayName("이전 사이클이 진행 중이면 이번 tick 은 skip 되어 크롤이 1회만 실행된다")
    void overlappingTickIsSkipped() throws InterruptedException {
        FacilityCrawlScheduler scheduler = new FacilityCrawlScheduler(crawlService, syncService, clock);
        CountDownLatch inside = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(crawlService.crawlAndReplace(anyList(), any())).thenAnswer(invocation -> {
            inside.countDown();
            release.await(); // 첫 실행을 붙잡아 두 번째 tick 과 겹치게 한다
            return new CrawlSummary(FetchStatus.SUCCESS, 1, 1, 0, List.of(), Duration.ofSeconds(1));
        });

        var pool = Executors.newSingleThreadExecutor();
        pool.submit(scheduler::runReservationCrawl); // 첫 tick — 락 점유
        inside.await();
        scheduler.runReservationCrawl();             // 둘째 tick — skip 되어야 함
        release.countDown();
        pool.shutdown();
        pool.awaitTermination(5, TimeUnit.SECONDS);

        verify(crawlService, times(1)).crawlAndReplace(anyList(), any());
    }
}
```

- [ ] 실행 → FAIL:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.scheduler.FacilityCrawlSchedulerTest"` → `BUILD FAILED`.
- [ ] 구현 `FacilityCrawlScheduler.java`:

```java
package com.duing.domain.facility.scheduler;

import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.service.FacilityCrawlService;
import com.duing.domain.facility.service.FacilitySyncService;
import java.time.Clock;
import java.time.YearMonth;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 시설 크롤 스케줄러. 예약(10분)·시설목록(1일 04:00) 잡을 실행한다. AtomicBoolean.compareAndSet 으로
 * in-JVM 중복 실행을 막는다(이전 사이클 진행 중이면 skip). 멀티 인스턴스 크로스 락은 향후 과제(§10).
 * 구조화 로그·Sentry breadcrumb 는 FacilityCrawlService 가 담당한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "duing.facility.crawler", name = "enabled", havingValue = "true")
public class FacilityCrawlScheduler {

    private final FacilityCrawlService crawlService;
    private final FacilitySyncService syncService;
    private final Clock clock;

    private final AtomicBoolean reservationRunning = new AtomicBoolean(false);
    private final AtomicBoolean syncRunning = new AtomicBoolean(false);

    @Scheduled(cron = "0 */10 * * * *", zone = "Asia/Seoul")
    public void runReservationCrawl() {
        if (!reservationRunning.compareAndSet(false, true)) {
            log.info("Facility Crawl skip: 이전 예약 수집 사이클이 아직 진행 중");
            return;
        }
        try {
            YearMonth current = YearMonth.now(clock);
            crawlService.crawlAndReplace(List.of(current, current.plusMonths(1)), CrawlSource.SCHEDULER);
        } finally {
            reservationRunning.set(false);
        }
    }

    @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
    public void runFacilitySync() {
        if (!syncRunning.compareAndSet(false, true)) {
            log.info("Facility Sync skip: 이전 시설목록 동기화가 아직 진행 중");
            return;
        }
        try {
            syncService.sync();
        } finally {
            syncRunning.set(false);
        }
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.scheduler.FacilityCrawlSchedulerTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/scheduler/FacilityCrawlScheduler.java backend/src/test/java/com/duing/domain/facility/scheduler/FacilityCrawlSchedulerTest.java && git commit -m "feat(backend): 시설 크롤 스케줄러(예약 10분·목록 1일·overlap guard)"
```

---

### Task 19: Response DTOs (record + static from())

record + static `from()`. **room_seq 는 어떤 응답에도 노출 금지**(FacilitySummaryResponse 는 id/roomName/location 만). `lastUpdatedAt` 은 crawled_at(Seoul 벽시계)을 Asia/Seoul 오프셋 `+09:00` 으로 직렬화한다. 시간은 `HH:mm` 문자열.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/controller/dto/response/FacilitySummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/facility/controller/dto/response/FacilityUsageResponse.java`
- Create: `backend/src/main/java/com/duing/domain/facility/controller/dto/response/FacilityDetailResponse.java`

- [ ] `FacilitySummaryResponse.java`:

```java
package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.entity.Facility;

/** §7.1 활성 시설 목록 원소. room_seq 는 노출하지 않는다. */
public record FacilitySummaryResponse(Long id, String roomName, String location) {

    public static FacilitySummaryResponse from(Facility facility) {
        return new FacilitySummaryResponse(facility.getId(), facility.getRoomName(), facility.getLocation());
    }
}
```

- [ ] `FacilityUsageResponse.java`:

```java
package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.ReservationStatus;
import com.duing.domain.facility.service.dto.query.FacilityUsageItem;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import com.duing.domain.facility.service.dto.query.ReservationSlot;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** §7.2 이용현황 응답. lastUpdatedAt 은 KST(+09:00) OffsetDateTime, 시간은 HH:mm 문자열, room_seq 미노출. */
public record FacilityUsageResponse(String yearMonth, OffsetDateTime lastUpdatedAt, boolean stale,
                                    DataSource source, List<FacilityUsage> facilities) {

    public record FacilityUsage(Long id, String roomName, String location, boolean isUsingNow,
                                Reservation currentReservation, Reservation nextReservation,
                                List<Reservation> reservations) {}

    public record Reservation(LocalDate date, String start, String end, String organization, ReservationStatus status) {}

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    public static FacilityUsageResponse from(FacilityUsageResult result) {
        return new FacilityUsageResponse(
                result.yearMonth().toString(),
                toKst(result.crawledAt()),
                result.stale(),
                result.source(),
                result.facilities().stream().map(FacilityUsageResponse::toFacility).toList());
    }

    static OffsetDateTime toKst(LocalDateTime crawledAt) {
        return crawledAt == null ? null : crawledAt.atZone(KST).toOffsetDateTime();
    }

    static FacilityUsage toFacility(FacilityUsageItem item) {
        return new FacilityUsage(
                item.facilityId(), item.roomName(), item.location(), item.isUsingNow(),
                toReservation(item.currentReservation()), toReservation(item.nextReservation()),
                item.reservations().stream().map(FacilityUsageResponse::toReservation).toList());
    }

    static Reservation toReservation(ReservationSlot slot) {
        return slot == null ? null
                : new Reservation(slot.date(), slot.start().format(HH_MM), slot.end().format(HH_MM),
                        slot.organization(), slot.status());
    }
}
```

- [ ] `FacilityDetailResponse.java`:

```java
package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.controller.dto.response.FacilityUsageResponse.FacilityUsage;
import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import java.time.OffsetDateTime;

/** §7.3 단일 시설 상세 응답 — usage 의 시설 1건 슬라이스 + lastUpdatedAt/stale/source. */
public record FacilityDetailResponse(String yearMonth, OffsetDateTime lastUpdatedAt, boolean stale,
                                     DataSource source, FacilityUsage facility) {

    public static FacilityDetailResponse from(FacilityUsageResult result) {
        FacilityUsage facility = result.facilities().isEmpty()
                ? null
                : FacilityUsageResponse.toFacility(result.facilities().get(0));
        return new FacilityDetailResponse(
                result.yearMonth().toString(),
                FacilityUsageResponse.toKst(result.crawledAt()),
                result.stale(),
                result.source(),
                facility);
    }
}
```

- [ ] 컴파일 검증: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava -q && echo COMPILE_OK` → `COMPILE_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/controller/dto/response && git commit -m "feat(backend): 시설 응답 DTO(목록·이용현황·상세, room_seq 미노출·KST lastUpdatedAt)"
```

---

### Task 20: FacilityApi 인터페이스 + FacilityController

`@RequestMapping("/api/v1")` 를 컨트롤러에 두고(clubs 패턴), Api 인터페이스는 상대 경로 3 GET. `yearMonth` 는 `@DateTimeFormat(pattern="yyyy-MM")` 로 바인딩(생략 시 null → 현재월). 모든 public GET 에 `Cache-Control: public, max-age=60`.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facility/api/FacilityApi.java`
- Create: `backend/src/main/java/com/duing/domain/facility/controller/FacilityController.java`

- [ ] `FacilityApi.java`:

```java
package com.duing.domain.facility.api;

import com.duing.domain.facility.controller.dto.response.FacilityDetailResponse;
import com.duing.domain.facility.controller.dto.response.FacilitySummaryResponse;
import com.duing.domain.facility.controller.dto.response.FacilityUsageResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 이용현황", description = "학생회관 공용시설 예약 이용현황 (비로그인 포함)")
public interface FacilityApi {

    @Operation(summary = "활성 시설 목록 (비로그인)")
    @GetMapping("/facilities")
    ResponseEntity<ApiResponse<List<FacilitySummaryResponse>>> listFacilities();

    @Operation(summary = "월별 이용현황 (비로그인). yearMonth 생략 시 현재월")
    @GetMapping("/facilities/usage")
    ResponseEntity<ApiResponse<FacilityUsageResponse>> getUsage(
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);

    @Operation(summary = "단일 시설 상세 (비로그인). yearMonth 생략 시 현재월")
    @GetMapping("/facilities/{facilityId}")
    ResponseEntity<ApiResponse<FacilityDetailResponse>> getFacilityDetail(
            @PathVariable Long facilityId,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);
}
```

- [ ] `FacilityController.java`:

```java
package com.duing.domain.facility.controller;

import com.duing.domain.facility.api.FacilityApi;
import com.duing.domain.facility.controller.dto.response.FacilityDetailResponse;
import com.duing.domain.facility.controller.dto.response.FacilitySummaryResponse;
import com.duing.domain.facility.controller.dto.response.FacilityUsageResponse;
import com.duing.domain.facility.service.FacilityUsageService;
import com.duing.global.response.ApiResponse;
import java.time.Duration;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FacilityController implements FacilityApi {

    private final FacilityUsageService facilityUsageService;

    private static CacheControl publicCache() {
        return CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic();
    }

    @Override
    public ResponseEntity<ApiResponse<List<FacilitySummaryResponse>>> listFacilities() {
        List<FacilitySummaryResponse> facilities = facilityUsageService.getActiveFacilities().stream()
                .map(FacilitySummaryResponse::from)
                .toList();
        return ResponseEntity.ok().cacheControl(publicCache()).body(ApiResponse.success(facilities));
    }

    @Override
    public ResponseEntity<ApiResponse<FacilityUsageResponse>> getUsage(YearMonth yearMonth) {
        FacilityUsageResponse response = FacilityUsageResponse.from(facilityUsageService.getUsage(yearMonth));
        return ResponseEntity.ok().cacheControl(publicCache()).body(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<FacilityDetailResponse>> getFacilityDetail(Long facilityId, YearMonth yearMonth) {
        FacilityDetailResponse response =
                FacilityDetailResponse.from(facilityUsageService.getDetail(facilityId, yearMonth));
        return ResponseEntity.ok().cacheControl(publicCache()).body(ApiResponse.success(response));
    }
}
```

- [ ] 컴파일 검증: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileJava -q && echo COMPILE_OK` → `COMPILE_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/domain/facility/api backend/src/main/java/com/duing/domain/facility/controller/FacilityController.java && git commit -m "feat(backend): 시설 이용현황 API 인터페이스·컨트롤러(3 GET·Cache-Control 60s)"
```

---

### Task 21: SecurityConfig permitAll + IntegrationTestBase TRUNCATE 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java`

- [ ] `SecurityConfig.java` 의 public-activities permitAll 다음 줄(92행)에 시설 GET permitAll 을 추가한다:

```java
                        .requestMatchers(HttpMethod.GET, "/api/v1/public-activities", "/api/v1/public-activities/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/facilities", "/api/v1/facilities/**").permitAll()
```

- [ ] `IntegrationTestBase.java` 의 TRUNCATE 문에 시설 테이블 3개를 추가한다(자식 → 부모 순, `cashbook_entry,` 앞에 배치). 다음 세 줄을 TRUNCATE 목록 맨 앞(`"TRUNCATE TABLE " +` 다음)에 삽입:

```java
                "facility_reservation, " +
                "facility_month_snapshot, " +
                "facility, " +
                "cashbook_entry, " +
```

- [ ] 검증(컴파일 + 시설 컨트롤러 permitAll 이 다음 Task 통합테스트에서 검증됨): `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew compileTestJava -q && echo COMPILE_OK` → `COMPILE_OK`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/main/java/com/duing/global/config/SecurityConfig.java backend/src/test/java/com/duing/common/IntegrationTestBase.java && git commit -m "feat(backend): 시설 공개 GET permitAll·통합테스트 시설 테이블 정리 추가"
```

---

### Task 22: 통합(Acceptance) 테스트 — 비로그인 200 + 필드 존재 + room_seq 미노출

신선한 월 스냅샷을 시드해 `ensureFresh` 가 캐시히트(외부 호출 없음)로 빠지게 한다. 상대날짜(today) 사용, Asia/Seoul 기준. **또한 이 테스트는 `FacilitySnapshotWriter` 의 실제 스냅샷 교체(delete→insert 원자성·롤백 fail-safe)를 실 DB(Testcontainers)로 최소 1회 검증해 C4 커버리지 공백(라이터 단위 테스트 부재)을 메운다.**

**Files:**
- Create: `backend/src/test/java/com/duing/domain/facility/FacilityUsageAcceptanceTest.java`

- [ ] 테스트 작성 `FacilityUsageAcceptanceTest.java`:

```java
package com.duing.domain.facility;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.entity.CrawlSource;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.domain.facility.entity.FetchStatus;
import com.duing.domain.facility.repository.FacilityMonthSnapshotRepository;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.repository.FacilityReservationRepository;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FacilityUsageAcceptanceTest extends IntegrationTestBase {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @LocalServerPort int port;

    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityReservationRepository reservationRepository;
    @Autowired FacilityMonthSnapshotRepository snapshotRepository;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        YearMonth current = YearMonth.now(KST);
        LocalDate today = LocalDate.now(KST);
        LocalDateTime now = LocalDateTime.now(KST);

        Facility facility = facilityRepository.save(Facility.create(4, "공동연습실(1)", "2105", 0));
        // 현재월 신선 스냅샷 → ensureFresh 가 CACHE 로 판정해 외부(학교) 호출 없음.
        snapshotRepository.save(FacilityMonthSnapshot.create(
                current, now, CrawlSource.SCHEDULER, FetchStatus.SUCCESS, null));
        reservationRepository.save(FacilityReservation.create(
                facility.getId(), 90001L, current, today, LocalTime.of(9, 0), LocalTime.of(10, 0), "댄스동아리", now));
    }

    @Test
    @DisplayName("비로그인 GET /api/v1/facilities 는 200 이고 id/roomName/location 만 담고 room_seq 는 없다")
    void listFacilitiesPublicNoRoomSeq() {
        String body = RestAssured.given()
                .when().get("/api/v1/facilities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .header("Cache-Control", org.hamcrest.Matchers.containsString("max-age=60"))
                .body("data[0].roomName", equalTo("공동연습실(1)"))
                .body("data[0].location", equalTo("2105"))
                .extract().asString();
        assertThat(body).doesNotContain("roomSeq").doesNotContain("room_seq");
    }

    @Test
    @DisplayName("비로그인 GET /api/v1/facilities/usage 는 200 이고 source/stale/lastUpdatedAt 을 포함하며 room_seq 를 노출하지 않는다")
    void usagePublicContainsMetaFieldsAndHidesRoomSeq() {
        String body = RestAssured.given()
                .when().get("/api/v1/facilities/usage")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.source", equalTo("CACHE"))
                .body("data.stale", equalTo(false))
                // lastUpdatedAt 은 KST(+09:00) ISO 오프셋 형식
                .body("data.lastUpdatedAt", matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?\\+09:00"))
                .body("data.facilities[0].roomName", equalTo("공동연습실(1)"))
                .body("data.facilities[0].reservations[0].start", equalTo("09:00"))
                .body("data.facilities[0].reservations[0].organization", equalTo("댄스동아리"))
                .body("data.facilities[0].id", notNullValue())
                .extract().asString();
        assertThat(body).doesNotContain("roomSeq").doesNotContain("room_seq");
    }
}
```

- [ ] 실행 → PASS:
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests "com.duing.domain.facility.FacilityUsageAcceptanceTest"` → `BUILD SUCCESSFUL`.
- [ ] 커밋:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing && git add backend/src/test/java/com/duing/domain/facility/FacilityUsageAcceptanceTest.java && git commit -m "test(backend): 시설 이용현황 공개 접근·메타 필드·room_seq 미노출 통합테스트"
```

---

### Task 23: 전체 빌드 검증

**Files:** (없음 — 검증만)

- [ ] 전체 빌드 실행(출력을 tail 로 가리지 말 것 — exit code/BUILD 배너 확인):
  `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew build` → 마지막 줄에 `BUILD SUCCESSFUL` 이 보여야 한다. 컴파일 경고/실패, ddl-auto=validate 불일치, RowLevelSecurityMigrationTest, 전체 facility 테스트가 모두 통과해야 한다.
- [ ] 실패 시: superpowers:systematic-debugging 으로 근본원인부터. 흔한 원인 — (a) `@Retryable` maxAttemptsExpression 프로퍼티 키 오타 → 컨텍스트 로드 실패, (b) 신규 테이블 RLS 누락 → RowLevelSecurityMigrationTest 실패, (c) YearMonth 파라미터 바인딩 실패 → `@DateTimeFormat(pattern="yyyy-MM")` 확인, (d) IntegrationTestBase TRUNCATE 에 facility 테이블 누락 시 FK 오류.
- [ ] (커밋 없음 — Task 1~22 가 모두 개별 커밋됨. push/PR 은 이 계획 범위 밖.)

---

## 설계 결정 · 스펙 섹션 → Task 커버리지 매핑

- §1 목표/원칙(캐시만 조회·부하 최소·fail-safe·확장성) → Task 13·15·16(전반 관통)
- §2.1 시설 목록 HTML 파싱 + 위치 분리 규칙 → Task 9(fetch)·Task 10(parse)
- §2.2 예약 JSON(POST 폼·200+[]·dept 꼬리표기) → Task 2(fixture)·Task 9(fetch)·Task 11(parse)
- §3 아키텍처/패키지/RestClient .exchange/잡 토글 → Task 8·9(+전 도메인 배치)
- §4.1 facility DDL/엔티티 → Task 3(V69)·Task 6
- §4.2 facility_reservation DDL/엔티티 → Task 3(V70)·Task 6
- §4.3 facility_month_snapshot DDL(빈 달 해결·crawled_at vs fetch_status 분리) → Task 3(V71)·Task 6·Task 14
- §5.1 시설목록 동기화(reconcile) → Task 13·Task 18(일 1회 잡)
- §5.2 예약 수집(10분·현재+다음월·100ms·룸 격리·월 메타) → Task 15·Task 18
- §5.3 재시도(총 4회·0.5/1/2초·5xx·네트워크·타임아웃만·4xx 제외) → Task 1·Task 8·Task 9
- §5.4 원자적 스냅샷 교체(200+[]=교체 / 에러=유지) → Task 14·Task 15
- §5.5 온디맨드·single-flight·TTL·월 범위 제한 → Task 16(single-flight/TTL)·Task 17(월 범위 400)
- §6.1 SlotMerger 4조건 → Task 12
- §6.2 조직명 정리 정규식 → Task 11
- §6.3 상태 계산(UPCOMING/USING/FINISHED·isUsingNow·current/next·Asia/Seoul) → Task 17
- §7 API(permitAll·ApiResponse·Cache-Control·room_seq 미노출) → Task 19·20·21·22
- §7.1 GET /facilities → Task 20·22
- §7.2 GET /facilities/usage(응답 형태·source·stale·lastUpdatedAt·nextReservation) → Task 17·19·20·22
- §7.3 GET /facilities/{id} → Task 17·19·20
- §8 프론트엔드 → **범위 밖(Out of Scope)**
- §9 운영 로그/관측(구조화 로그·Sentry breadcrumb·failedRooms) → Task 15
- §10 향후 확장(멀티 인스턴스 락 등) → **범위 밖(TODO)**, 스케줄러는 in-JVM overlap guard 로 Task 18
- §11 테스트 전략(fixture 박제·Clock 주입·상대날짜·single-flight·permitAll) → Task 2·9·10·11·12·15·16·17·22
- §13 결정 1 상태 미저장/조회 시 계산 → Task 17
- §13 결정 2 원자적 교체 → Task 14·15
- §13 결정 3 YearMonth 컨버터(네이티브 우회) → Task 4·6·7
- §13 결정 4 룸 100ms 간격 → Task 15
- §13 결정 5 재시도 4회/백오프/룸 격리 → Task 1·8·9·15
- §13 결정 6 구조화 로그 + breadcrumb → Task 15
- §13 결정 7 SlotMerger 4조건 → Task 12
- §13 결정 8 reconcile(하드삭제 금지·archived_at IS NULL) → Task 6·13·17
- §13 결정 9 스케줄러 락(단일=없음, in-JVM) → Task 18
- §13 결정 10 TTL(현재·다음월 10분/그 외 24h) → Task 16·17
- §13 결정 11 API 식별자=facility.id, room_seq 미노출 → Task 19·22
- §13 결정 12 lastUpdatedAt/stale/source(enum) → Task 17·19
- §13 결정 13 fetch_status/last_error(≤500·PII 금지) 분리 → Task 6·14·15
- §13 결정 14 스케줄러 중복 실행 방지(AtomicBoolean) → Task 18
- §13 결정 15 Cache-Control public max-age=60 → Task 20·22
- §13 결정 16 nextReservation → Task 17·19
- §13 결정 17 실측 HTML/JSON fixture 박제 → Task 2·10·11
- 공통 인프라: build.gradle(spring-retry) → Task 1 / SecurityConfig → Task 21 / 전체 빌드 → Task 23




