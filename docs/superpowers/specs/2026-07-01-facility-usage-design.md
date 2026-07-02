# 학생회관 시설 이용현황 크롤링 · 조회 기능 — 설계 문서

- 작성일: 2026-07-01
- 대상: 백엔드(`backend/`, Spring Boot 3.4 / Java 21) + 프론트(`frontend/`, Next.js 15 App Router)
- 상태: 설계 확정(구현 계획 착수 전)

---

## 1. 목표 · 원칙

대구대학교 학생회관 공용시설(커뮤니티룸·공동연습실·강당 등)의 예약 이용현황을 Duing 서비스에서 제공한다.

- 사용자는 **Duing DB(캐시)만** 조회한다. 학교 서버는 **스케줄러 + 온디맨드 fetch(single-flight)만** 접근한다.
- **최우선 원칙**: 학교 서버에 불필요한 부하를 주지 않는다. 사용자 수(3천→30만)가 늘어도 학교 요청량은 사실상 증가하지 않는다.
- **Fail-safe**: 학교 응답 실패 시 기존 스냅샷을 절대 삭제/치환하지 않는다. 빈 데이터를 반환하지 않는다.
- **확장성**: 학교가 시설을 추가/변경/제거해도 코드 수정 없이 자동 반영된다.

---

## 2. 데이터 소스 (실측 검증 완료)

대상 페이지 `https://www.daegu.ac.kr/room/detail` 의 **HTML에는 예약 데이터가 없다.** 시설 탭 목록만 정적 HTML에 있고, 예약현황은 프론트 JS가 아래 JSON 엔드포인트를 호출해 렌더링한다. → **HTML 테이블 스크래핑이 아니라 학교가 쓰는 공식 JSON API를 그대로 사용한다.**

### 2.1 시설 목록 (정적 HTML)

`GET /room/detail` 응답의 `li[id^="room_"]` 탭에서 `room_seq` ↔ 시설명을 파싱한다.

```html
<li class="fst active" id="room_1"><a onclick="tab_menu2(1);" href="#none">커뮤니티룸(1)(1503호)</a>
    <h3 class="heading_title">커뮤니티룸(1)(1503호)</h3></li>
```

- `room_seq`는 `id="room_N"`에서 추출. **값이 불연속**(`1,2,3,4,6,22,41,82,102,143`)이므로 절대 하드코딩/연번 가정 금지 — 동적 파싱이 곧 "새 시설 자동 감지" 요구사항을 충족한다.
- 시설명 문자열 `커뮤니티룸(1)(1503호)` → `roomName=커뮤니티룸(1)`, `location=1503호`로 분리. 위치가 없는 시설(`빛광장`, `웅지관 강당`, `자유광장(노천강당)`)은 `location=null`.
  - 분리 규칙: 마지막 괄호 그룹이 `\d+호?` 또는 순수 숫자(예: `2105`)이면 location으로 분리, 아니면 전체가 roomName(`자유광장(노천강당)`은 분리하지 않음).

현재 대상 10개 시설이 모두 탭에 존재함을 확인:
커뮤니티룸(1~3), 공동연습실(1~4), 빛광장, 자유광장(노천강당), 웅지관 강당.

### 2.2 예약 데이터 (JSON, 월 단위)

```
POST https://www.daegu.ac.kr/room/data/list
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
body: room_seq=<번호>&schedule_date=YYYY-MM
```

응답(JSON 배열) 원소 예시:

```json
{ "schedule_seq": "18134", "schedule_dept": "고정관념(9:00~20:00)",
  "schedule_date": "01", "schedule_time": "19:00~20:00",
  "room_seq": null, "room_title": null, "year": null, "month": null, "code_name": null }
```

- 세션 쿠키 불필요(무상태). `200 + []`는 "예약 없음"의 정상 응답.
- **사용 가능한 필드**: `schedule_seq`(예약 고유 ID = 자연키), `schedule_dept`(사용단체), `schedule_date`(일자, 2자리), `schedule_time`(1시간 슬롯).
- **소스에 존재하지 않는 필드**: 예약명(행사명), 사용상태(status). `code_name`은 항상 null. → 예약명은 저장하지 않고, status/현재사용여부는 우리가 조회 시점에 계산한다.
- `schedule_dept`의 꼬리 시간표기(`(9:00~20:00)`)는 운영시간 주석이므로 조직명에서 제거한다(§6.2).

---

## 3. 아키텍처

패키지: `backend/src/main/java/com/duing/domain/facility/` (기존 `domain/fee`, `domain/publicactivity` 컨벤션과 동일)

