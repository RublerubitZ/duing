# AGENTS.md — du-ing-be

대구대학교 동아리 통합 플랫폼 **Du-ing(두잉)** 백엔드.
재학생·동아리장·총동연을 위한 동아리 탐색, 지원, 모집 관리 시스템.

> **배포**: 백엔드는 AWS Lightsail 한 대에서 Docker + Caddy 로 운영한다(상세: [/deploy/README.md](../deploy/README.md)). 프론트는 Vercel, DB 는 Supabase(운영·개발 프로젝트 분리), 파일은 Cloudflare R2(S3 호환)다.
> 파일 저장 등 외부 의존성은 인터페이스로 추상화되어 있고, 구현체는 설정으로 고른다.

---

## 기술 스택

- **언어/프레임워크**: Java 21, Spring Boot 3.5.x, Gradle
- **데이터**: PostgreSQL (Supabase — 운영·개발 프로젝트 분리, 개발 DB 는 팀 공유), Flyway, Spring Data JPA, QueryDSL
- **인증**: Spring Security, JWT (auth0 java-jwt)
- **파일 저장**: `FileStorageService` 인터페이스 — 로컬 파일 시스템(`local`, 기본) / S3 호환 스토리지(`s3`, 운영은 Cloudflare R2). `file.storage.provider` 로 고른다 — 로컬은 `FILE_STORAGE_PROVIDER`(기본 local), 운영은 `application-prod.yml` 이 s3 로 고정
- **테스트**: JUnit 5, TestContainers, RestAssured, Fixture Monkey
- **API 문서**: springdoc-openapi (Swagger UI)

---

## 명령어

```bash
# 빌드 (테스트 스킵)
./gradlew clean build -x test

# 로컬 실행
./gradlew bootRun --args='--spring.profiles.active=local'

# 전체 테스트 (Docker 필수 — TestContainers 사용)
./gradlew test

# 특정 테스트 클래스 실행
./gradlew test --tests "*ClassName*"
```

---

## 프로젝트 구조

```
src/main/java/com/duing/
├── DuingApplication.java
├── global/              # (일부)
│   ├── config/          # SecurityConfig, QueryDslConfig, SwaggerConfig
│   ├── auth/            # JwtTokenProvider, JwtAuthenticationFilter, UserPrincipal
│   ├── exception/       # GlobalExceptionHandler, ApplicationException
│   ├── response/        # ApiResponse<T>, PageResponse<T>
│   └── file/            # FileStorageService (인터페이스)
│                        # LocalFileStorageService (local, 기본) · S3FileStorageService (s3 — 운영 R2)
│
└── domain/              # (일부 — 전체 목록은 domain/ 아래)
    ├── club/            # 동아리 마스터
    ├── clubmember/      # 동아리 멤버십 + Club-scoped role (MEMBER/OFFICER/LEADER)
    ├── recruitment/     # 모집 공고
    ├── application/     # 지원서
    ├── interview/       # 면접 라운드·일정
    ├── notice/          # 공지(총동연·동아리 — 화면 이름 '소식')
    ├── notification/    # 알림
    └── user/            # 사용자 + Global role (STUDENT/ADMIN)

src/main/resources/
├── application.yml          # 공통 설정
├── application-local.yml    # 로컬 환경 (개발 DB 접속, 로컬 파일 경로)
├── application-prod.yml     # 운영 환경 (prod 프로파일 — 운영 잡 기본 활성 등)
└── db/migration/            # V1__, V2__ ... Flyway 파일
```

각 도메인 내부 구조:
```
domain/{도메인}/
├── api/                         # Swagger 인터페이스 (Contract-first)
├── controller/
│   ├── {Role}{Domain}Controller.java
│   └── dto/
│       ├── request/             # HTTP 요청 DTO (record) — @Valid 적용
│       └── response/            # HTTP 응답 DTO (record)
├── service/
│   ├── {Domain}Service.java     # 인터페이스
│   ├── General{Domain}Service.java
│   └── dto/
│       ├── command/             # 서비스 쓰기 DTO (record)
│       └── query/               # 서비스 읽기 DTO (record)
├── repository/                  # JPA Repository + QueryDSL Custom/Impl
├── entity/                      # JPA 엔티티 + Enum
└── exception/                   # 도메인 예외 클래스
```

