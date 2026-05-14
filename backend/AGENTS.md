# AGENTS.md — du-ing-be

대구대학교 동아리 통합 플랫폼 **Du-ing(두잉)** 백엔드.
재학생·동아리장·총동연을 위한 동아리 탐색, 지원, 모집 관리 시스템.

> **현재 범위**: 로컬 실행 기준. 배포는 추후 확장 예정.
> 파일 저장, 인증 등 외부 의존성은 인터페이스로 추상화되어 있어 구현체 교체만으로 배포 환경 전환 가능.

---

## 기술 스택

- **언어/프레임워크**: Java 21, Spring Boot 3.4.x, Gradle
- **데이터**: PostgreSQL (Supabase 공유 인스턴스), Flyway, Spring Data JPA, QueryDSL
- **인증**: Spring Security, JWT (auth0 java-jwt)
- **파일 저장**: 로컬 파일 시스템 → `FileStorageService` 인터페이스로 추상화 (추후 S3 교체 가능)
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
├── global/
│   ├── config/          # SecurityConfig, QueryDslConfig, SwaggerConfig
│   ├── auth/            # JwtTokenProvider, JwtAuthenticationFilter, UserPrincipal
│   ├── exception/       # GlobalExceptionHandler, ApplicationException
│   ├── response/        # ApiResponse<T>
│   └── file/            # FileStorageService (인터페이스)
│                        # LocalFileStorageService (현재 구현체)
│                        # S3FileStorageService   (추후 구현체 — 미구현)
│
├── domain/
│   ├── club/            # 동아리 마스터
│   ├── clubmember/      # 동아리 멤버십 + Club-scoped role (MEMBER/OFFICER/LEADER)
│   ├── recruitment/     # 모집 공고
│   ├── application/     # 지원서
│   ├── feed/            # 활동 피드 (미구현)
│   └── user/            # 사용자 + Global role (STUDENT/ADMIN)
│
└── common/
    └── fixture/         # 테스트 전용 Fixture

src/main/resources/
├── application.yml          # 공통 설정
├── application-local.yml    # 로컬 환경 (Supabase URL, 로컬 파일 경로)
├── application-prod.yml     # 배포 환경 (추후 작성)
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
- 동아리장 전용: `/api/v1/leader/...` (예: `/api/v1/leader/clubs/{clubId}/recruitments`)
- 총동연 전용: `/api/v1/admin/...` (예: `/api/v1/admin/clubs`)

### 페이지네이션