```
domain/facility/
├── config/       FacilityCrawlerJobConfig     — @Configuration @EnableScheduling @ConditionalOnProperty
│                 FacilitySchoolClientConfig    — RestClient 빈(timeout) + @EnableConfigurationProperties
│                 FacilityCrawlerProperties     — @ConfigurationProperties(record)
├── crawler/      SchoolFacilityClient          — HTTP만: Jsoup GET(html) + RestClient POST(json), 재시도 포함
├── parser/       FacilityListParser            — html → List<ParsedFacility(roomSeq, roomName, location, sortOrder)>
│                 ReservationParser             — json → List<ParsedReservation> (dept 정리·date 조립·slot 파싱)
├── scheduler/    FacilityCrawlScheduler        — @Scheduled(예약 10분 / 시설목록 1일)
├── service/      FacilityCrawlService          — 수집 오케스트레이션 + 원자적 스냅샷 교체 + 온디맨드 single-flight
│                 FacilitySyncService           — 시설목록 reconcile(추가/수정/archive/복구)
│                 FacilityUsageService          — 조회 + 상태계산(Asia/Seoul) + slot 병합
│                 SlotMerger                    — 연속 슬롯 병합(순수 함수)
├── repository/   FacilityRepository, FacilityReservationRepository, FacilityMonthSnapshotRepository
├── controller/   FacilityController (+ api/FacilityApi 인터페이스로 매핑 분리)
├── dto/          query/*Item (내부), response/*Response (record, static from())
├── entity/       Facility, FacilityReservation, FacilityMonthSnapshot,
│                 ReservationStatus(enum, 응답 전용 — 미영속), DataSource(enum: CACHE/LIVE_FETCH/STALE_CACHE)
└── (converter)   YearMonthAttributeConverter   — java.time.YearMonth ↔ VARCHAR(7)
```

계층 책임: Crawler=HTTP만 / Parser=변환만 / Service=비즈니스 / Repository=DB / Controller=REST.

- HTTP 클라이언트는 기존 `BankApiClientConfig` 패턴(`SimpleClientHttpRequestFactory` + `Duration` timeout).
  **Connection Timeout 3초 / Read Timeout 5초.**
- `RestClient`는 `.retrieve()`(4xx/5xx에서 throw)가 아니라 `.exchange()`로 상태코드를 직접 판정한다(재시도 판단에 필요).
- 잡 토글: `duing.facility.crawler.enabled` — base `application.yml`=`false`, `application-prod.yml`=`${DUING_FACILITY_CRAWLER_ENABLED:true}`(기존 잡 컨벤션과 동일, 로컬/테스트는 비활성).

---

## 4. 데이터 모델

Flyway 위치 `backend/src/main/resources/db/migration/`, 현재 최신 `V68` → 신규 `V69/V70/V71`.
컬럼 snake_case, PK `BIGSERIAL`, 타임스탬프 `TIMESTAMP DEFAULT NOW()`(UTC), `BaseEntity` 상속(`created_at/updated_at`).
> `BaseEntity`의 `deleted_at` 컬럼은 이 도메인에서 **미사용**(soft-delete 안 씀). 시설의 도메인 아카이브는 별도 `archived_at`으로 표현하고, 예약은 하드 삭제(스냅샷 교체)한다.

### 4.1 `facility` (V69) — 캐시된 시설 목록

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGSERIAL PK | API 식별자 |
| room_seq | INT NOT NULL **UNIQUE** | 학교 외부키(내부 매핑 전용, **API 미노출**) |
| room_name | VARCHAR(100) NOT NULL | 예: `커뮤니티룸(1)` |
| location | VARCHAR(100) NULL | 예: `1503호`, 없을 수 있음 |
| sort_order | INT NOT NULL DEFAULT 0 | 탭 노출 순서 |
| archived_at | TIMESTAMP NULL | 학교 목록에서 사라지면 설정, 재등장 시 NULL 복구 |
| created_at / updated_at | TIMESTAMP | BaseEntity |

- idx `facility (archived_at)` (활성 목록 조회용).

### 4.2 `facility_reservation` (V70) — 월별 예약 스냅샷

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGSERIAL PK | |
| facility_id | BIGINT NOT NULL → facility(id) | FK(ON DELETE 없음) |
| schedule_seq | BIGINT NOT NULL **UNIQUE** | 자연키(중복 제거) |
| year_month | VARCHAR(7) NOT NULL | `YYYY-MM`, YearMonth 컨버터, 스냅샷 파티션키 |
| reservation_date | DATE NOT NULL | year_month + schedule_date(일) 조립 |
| start_time / end_time | TIME NOT NULL | **원본 1시간 슬롯 그대로 저장**(병합은 조회 시) |
| organization_name | VARCHAR(200) NOT NULL | 정리된 dept |
| crawled_at | TIMESTAMP NOT NULL | 수집 시각 |
| created_at / updated_at | TIMESTAMP | BaseEntity |

