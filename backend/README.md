# Du-ing Backend

Spring Boot 기반 백엔드. 모노레포 전체 개요는 [루트 README](../README.md) 참조.

> 본 문서는 백엔드 개발자가 **클론 → 실행 → 첫 PR** 까지 자력으로 도달하기 위한 가이드다.
> 컨벤션·아키텍처는 [`AGENTS.md`](./AGENTS.md), 작업 규칙은 [`../CLAUDE.md`](../CLAUDE.md), 요구사항은 [`../REQUIREMENTS.md`](../REQUIREMENTS.md), 반복 패턴은 [`SKILL.md`](./SKILL.md) 참조.
> 모든 명령어는 `backend/` 디렉터리에서 실행한다.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어 / 런타임 | Java 21 (Temurin) |
| 프레임워크 | Spring Boot 3.4.x |
| 빌드 | Gradle (Kotlin DSL) |
| DB | PostgreSQL (Supabase 공유 인스턴스) |
| ORM | Spring Data JPA + Hibernate 6, QueryDSL 5 (jakarta) |
| 마이그레이션 | Flyway |
| 인증 | Spring Security + JWT (auth0 java-jwt) |
| API 문서 | springdoc-openapi (Swagger UI) |
| 테스트 | JUnit 5, TestContainers, RestAssured, Fixture Monkey |

---

## 사전 설치

| 항목 | 버전 | 설치 |
|---|---|---|
| **JDK 21** | Temurin 21 | `brew install --cask temurin@21` |
| **Docker (또는 OrbStack)** | 최신 | `brew install --cask orbstack` (권장 — 가볍고 무료) |
| **Git** | 2.30+ | macOS 기본 |
| **IntelliJ IDEA** | 2024.2+ | 권장 IDE. Lombok 플러그인 기본 내장. EnvFile 플러그인 설치 권장 |

> Docker 는 테스트(TestContainers) 와 로컬 PostgreSQL 컨테이너 실행에 필요. CI/통합 테스트 단계에서만 필수이므로 처음에는 없어도 컴파일/실행은 가능.

---

## 빠른 시작

### 1. 클론

```bash
git clone https://github.com/RublerubitZ/duing.git
cd duing/backend
```

### 2. 환경변수 설정

`.env.example` 을 `.env` 로 복사 후 실제 값으로 채운다. **`.env` 는 절대 커밋 금지**.

```bash
cp .env.example .env
# 그 후 .env 수정
```

| 변수 | 설명 |
|---|---|
| `DB_URL` | Supabase Postgres JDBC URL (`jdbc:postgresql://...`) |
| `DB_USERNAME` / `DB_PASSWORD` | DB 자격 증명 (팀 공유 채널에서 확인) |
| `JWT_SECRET` | 32자 이상 임의 문자열 (`openssl rand -hex 32`) |
| `JWT_EXPIRY_MS` | JWT 만료 ms (기본 3,600,000 = 1시간) |
| `FILE_UPLOAD_DIR` | 로컬 파일 저장 경로 (기본 `/tmp/duing/uploads`) |

IntelliJ 의 Run Configuration → Environment variables 에 등록하거나, EnvFile 플러그인으로 `.env` 를 연결해 사용한다.

### 3. 빌드

```bash
./gradlew clean build -x test    # 테스트 스킵 빌드
./gradlew compileJava            # 컴파일만
```

### 4. 실행

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

기동 후:
- 종합 헬스: <http://localhost:8080/actuator/health> — 기존 호환용이며 DB 상태를 포함한다.
- Liveness: <http://localhost:8080/actuator/health/liveness> — JVM·HTTP 서버 생존 상태만 확인한다.
- Readiness: <http://localhost:8080/actuator/health/readiness> — 요청 처리 준비 상태와 DB 연결을 확인한다.
- Swagger UI: <http://localhost:8080/swagger-ui.html>
- OpenAPI JSON: <http://localhost:8080/v3/api-docs>

### 5. 테스트

```bash
./gradlew test                                # 전체 (Docker 필요)
./gradlew test --tests "*ClubControllerTest"  # 특정 클래스만
```

---

## 프로젝트 구조

