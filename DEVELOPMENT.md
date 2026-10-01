# Du-ing 개발 가이드

두잉 모노레포에서 개발하기 위한 문서. 서비스 소개와 기능 가이드는 [루트 README](./README.md) 참조.

```
duing/
├── backend/    Spring Boot 3.5 + Java 21 + PostgreSQL/JPA/QueryDSL/Flyway/JWT
├── frontend/   Next.js 16 + React 19 + TypeScript (pnpm workspaces 모노레포, RN 호환 설계)
│   ├── apps/web/       Next.js App Router + Tailwind
│   └── packages/       types · api · schemas · stores · hooks · storage (RN 재사용)
├── deploy/           배포 설정 · 롤백 런북
├── CLAUDE.md         Claude Code 작업 규칙 (프로젝트 전역)
├── REQUIREMENTS.md   MVP 요구사항 정의서
└── .claude/          Claude 코드 리뷰 에이전트 + 도메인/API/Flyway/테스트 스킬
```

---

## 사전 설치

| 항목 | 버전 | 설치 |
|---|---|---|
| **JDK 21** | Temurin 21 | `brew install --cask temurin@21` |
| **Docker (또는 OrbStack)** | 최신 | `brew install --cask orbstack` (권장) |
| **Node.js / pnpm** | Node 24 / pnpm 9+ | `brew install node@24 pnpm` (node@24 는 keg-only — PATH 추가는 [frontend/README.md](./frontend/README.md)) |
| **Git** | 2.30+ | macOS 기본 |
| **IntelliJ IDEA** | 2024.2+ | Lombok 기본 내장, EnvFile 플러그인 권장 |

> Docker 는 백엔드 통합 테스트(TestContainers) 와 로컬 PostgreSQL 컨테이너에 필요.

---

## 빠른 시작

### 백엔드

```bash
cd backend
cp .env.example .env       # 후 실제 값 채우기
./gradlew bootRun --args='--spring.profiles.active=local'
```

상세는 [`backend/README.md`](./backend/README.md) 참조. API 컨트랙트는 부팅 후 `http://localhost:8080/swagger-ui.html` 에서 확인.

### 프론트엔드

```bash
cd frontend
pnpm install
cp apps/web/.env.local.example apps/web/.env.local
pnpm dev                    # http://localhost:3000
```

상세는 [`frontend/README.md`](./frontend/README.md) 참조.

---

## 기술 스택

| 영역 | 백엔드 | 프론트엔드 |
|---|---|---|
| 언어 | Java 21 | TypeScript 5 |
| 프레임워크 | Spring Boot 3.5 | Next.js 16 (App Router) + React 19 |
| 빌드/패키지 | Gradle (Kotlin DSL) | pnpm 9 workspaces |
| 데이터 | PostgreSQL (Supabase), JPA, QueryDSL, Flyway | TanStack Query (서버 상태) + Zustand (클라이언트 상태) |
| 인증 | Spring Security + JWT (HS256), 웹 HttpOnly Cookie·모바일 Bearer | 웹 Cookie 세션, 모바일 Bearer용 `@duing/storage` 추상화 |
| 검증 | Bean Validation (`@Valid`) | Zod + React Hook Form |
| HTTP | — | ky |
| 스타일 | — | Tailwind CSS |
| API 문서 / 타입 | springdoc-openapi | `pnpm gen:api` 로 OpenAPI → TS 자동 생성 (`openapi-typescript`) |
| 테스트 | JUnit 5, TestContainers, RestAssured, Fixture Monkey | Vitest + Testing Library |

---

## 권한 모델 (RBAC)

사용자 역할은 **Global**(시스템 전역) × **Club-scoped**(동아리 단위) 두 축으로 분리:

- Global: `STUDENT` (재학생) / `ADMIN` (총동연) — `users.role`
- Club-scoped: `MEMBER` (회원) / `OFFICER` (운영진) / `LEADER` (회장) — `club_members.role`

자동 멤버십: 동아리 생성 시 leader → `ClubMember(LEADER)`. 지원 합격 시 지원자 → `ClubMember(MEMBER)`.

도메인별 입력/출력/예외는 [`REQUIREMENTS.md`](./REQUIREMENTS.md) 참조.

---

## 협업 규칙

### 브랜치 전략

- 기본 브랜치: `develop` (모든 작업 머지 대상, squash 머지)
- 배포 브랜치: `main` (릴리스 시점에 develop → main)
- 작업 브랜치: `{type}/{설명}` (예: `feat/club-list-ui`, `fix/calendar-month-nav-and-resize`)
- **API 1개 / 페이지 1개 = 브랜치 1개 = PR 1개** 원칙

### 커밋 / PR

