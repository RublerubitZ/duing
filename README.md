# Du-ing (두잉) Backend

대구대학교 동아리 통합 플랫폼 **Du-ing** 의 백엔드 저장소.
재학생의 동아리 탐색·지원, 동아리장의 모집·지원자 관리, 총동연의 동아리 승인·관리를 다룬다.

> 본 README 는 새 팀원이 **클론 → 실행 → 첫 PR** 까지 자력으로 도달할 수 있도록 작성되었다.
> 컨벤션·아키텍처 상세는 [`AGENTS.md`](./AGENTS.md), 협업 규칙은 [`CLAUDE.md`](./CLAUDE.md), 요구사항은 [`REQUIREMENTS.md`](./REQUIREMENTS.md) 참조.

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
cd duing
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
- 헬스: <http://localhost:8080/actuator/health>
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
- 작업 브랜치: `{type}/{이슈번호}-{설명}` (예: `feat/12-application-submit`)
- **API 1개 = 브랜치 1개 = PR 1개** 원칙
- 커밋 메시지: 한국어, `[#이슈번호] 작업 내용` 형식
- PR 본문: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항

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