- idx `facility_reservation (facility_id, year_month, reservation_date)`.
- 슬롯은 **원본 그대로 저장**하고 병합은 조회 시 `SlotMerger`로 수행(재병합·디버깅 용이).
- `schedule_seq`는 학교 전역에서 유일 → DB unique로 중복 방지(파서에서도 distinct). 드물게 예약이 시설/월 경계를 넘어 이동하면 교체 트랜잭션이 unique 충돌로 롤백될 수 있는데, 이는 fail-safe(해당 시설 기존 데이터 유지)로 처리되고 다음 주기에 자연 정합된다.

### 4.3 `facility_month_snapshot` (V71) — 월 캐시 메타 (**빈 달 문제 해결**)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGSERIAL PK | |
| year_month | VARCHAR(7) NOT NULL **UNIQUE** | |
| crawled_at | TIMESTAMP NOT NULL | 해당 월 **마지막 성공** 수집 시각(stale/TTL 기준, lastUpdatedAt 출처) |
| source | VARCHAR(20) NOT NULL | 마지막 채움 경로: SCHEDULER / ON_DEMAND |
| fetch_status | VARCHAR(20) NOT NULL | **마지막 시도 결과**: SUCCESS / PARTIAL / FAILED |
| last_error | VARCHAR(500) NULL | 마지막 실패 요약(method/status/code 수준, **PII 금지**) |
| created_at / updated_at | TIMESTAMP | BaseEntity |

> `crawled_at`(마지막 성공)과 `fetch_status`/`last_error`(마지막 시도)는 분리한다. 전체 실패(FAILED) 시 `crawled_at`은 건드리지 않아 stale/TTL 기준을 보존하고, `fetch_status=FAILED`·`last_error`로 장애를 기록한다. PARTIAL(일부 룸 실패)은 성공한 룸을 반영하며 `crawled_at`을 갱신한다.

> 필요성: 예약 0건인 달은 예약 테이블에 행이 없어 "미캐시"로 오인 → 매 조회마다 학교 재요청 → 부하 보장 붕괴. 메타 테이블이 "이 달은 T 시각에 정상 수집됨(0건이어도)"을 기록해 이를 방지한다.

---

## 5. 수집 흐름

### 5.1 시설 목록 동기화 (1일 1회 + 최초 기동 시 비어 있으면)

`GET /room/detail` → `FacilityListParser` → **reconcile**:

- 신규 room_seq → 생성
- 기존 room_seq → `room_name`/`location`/`sort_order` 변경 시 수정, `archived_at` 있으면 NULL 복구
- 파싱 목록에 **없어진** 기존 facility → `archived_at = now` (하드삭제 금지, FK 무결성·복구 가능성 보존)

### 5.2 예약 수집 (10분, `cron = "0 */10 * * * *"`, zone `Asia/Seoul`)

**중복 실행 방지**: 스케줄러 진입 시 `AtomicBoolean.compareAndSet(false, true)`(try/finally로 해제). 이전 사이클이 아직 진행 중이면(전 룸 학교 장애 시 최악 ~8분 소요 가능) 이번 tick은 **skip + 로그**. (in-JVM 겹침 방지 — 멀티 인스턴스 크로스 락은 §10 별개)

대상 월 = **현재월 + 다음월**. 활성 facility(`archived_at IS NULL`) 각각에 대해:

1. 두 월을 `SchoolFacilityClient.fetch(room_seq, yearMonth)` — **룸 간 100ms 간격**.
2. `ReservationParser`로 파싱·검증(트랜잭션 밖).
3. **원자적 교체(§5.4)**: 해당 facility의 두 월 rows를 한 트랜잭션에서 `delete → insert`.
4. 룸 실패는 격리 — 다른 룸 수집에 영향 없음.
5. 모든 룸 종료 후 각 월 `facility_month_snapshot.crawled_at` 갱신(해당 월 ≥1 룸 성공 시), `source=SCHEDULER`.

요청량: 2월 × 10룸 = **주기당 약 20 POST**(+1일 1회 시설목록 GET) ≈ 하루 ~2,900. 매우 가벼움.

### 5.3 재시도 (룸 단위, `SchoolFacilityClient` 내부)

- 초기 1회 + **재시도 최대 3회 = 총 4회**, 백오프 **500ms → 1s → 2s**.
- 재시도 대상: **네트워크 오류 · Timeout · HTTP 5xx(500/502/503/504)만**. **4xx는 재시도 안 함**.
- Timeout은 그대로(connect 3s / read 5s).
- 구현: `spring-retry` 의존성 + `@Retryable(maxAttempts=4, backoff=@Backoff(delay=500, multiplier=2))`(대기 0.5/1/2초와 정확히 일치). 4xx는 재시도 예외에서 제외.
- 4회 모두 실패 → 해당 룸 실패 처리(기존 스냅샷 유지), 다음 룸 계속.