```
src/main/java/com/duing/
├── DuingApplication.java
├── global/                          # 전역 설정·공용 빈
│   ├── config/   (SecurityConfig, QueryDslConfig, SwaggerConfig)
│   ├── auth/     (JwtTokenProvider, JwtAuthenticationFilter, UserPrincipal)
│   ├── exception/(ApplicationException, GlobalExceptionHandler)
│   ├── response/ (ApiResponse<T>, PageResponse<T>)
│   ├── entity/   (BaseEntity)
│   └── file/     (FileStorageService 인터페이스 + Local 구현체)
└── domain/
    ├── user/         (가입·로그인·내 정보)
    ├── club/         (목록·상세·생성·상태변경)
    ├── recruitment/  (달력·상세·생성)
    └── application/  (지원 제출·내 지원·지원자 관리)

src/main/resources/
├── application.yml          # 공통
├── application-local.yml    # 로컬 (Supabase URL, 파일 경로)
└── db/migration/V*.sql      # Flyway
```

각 도메인 내부는 동일한 패턴(`api/` → `controller/` → `service/` → `repository/` → `entity/` + `exception/`)을 따른다. 상세는 [`AGENTS.md`](./AGENTS.md).

---

## 브랜치 / PR 전략

- 기본 브랜치: `develop` (모든 작업이 여기로 머지)
- 통합 브랜치: `main` (배포 시점에만 develop → main 머지)
- 작업 브랜치: `{type}/{설명}` (예: `feat/application-submit`). 이슈가 있으면 `{type}/{이슈번호}-{설명}`
- **API 1개 = 브랜치 1개 = PR 1개** 원칙
- 커밋 메시지: Conventional Commits + 한국어 (예: `feat(backend): 지원서 제출 API 구현`)
- PR 제목도 같은 형식 — `develop` 은 squash 머지라 PR 제목이 develop 커밋 메시지가 된다
- PR 본문: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항

---

## MVP 기능 명세

본 MVP 는 **4개 도메인 · 15개 엔드포인트** 로 구성된다. 상세 입출력·예외 조건은 [`REQUIREMENTS.md`](./REQUIREMENTS.md) 참조.

### 도메인 / 사용자 역할

| 역할 | Enum | 권한 요약 |
|---|---|---|
| 일반 재학생 | `STUDENT` | 동아리 탐색·지원, 본인 지원 현황 확인 |
| 동아리장 | `LEADER` | 본인 동아리의 모집 공고·지원자 관리 (`Club.leader_id` 매칭으로 검증) |
| 총동연 | `ADMIN` | 동아리 등록·승인·운영 상태 관리 |

### User (사용자) ✅ 구현완료

| ID | 기능 | 핵심 규칙 |
|---|---|---|
| U-1 | 회원가입 | 학번(7~10자리 숫자)·이메일·비번(8~72자) 검증, BCrypt 해싱, 기본 role `STUDENT` |
| U-2 | 로그인 | 이메일+비번 → JWT(HS256) 발급, 만료 `JWT_EXPIRY_MS` |
| U-3 | 내 정보 조회 | `@AuthenticationPrincipal UserPrincipal` 로 현재 사용자 식별 |

### Club (동아리) ✅ 구현완료

| ID | 기능 | 핵심 규칙 |
|---|---|---|
| C-1 | 동아리 목록 | `category`·`division`·`keyword` 동적 필터 (QueryDSL `BooleanExpression`), `Pageable`, 공개 |
| C-2 | 동아리 상세 | leader 정보 포함, 공개 |
| C-3 | 동아리 생성 | ADMIN 전용. 기본 상태 `PENDING_APPROVAL`. 이름 중복 차단 |
| C-4 | 운영 상태 변경 | ADMIN 전용. `PENDING_APPROVAL`/`ACTIVE`/`INACTIVE` 전환 |

`ClubCategory`: `ACADEMIC` / `CULTURE` / `ART` / `SPORTS` / `VOLUNTEER` / `RELIGION` / `HOBBY` / `OTHER`

### Recruitment (모집 공고) ✅ 구현완료

| ID | 기능 | 핵심 규칙 |
|---|---|---|
| R-1 | 모집 달력 조회 | `yearMonth=YYYY-MM` 입력, 해당 월과 기간이 겹치는 공고를 시작일순 반환, 공개 |
| R-2 | 모집 상세 조회 | `RecruitmentForm.questions` 포함, `effectivelyOpen` 종료일 기반 자동 계산, 공개 |
| R-3 | 모집 공고 생성 | LEADER(본인 동아리). 정원≥1, `endDate≥startDate`. 질문 목록과 함께 `RecruitmentForm` 자동 생성 |

`RecruitmentStatus`: `OPEN` / `CLOSED` — 실효 마감은 조회 시점 (today > endDate) 에 계산.

### Application (지원) ✅ 구현완료

