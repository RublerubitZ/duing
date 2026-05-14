# Du-ing (두잉) — 대구대학교 동아리 통합 플랫폼

재학생 · 동아리장 · 총동연을 위한 동아리 탐색, 지원, 모집 관리 모노레포.

```
duing/
├── backend/    Spring Boot 3.4 + Java 21 + PostgreSQL/JPA/QueryDSL/Flyway/JWT
├── frontend/   (TBD)
├── CLAUDE.md         Claude Code 작업 규칙 (프로젝트 전역)
├── REQUIREMENTS.md   MVP 요구사항 정의서 (4도메인 · 15개 API)
└── .claude/    Claude 코드 리뷰 에이전트 + 도메인/API/Flyway/테스트 스킬
```

---

## 빠른 시작

### 백엔드

```bash
cd backend
cp .env.example .env       # 후 실제 값 채우기
./gradlew bootRun --args='--spring.profiles.active=local'
```

상세는 [`backend/README.md`](./backend/README.md) 참조.

### 프론트엔드

스캐폴딩 예정. 결정된 스택(React/Vite, Next.js 등)에 따라 [`frontend/README.md`](./frontend/README.md) 가 갱신됨.

---

## 기술 스택

| 영역 | 백엔드 | 프론트엔드 |
|---|---|---|
| 언어 | Java 21 | TBD (TypeScript 예정) |
| 프레임워크 | Spring Boot 3.4 | TBD (React/Vite 또는 Next.js) |
| 빌드 | Gradle (Kotlin DSL) | TBD (pnpm + Vite/Next) |
| 데이터 | PostgreSQL (Supabase), JPA, QueryDSL, Flyway | — |
| 인증 | Spring Security + JWT | JWT 헤더 송신 |
| API 문서 | springdoc-openapi | OpenAPI → TS 타입 생성 (TBD) |
| 테스트 | JUnit 5, TestContainers, RestAssured, Fixture Monkey | Vitest/Playwright (TBD) |

---

## MVP 기능 개요

**4개 도메인 · 15개 엔드포인트** (현재 백엔드 구현 완료).

| 도메인 | 주요 기능 | 상태 |
|---|---|---|
| **User** | 회원가입 · 로그인(JWT) · 내 정보 | ✅ |
| **Club** | 목록(필터/페이지) · 상세 · 생성(ADMIN) · 상태변경(ADMIN) | ✅ |
| **Recruitment** | 달력 조회 · 상세(질문 포함) · 생성(LEADER) | ✅ |
| **Application** | 지원 제출(STUDENT) · 내 지원 목록 · 지원자 관리(LEADER) | ✅ |

사용자 역할: `STUDENT` (재학생) / `LEADER` (동아리장 — `Club.leader_id` 매칭으로 검증) / `ADMIN` (총동연).

상세 명세는 [`REQUIREMENTS.md`](./REQUIREMENTS.md), API 컨트랙트는 부팅 후 `http://localhost:8080/swagger-ui.html` 에서 확인.

---

## 협업 규칙

### 브랜치 전략

- 기본 브랜치: `develop` (모든 작업 머지 대상)
- 통합 브랜치: `main` (배포 시점 develop → main)
- 작업 브랜치: `{type}/{이슈번호}-{설명}` (예: `feat/12-application-submit`)
- **API 1개 = 브랜치 1개 = PR 1개** 원칙

### 커밋 / PR

- 커밋 메시지: 한국어, `[#이슈번호] 작업 내용` 형식
- PR 본문: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항

### CI 분기

[GitHub Actions `paths` 필터](./.github/workflows) 로 변경 영향만 빌드:

- `backend/**` 변경 → `backend-ci.yml`: JDK 21 + Gradle `compileJava` + `build -x test` (실패 시 build/reports 업로드)
- `frontend/**` 변경 → `frontend-ci.yml`: pnpm install / lint / typecheck / build / test (스캐폴딩 전에는 자동 스킵)
- PR 템플릿: [`./.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md)

---

## 사전 설치

| 항목 | 버전 | 설치 |
|---|---|---|
| **JDK 21** | Temurin 21 | `brew install --cask temurin@21` |
| **Docker (또는 OrbStack)** | 최신 | `brew install --cask orbstack` (권장) |
| **Node.js / pnpm** | LTS (프론트 시작 시) | `brew install node pnpm` |
| **Git** | 2.30+ | macOS 기본 |
| **IntelliJ IDEA** | 2024.2+ | Lombok 기본 내장, EnvFile 플러그인 권장 |

> Docker 는 백엔드 통합 테스트(TestContainers) 와 로컬 PostgreSQL 컨테이너에 필요.

---

## 환경변수 / 시크릿

- 백엔드: `backend/.env` (커밋 금지) — 템플릿: `backend/.env.example`
- 프론트엔드: `frontend/.env.local` (커밋 금지) — 추후 추가
- 공통 원칙: 코드/yml 에 시크릿 직접 기재 절대 금지. `.env` 또는 CI Secret 으로만 주입.

---

## 추가 문서

| 파일 | 내용 |
|---|---|
| [`backend/README.md`](./backend/README.md) | 백엔드 빠른 시작·구조·엔드포인트·MVP 기능 명세 |
| [`backend/AGENTS.md`](./backend/AGENTS.md) | 백엔드 아키텍처·구현 패턴 상세 |
| [`backend/SKILL.md`](./backend/SKILL.md) | 백엔드 반복 작업 스킬 (new-api, querydsl-filter, ...) |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 작업 규칙·금지 사항 |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | MVP 요구사항 정의서 (도메인별 입력/출력/예외) |
| [`.claude/agents/duing-code-reviewer.md`](./.claude/agents/duing-code-reviewer.md) | DDD/네이밍/예외 컨벤션 자동 리뷰 |
| [`.claude/skills/`](./.claude/skills) | 스캐폴딩 스킬 (new-domain, new-api, flyway-migration, api-test) |
