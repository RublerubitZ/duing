# CLAUDE.md — du-ing-fe

프로젝트 개요, 구조, 명령어, 핵심 패턴은 @frontend/AGENTS.md 참조.
모노레포 구조: `backend/` (Spring Boot 3.4 / Java 21), `frontend/` (Next.js 15 + React 19, pnpm workspaces).
백엔드 작업 규칙은 [`../backend/AGENTS.md`](../backend/AGENTS.md), 루트 공통 규칙은 [`../CLAUDE.md`](../CLAUDE.md) 참조.

---

## Claude 작업 규칙

### 시작 전
- 요청이 모호하면 먼저 질문한다
- 수정할 파일은 반드시 읽고 기존 패턴(폴더 구조, 네이밍, import 순서)을 파악한 뒤 작업한다
- 솔루션 로직을 스스로 검토한 후 제시한다

### 코드 작성
- 기존 프로젝트 스타일과 App Router 구조를 엄격히 따른다
- 요청된 작업 범위만 수정한다 (불필요한 리팩토링 금지)
- 완전히 실행 가능한 코드만 제공한다 (의사코드 금지)
- secrets/환경변수 하드코딩 절대 금지 — `apps/web/.env.local` + `process.env` 로 주입
- 변수명은 역할이 드러나도록 작성한다 — `data`, `res`, `e` 같은 모호한 축약 금지
  - 좋은 예: `const { data: clubList } = useClubListQuery(...)`
- `any` 사용 금지 — 불가피한 경우 `unknown` 후 타입 가드
- `as` 타입 단언 사용 금지 — Zod parse 또는 타입 가드 사용
- 타입 선언은 `type` 사용 (`interface` 금지)

### 새 기능(페이지) 추가 시 필수 순서
1. `packages/types/src/`에 도메인 타입 추가 (누락 시)
2. `packages/api/src/client.ts` 에 API 메서드 추가 (백엔드와 1:1 매칭)
3. `packages/hooks/src/` 에 React Query 훅 추가 (`use{Domain}{Action}Query` / `use{Domain}{Action}Mutation`)
4. `apps/web/app/[route]/_components` 또는 `_containers/` 에 UI 컴포넌트 구현
5. `apps/web/app/[route]/_pages/` 에 Client Page 컴포넌트 조립 또는 `page.tsx` 에 Server Component 작성
6. 테스트 작성 (`apps/web/test/[route]/`)

> 한 라우트에서만 쓰이는 것은 `apps/web/app/[route]/_*/` 에, 두 곳 이상에서 쓰이면 `packages/*` 또는 `apps/web/` 상위로 승격.

---

## Git / PR 규칙

- 브랜치명: `{type}/{이슈번호}-{설명}` (예: `feat/12-club-list-ui`)
- 커밋 메시지: 한국어, `[#이슈번호] 작업 내용` 형식 (예: `[#12] 동아리 목록 페이지 UI 구현`)
- PR 본문: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항 — 파일/컴포넌트명 나열 금지, 자연스러운 문장으로

### 페이지 단위 브랜치 전략
PR 크기 관리를 위해 **페이지(또는 독립 기능) 1개 = 브랜치 1개 = PR 1개** 원칙을 따른다.
- 브랜치는 `develop` 에서 분기, `develop` 으로 PR
- 백엔드 API 에 의존하면 해당 백엔드 PR 머지 후 작업 시작

### CI Checks
`frontend-ci.yml` 이 PR 에서 자동 실행: lint / typecheck / build / test. 실패 시 머지 차단.

---

## 에이전트 & 스킬 자동 사용 규칙

모든 에이전트(`.claude/agents/`)와 스킬(`.claude/skills/`)은 사용자가 명시적으로 요청하지 않아도
작업 맥락에 맞으면 능동적으로 사용한다. (현재는 백엔드 스킬만 — 프론트 스킬은 후속 추가)

---

## 절대 금지

- `'use client'` 무분별 추가 — Server Component 가 가능한 곳은 Server 로 유지
- 서버 상태를 Zustand 또는 `useState` 로 관리 — 반드시 TanStack Query 사용
- `any` 타입, `as` 타입 단언 남용
- `@duing/api` 없이 컴포넌트/훅에서 `ky` 또는 `fetch` 직접 호출
- `.env` 파일 또는 코드 내 시크릿 값 직접 기재
- 의사코드, 미완성 코드 제공
- TanStack Query 내부 모킹 (`useQuery` 자체를 mock)
- `useEffect` 안에서 데이터 패칭 — TanStack Query / Server Component 사용
- `packages/*` 에 DOM API(`window`, `document`) 또는 RN 전용 API 직접 import — 플랫폼 추상화 깨짐
