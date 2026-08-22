# Slack 운영 모니터링 + Octomo 사용량 표기 설계 (2026-08-23)

## 목표

주요 비즈니스 이벤트(회원가입·동아리·회비·시설·관리자 조치)와 배포 결과를 운영자가 Slack 한 채널에서 확인한다.
Slack 은 **운영 이벤트 채널**이다 — 로그 집계기·Sentry 복제본이 아니다.

| 시스템 | 역할 | 이번 변경 |
|---|---|---|
| Sentry | 예외·스택·릴리스 회귀·장애 분석 | 없음(기존 유지). High 이슈 → Slack 은 Sentry Slack 연동(수동, §9) |
| PostHog | 사용자 행동·pageview (FE 전용) | 없음 |
| Better Stack | 가용성(헬스·DB·FE) → Slack | 없음(이미 연결, `deploy/UPTIME.md`) |
| **Slack** | 운영 이벤트·주요 비즈니스 이벤트·배포 결과 | **신규** — 백엔드 리스너 + CD 스텝 |

보내지 않는 것: 일반 API 요청·일반 로그인·pageview·PostHog 이벤트·debug 로그·일반 CRUD·4xx·스케줄러 실행 로그·쿼리 로그·5xx 건별 알림(Sentry 가 담당).

## 정찰 결과 요약 (설계 근거)

- 이벤트 인프라: `record` 이벤트 + `ApplicationEventPublisher` + `@TransactionalEventListener(AFTER_COMMIT)` 13종. **`@Async`/Executor 전무** — 리스너는 요청 스레드에서 동기 실행.
- 외부 HTTP 클라이언트: `RestClient` + `SimpleClientHttpRequestFactory` 타임아웃, `@ConfigurationProperties` record 를 owning `@Configuration` 의 `@EnableConfigurationProperties` 로만 등록, 응답 바디 로깅 금지(Octomo·BANK 전례).
- 시크릿: env 전용. prod yml 은 `${X}` 폴백 없이 fail-fast(SENTRY_DSN·CORS 관례), 빈 값 = 의도적 비활성.
- Sentry: BE 프로젝트 `java-spring-boot`, 이슈 알림 규칙 1개(`3609658`, 이메일 액션만). Slack 연동 미설치.
- **Octomo 에는 quota 조회 API 가 없다.** 공식 문서(api-docs 페이지 JS 청크 해독)·공식 샘플 레포 모두 `POST /octomo/v1/public/message/exists`·`/qr-code` 둘뿐. 사용량은 "마이페이지 > 사용량" 대시보드 전용, 한도 초과는 `429 "월 API 호출 한도를 초과했습니다"` 로만 드러난다.

## Octomo 표기 결정

벤더 잔여 쿼터는 조회 불가 → **추정값을 만들지 않는다.** 대신 우리 쪽 실측값인 `MoPollThrottle` 의 일일 카운터(KST 오늘 실호출 수 / 자체 일일 상한 `mo.daily-call-limit`, 기본 1,000)를 한 줄 표기한다.

```
Octomo 호출(자체 집계, 오늘): 37 / 1,000
```

- "자체 집계" 라벨로 벤더 월 쿼터(Free 10,000/월)와 혼동을 막는다. 인메모리·단일 인스턴스·재기동 시 0 — 기존 카운터의 한계를 그대로 상속하며 새 저장소를 만들지 않는다.
- `MoPollThrottle` 에 날짜 롤오버를 반영하는 읽기 메서드 `dailyUsage(LocalDateTime now)` 를 추가한다(자정 이후 첫 호출 전에는 0 으로 읽혀야 한다). 기존 `consumedDailyCalls()`(테스트 전용) 는 그대로 둔다.
- 외부 호출이 없으므로 "Octomo 조회 실패(TIMEOUT/HTTP_5XX/…)" 분기는 존재하지 않는다. 월 누적 영속 카운터(DB)는 Octomo 폴링 핫패스에 쓰기를 붙이는 것이라 채택하지 않는다(Out of Scope).

## 아키텍처

```
@Transactional 서비스
  └─ eventPublisher.publishEvent(XxxEvent record)
        ──(commit)──▶ OpsSlackListener            @Async("monitoringTaskExecutor") + AFTER_COMMIT
                        ├─ OpsSlackMessageFormatter  명시 필드만 → 텍스트
                        └─ SlackNotifier             webhook POST {"text": ...}, 3s/5s, 제한 재시도
```