### 5.4 원자적 스냅샷 교체 (Fail-safe 핵심)

순서: `HTTP fetch(재시도 포함) → 파싱·검증 → [트랜잭션] delete(facility,월) → insert → commit`.
예외는 트랜잭션 진입 **전**에 발생하므로 기존 스냅샷은 절대 삭제되지 않는다.

| 응답 | 판정 | 처리 |
|---|---|---|
| `200 + [빈 배열]` | **정상**(예약 없음) | 빈 스냅샷으로 **교체**(취소된 예약 유령 방지) |
| Timeout / Network Error / 5xx / JSON 파싱 에러 | **비정상** | 기존 스냅샷 **그대로 유지**, 삭제 안 함 |

### 5.5 온디맨드 + Single-flight + TTL

`usage?yearMonth=M` 조회 시:

- **TTL**: 현재월·다음월 = 10분 / **그 외 모든 월(과거·미래) = 24시간**.
- 신선도 판정: 메타 존재 && `now - crawled_at < TTL` → 캐시 서빙(`source=CACHE`).
- 만료/미캐시 → **JVM 내 single-flight 락**(`ConcurrentHashMap<YearMonth, Lock>` + 더블체크)으로 그 월을 전 시설 fetch·교체 → 서빙(`source=LIVE_FETCH`). 동시 미스 N건이 학교 fetch **1회**로 수렴.
  - fetch 실패 & 기존 캐시 있음 → 옛 캐시 서빙, `source=STALE_CACHE`, `stale=true`.
  - fetch 실패 & 캐시 전무(콜드 스타트 + 학교 다운) → 빈 목록 + `stale=true`(데이터 조작 불가).
- **월 범위 제한**: `현재월 ±12개월` 초과 조회는 400(enumeration abuse 방지).
- 락 범위: 단일 인스턴스라 in-JVM으로 충분. 멀티 인스턴스 전환 시 §10.

---

## 6. 상태 계산 · 슬롯 병합 (조회 시, DB 미저장)

### 6.1 슬롯 병합 (`SlotMerger`)

정렬 후 아래 **4조건 모두** 만족 시에만 하나로 병합:
① 같은 시설 ② 같은 날짜 ③ 같은 사용단체 ④ 이전 슬롯 `end_time == 다음 슬롯 start_time`.
예) `09-10 + 10-11 + 11-12 → 09-12`. 비인접(`고정관념` 09-10 · 19-20)은 분리 유지.

### 6.2 조직명 정리

꼬리 시간표기만 제거: 정규식 `\s*\(\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}\)\s*$` → `고정관념(9:00~20:00)` → `고정관념`. 그 외 괄호는 보존.

### 6.3 상태 (Asia/Seoul 기준, `ReservationStatus` enum — 응답 전용)

병합된 예약 각각에 대해 실제 `now`(Seoul) 기준:
- `now < start` → `UPCOMING`
- `start ≤ now < end` → `USING`
- `now ≥ end` → `FINISHED`

시설 카드 상태: 오늘 `USING` 예약 있으면 `isUsingNow=true` + `currentReservation` 제공, 없으면 이용 가능. 현재월이 아닌(오늘을 포함하지 않는) 월 조회 시 `isUsingNow`는 자연히 false — 실시간 상태는 현재월/오늘 뷰에서만 의미.

- `currentReservation`: 지금(`start ≤ now < end`) 사용 중인 병합 예약(없으면 null).
- `nextReservation`: `now` 이후 **가장 이른** 시작(해당 월 범위 내)의 병합 예약(없으면 null). "이용 가능 + 다음 예약 14:00~16:00 OO동아리" UX용.

> 시간 비교는 저장된 `reservation_date(DATE)` + `start/end(TIME)`(KST wall-clock)를 `LocalDateTime.now(Asia/Seoul)`와 비교 → JVM 타임존(prod=UTC)과 무관하게 정확. `crawled_at`(Instant)은 응답 시 KST로 변환.

---

## 7. API (공개, permitAll)

`SecurityConfig`에 `requestMatchers(HttpMethod.GET, "/api/v1/facilities", "/api/v1/facilities/**").permitAll()` 추가(정확 경로 + 와일드카드 둘 다 필요). 응답은 `ApiResponse<T>` 래퍼, DTO는 record + static `from()`. **room_seq는 어떤 응답에도 노출 금지.**

**Cache-Control**: 모든 public GET에 `ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())` — `public, max-age=60`. status/isUsingNow는 라이브 계산이나 60초 지연은 분 단위 전이라 무해하며, 대규모 트래픽 시 우리 서버 부하를 줄인다.