| ID | 기능 | 핵심 규칙 |
|---|---|---|
| A-1 | 지원 제출 | STUDENT. 마감 공고 차단, 중복 지원 차단((recruitment_id, user_id) 부분 유니크), 답변 개수 == 질문 개수 |
| A-2 | 내 지원 목록 | STUDENT. 최신순 반환, 동아리·모집 정보 포함 |
| A-3 | 지원자 목록 | LEADER(본인 동아리). 제출 순으로 학번·이름·답변 반환 |
| A-4 | 지원자 상태 변경 | LEADER(본인 동아리). `ACCEPTED`/`REJECTED` 만 허용, `SUBMITTED` 로 되돌리기 차단 |

`ApplicationStatus`: `SUBMITTED`(제출됨) / `ACCEPTED`(합격) / `REJECTED`(불합격)

### 공통 / 비기능

- **응답 표준**: `{ "ok": boolean, "data": <T>, "message": string? }`. 목록은 `PageResponse<T>` 래핑
- **HTTP 상태**: GET 200 / POST 201 / PUT·PATCH·DELETE 204 / 검증 400 / 미인증 401 / 권한부족 403 / 없음 404 / 충돌 409
- **인증**: 비공개 API 는 `Authorization: Bearer <JWT>` 헤더 필요
- **데이터**: 모든 엔티티 `BaseEntity` 상속 + Soft delete(`@SQLDelete`/`@SQLRestriction`). 물리 삭제 금지
- **검증**: Request DTO 에 `@Valid` + 한국어 메시지(예: `@NotBlank(message = "이메일은 필수 입력값입니다.")`)
- **마이그레이션**: Flyway, 기존 파일 수정 금지

### MVP 외 (Out of Scope)

- 활동 피드 (FeedPost, 이미지 업로드)
- 푸시 알림 (모집 시작·마감, 합격·불합격)
- OAuth2 소셜 로그인
- 통계 대시보드 (총동연)
- 동아리장 인수인계 워크플로우

---

## 현재 구현된 엔드포인트

### 공개

| 메서드 | URL | 설명 |
|---|---|---|
| POST | `/api/v1/auth/signup` | 회원가입 (기본 STUDENT) |
| POST | `/api/v1/auth/login` | 로그인 → JWT 발급 |
| GET | `/api/v1/clubs` | 동아리 목록 (`category`, `division`, `keyword`, `page`, `size`) |
| GET | `/api/v1/clubs/{clubId}` | 동아리 상세 |
| GET | `/api/v1/recruitments?yearMonth=YYYY-MM` | 모집 달력 |
| GET | `/api/v1/recruitments/{recruitmentId}` | 모집 상세 |

### 인증 필요

| 메서드 | URL | 권한 | 설명 |
|---|---|---|---|
| GET | `/api/v1/users/me` | 인증 | 내 정보 |
| POST | `/api/v1/recruitments/{recruitmentId}/applications` | 인증 (STUDENT) | 지원 제출 |
| GET | `/api/v1/users/me/applications` | 인증 (STUDENT) | 내 지원 목록 |
| POST | `/api/v1/leader/clubs/{clubId}/recruitments` | 인증 + 동아리장 본인 | 모집 공고 생성 |
| GET | `/api/v1/leader/recruitments/{recruitmentId}/applications` | 인증 + 동아리장 본인 | 지원자 목록 |
| PATCH | `/api/v1/leader/applications/{applicationId}/status` | 인증 + 동아리장 본인 | 지원자 합/불합격 처리 |
| POST | `/api/v1/admin/clubs` | ADMIN | 동아리 생성 |
| PATCH | `/api/v1/admin/clubs/{clubId}/status` | ADMIN | 운영 상태 변경 |

전체 명세는 Swagger UI 에서 확인할 수 있다.

---

## 주의사항 / 컨벤션 한 줄 요약

- Flyway 기존 파일 **수정 금지** — 새 버전 파일만 추가
- 엔티티는 모두 `BaseEntity` 상속 + soft delete (`@SQLDelete`/`@SQLRestriction`)
- DTO 는 모두 `record`, Request 에 `@Valid` + 한국어 메시지
- 시크릿은 `.env`/환경변수로만 주입 — 코드/yml 에 절대 기재 금지
- 코드 리뷰는 `.claude/agents/duing-code-reviewer` 컨벤션 기준 자동 점검

---

## 추가 문서

- [`AGENTS.md`](./AGENTS.md) — 아키텍처·구현 패턴 상세
- [`CLAUDE.md`](./CLAUDE.md) — 작업 규칙·금지 사항
- [`REQUIREMENTS.md`](./REQUIREMENTS.md) — 요구사항 정의서
- [`SKILL.md`](./SKILL.md) — 반복 작업 스킬 모음