패키지: `com.duing.global.monitoring` (+ `.event`). `global → domain` import 전례(`PiiRetentionJob`, `GlobalExceptionHandler`) 있음.

### 비동기 — `MonitoringAsyncConfig`
- `@EnableAsync` + `@Bean("monitoringTaskExecutor") ThreadPoolTaskExecutor`: core 1 / max 2 / queue 100 / 스레드명 `ops-slack-` / 거부 시 `log.warn` 후 폐기(알림은 손실 허용) / 종료 시 진행 중 작업 5초 대기.
- 기존 리스너에는 `@Async` 가 없으므로 `@EnableAsync` 는 기존 동작에 영향이 없다.
- `@Async` 메서드 안에서 모든 예외를 잡는다 — `AsyncUncaughtExceptionHandler` 기본값이 ERROR 로그(=Sentry) 라서.

### Slack — `SlackProperties` / `SlackClientConfig` / `SlackNotifier`
- `SlackProperties(String webhookUrl)` — `@ConfigurationProperties(prefix = "monitoring.slack")` record, `SlackClientConfig` 의 `@EnableConfigurationProperties` 로 등록. `@Validated` 없음(빈 값 허용 = 비활성).
- `SlackClientConfig.slackRestClient`: connect 3s / read 5s. webhook URL 은 시크릿이므로 **baseUrl 로 넣고 요청 경로는 빈 문자열**(로그·예외 메시지에 URL 이 남지 않게 요청 URI 를 로그하지 않는다).
- `SlackNotifier.send(String text)`: `enabled = !webhookUrl.isBlank()`. 비활성이면 즉시 return(debug 로그).
  - 재시도: **5xx·429 에만 1회**(서버가 거절 = 미반영 확정 → 중복 없음). 그 외 4xx·네트워크 오류·타임아웃은 재시도하지 않는다(요청이 이미 도달했을 수 있어 중복 위험). 재시도 사이 대기 500ms.
  - 최종 실패: `log.error("Slack 운영 알림 전송 실패 — reason={}")` — 상태코드/예외 클래스명만, 스택·응답 바디·URL 없음(메일 제공자 ERROR 정책과 동일). 호출부로 예외를 던지지 않는다.
  - 성공: debug.
- 환경 라벨: `@Value("${sentry.environment:local}")` 재사용 — prod 는 `production`, 로컬 `local`, 테스트는 기본값.

### 이벤트 카탈로그 (P1)

| 이벤트 | record (신규 `global/monitoring/event/`) | 발행 지점 | Slack 헤더 |
|---|---|---|---|
| USER_REGISTERED | `UserRegisteredEvent(Long userId, String studentId, String name, LocalDateTime registeredAt)` | `GeneralUserService.signup` — `consume()` 직후 | 🟢 신규 회원 가입 |
| CLUB_CREATED | `ClubCreatedEvent(Long clubId, String clubName, Long leaderUserId)` | `GeneralClubService.create` — ClubMember 저장 후 | 🏛️ 동아리 생성 |
| CLUB_STATUS_CHANGED | `ClubStatusChangedEvent(Long clubId, String clubName, ClubStatus previousStatus, ClubStatus nextStatus, Long actorUserId)` | `GeneralClubService.updateStatus` — `changeStatus` 후 | 🔄 동아리 상태 변경 (승인·거절·운영중단·재개) |
| CLUB_CLOSED | `ClubClosedEvent(Long clubId, String clubName, Long actorUserId)` | `GeneralClubClosureService.close` — soft-delete 직후 | ⛔ 동아리 폐쇄 |
| FEE_ACCOUNT_CREATED | `FeeAccountCreatedEvent(Long clubId, Long feeAccountId, Bank bank, Long actorUserId)` | `GeneralFeeAccountService.upsert` — **최초 등록(INSERT) 분기만**. 갱신·무변경·경합 409 는 발행 안 함 | 🏦 회비 계좌 등록 |
| ADMIN_USER_ACTION | `AdminUserActionEvent(AdminUserAction action, Long targetUserId, Long actorUserId)` | `GeneralAdminUserCommandService.changeStatus`(SUSPENDED/UNSUSPENDED), `GeneralUserService.forceLogout`(FORCE_LOGOUT) — 감사로그 저장 직후 | 🛡️ 관리자 조치 |