### 7.1 `GET /api/v1/facilities`
활성 시설 목록(가벼움). `[{ id, roomName, location }]`.

### 7.2 `GET /api/v1/facilities/usage?yearMonth=YYYY-MM` (주력)
`yearMonth` 생략 시 현재월.

```json
{
  "yearMonth": "2026-07",
  "lastUpdatedAt": "2026-07-01T11:20:00+09:00",
  "stale": false,
  "source": "CACHE",
  "facilities": [
    {
      "id": 12,
      "roomName": "공동연습실(1)",
      "location": "2105",
      "isUsingNow": true,
      "currentReservation": { "date": "2026-07-01", "start": "09:00", "end": "11:00", "organization": "댄스동아리", "status": "USING" },
      "nextReservation": { "date": "2026-07-02", "start": "16:00", "end": "17:00", "organization": "고정관념", "status": "UPCOMING" },
      "reservations": [
        { "date": "2026-07-01", "start": "09:00", "end": "11:00", "organization": "댄스동아리", "status": "USING" },
        { "date": "2026-07-02", "start": "16:00", "end": "17:00", "organization": "고정관념", "status": "UPCOMING" }
      ]
    }
  ]
}
```
> 위 값은 응답 **형태를 보이기 위한 예시**(현재시각 10:15 가정, 09-10·10-11 인접 슬롯이 09:00~11:00로 병합된 USING 사례)이며 실측치가 아니다. 실제 소스에는 비인접 슬롯(예: `고정관념` 09-10·19-20)도 있어 병합되지 않고 분리된다.

- `reservations`는 병합 완료된 해당 월 전체. `currentReservation`은 지금 사용 중인 병합 예약(없으면 null).
- `source` enum: `CACHE`(캐시만) / `LIVE_FETCH`(이번 요청이 온디맨드 fetch 수행) / `STALE_CACHE`(라이브 실패 후 옛 캐시).
- `stale` = `now - lastUpdatedAt > TTL`. 크롤 실패 지속 시 자연히 true → 프론트 안내 배너.

### 7.3 `GET /api/v1/facilities/{facilityId}?yearMonth=YYYY-MM`
단일 시설 상세(타임라인용) — usage의 시설 1건 슬라이스 + `lastUpdatedAt/stale/source`.

---

## 8. 프론트엔드 (`/facilities`, 공개)

- 라우트: `apps/web/app/facilities/page.tsx`(목록) + `[facilityId]/page.tsx`(상세, **모달 아닌 풀 라우트** = `/clubs` 컨벤션). `layout.tsx`에서 `.duing` **1회** 래핑(중첩 시 bg-cream 띠 버그).
- 컴포넌트: `_components/FacilityCard`, `FacilityTimeline`(시간별), `_pages/FacilityExplorePage`, `_lib/facilities.ts`.
- 데이터: `packages/hooks/facilities.ts`(`useFacilityUsageQuery`, `useFacilityDetailQuery`) + `facilityQueryKeys`, `packages/types/facility.ts`. 기존 ky 클라이언트(공개 endpoint는 토큰 null이면 Authorization 자동 생략).
- 카드(예시): `🟢 공동연습실(1) / 2105호 / 현재 사용 중 / 09:00~11:00 / 고정관념 / [상세보기]`, 미사용 시 `현재 이용 가능`.
- 타임라인: `StepTimeline` 팔레트 재사용 — 예약 구간=`#2E6149`(ink-soft, Primary), 빈=`#fff`/`#F0EDE5`(gray), **현재시각 세로 인디케이터**. hex 인라인(Tailwind 임의값 회피). 예약 hover/클릭 시 예약명(조직)·시간·단체 표시.
- 상단: `마지막 업데이트 2026-07-01 11:20`(`lastUpdatedAt` 포맷). `stale===true`면 "현재 최신 캐시 데이터를 표시하고 있습니다" 배너.
- 시간 포맷: 백엔드가 KST(+09:00)로 내려주므로 `toLocaleString('ko-KR')` 그대로. (별도 date 라이브러리 없음)
- 나비: `BottomNav` TABS에 `{ label: '시설', href: '/facilities' }` 추가(모바일) + `HomeNav`(데스크톱).

---

## 9. 운영 로그 · 관측

- Micrometer 미도입. **구조화 로그(`@Slf4j`) + Sentry breadcrumb**.
- 크롤 완료 시 필수 기록: 성공/실패 여부 · 수행 시간 · 수집 시설 수 · 수집 예약 수 · **실패한 룸 목록**.
  ```
  Facility Crawl SUCCESS rooms=10 reservations=138 duration=1.2s
  Facility Crawl PARTIAL rooms=8/10 reservations=120 duration=3.4s failedRooms=[6, 82]
  ```