- 목록 조회는 Spring `Pageable` 사용 (`?page=0&size=20&sort=createdAt,desc`)
- 응답은 `PageResponse<T>` 래퍼로 통일 (`content`, `page`, `size`, `totalElements`, `totalPages`)

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
// domain/club/api/ClubApi.java
@Tag(name = "동아리")
public interface ClubApi {
    @Operation(summary = "동아리 목록 조회")
    @GetMapping("/clubs")
    ResponseEntity<ApiResponse<List<ClubSummaryResponse>>> getClubs(
        @RequestParam(required = false) ClubCategory category,
        @RequestParam(required = false) RecruitmentStatus status,
        @RequestParam(required = false) String keyword
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
@RequiredArgsConstructor
public class ClubRepositoryImpl implements ClubRepositoryCustom {
    private final JPAQueryFactory queryFactory;

    @Override
    public List<Club> findByCondition(ClubSearchCondition condition) {
        return queryFactory
            .selectFrom(club)
            .where(
                categoryEq(condition.category()),
                recruitmentStatusEq(condition.recruitmentStatus()),
                keywordContains(condition.keyword()),
                club.deletedAt.isNull()
            )
            .orderBy(club.name.asc())
            .fetch();
    }

    private BooleanExpression categoryEq(ClubCategory category) {
        return category != null ? club.category.eq(category) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        return StringUtils.hasText(keyword)
            ? club.name.containsIgnoreCase(keyword)
                .or(club.description.containsIgnoreCase(keyword))
            : null;
    }
}
```

### 3. 파일 저장 추상화 (확장성 핵심)

```java
// global/file/FileStorageService.java — 인터페이스
public interface FileStorageService {
    String upload(MultipartFile file, String directory);
    void delete(String fileUrl);
}

// global/file/LocalFileStorageService.java — 현재 구현체
@Service
@Profile("local")
public class LocalFileStorageService implements FileStorageService {
    // 로컬 디렉토리에 저장, URL 반환
}

// global/file/S3FileStorageService.java — 추후 구현체 (미구현)
// @Service
// @Profile("prod")
// public class S3FileStorageService implements FileStorageService { ... }

// 사용 (Service에서 인터페이스 타입으로만 주입)
@RequiredArgsConstructor
public class FeedService {
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

```java
// 성공 응답
return ResponseEntity.ok(ApiResponse.success(result));
return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));

// 롤 제한
@PreAuthorize("hasRole('LEADER')")
@PreAuthorize("hasRole('ADMIN')")

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

---

## 도메인 목록 및 엔티티

| 도메인 | 엔티티 | 주요 필드 |
|---|---|---|
| user | User | id, studentId, name, email, passwordHash, role (Global) |
| club | Club | id, name, category, division, description, logoUrl, status |
| clubmember | ClubMember | id, clubId, userId, role (Club-scoped) |
| recruitment | Recruitment | id, clubId, title, content, startDate, endDate, capacity, status |
| recruitment | RecruitmentForm | id, recruitmentId, questions(JSON) |
| application | Application | id, recruitmentId, userId, answers(JSON), status |
| feed | FeedPost | id, clubId, content, imageUrl |

> 모든 엔티티는 `BaseEntity` 를 상속하므로 위 표에서 `id`/`createdAt`/`updatedAt`/`deletedAt` 은 공통 필드다.
> 비밀번호는 `BCryptPasswordEncoder` 로 해싱한 결과를 `passwordHash` 에 저장한다. 평문 저장 금지.

## Status Enum 정책

`Club.status` 와 `Recruitment.status` 는 의미가 다르며 절대 혼용하지 않는다.

| Enum | 위치 | 값 | 의미 |
|---|---|---|---|
| `ClubStatus` | `domain/club/entity/` | `ACTIVE` / `INACTIVE` / `PENDING_APPROVAL` | 동아리 운영 상태 (총동연 승인 플로우) |
| `RecruitmentStatus` | `domain/recruitment/entity/` | `OPEN` / `CLOSED` | 모집 공고 상태 |
| `ApplicationStatus` | `domain/application/entity/` | `SUBMITTED` / `ACCEPTED` / `REJECTED` | 지원 처리 상태 |

동아리 목록의 "모집 중" 필터는 Club 컬럼이 아닌 **Recruitment 조인 + `RecruitmentStatus.OPEN`** 으로 계산한다 — 데이터 정합성을 위해 Club 에 `recruitmentStatus` 를 캐싱하지 않는다.

## 권한 모델 (Global vs Club-scoped)

권한은 **두 축**으로 분리한다. 어노테이션 기반 검증(@PreAuthorize)은 Global 한정,
Club-scoped 검증은 서비스 레이어에서 `ClubMemberRepository` 조회로 처리한다.

### Global role (`users.role` → `UserRole`)

| 값 | 의미 |
|---|---|
| `STUDENT` | 일반 재학생 (동아리 탐색·지원) |
| `ADMIN` | 총동연 (전체 동아리 승인·관리) |

### Club-scoped role (`club_members.role` → `ClubMemberRole`)

| 값 | 의미 | 운영 권한 (`canManageClub()`) |
|---|---|---|
| `MEMBER` | 일반 동아리 회원 | ❌ |
| `OFFICER` | 운영진 | ✅ |
| `LEADER` | 회장 | ✅ |

### 자동 멤버십 등록

| 트리거 | 결과 |
|---|---|
| `POST /admin/clubs` (ADMIN) | designated leader → `ClubMember(LEADER)` 자동 생성 |
| `PATCH /leader/applications/{id}/status = ACCEPTED` | 지원자 → `ClubMember(MEMBER)` 자동 생성 (멱등) |

### 권한 검증 패턴 (서비스 레이어)

```java
clubMemberRepository.findByClubIdAndUserId(clubId, currentUserId)
    .filter(ClubMember::canManageClub)
    .orElseThrow(ClubMemberException.NotClubManagerException::new);
```

---

## 환경변수

```bash
# 공통 (로컬 / 배포 모두 필요)
DB_URL=jdbc:postgresql://{supabase-host}:5432/postgres
DB_USERNAME=postgres
DB_PASSWORD=****
JWT_SECRET=****
JWT_EXPIRY_MS=3600000

# 로컬 전용
FILE_UPLOAD_DIR=/tmp/duing/uploads    # 로컬 파일 저장 경로

# 배포 시 추가 예정 (현재 미사용)
# AWS_S3_BUCKET=
# AWS_ACCESS_KEY=
# AWS_SECRET_KEY=
# AWS_REGION=ap-northeast-2
```

모든 값은 환경변수 또는 팀 공유 `.env` 파일로 주입한다. 코드/yml 직접 기재 금지.