기존 이벤트 재사용(새 record 없음, 리스너만 구독): `RecruitmentOpenedEvent`(📣 모집 오픈), `FacilityBookingSubmittedEvent`(🏟️ 시설 예약 신청), `FacilityBookingCancelledEvent`(관리자 취소, 🏟️ 시설 예약 취소), `FacilityBookingConflictEvent`(⚠️ 시설 예약 충돌). 재사용 이벤트의 자유 텍스트 필드(`reason`·`detail`)는 **출력하지 않는다** — id 만.

### 메시지 포맷 (`OpsSlackMessageFormatter`)

줄바꿈 구분 평문. 값이 없는 줄은 출력하지 않는다. 시간은 `yyyy-MM-dd HH:mm KST`(`seoulClock`).

```
🟢 신규 회원 가입
서비스: Duing
이벤트: USER_REGISTERED
이름: 홍길동
학번: 20231234
UserId: 812
환경: production
가입시간: 2026-08-22 23:41 KST
Octomo 호출(자체 집계, 오늘): 37 / 1,000
```

```
🛡️ 관리자 조치
서비스: Duing
이벤트: ADMIN_USER_ACTION
조치: ACCOUNT_SUSPENDED
대상 UserId: 812
관리자 UserId: 3
환경: production
시간: 2026-08-22 23:41 KST
```

다른 이벤트도 같은 골격(헤더 / 서비스 / 이벤트 / 도메인 필드 2~4줄 / 환경 / 시간). UserId 는 `Long` 그대로(축약 없음 — 관리 콘솔 검색 키).

### 개인정보 원칙
- 포함(의도): 이름·학번·UserId(회원가입), 동아리명·각종 id·상태·은행명·관리자 조치 종류.
- 제외(구조적): 전화·비밀번호·JWT/refresh/cookie/Authorization/요청 바디·계좌번호·예금주·정지 사유·취소 사유. **이벤트 record 에 해당 필드가 존재하지 않으므로** 포매터가 실수로 넣을 수 없다. 이메일은 서비스가 수집하지 않아 필드 자체를 만들지 않는다.

### 트랜잭션 경계·장애 격리
- 발행은 `@Transactional` 안, 수신은 `AFTER_COMMIT` → 롤백(중복 가입 409, 제약 위반 등)이면 Slack 으로 아무것도 가지 않는다.
- `@Async` 라 Slack/포매팅 지연·실패가 HTTP 응답 시간·상태에 영향을 주지 않는다. 리스너 내부 try/catch 로 예외 전파 0.
- Octomo 는 호출하지 않는다(인메모리 읽기만) → 회원가입 ↔ Octomo 결합 없음.
- 중복: 이벤트당 리스너 1회 실행, 재시도는 "서버 거절" 응답에만 → 같은 메시지 2회 게시 경로 없음.

### 설정 / 시크릿
- `application.yml`: `monitoring.slack.webhook-url: ${SLACK_WEBHOOK_URL:}` (로컬·CI 비활성).
- `application-prod.yml`: `monitoring.slack.webhook-url: ${SLACK_WEBHOOK_URL}` — 폴백 없음(SENTRY_DSN 관례). **릴리스 전 서버 `deploy/.env` 에 `SLACK_WEBHOOK_URL=` 줄을 반드시 추가**(빈 값이면 비활성으로 부팅, 키 자체가 없으면 부팅 실패→자동 롤백).
- 테스트 `application.yml`: `monitoring.slack.webhook-url: ""`.
- `backend/.env.example` 에 `SLACK_WEBHOOK_URL=` 항목(모니터링 섹션).
- GitHub Actions Secret `SLACK_WEBHOOK_URL`(배포 알림용, 선택 — 없으면 스텝이 조용히 생략).

## P0 장애 알림 (코드 밖 + CD 스텝)