- 커밋 메시지: **Conventional Commits (한국어)** — `feat(backend): ...`, `fix(frontend): ...`, `refactor(...)`, `docs(spec): ...`, `ci: ...`, `perf(frontend): ...`
- PR 제목도 같은 형식 — squash 머지라 PR 제목이 그대로 develop 커밋 메시지가 된다
- PR 본문 템플릿: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항 ([`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md))
- 모든 작업 브랜치는 `develop` 에서 분기, `develop` 으로 PR

### CI

모든 PR 에서 [`ci-gate.yml`](./.github/workflows/ci-gate.yml) 이 변경 영역을 판정해 필요한 워크플로만 호출하고, 결과를 `Gate` 체크 하나로 모은다.

- `backend/**` 변경 → `backend-ci.yml`
- `frontend/**` 변경 → `frontend-ci.yml`: lint · typecheck · build · test 등
- `deploy/**` 변경 → `deploy-config-ci.yml`

`develop` 브랜치 보호의 필수 체크는 **`Gate` 하나뿐**이다. 개별 CI 를 필수로 지정하면 해당 경로를 건드리지 않은 PR 에서 체크가 생성되지 않아 머지가 영구히 막힌다.

### 자동 코드 리뷰

`.claude/agents/duing-code-reviewer.md` 가 PR 머지 전 DDD/네이밍/예외/트랜잭션/보안 컨벤션을 자동 검사.

---

## 환경변수 / 시크릿

- 백엔드: `backend/.env` (커밋 금지) — 템플릿: `backend/.env.example`
- 프론트엔드: `frontend/apps/web/.env.local` (커밋 금지) — 템플릿: `apps/web/.env.local.example`
- 공통 원칙: 코드/yml 에 시크릿 직접 기재 절대 금지. `.env` 또는 CI Secret 으로만 주입.

웹 인증 운영에서는 시크릿 소유권을 다음과 같이 분리한다.

- 백엔드는 Access Token 서명용 `JWT_SECRET`, Middleware 힌트 서명용 `AUTH_HINT_SECRET`, 운영 힌트
  Cookie 범위용 `AUTH_HINT_COOKIE_DOMAIN=.duings.com`을 사용한다. 두 Secret은 각각 최소 32바이트이며
  반드시 서로 다른 값이어야 한다. 운영 프로필에서 Cookie Domain이 누락되거나 정확히 `.duings.com`이
  아니면 기동에 실패한다.
- Vercel에는 백엔드와 같은 `AUTH_HINT_SECRET`만 주입한다. Access Token을 서명할 수 있는
  `JWT_SECRET`은 Vercel 환경변수로 등록하면 안 된다.

운영 웹 `duings.com`/`api.duings.com`과 로컬 `localhost:3000`/`localhost:8080`을 지원한다. 로컬에서는
`AUTH_HINT_COOKIE_DOMAIN`을 비우거나 설정하지 않아 Access Token과 `auth_hint`를 모두 localhost
host-only Cookie로 발급하고, 프론트와 백엔드의 호스트 문자열도 `localhost`로 통일한다.
`127.0.0.1`과 섞지 않는다. 브라우저의 localhost Secure Cookie 예외 덕분에 HTTP localhost 개발을
지원하지만, 일반 HTTP non-localhost 호스트에는 웹 인증 Cookie를 발급하지 않는다. 일반
`*.vercel.app` Preview는 웹 인증 지원 대상이 아니다. Preview 인증이 필요하면 `preview.duings.com`처럼
API와 동일 사이트가 되는 커스텀 도메인을 사용한다.

웹 Access Token은 백엔드가 `__Host-duing_access_token` host-only Cookie로만 발급한다
(`Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800`, Domain 미지정). Refresh Token은
`__Secure-duing_refresh_token` Cookie(`Path=/api/v1/auth`)로 발급하고 수명은 30일
(`DUING_AUTH_REFRESH_TTL_DAYS`, 갱신마다 연장)이며, `auth_hint`도 같은 수명을 따른다. 로그인 상태 유지를
끄면 세 Cookie 모두 Max-Age 없는 세션 Cookie가 된다. `auth_hint`는 로그인·역할별 리다이렉트 UX에만 쓰며
API 인증이나 권한 판정에는 사용하지 않는다. Access JWT 수명은 코드(`JwtTokenProvider`)가 30분
(1,800,000ms)으로 고정 검증하므로 `JWT_EXPIRY_MS`는 설정하지 않는다 — 다른 값이면 기동에 실패한다.
로그아웃과 개별 세션 폐기는 그 세션만 끊는다 — 그 기기에서 이미 발급된 Access Token은 만료(최대 30분)까지
서버에서 유효하다. 즉시 차단은 모든 기기 로그아웃(`DELETE /api/v1/users/me/sessions`)뿐이며, `token_version`을
올려 모든 Access Token을 즉시 무효화한다.

배포 순서와 롤백 절차는 [`deploy/README.md`](./deploy/README.md)를 따른다.

---

## 추가 문서

| 파일 | 내용 |
|---|---|
| [`backend/README.md`](./backend/README.md) | 백엔드 빠른 시작·구조·엔드포인트·MVP 기능 명세 |
| [`backend/AGENTS.md`](./backend/AGENTS.md) | 백엔드 아키텍처·구현 패턴 상세 |
| [`backend/SKILL.md`](./backend/SKILL.md) | 백엔드 반복 작업 스킬 (new-api, querydsl-filter, ...) |
| [`frontend/README.md`](./frontend/README.md) | 프론트 빠른 시작·패키지 구조 |
| [`frontend/AGENTS.md`](./frontend/AGENTS.md) | 프론트 구조·패턴 레퍼런스 |
| [`deploy/README.md`](./deploy/README.md) | 배포 순서·롤백 런북 |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 작업 규칙·금지 사항 |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | MVP 요구사항 정의서 (도메인별 입력/출력/예외) |
| [`.claude/agents/duing-code-reviewer.md`](./.claude/agents/duing-code-reviewer.md) | DDD/네이밍/예외 컨벤션 자동 리뷰 |
| [`.claude/skills/`](./.claude/skills) | 스캐폴딩 스킬 (new-domain, new-api, flyway-migration, api-test) |