**DTO 2-tier 원칙**: HTTP 경계(controller/dto)와 서비스 경계(service/dto)를 분리한다.
매핑은 `Request#toCommand()` (요청 → 서비스 입력), `Response#from(Query)` (서비스 출력 → 응답).
공용 테스트 픽스처는 `src/test/java/com/duing/common/fixture/` 에 둔다.

---

## 아키텍처 패턴

- **계층 구조**: Controller → Service → Repository
- **Contract-first API**: `api/` 패키지에 Swagger 인터페이스 정의 후 Controller가 구현
- **DTO 2-tier**: HTTP 경계는 `controller/dto/{request,response}`, 서비스 경계는 `service/dto/{command,query}`. 매핑은 `Request#toCommand()` / `Response#from(Query)`
- **Soft Delete**: `@SQLDelete` + `@SQLRestriction` 사용, 물리 삭제 금지
- **파일 저장 추상화**: `FileStorageService` 인터페이스로 의존성 역전 — 구현체 교체로 로컬 ↔ S3 전환
- **모든 DTO**: Java `record` 사용

### URL 컨벤션

- 공개/일반 사용자: `/api/v1/{resource}` (예: `/api/v1/clubs`)
- 운영진(회장·임원) 전용: `/api/v1/leader/...` (예: `/api/v1/leader/clubs/{clubId}/recruitments`)
- 동아리 단위(운영진·회원): `/api/v1/clubs/{clubId}/...` (멤버·가입 신청은 운영진, 공지·일정 조회는 회원 이상)
  - 현재 사용자 기준으로 판정하는 GET 을 여기에 새로 만들면 `SecurityConfig` 의 `GET /api/v1/clubs/**` permitAll 보다 앞에 `.authenticated()` 를 추가한다 — 없으면 익명 요청이 401 대신 403 을 받아 프론트가 토큰 갱신을 타지 못한다(#838)
- 총동연 전용: `/api/v1/admin/...` (예: `/api/v1/admin/clubs`)

### 페이지네이션

- 목록 조회는 Spring `Pageable` 사용 (`?page=0&size=20&sort=createdAt,desc`)
- 네이티브 쿼리(`@NativeQuery`·`@Query(nativeQuery = true)`)에는 `Pageable`·`Sort` 를 넘기지 않는다 — 정렬은 JPQL·QueryDSL 로 하고(클라이언트 정렬값은 `SortWhitelist`), 네이티브는 ORDER BY 를 고정하고 LIMIT·OFFSET 을 바인딩한다. `NativeQuerySortGuardTest` 가 막는다(CVE-2026-47834, #1318)
- 응답은 `PageResponse<T>` 래퍼로 통일 (`content`, `page`, `size`, `totalElements`, `totalPages`, `hasNext`)

### BaseEntity 표준

모든 엔티티는 `global/entity/BaseEntity` 를 상속한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `Long` | PK (`@GeneratedValue IDENTITY`) |
| `createdAt` | `LocalDateTime` | `@CreatedDate` |
| `updatedAt` | `LocalDateTime` | `@LastModifiedDate` |
| `deletedAt` | `LocalDateTime` | soft delete 마커 (`@SQLDelete` 가 NOW 로 세팅) |

---

## 핵심 구현 패턴

### 1. API 인터페이스 → Controller

```java
// domain/club/api/ClubApi.java (파라미터 일부만 표시)
@Tag(name = "동아리")
public interface ClubApi {
    @Operation(summary = "동아리 목록 조회")
    @GetMapping("/clubs")
    ResponseEntity<ApiResponse<PageResponse<ClubSummaryResponse>>> getClubs(
        @RequestParam(required = false) ClubCategory category,
        @RequestParam(required = false) String keyword,
        @RequestParam(required = false) RecruitmentStatusFilter recruitmentStatus,
        @Parameter(hidden = true) Pageable pageable
    );
}

// domain/club/controller/ClubController.java
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubController implements ClubApi {
    private final ClubService clubService;
    // 구현
}
```

### 2. QueryDSL 동적 필터

```java
// 개념 예시 — 정본은 ClubRepositoryImpl.findByCondition (투영·정렬·페이지 포함)
@RequiredArgsConstructor
public class ClubRepositoryImpl implements ClubRepositoryCustom {
    private final JPAQueryFactory queryFactory;

    @Override
    public Page<ClubSummaryQuery> findByCondition(ClubSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
            club.status.eq(ClubStatus.ACTIVE),                                  // 공개 동아리만
            categoryEq(condition.category()),                                   // null 이면 조건 생략
            recruitmentStatusFilter(condition.effectiveRecruitmentStatus()),    // 모집 중 판정은 RecruitmentPredicates
        };
        // … 탐색 카드에 필요한 컬럼만 투영해 페이지로 읽는다
    }

    private BooleanExpression categoryEq(ClubCategory category) {
        return category != null ? club.category.eq(category) : null;
    }
}
```

"모집 중"(진행 중·오늘 지원 가능) 판정은 `RecruitmentPredicates`(조회)와 `RecruitmentDisplayStatus`(표기)를 쓴다 — 같은 판정을 새로 쓰면 목록·상세 표기가 갈린다(`RecruitmentPredicates` 자바독 참고).

### 3. 파일 저장 추상화 (확장성 핵심)

```java
// global/file/FileStorageService.java — 인터페이스 (업로드·삭제·저장 키↔URL 변환 등, 일부만 표시)
public interface FileStorageService {
    String upload(MultipartFile file, String directory, String contentType);
    boolean delete(String fileUrl);
}

// 구현체는 file.storage.provider(FILE_STORAGE_PROVIDER)로 고른다 — 기본 local
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "local", matchIfMissing = true)
public class LocalFileStorageService implements FileStorageService { ... }

@ConditionalOnProperty(name = "file.storage.provider", havingValue = "s3")
public class S3FileStorageService implements FileStorageService { ... }   // 운영: Cloudflare R2

// 사용 (Service에서 인터페이스 타입으로만 주입)
@RequiredArgsConstructor
public class GeneralFederationInquiryService implements FederationInquiryService {
    private final FileStorageService fileStorageService; // 구현체 몰라도 됨
}
```

### 4. Soft Delete

```java
@Entity
@SQLDelete(sql = "UPDATE club SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Club extends BaseEntity {
    // deletedAt은 BaseEntity에 정의
}
```

### 5. 예외 처리

```java
// domain/club/exception/ClubException.java
public class ClubException extends ApplicationException {
    public static class ClubNotFoundException extends ClubException {
        private static final String MESSAGE = "동아리를 찾을 수 없습니다.";
        public ClubNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
    public static class DuplicateApplicationException extends ClubException {
        private static final String MESSAGE = "이미 지원한 동아리입니다.";
        public DuplicateApplicationException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
}

// 사용
throw new ClubException.ClubNotFoundException();
```

### 6. 전역 응답 / 인증

> 조회 API 에서 "없음"을 `200 + null` · `404` · `403` 중 무엇으로 표현할지는
> [Nullable API 계약 가이드](../docs/superpowers/specs/2026-08-03-nullable-api-contract-design.md) 를 따른다.

```java
// 성공 응답
return ResponseEntity.ok(ApiResponse.success(result));
return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));

// 롤 제한 — Global role 만(@PreAuthorize). 동아리 단위 권한(회장·운영진)은 서비스에서 ClubAuthService 로 검증
@PreAuthorize("hasRole('ADMIN')")
@PreAuthorize("isAuthenticated()")

// 현재 사용자 주입
@AuthenticationPrincipal UserPrincipal currentUser
```

---

## Flyway 마이그레이션 규칙

```
파일명: V{버전}__{스네이크케이스_설명}.sql   ← 언더스코어 두 개 필수
예)  V1__create_user_table.sql
     V2__create_club_table.sql
     V3__add_division_column_to_club.sql
```

- 기존 파일 절대 수정 금지 — 변경은 새 버전 파일만
- `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` 사용
- 컬럼 추가와 같은 릴리스에서 `DROP DEFAULT`·`SET NOT NULL` 로 제약을 강화하거나 `DROP COLUMN` 으로 컬럼을 지우지 말 것 — 배포 실패 시 자동 롤백으로 그 컬럼을 모르는(또는 아직 매핑 중인) 구 이미지가 다시 뜨는데 Flyway 는 되돌아가지 않아 해당 기능의 INSERT 만 조용히 깨진다(제약 강화·컬럼 삭제는 다음 릴리스에서 단독 마이그레이션으로)

---

## 시간 처리 규칙 (요약 — 상세: [/TIMEZONE.md](../TIMEZONE.md))

- **Event Time**(발생 시각: createdAt/handledAt 등)은 응답 DTO에서 `Instant`로 노출 — 저장 벽시계에 맞는 `TimeMapper.systemWallClockToInstant`(감사 필드·무클럭 now) 또는 `seoulWallClockToInstant`(seoulClock 기록)로 변환. 오프셋 없는 LocalDateTime JSON 반환 금지
- **Schedule Time**(행사·면접·모집 등 KST 예정 시각)은 `LocalDate`/`LocalDateTime` 유지
- **판정**(마감·오늘)은 항상 `now(seoulClock)` — 무클럭 `now()` 신규 작성 금지
- prod JVM=UTC(`Dockerfile TZ=UTC`), 새 시각 필드를 응답에 노출하면 TIMEZONE.md regime 표에 행 추가

---

## 도메인 목록 및 엔티티

| 도메인 | 엔티티 | 주요 필드 |
|---|---|---|
| user | User | id, studentId, name, phone, passwordHash, role (Global), status |
| club | Club | id, name, category, division, description, logoUrl, status |
| clubmember | ClubMember | id, clubId, userId, role (Club-scoped) |
| recruitment | Recruitment | id, clubId, title, content, startDate, endDate, capacity, status |
| recruitment | RecruitmentForm | id, recruitmentId, questions(JSON) |
| application | Application | id, recruitmentId, userId, answers(JSON), status |

> 대표 엔티티만 적은 개요다 — 정확한 필드는 엔티티 클래스를 본다.
> 모든 엔티티는 `BaseEntity` 를 상속하므로 위 표에서 `id`/`createdAt`/`updatedAt`/`deletedAt` 은 공통 필드다.
> 비밀번호는 `BCryptPasswordEncoder` 로 해싱한 결과를 `passwordHash` 에 저장한다. 평문 저장 금지.

## Status Enum 정책

`Club.status` 와 `Recruitment.status` 는 의미가 다르며 절대 혼용하지 않는다.

| Enum | 위치 | 값 | 의미 |
|---|---|---|---|
| `ClubStatus` | `domain/club/entity/` | `PENDING_APPROVAL` / `ACTIVE` / `INACTIVE` / `REJECTED` | 동아리 운영 상태 (총동연 승인 플로우) |
| `RecruitmentStatus` | `domain/recruitment/entity/` | `OPEN` / `CLOSED` | 모집 공고 상태 |
| `ApplicationStatus` | `domain/application/entity/` | `SUBMITTED` / `ON_HOLD` / `INTERVIEW_PENDING` / `ACCEPTED` / `REJECTED` | 지원 처리 상태 (`ON_HOLD` 는 운영진 내부용 — 지원자에게는 `SUBMITTED` 로 보인다) |

동아리 목록의 "모집 중" 필터는 Club 컬럼이 아닌 **Recruitment 조인 + `RecruitmentPredicates`(상태 `OPEN` + 모집 기간)** 로 계산하고, 화면 표기는 `RecruitmentDisplayStatus` 가 정한다 — 데이터 정합성을 위해 Club 에 `recruitmentStatus` 를 캐싱하지 않는다.

## 권한 모델 (Global vs Club-scoped)

권한은 **두 축**으로 분리한다. 어노테이션 기반 검증(`@PreAuthorize`)은 Global 한정,
Club-scoped 검증은 서비스 레이어에서 `ClubAuthService` 로 처리한다.

### Global role (`users.role` → `UserRole`)

| 값 | 의미 |
|---|---|
| `STUDENT` | 일반 재학생 (동아리 탐색·지원) |
| `ADMIN` | 총동연 (전체 동아리 승인·관리) |

### Club-scoped role (`club_member.role` → `ClubMemberRole`)

| 값 | 의미 | 운영 권한 (`canManageClub()`) |
|---|---|---|
| `MEMBER` | 일반 동아리 회원 | ❌ |
| `OFFICER` | 운영진 | ✅ |
| `LEADER` | 회장 | ✅ |

### 자동 멤버십 등록

| 트리거 | 결과 |
|---|---|
| `POST /admin/clubs` (ADMIN) | designated leader → `ClubMember(LEADER)` 자동 생성 |
| `PATCH /leader/applications/{id}/status = ACCEPTED`·`bulk-status` | 지원자 → 모집 대상 역할(`targetRole`: MEMBER·OFFICER)로 `ClubMember` 자동 등록. 이미 회원이면 더 높은 역할일 때만 승급 (멱등). 운영진 모집은 지원 자격이 기존 MEMBER 라 보통 MEMBER → OFFICER 승급이다 |
| 위와 같음, 운영진 모집(`targetRole=OFFICER`) | 합격 처리는 회장(LEADER)만 — 임원이 하면 403(일괄 처리는 건별 실패로 담긴다) |
| `POST /join-codes/{code}/requests` (자동 승인 코드) | 신청자 → `ClubMember(MEMBER)` 즉시 등록 |
| `PATCH /clubs/{clubId}/join-requests/{id}` (`status=APPROVED`)·`bulk-approve` — 운영진 | 신청자 → `ClubMember(MEMBER)` 등록. 그새 회원이 됐으면 자동 거절하고 신청 때 확보한 자리를 돌려준다 |

### 권한 검증 패턴 (서비스 레이어)

```java
// Global role: @PreAuthorize 사용
@PreAuthorize("hasRole('ADMIN')")

// Club-scoped role: ClubAuthService 단일 진입점 사용
clubAuthService.requireManager(currentUserId, clubId);
// LEADER 전용은 requireManager 대신 requireLeader 사용.
```

---

## 환경변수

```bash
# 공통 (로컬 / 배포 모두 필요)
DB_URL=jdbc:postgresql://{supabase-host}:5432/postgres
DB_USERNAME=postgres
DB_PASSWORD=****
JWT_SECRET=****
# access 토큰 수명은 코드 상수 30분(1800000, JwtTokenProvider) — 설정 없음(refresh 토큰 도입으로 3600000→1800000)
# DUING_AUTH_* — refresh TTL(30일)·재사용 grace(30초)·동시 세션 상한(5)·cleanup 잡 토글. 전부 기본값으로 충분해 운영 env 미주입 가능(prod cleanup 만 application-prod.yml 에서 자동 활성).
SLACK_WEBHOOK_URL=                     # 운영 Slack 알림(Incoming Webhook). 비움/미설정=비활성(시작 로그 WARN), 운영은 주입 권장. deploy/MONITORING.md
DUING_FRONTEND_REVALIDATE_SECRET=      # 동아리 탐색(/clubs) 정각·상세(/clubs/<id>) 변경 시·매일 00:05 재생성 트리거. Vercel REVALIDATE_SECRET 과 같은 값(32바이트+). 비움=비활성(시작 로그 WARN)
DUING_CLUB_DETAIL_DAILY_REVALIDATE_ENABLED=  # 동아리 상세 매일 재생성(00:05 KST, 진행 중·최근 마감 모집 동아리). 운영 기본 활성(application-prod.yml), 끄려면 false
DUING_CLUB_LOGO_THUMBNAIL_BACKFILL_ENABLED=  # 동아리 로고 썸네일 백필(기동 뒤 백그라운드 1회, 썸네일 없는 로고). 운영 기본 활성(application-prod.yml), 끄려면 false
DUING_RECRUITMENT_AUTO_CLOSE_ENABLED=  # 기간 종료 모집 자동 마감(00:40 KST, 종료 7일 경과·결과 없는 지원·진행 중 면접 라운드 0인 OPEN 모집). 운영 기본 활성(application-prod.yml), 끄려면 false

# 로컬 전용
FILE_UPLOAD_DIR=/tmp/duing/uploads    # 로컬 파일 저장 경로

# 파일 스토리지 — 로컬은 선택(기본 local). 운영은 application-prod.yml 이 s3 로 고정하고
# S3_ENDPOINT·S3_ACCESS_KEY·S3_SECRET_KEY·S3_PUBLIC_BASE_URL 이 필수다(없으면 기동 실패)
FILE_STORAGE_PROVIDER=local           # local | s3 (운영 s3 = Cloudflare R2)
S3_ENDPOINT=
S3_REGION=auto
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=duing
S3_PUBLIC_BASE_URL=

# Phase 3 — 알림 스케줄러
# prod 프로파일을 활성화하면 application-prod.yml 에서 자동으로 true 가 주입되므로 별도 셋업 불필요.
# 로컬에서 잡 동작을 확인하려면 .env 에 아래를 추가하거나 IntelliJ Run config 에 등록.
DUING_NOTIFICATION_JOBS_ENABLED=false  # 로컬 default. true 로 두면 매일 06:00 KST DeadlineNotificationJob + 매시 정각 InterviewReminderJob + 매일 09:30 KST ApplicationPendingReminderJob·ExternalRecruitmentCheckJob 활성
```

모든 값은 환경변수 또는 팀 공유 `.env` 파일로 주입한다. 코드/yml 직접 기재 금지.
위 목록은 일부다 — 전체 목록과 필수 여부의 정본은 [`.env.example`](./.env.example) 이다(예: `AUTH_HINT_SECRET`·`PHONE_VERIFICATION_SECRET`·`FEE_ACCOUNT_ENC_KEY` 는 없으면 기동이 실패하고, `CORS_ALLOWED_ORIGINS` 는 운영에서 필수다).

### 알림 스케줄러 운영 활성화 (Phase 3)

운영(prod 프로파일) 에서는 `application-prod.yml` 이 `duing.notification.jobs.enabled: true` 를 자동 주입하므로 별도 env var 셋업이 필요 없다. `NotificationJobConfig` 의 `@ConditionalOnProperty` 가 통과하면서 아래 잡이 등록된다(모두 같은 토글 `duing.notification.jobs.enabled`).

- `DeadlineNotificationJob` — 매일 06:00 KST. 찜한 동아리의 진행 중 모집을 스캔해 D-3 / D-1 / D-0 + 오늘 시작(`RECRUITMENT_OPENED`) 알림을 멱등 INSERT.
- `InterviewReminderJob` — 매시 정각. `interview_at` 이 지금부터 23~25시간 사이인 `INTERVIEW_PENDING` 지원에 D-1 리마인더를 멱등 INSERT.
- `ApplicationPendingReminderJob` — 매일 09:30 KST. 제출 뒤 7일 넘게 `SUBMITTED` 로 남은 지원서가 있는 모집마다 운영진(회장·임원)에게 `APPLICATION_PENDING_REMINDER` 를 하루 1건 멱등 INSERT.
- `ExternalRecruitmentCheckJob` — 매일 09:30 KST. 시작 후 30일이 지난 외부 폼 상시모집(종료일 없음·OPEN)마다 운영진에게 `EXTERNAL_RECRUITMENT_STILL_OPEN` 을 30일 주기당 1건 멱등 INSERT.

부팅 직후 `NotificationJobStatusLogger` 가 항상 다음 두 라인 중 하나를 INFO 로그로 남기므로, 시작 로그에서 잡 활성 여부를 즉시 확인할 수 있다:

```
[알림 스케줄러] 활성. DeadlineNotificationJob(매일 06:00 KST) + InterviewReminderJob(매시 정각) + ApplicationPendingReminderJob·ExternalRecruitmentCheckJob(매일 09:30 KST) 등록됨.
[알림 스케줄러] 비활성. 마감 임박 / 면접 하루 전 / 미처리 지원서 / 외부 폼 유지 확인 알림이 발송되지 않습니다. 운영 환경이라면 prod 프로파일 활성화(spring.profiles.active=prod) 또는 DUING_NOTIFICATION_JOBS_ENABLED=true 환경변수 주입 필요.
```

활성화 직후 첫 06:00 KST 실행에서 다음 로그가 찍히는지 확인한다:

```
DeadlineNotificationJob start: candidates={N}
DeadlineNotificationJob done: created={M}
```

`candidates=0` 만 떠도 정상(해당 시점에 조건을 만족하는 모집이 없다는 의미). 잡 실패는 ERROR 로그로 남고 다음 실행에 멱등 복구된다.

운영에서 일시적으로 잡을 끄고 싶다면 `DUING_NOTIFICATION_JOBS_ENABLED=false` 환경변수로 prod 프로파일 기본값을 오버라이드한다.