- 로그에 PII/학교 민감정보 금지(기존 컨벤션). 에러 로그는 method/status/code 수준만.

---

## 10. 향후 확장 (TODO)

- **멀티 인스턴스 스케줄러 락**: 현재 단일 Lightsail = 락 없음. 다중 인스턴스 전환 시 **ShedLock 또는 PostgreSQL Advisory Lock** 적용(스케줄러 중복 실행 방지 + 온디맨드 single-flight를 DB 락으로 승격).
- 미접근 온디맨드 월 데이터 정리 잡(데이터가 작아 현재 불필요).
- 시설 이미지/부가정보(학교 소스에 없음).

---

## 11. 테스트 전략

- **실측 Fixture 박제**: 실제 응답을 `backend/src/test/resources/facility/`에 저장해 파서 회귀 테스트의 입력으로 사용(HTML/JSON 구조 변경 감지).
  - `room_detail.html`(시설 탭 목록), `room_data_list_room4.json`(예약 있음), `room_data_list_room1_empty.json`(200+[]), `room_data_list_room143.json`. (원본은 세션 scratchpad에 확보됨 → 커밋 시 이 경로로 복사)
- `ReservationParser`: 위 JSON 픽스처(room 4/143/빈 room 1)로 파싱·dept 정리·date 조립 검증.
- `FacilityListParser`: 실제 HTML 탭 픽스처로 room_seq/이름/위치 분리(빛광장 등 location=null 포함) 검증.
- `SlotMerger`: 4조건 각각(연속 병합 / 비인접 분리 / 다른 단체 / 다른 날짜) 단위 테스트.
- 상태 계산: **하드코딩 미래 절대날짜 금지**(CI timebomb). `Clock` 주입/상대시각으로 UPCOMING/USING/FINISHED 경계 테스트.
- 원자적 교체: `200+[]`=교체 / 5xx·timeout=유지 를 각각 검증(기존 rows 보존 단언).
- 온디맨드 single-flight: 동시 미스가 fetch 1회로 수렴하는지(모킹) 검증.
- 컨트롤러: permitAll(비로그인 200), `source`/`stale`/`lastUpdatedAt` 필드 존재, room_seq 미노출 단언.

---

## 12. Out of Scope

예약 생성/수정(읽기 전용 크롤 데이터) · 실시간 push/웹소켓 · 학교 로그인 필요한 시설 · 메트릭 파이프라인(Micrometer/Prometheus) · 멀티 인스턴스 락(§10 TODO) · 시설 이미지.

---

## 13. 확정된 설계 결정 기록

1. 상태·현재사용여부는 **미저장, 조회 시 Asia/Seoul 계산**(DTO에만).
2. 스냅샷 교체는 **원자적**(fetch·검증 후 트랜잭션 내 delete+insert), `200+[]`은 정상 교체 / 에러는 기존 유지.
3. `year_month`는 엔티티에서 `java.time.YearMonth`, DB는 컨버터로 `VARCHAR(7)`. (네이티브 쿼리는 문자열 바인딩)
4. 룸 요청 간격 **100ms**.
5. 재시도 **총 4회 / 0.5·1·2초 / 5xx·네트워크·타임아웃만 / 룸 단위 격리**.
6. 운영 로그: 구조화 로그 + Sentry breadcrumb(Micrometer 미도입).
7. `SlotMerger` 4조건.
8. 시설 목록 reconcile: 추가/개명/위치변경/`archived_at` 아카이브·복구. **하드삭제 금지.** API는 `archived_at IS NULL`만.
9. 스케줄러 락: 단일 인스턴스=없음, 멀티=ShedLock/PG advisory(TODO).
10. TTL: 현재·다음월=10분 / 그 외=24시간.
11. API 식별자=내부 `facility.id`, `room_seq` **미노출**.
12. 응답에 `lastUpdatedAt`/`stale`/`source(CACHE·LIVE_FETCH·STALE_CACHE)` 포함, enum 확장 가능.
13. 메타 테이블에 `fetch_status(SUCCESS/PARTIAL/FAILED)`·`last_error(≤500, PII 금지)` 추가 — 마지막 성공(`crawled_at`)과 마지막 시도 분리.
14. 스케줄러 **중복 실행 방지**: `AtomicBoolean` compareAndSet, 진행 중이면 tick skip(in-JVM).
15. public GET에 **`Cache-Control: public, max-age=60`**.
16. 응답에 **`nextReservation`**(now 이후 가장 이른 병합 예약) 추가.
17. 실측 **HTML/JSON fixture**를 `src/test/resources/facility/`에 박제해 파서 회귀 테스트.

---

