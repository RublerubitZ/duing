# Du-ing (두잉) — 대구대학교 동아리 통합 플랫폼

<img width="1798" height="875" alt="ChatGPT Image 2026년 5월 14일 오후 07_46_59" src="https://github.com/user-attachments/assets/83b23da1-3bd6-46f0-951d-c1d8972ca779" />


재학생 · 동아리장 · 총동연(총동아리연합회)을 위한 동아리 탐색·지원·모집 관리 모노레포.

```
duing/
├── backend/    Spring Boot 3.4 + Java 21 + PostgreSQL/JPA/QueryDSL/Flyway/JWT
├── frontend/   Next.js 15 + React 19 + TypeScript (pnpm workspaces 모노레포, RN 호환 설계)
│   ├── apps/web/       Next.js App Router + Tailwind
│   └── packages/       types · api · schemas · stores · hooks · storage (RN 재사용)
├── docs/             설계 명세 · 구현 plan (docs/superpowers/specs)
├── CLAUDE.md         Claude Code 작업 규칙 (프로젝트 전역)
├── REQUIREMENTS.md   MVP 요구사항 정의서 (8 도메인 · 30+ API)
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
| 프레임워크 | Spring Boot 3.4 | Next.js 15 (App Router) + React 19 |
| 빌드/패키지 | Gradle (Kotlin DSL) | pnpm 9 workspaces |
| 데이터 | PostgreSQL (Supabase), JPA, QueryDSL, Flyway | TanStack Query (서버 상태) + Zustand (클라이언트 상태) |
| 인증 | Spring Security + JWT (HS256), 웹 HttpOnly Cookie·모바일 Bearer | 웹 Cookie 세션, 모바일 Bearer용 `@duing/storage` 추상화 |
| 검증 | Bean Validation (`@Valid`) | Zod + React Hook Form |
| HTTP | — | ky |
| 스타일 | — | Tailwind CSS |
| API 문서 / 타입 | springdoc-openapi | `pnpm gen:api` 로 OpenAPI → TS 자동 생성 (`openapi-typescript`) |
| 테스트 | JUnit 5, TestContainers, RestAssured, Fixture Monkey | Vitest + Testing Library |

---

## MVP 기능 개요

**핵심 4 도메인 + 운영 4 도메인** (백엔드 구현 완료, 프론트 연동 진행 중).

### 핵심 도메인

| 도메인 | 주요 기능 | 상태 |
|---|---|---|
| **User** | 회원가입(학교 이메일 검증) · 로그인(JWT) · 내 정보 | ✅ |
| **Club** | 목록(키워드/카테고리/단과대/모집상태/정렬) · 상세 · 생성(ADMIN) · 상태전이(ADMIN) · 중앙동아리 토글 | ✅ |
| **ClubMember** | 멤버십 (생성 시 자동 LEADER, 합격 시 자동 MEMBER) · 권한 변경 히스토리(감사 로그) | ✅ |
| **Recruitment** | 모집 달력 조회 · 상세(질문 폼 포함) · 생성(LEADER/OFFICER) | ✅ |
| **Application** | 지원 제출(STUDENT) · 내 지원 목록(scope 필터) · 지원자 관리(LEADER) | ✅ |

### 운영 / 어드민 도메인

| 도메인 | 주요 기능 | 상태 |
|---|---|---|
| **Report** | 동아리/공고 신고 · ADMIN 처리(RESOLVED/DISMISSED) | ✅ |
| **Leader Succession** | OFFICER 회장 승계 요청 · ADMIN 강제 LEADER 지정 · 권한 이력 | ✅ |
| **Recertification** | 중앙동아리 연간 재인증 라운드 OPEN/CLOSE · 제출 · 처리 | ✅ |
| **Promotion** | 동아리 홍보 요청 · ADMIN 배너 큐레이션(공개 캐러셀) | ✅ |
| **Notice** | 캠퍼스 소식·공지 (목록·상세) | ✅ |
| **Favorite** | 동아리 즐겨찾기 | ✅ |

### 권한 모델 (RBAC)

사용자 역할은 **Global**(시스템 전역) × **Club-scoped**(동아리 단위) 두 축으로 분리:

- Global: `STUDENT` (재학생) / `ADMIN` (총동연) — `users.role`
- Club-scoped: `MEMBER` (회원) / `OFFICER` (운영진) / `LEADER` (회장) — `club_members.role`

자동 멤버십: 동아리 생성 시 leader → `ClubMember(LEADER)`. 지원 합격 시 지원자 → `ClubMember(MEMBER)`.

상세 명세는 [`REQUIREMENTS.md`](./REQUIREMENTS.md), API 컨트랙트는 부팅 후 `http://localhost:8080/swagger-ui.html` 에서 확인.

---

## 협업 규칙

### 브랜치 전략

