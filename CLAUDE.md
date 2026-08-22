# CLAUDE.md — du-ing (monorepo)

대구대학교 동아리 통합 플랫폼 **Du-ing(두잉)** 모노레포 루트.
파트별 상세 규칙은 작업 디렉터리의 `CLAUDE.md` 와 `AGENTS.md` 를 따른다.

```
duing/
├── backend/          Spring Boot 3.4 / Java 21
│   ├── CLAUDE.md     백엔드 작업 규칙 (DDD·Flyway·QueryDSL·테스트 등)
│   └── AGENTS.md     백엔드 아키텍처·구현 패턴 레퍼런스
├── frontend/         Next.js 15 + React 19 / pnpm workspaces
│   ├── CLAUDE.md     프론트 작업 규칙 (App Router·React Query·Zustand 등)
│   └── AGENTS.md     프론트 구조·패턴 레퍼런스
├── REQUIREMENTS.md   MVP 요구사항 정의서 (4도메인 · 15개 API)
├── README.md         빠른 시작·전체 개요
└── .claude/          전역 에이전트 + 스킬 (현재 백엔드 위주)
```

→ 백엔드 작업: [`backend/CLAUDE.md`](./backend/CLAUDE.md) + [`backend/AGENTS.md`](./backend/AGENTS.md)
→ 프론트 작업: [`frontend/CLAUDE.md`](./frontend/CLAUDE.md) + [`frontend/AGENTS.md`](./frontend/AGENTS.md)

---

## 공통(monorepo-wide) 규칙

### 시작 전
- 요청이 모호하면 먼저 질문한다
- 수정할 파일은 반드시 읽고 기존 패턴(폴더 구조, 네이밍, 어노테이션·import 순서)을 파악한 뒤 작업한다
- 솔루션 로직을 스스로 검토한 후 제시한다

### 코드 작성
- 요청된 작업 범위만 수정한다 (불필요한 리팩토링 금지)
- 완전히 실행 가능한 코드만 제공한다 (의사코드 금지)
- 변수명은 역할이 드러나도록 작성한다 — `dto`/`r`/`e`/`data`/`res` 같은 모호한 축약 금지
- **시크릿/환경변수 하드코딩 절대 금지** — `.env*` 또는 CI Secret 으로만 주입

### Git / PR
- 브랜치명: `{type}/{설명}` (예: `feat/club-list-ui`). 이슈가 있으면 `{type}/{이슈번호}-{설명}`
- 커밋 메시지: **Conventional Commits + 한국어** — `{type}({scope}): 작업 내용`
  - 예: `feat(frontend): 동아리 목록 필터 추가`, `fix(backend): 중복 지원 검증 누락 수정`
  - type: `feat` `fix` `refactor` `docs` `test` `chore` `ci` `perf`
  - scope: `frontend` `backend` `web` `deploy` `spec` `ci` 등 — 여러 파트에 걸치면 생략 (`refactor: …`)
  - `[#이슈번호] 작업 내용` 형식은 쓰지 않는다
- **PR 제목도 커밋과 같은 형식으로 쓴다** — `develop` 은 squash 머지라 PR 제목이 그대로 develop 커밋 메시지가 된다
- PR 본문: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항 — 파일·클래스명 나열 금지, 자연스러운 문장으로
- **1개 단위 = 1 브랜치 = 1 PR** 원칙 (백엔드: API 단위 / 프론트: 페이지 단위)
- 모든 작업 브랜치는 `develop` 에서 분기, `develop` 으로 PR

### CI
- `.github/workflows/ci-gate.yml` — **모든 PR 에서 실행**. 변경 영역을 판정해 아래 세 워크플로를 필요한 만큼만 호출하고, 그 결과를 모아 `Gate` 체크 하나로 낸다.
- `.github/workflows/backend-ci.yml` — `backend/**` 변경 시 (PR 은 게이트가 호출, develop·main push 는 직접 실행)
- `.github/workflows/frontend-ci.yml` — `frontend/**` 변경 시 (동일)
- `.github/workflows/deploy-config-ci.yml` — `deploy/**` 변경 시 (동일)
- PR 템플릿: [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md)

`develop` 브랜치 보호의 필수 체크는 **`Gate` 하나뿐**이다. 개별 CI 를 직접 필수로 지정하면, 해당 경로를
건드리지 않은 PR 에서는 체크가 생성되지 않아 GitHub 이 이를 pending 으로 간주하고 머지가 영구히 막힌다.
게이트는 "변경이 있는데 성공이 아닌" 경우와 "변경이 없는데 건너뛰지 않은" 경우를 모두 실패로 처리하므로,
검사가 돌지 않았는데 통과하는 경로는 없다. 게이트 자신이 바뀌면 전 영역 CI 를 모두 돌린다.

### 에이전트 & 스킬 자동 사용
모든 에이전트(`.claude/agents/`)와 스킬(`.claude/skills/`)은 사용자가 명시적으로 요청하지 않아도
작업 맥락에 맞으면 능동적으로 사용한다.

---

## 절대 금지 (전 영역 공통)

- 시크릿 값을 코드/yml/공개 채널에 직접 기재
- 의사코드·미완성 코드 제공
- 영역별 추가 금지 사항은 각 `CLAUDE.md` 참조
