# Public Activity Feed API (Phase 2) 설계

- 날짜: 2026-06-29
- 범위: 1개 PR (백엔드 전용 · DB 마이그레이션 없음 · 도메인 쓰기경로 변경 없음)
- 대상: 신규 read-model 도메인 `com.duing.domain.publicactivity` + 공개 GET 엔드포인트
- 분해: 3-Phase 중 **Phase 2 (B)**. Phase A(FE 비주얼) 머지 완료(#560), Phase C(FE 연동)는 별도 PR.

## 배경

Phase A 에서 홈 Hero 의 활동 토스트는 `recentActivities` 를 받도록 seam(`resolveHeroToasts`)이 완성됐고, 데이터가 없으면 폴백 토스트로 동작 중이다. **Phase 2 는 그 데이터를 공급하는 백엔드 API** 를 만든다. Phase C 에서 FE 가 이 API 를 호출해 폴백 자리에 실데이터를 꽂는다.

탐색 결과 6개 도메인이 깔끔한 이벤트 timestamp 를 가진다(아래 표). 유일한 공백인 `RECRUIT_CLOSE`(전용 timestamp 없음)는 사용자 결정으로 **v1 제외**한다 — FE 폴백이 부족분을 채우므로 무방하고, 마이그레이션/쓰기경로 변경을 피한다.

## 목표

- 홈 Hero 용 **공개(비인증) 최근 활동 피드**. 6개 도메인의 최근 활동을 시간순으로 집계해 GET 으로 제공한다.
- **읽기 전용** — DB 스키마·도메인 쓰기경로를 바꾸지 않는다.
- **데이터 누출 금지** — 비ACTIVE 동아리 · 비PUBLIC 공지 · 드래프트 · 소프트삭제 데이터가 공개 피드로 새지 않게 한다(보안 표면).

## 결정 사항

- **타입 6종**: `RECRUIT_OPEN` · `NOTICE_CREATED` · `INTERVIEW_CREATED` · `INTERVIEW_RESULT` · `EVENT_CREATED` · `FEE_OPEN`. `RECRUIT_CLOSE` 는 v1 제외(전용 timestamp 부재). 타입 enum 값 문자열은 **FE 의 `HeroActivityType` 와 1:1**(직렬화 시 enum name 그대로).
- **엔드포인트**: `GET /api/v1/public-activities?limit={N}` (`permitAll`). 개인용 Activity/Notification API 와 역할이 명확히 구분되도록 `public-activities` 네이밍.
- **집계 방식**: 소스별 QueryDSL 쿼리(각 `limit` 건, club 조인 + 가시성 필터 + 윈도우 + 이벤트시각 내림차순) → 서비스에서 **머지 → 정렬 → 상위 limit**. 새 테이블·활동로그 없음.
- **응답 아이템**: `ActivityItem(PublicActivityType type, Long clubId, String clubName, Instant occurredAt)`. `clubId` 는 Hero 에선 미사용이나 추후 동아리 상세 이동·확장 위해 포함.
- **`occurredAt` = `Instant`** (존 포함 ISO-8601, 예: `2026-06-29T01:23:45Z`). BaseEntity 의 `LocalDateTime` → `Instant` 변환은 **주입된 `Clock`(앱 논리 타임존 `Asia/Seoul`)** 의 존 기준으로 한 곳(헬퍼)에서: `localDateTime.atZone(clock.getZone()).toInstant()`. FE 가 존 포함 ISO 를 파싱해 상대시간을 안정적으로 계산한다.
- **`Clock` 주입**: 현재 시각을 직접 호출(`Instant.now()`/`LocalDateTime.now()`)하지 않고 **주입된 `Clock`** 을 쓴다(`Instant now = Instant.now(clock)`). **이미 존재하는** `seoulClock`(`TimeConfig`, `Clock.system(ZoneId.of("Asia/Seoul"))`) 빈을 주입(`private final Clock clock`)하고, 윈도우 경계 계산과 `LocalDateTime`→`Instant` 변환 모두 이 `Clock` 을 거친다. 테스트는 `Clock.fixed(...)` 로 시간을 고정해 윈도우·정렬을 결정적으로 검증한다.
- **정렬(결정적)**: ① `occurredAt` DESC ② `clubId` DESC ③ `type` ASC. `clubName` 은 **가변값**이라 정렬 키로 쓰지 않고, 불변 식별자 `clubId` 와 불변 계약값 `type` 으로 동률을 깬다(동일 club·동일 시각의 드문 충돌까지 결정적).
- **설정값화**: 하드코딩 금지, `@ConfigurationProperties(prefix = "duing.public-activity")` 로 외부화(코드베이스가 feature 설정을 `duing.<feature>` 로 네스팅하는 컨벤션 — `BankApiProperties`/`RetentionProperties` 패턴).
  - `duing.public-activity.window-days=30` (최근성 윈도우 — `occurredAt >= now - windowDays` 인 활동만)
  - `duing.public-activity.default-limit=10` (limit 미지정 시)
  - `duing.public-activity.max-limit=20` (상한 — 초과 요청은 클램프)
- **limit 정규화 + 소스 과조회**: 요청 `limit` → `effectiveLimit = clamp(limit ?? default-limit, 1, max-limit)`. 각 소스는 **`sourceFetchLimit = effectiveLimit * 2`** 만큼 조회(머지 헤드룸)한 뒤, 머지→정렬→상위 `effectiveLimit` 만 반환. (순수 최신순 머지에선 과조회가 결과를 바꾸진 않지만, 향후 타입 다양성/라운드로빈 도입 여지를 위한 헤드룸. v1 은 엄격 최신순 유지 — 특정 타입이 최신이면 다수 차지 가능, 타입 강제 다양성은 비목표.)
- **Cache-Control**: 응답에 `Cache-Control: public, max-age=60, stale-while-revalidate=30`. 공개 읽기 전용이라 짧은 캐시로 Hero 반복 조회 DB 부하를 줄이고, SWR 로 만료 직후엔 캐시본을 즉시 주며 백그라운드 재검증해 UX 를 매끄럽게 한다(Spring `CacheControl.maxAge(60, SECONDS).cachePublic().staleWhileRevalidate(Duration.ofSeconds(30))`).
- **가시성(전 소스 공통)**: `club.status = ACTIVE` + 소프트삭제 제외(`@SQLRestriction("deleted_at IS NULL")` 자동) + 윈도우. 추가로 소스별 조건(아래).

## API 계약 (하위 호환)

이 엔드포인트는 FE Phase C 가 의존하는 **공개 계약**이다:

- **`PublicActivityType` enum = FE `HeroActivityType` 과 1:1 계약.** enum name **변경·삭제·rename 은 Breaking Change** 로 취급한다. 신규 타입은 **뒤에 추가(additive)** 만 허용(기존 값·의미 유지).
- **응답 DTO 는 additive 확장만.** 향후 `clubThumbnail` · `clubSlug` · `deepLink` 등 **하위 호환 필드 추가**만 허용하고, 기존 필드(`type`/`clubId`/`clubName`/`occurredAt`)의 이름·타입·의미 변경은 Breaking Change 다. (구 클라이언트는 모르는 필드를 무시하므로 추가는 안전.)

## 소스별 쿼리 규칙

전 소스 공통: club 조인 → `club.status = ACTIVE`, 이벤트시각 `>= now - windowDays`, 이벤트시각 DESC, `limit`.

| 타입 | 소스 엔티티 / 추가 조건 | clubName/clubId 경로 | occurredAt(소스 필드) |
|---|---|---|---|
| `RECRUIT_OPEN` | `Recruitment` (드래프트/공개 컬럼 없음 — club ACTIVE 만; `recruitment.club` 은 연관관계) | `recruitment.club` | `createdAt` |
| `NOTICE_CREATED` | `Notice` (`visibility = PUBLIC`) | `notice.owningClub` | `createdAt` |
| `INTERVIEW_CREATED` | `InterviewRound` (DRAFT 제외) → `recruitment` | `recruitment.club` | `round.createdAt` |
| `INTERVIEW_RESULT` | `InterviewRound` (`status = SCHEDULED`, `assignmentCompletedAt ≠ null`) → `recruitment` | `recruitment.club` | `round.assignmentCompletedAt` (라운드당 1건) |
| `EVENT_CREATED` | `ClubEvent` | `clubEvent.club` | `createdAt` |
| `FEE_OPEN` | `FeePolicy` (`active = true`) | `feePolicy.club` | `createdAt` |

> `INTERVIEW_RESULT` 는 **라운드당 1건**(InterviewRoundMember 멤버별 아님 — 스팸·PII 방지). `INTERVIEW_CREATED` 와 `INTERVIEW_RESULT` 는 같은 `InterviewRound` 에서 서로 다른 시각/상태로 각각 나올 수 있다.
> 드래프트 제외 조건의 정확한 필드(`RecruitmentDisplayStatus`, `RoundStatus.DRAFT` 등)는 계획서에서 엔티티를 읽고 확정한다.

## 컴포넌트 설계 (DDD — 기존 도메인 구조 따름)

신규 패키지 `com.duing.domain.publicactivity/`:

- **`entity/PublicActivityType.java`** — enum 6종(위). JSON 직렬화 = enum name.
- **`service/dto/query/ActivityItem.java`** — `record ActivityItem(PublicActivityType type, Long clubId, String clubName, Instant occurredAt)`. 머지/정렬 단위이자 응답 매핑 소스.
- **`repository/PublicActivityQueryRepository.java`** — `JPAQueryFactory` + `Clock` 주입(`@RequiredArgsConstructor`). 소스별 메서드 6개: `findRecentRecruitOpen(LocalDateTime since, int sourceFetchLimit)` 등. 각 메서드는 club 조인 + 가시성 + 윈도우 + 정렬 + limit 으로 QueryDSL 조회하고, **소스 `LocalDateTime` 을 `Instant`(주입 `Clock` 존) 로 변환**해 `List<ActivityItem>` 반환(타입은 각 메서드가 고정 주입). 변환 헬퍼는 한 곳에.
- **`service/PublicActivityService.java`** (interface) + **`service/GeneralPublicActivityService.java`** (impl):
  - `getRecentActivities(Integer limitParam): List<ActivityItem>`.
  - `effectiveLimit = clamp(limitParam ?? defaultLimit, 1, maxLimit)`; `sourceFetchLimit = effectiveLimit * 2`; `since = LocalDateTime.now(clock).minusDays(windowDays)`.
  - 6개 repo 메서드 호출(각 `sourceFetchLimit`, `since`) → 단일 리스트 머지 → 정렬(`occurredAt` DESC, `clubId` DESC, `type` ASC) → 상위 `effectiveLimit`.
  - `ActivityFeedProperties` + `Clock` 주입.
- **`controller/PublicActivityController.java`** (+ `api/PublicActivityApi.java` Swagger interface) — `@GetMapping("/api/v1/public-activities")`, `@RequestParam(required=false) Integer limit`. `ResponseEntity<PublicActivityResponse>` 에 `CacheControl.maxAge(60, SECONDS).cachePublic().staleWhileRevalidate(Duration.ofSeconds(30))` 헤더. 서비스 결과를 응답으로 매핑.
- **`controller/dto/response/PublicActivityResponse.java`** — `record PublicActivityResponse(List<Item> items)` + nested `record Item(PublicActivityType type, Long clubId, String clubName, Instant occurredAt)`. (서비스 `ActivityItem` → 응답 `Item` 1:1 매핑.)
- **`global` 설정**: `ActivityFeedProperties`(`@ConfigurationProperties(prefix="activity.feed")` record `int windowDays, int defaultLimit, int maxLimit`) + `@EnableConfigurationProperties` 등록. `application.yml` 에 `activity.feed.*` 기본값 추가.
- **`SecurityConfig`** 수정: `.requestMatchers(HttpMethod.GET, "/api/v1/public-activities", "/api/v1/public-activities/**").permitAll()` 추가(기존 공개 GET 패턴과 동일 위치).

## 변경 지점

- **신규** `domain/publicactivity/` 하위(엔티티 enum · query dto · query repository · service(interface+impl) · controller · api · response dto).
- **신규** `ActivityFeedProperties` + `application.yml` 의 `activity.feed.*`.
- **수정** `global/config/SecurityConfig.java` — 공개 GET permitAll 1줄.
- 기존 6도메인 엔티티/서비스/리포지토리/마이그레이션 **무변경**(읽기만 참조).

## 테스트 (기존 컨벤션: Acceptance + Testcontainers, 상대 날짜)

`promotion/PromotionAcceptanceTest`(공개 읽기 API) 패턴을 따른다. **시드는 상대 날짜**(`now().minusX`)로 — 하드코딩 미래 절대날짜는 시간폭탄(메모리 교훈).

- **Acceptance(컨트롤러)**: 비인증 GET `200`; 응답 shape(type/clubId/clubName/occurredAt); `Cache-Control: public, max-age=60, stale-while-revalidate=30` 헤더; `limit` 반영 + 클램프(미지정→default, >max→max, <1→1).
- **가시성/누출 차단(핵심)**: 비ACTIVE 동아리·소프트삭제 동아리 활동 제외; 비PUBLIC 공지 제외; 드래프트 모집/DRAFT 라운드 제외; `FeePolicy.active=false` 제외. **공개돼선 안 될 데이터가 응답에 없음**을 명시 검증.
- **타입별 매핑**: 각 소스 1건씩 시드 → 해당 타입·occurredAt(특히 `INTERVIEW_RESULT` 는 `assignmentCompletedAt`, 라운드당 1건) 확인.
- **윈도우(고정 `Clock`)**: `now - (windowDays+1)일` 활동은 제외, 윈도우 내 활동은 포함.
- **정렬 결정성(고정 `Clock`)**: 동일 `occurredAt` 두 건 → `clubId` DESC, 동일 (`occurredAt`·`clubId`) → `type` ASC.
- **과조회**: 한 소스에 `sourceFetchLimit` 초과 활동이 있어도 머지 후 상위 `effectiveLimit` 만 반환(전역 최신순 일치).
- **타임존**: 응답 `occurredAt` 이 존 포함 ISO(Instant, `...Z`)로 직렬화되는지.

## 리뷰 강도

신규 **공개 API** 라 메모리 리뷰 규약상 트리거 해당:
- **API contract**(FE Phase C 가 의존하는 신규 공개 계약) + **권한/가시성**(비공개·비ACTIVE·드래프트 데이터의 공개 누출 방지가 핵심 보안 표면).
→ 기본 리뷰(`duing-code-reviewer` + `codex:review`)에 더해 **`codex:adversarial-review` 추가**. 적대적 리뷰 중점: "어떤 경로로든 비공개/비ACTIVE/드래프트/삭제 데이터가 피드에 새지 않는가", limit 클램프 우회, 윈도우 경계, 타임존 변환 정확성.

## Out of Scope

- `RECRUIT_CLOSE`(전용 timestamp 없음 — 추후 `closed_at` 추가 시 별도).
- 활동로그/아웃박스 테이블, DB 마이그레이션, 도메인 쓰기경로 변경.
- 페이지네이션/커서, 무한스크롤, 실시간(웹소켓/SSE).
- **Phase C**(FE 가 이 API 호출·매핑·렌더) — 별도 PR.
- 멤버별 개별 활동, 인증 사용자 개인화 피드(개인용 Activity/Notification 은 별개).
- 다국어 메시지(문구는 FE 의 `ACTIVITY_PRESETS` 가 타입→문구 매핑 담당 — BE 는 type 만 내려줌).