- 기본 브랜치: `develop` (모든 작업 머지 대상)
- 통합 브랜치: `main` (배포 시점 develop → main squash)
- 작업 브랜치: `{type}/{설명}` (예: `feat/be-me-clubs-and-application-scope`, `fix/calendar-month-nav-and-resize`)
- **API 1개 / 페이지 1개 = 브랜치 1개 = PR 1개** 원칙

### 커밋 / PR

- 커밋 메시지: **Conventional Commits (한국어)** — `feat(backend): ...`, `fix(frontend): ...`, `refactor(...)`, `docs(spec): ...`, `ci: ...`, `perf(frontend): ...`
- PR 본문 템플릿: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항
- 모든 작업 브랜치는 `develop` 에서 분기, `develop` 으로 PR

### CI 분기

[GitHub Actions `paths` 필터](./.github/workflows) 로 변경 영향만 빌드:

- `backend/**` 변경 → `backend-ci.yml`: JDK 21 + Gradle `compileJava` + `build -x test` (실패 시 build/reports 업로드)
- `frontend/**` 변경 → `frontend-ci.yml`: pnpm install / lint / typecheck / build / test
- PR 템플릿: [`./.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md)

### 자동 코드 리뷰

`.claude/agents/duing-code-reviewer.md` 가 PR 머지 전 DDD/네이밍/예외/트랜잭션/보안 컨벤션을 자동 검사.

---

## 사전 설치

| 항목 | 버전 | 설치 |
|---|---|---|
| **JDK 21** | Temurin 21 | `brew install --cask temurin@21` |
| **Docker (또는 OrbStack)** | 최신 | `brew install --cask orbstack` (권장) |
| **Node.js / pnpm** | Node 20+ / pnpm 9+ | `brew install node pnpm` |
| **Git** | 2.30+ | macOS 기본 |
| **IntelliJ IDEA** | 2024.2+ | Lombok 기본 내장, EnvFile 플러그인 권장 |

> Docker 는 백엔드 통합 테스트(TestContainers) 와 로컬 PostgreSQL 컨테이너에 필요.

---

## 환경변수 / 시크릿

- 백엔드: `backend/.env` (커밋 금지) — 템플릿: `backend/.env.example`
- 프론트엔드: `frontend/apps/web/.env.local` (커밋 금지) — 템플릿: `apps/web/.env.local.example`
- 공통 원칙: 코드/yml 에 시크릿 직접 기재 절대 금지. `.env` 또는 CI Secret 으로만 주입.

웹 인증 운영에서는 시크릿 소유권을 다음과 같이 분리한다.

- 백엔드는 Access Token 서명용 `JWT_SECRET`, Middleware 힌트 서명용 `AUTH_HINT_SECRET`, 운영 힌트
  Cookie 범위용 `AUTH_HINT_COOKIE_DOMAIN=.duings.com`을 사용한다. 두 Secret은 각각 최소 32바이트이며
  반드시 서로 다른 값이어야 한다.
- Vercel에는 백엔드와 같은 `AUTH_HINT_SECRET`만 주입한다. Access Token을 서명할 수 있는
  `JWT_SECRET`은 Vercel 환경변수로 등록하면 안 된다.

운영 웹 `duings.com`/`api.duings.com`과 로컬 `localhost:3000`/`localhost:8080`을 지원한다. 로컬에서는
프론트와 백엔드의 호스트 문자열을 모두 `localhost`로 통일하며 `127.0.0.1`과 섞지 않는다. 일반
`*.vercel.app` Preview는 웹 인증 지원 대상이 아니다. Preview 인증이 필요하면 `preview.duings.com`처럼
API와 동일 사이트가 되는 커스텀 도메인을 사용한다.

웹 Access Token은 백엔드가 `__Host-duing_access_token` host-only Cookie로만 발급한다
(`Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`, Domain 미지정). `auth_hint`는 로그인·역할별
리다이렉트 UX에만 쓰며 API 인증이나 권한 판정에는 사용하지 않는다. Refresh Token은 아직 사용하지
않는다. 현재 로그아웃은 사용자 단위 `token_version`을 증가시키므로 웹이나 모바일 한 곳에서
로그아웃하면 해당 사용자의 모든 디바이스 세션이 무효화된다.

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
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code 작업 규칙·금지 사항 |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | MVP 요구사항 정의서 (도메인별 입력/출력/예외) |
| [`docs/superpowers/specs/`](./docs/superpowers/specs) | 기능별 설계 spec + 구현 plan |
| [`.claude/agents/duing-code-reviewer.md`](./.claude/agents/duing-code-reviewer.md) | DDD/네이밍/예외 컨벤션 자동 리뷰 |
| [`.claude/skills/`](./.claude/skills) | 스캐폴딩 스킬 (new-domain, new-api, flyway-migration, api-test) |