## 14. 알려진 한계 (Known limitations)

- **월 단위 신선도 granularity**: `facility_month_snapshot`은 월 1행이라 `stale`/신선도가 월 단위다. PARTIAL 크롤(일부 룸만 성공)은 `fetch_status=PARTIAL`로 기록되고, `isFresh`/`stale` 판정 모두 `fetch_status==SUCCESS`를 요구하므로 **PARTIAL 월은 항상 `stale=true`로 노출되고 계속 재시도된다**(과거처럼 한 룸만 성공해도 "최신"으로 오표기되지 않음, §15 참조). 다만 판정 단위 자체는 여전히 월 단위라, PARTIAL 안에서 **어느 룸**이 실패했는지는 응답에서 구분되지 않는다(`failedRooms`는 로그·Sentry breadcrumb에만 존재). 룸별 신선도/실패 노출이 필요하면 예약 행의 `crawled_at`(이미 존재)을 응답에 노출하거나 룸별 상태 컬럼을 추가해야 한다(스키마 변경 → 후속, MINOR).

## 15. 최종 코드리뷰 후속 수정 (2026-07-02)

- **스케줄러 single-flight 통합**: 스케줄러도 `refreshMonthLocked`로 on-demand와 동일한 월별 락을 거쳐, 스케줄러↔온디맨드가 같은 월의 delete+insert·메타 first-insert를 경합하던 문제 제거.
- **온디맨드 실패 쿨다운(30s)**: 학교 장애 시 공개 GET이 연쇄 재크롤로 스레드풀·상류를 폭주시키지 않도록, 최근 시도 후 쿨다운 내에는 `STALE_CACHE` 즉시 반환.
- **인터럽트 중단**: 크롤 루프가 shutdown 인터럽트를 룸 경계에서 감지해 중단.
- **메타 기록 방어**: 월 메타 기록 실패가 공개 GET로 전파되지 않도록 try/catch로 격리.
- **프론트 `lastUpdatedAt` null 처리**: 콜드/미수집 월(null) 시 `1970-01-01` 오표기 방지(업데이트 줄 숨김, 타입 `string|null`).
- **타임라인 시간축 라벨 정렬**: 09~22 선형 트랙에 절대 좌표로 정렬(`justify-between` 어긋남 수정). 카드 트랜지션 `motion-safe:` 통일.
- **온디맨드 동시성 상한(2026-07-02 adversarial review)**: `ensureFresh`의 월별 락을 블로킹 `lock()`에서 비블로킹 `tryLock()`으로 바꿔, 같은 월을 다른 요청이 이미 갱신 중이면 대기하지 않고 `STALE_CACHE`를 즉시 반환한다. 추가로 전역 `Semaphore(3)`(`onDemandSlots`)로 월이 달라도 동시 온디맨드 크롤을 최대 3개로 제한한다(초과분도 대기 없이 `STALE_CACHE`). 인증 없는 클라이언트가 ±12개월 창을 순회하며 요청 스레드를 무한정 점유하거나 학교 서버를 연쇄 호출시키는 것을 막는다. 스케줄러 전용 `refreshMonthLocked`는 블로킹 `lock()`과 세마포어 미적용을 그대로 유지(배경 잡은 반드시 완주해야 함); `ensureFresh`만 월락→세마포어 순으로 획득하는 유일한 경로라 락 순서 역전에 의한 교착 가능성은 없다.
- **PARTIAL 스테일 노출(2026-07-02 adversarial review)**: 이전에는 PARTIAL 크롤도 `recordSuccessfulMeta`로 `crawled_at`이 갱신되고, `isFresh`/`isStale`이 `crawled_at`만 봐서 일부 룸이 계속 실패해도 `stale=false`로 마스킹됐다(§14 이전 버전 한계). 이제 `FacilityCrawlService.isFresh`와 `GeneralFacilityUsageService.isStale` 모두 `fetch_status==SUCCESS`를 함께 요구해, PARTIAL 월은 `isFresh=false`(계속 재시도)·`stale=true`(클라이언트 배너 노출)로 정확히 드러난다. 응답 필드는 추가하지 않고 기존 `stale`만으로 표현한다.

### 설계 리뷰(Fable, 2026-07-02) 후속