| 신호 | 경로 | 상태 |
|---|---|---|
| Backend health / DB / FE 다운 | Better Stack → Slack | 완료(기존) |
| Sentry High/Critical, 5xx 급증 | Sentry Slack 연동 + 규칙 `3609658` 에 Slack 액션 추가(+ 선택: 메트릭 알림 "errors ≥ N / 5min") | **수동**(Sentry UI OAuth) — `deploy/MONITORING.md` 에 절차 |
| 인증 시스템 장애 | Better Stack 5번(FE 인증 가드) + Sentry | 기존 문서 |
| production 배포 성공/실패 | `deploy-backend.yml` 마지막 `if: always()` 스텝이 webhook 에 curl (서드파티 액션 없음) | **신규** |

배포 메시지: `🚀 Deployment` / 서비스 / 환경: production / release: `${{ github.sha }}` / status: SUCCESS·FAILURE(cancelled 포함) / 시간(KST) / 실행 URL. 실패 시 "헬스 게이트 실패면 직전 이미지로 자동 롤백 시도됨" 한 줄.

## 테스트

| 대상 | 검증 |
|---|---|
| `SlackNotifierTest` (MockRestServiceServer) | 성공 1회 POST·`{"text":…}` 바디 / 5xx → 정확히 2회 후 포기(예외 없음) / 429 → 2회 / 4xx(400) → 1회·무재시도 / 네트워크 오류 → 1회·무재시도 / 비활성(빈 URL) → 요청 0 |
| `OpsSlackMessageFormatterTest` | 회원가입 메시지에 이름·학번·UserId·환경·KST 시간·Octomo 줄 포함, "이메일"·전화 형식 부재 / 관리자·동아리·회비·시설·모집 포맷 / 자유 텍스트(reason·detail) 부재 |
| `OpsSlackListenerTest` | notifier 가 RuntimeException 을 던져도 리스너 메서드가 예외를 전파하지 않음 |
| `MoPollThrottleTest` 추가 | `dailyUsage` — 예약 n 회 후 n/limit, 다음 날 읽으면 0/limit |
| `OpsSlackMonitoringIntegrationTest` (`@SpringBootTest`, `@MockitoBean SlackNotifier`, RestAssured) | 가입 201 → `verify(notifier, timeout(3000))` 로 USER_REGISTERED 메시지(이름·학번·UserId·환경·KST·Octomo 줄, 전화·비밀번호 부재) / 중복 가입 409 → 추가 전송 0 / 발행 후 롤백 → 호출 0 / notifier 가 예외 → 가입 201·저장 정상 / 동아리 생성·승인·중단·폐쇄, 회비 계좌 최초 등록만(재저장·갱신 제외), 관리자 정지·해제·강제 로그아웃 메시지(사유 부재) |
| 회귀 | 백엔드 전체 `./gradlew test` BUILD SUCCESSFUL |

## 실검증 계획
1. 로컬 mock webhook(HTTP 서버)으로 백엔드 기동 → 가입 API 호출 → 수신 페이로드 확인(필드·PII 부재·KST·Octomo 줄), 5xx 모드로 재시도 1회·서비스 무영향 확인.
2. 실제 Slack webhook URL 은 현재 어디에도 없다(로컬 .env·GitHub Secrets·서버 미확인). URL 을 받으면 동일 절차를 실채널로 재실행한다 — 실운영 회원가입 데이터는 만들지 않고 로컬 서버 + 테스트 학번으로 수행.

## Out of Scope
- Octomo 벤더 월 쿼터·잔여 호출(API 미제공) · 월 누적 영속 카운터(DB) · Redis 카운터.
- 백엔드 5xx 건별 Slack 알림(Sentry 와 중복·폭주) · Sentry 스택트레이스 Slack 복제.
- Sentry Slack 연동 설치·알림 규칙 변경(수동 운영 작업, 문서만) · Better Stack 설정 변경.
- 동아리 측 시설 예약 취소(`GeneralFacilityBookingService.cancel`) 이벤트 — 기존 알림 도메인에도 이벤트가 없음(후속).
- 모집 마감/접수중단/관리자 강제마감·회비 이상 이벤트(VOID 등)·관리자 메모·전화번호 열람·동아리 중앙동아리 플래그 변경 — 필요 시 publish 한 줄 + 포매터 한 메서드로 추가 가능.
- 프론트(Vercel) 배포 알림 · 채널 세분화(`#duing-monitoring` 단일).
- Slack Block Kit 포맷 · 메시지 큐/outbox 도입 · 멀티 인스턴스 중복 방지.