- **조회 트랜잭션 경계 분리(CRITICAL)**: `GeneralFacilityUsageService`의 클래스 레벨 `@Transactional(readOnly = true)`가 온디맨드 크롤(`ensureFresh` → `FacilitySnapshotWriter.replaceReservations`)의 delete+insert 를 read-only 트랜잭션에 편승시켜 PostgreSQL 25006 → 공개 GET 500·영속 실패를 유발했다. 어노테이션을 제거해 조회 조립을 무트랜잭션 오케스트레이션으로 두고, `FacilitySnapshotWriter`의 `@Transactional`이 유일한 쓰기 경계가 되도록 했다(§5.4). 실 PG 회귀 테스트 `FacilityOnDemandCrawlIntegrationTest` 추가(200+LIVE_FETCH+영속 검증).
- **스키마 드리프트 가드(HIGH)**: 200 + 비어있지 않은 배열이 전 원소 파싱 실패로 빈 리스트가 되면(학교 필드 개명 등) 진짜 빈 달과 구분 없이 빈 스냅샷으로 교체·SUCCESS 기록되던 것을, `crawlAndReplace`에서 `FacilityBadResponseException`으로 룸 실패 처리해 기존 스냅샷을 보존한다(§1 fail-safe, `FacilitySyncService`의 파싱 0건 스킵과 동일 원칙).
- **콜드 스타트 시설 동기화(MEDIUM)**: §5.1의 '최초 기동 시 비어 있으면 동기화'가 미구현이라 첫 배포 후 04:00 잡 전까지 빈 목록이 서빙되던 것을, `FacilityCrawlScheduler`에 `ApplicationReadyEvent` 리스너로 `facility` 테이블이 비어 있을 때 1회 `sync()` 실행(실패해도 기동 계속)으로 구현.
- **쿨다운 스탬프 완료 시점 이동(하드닝)**: `lastAttemptAt`을 크롤 시작 전이 아니라 완료 시점(finally)에 찍어, 크롤이 30초를 초과하는 장애 상황에서 쿨다운이 무력화되어 연속 재크롤이 일어나는 것을 방지.

---

## 16. 2차 개선 (2026-07-02 사용자 합의)

### 16.1 운영시간 기반 예약 병합 (필수 · 백엔드)

**발견**: 학교 데이터의 1시간 슬롯은 예약의 시작/끝 마커일 수 있으며, 실제 예약 시간은 `schedule_dept` 꼬리의 운영시간 표기다. 예: `비호상무회(09:00~17:00)` — 슬롯은 09-10·16-17 두 개만 내려오지만 실제 예약은 09:00~17:00 전체. 기존 구현은 이 꼬리를 조직명 정리 단계에서 버려 실제 이용시간이 왜곡 표시됐다.

- **저장**: 원본 1시간 슬롯은 지금처럼 그대로 보존. V72로 `facility_reservation`에 `reserved_start_time`/`reserved_end_time`(TIME NULL) 추가 — 파서가 꼬리 제거 **전에** `(H:MM~H:MM)` 범위를 추출해 저장(조직명 정리는 기존 유지).
- **조회(병합 우선순위)**: `(reservation_date, organization, 운영시간범위)` 그룹 단위 —
  1. 운영시간이 있으면 **그 범위로 예약 1건** (운영시간 우선, SlotMerger 미적용)
  2. 운영시간이 없으면 기존 **SlotMerger**(연속 슬롯 병합) 폴백
- **정책**: ① 슬롯과 운영시간이 모순(슬롯이 범위 밖)이어도 **학교 제공 운영시간을 신뢰**. ② 같은 날 같은 단체라도 운영시간이 다르면 **각각 별개 예약**. ③ 범위 파싱 실패(역전·형식 이상)는 범위 null 처리(폴백) — 원소 스킵 아님.

### 16.2 상세 페이지 월 이동 (필수 · 프론트)

- `/facilities/{id}`에 **이전 달 / 다음 달** 버튼. 기존 `?yearMonth=YYYY-MM` API·TTL(현재·다음월 10분, 그 외 24h)·온디맨드 수집 그대로 사용.
- **±12개월 경계에서 버튼 비활성화**. 월 전환 시 날짜 선택 초기화(현재월=오늘, 그 외=1일). 미캐시 월 첫 진입은 온디맨드 수집 동안 로딩 표시.
- 목록(Overview)은 "오늘" 기준 화면이므로 월 이동 없음.

### 16.3 전체 시설 통합 타임라인 Overview (UX · 프론트)

- `/facilities`를 카드 그리드에서 **통합 타임라인**으로 변경: **시설 = 행(Row), 오늘 09:00~22:00 = 가로축**. 각 행에 상태(사용중/이용가능)·시설명·위치·다음 예약(오늘 아니면 날짜 병기)과 오늘 예약 바를 표시하고, 공유 시간축 헤더 + 현재시각 세로 인디케이터 제공.
- 스크롤 없이 어느 시설이 언제 비어있는지 한눈에 비교. 행 클릭 → `/facilities/{id}` 상세(월간 타임라인은 상세에서 그대로 제공).
- 구조: `/facilities` = Overview(오늘 통합) / `/facilities/{id}` = Detail(월간 상세) 2단계.
