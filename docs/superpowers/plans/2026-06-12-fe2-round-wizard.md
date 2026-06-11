# FE#2 — 면접 라운드 Wizard (선정→생성→슬롯→발송) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 운영진 wizard `manage/.../interview/rounds/new` — Step1 후보 선정(ephemeral) → Step2 라운드 생성(첫 persist + UNDER_REVIEW 전이 명시) → Step3 슬롯 등록 → Step4 검토·발송. DRAFT 감지 시 이어하기/폐기 (스펙 §10.2·§10.3·§12 FE#2).

**Architecture:** 데이터 레이어(타입·클라이언트·쿼리키·훅) → wizard UI 의 2 계층 2 커밋. 신규 백엔드 계약(BE#2~#12)의 타입은 **백엔드 DTO 파일과 1:1 수동 정의** — `pnpm gen:api` 는 live 서버(localhost:8080)가 필요한데 로컬 기동 인프라(compose)가 없어 이 PR 에서 보류한다(별도 chore 로 재생성 후 별칭 교체 — 스펙 §10.1 의 갱신 시점을 의도적으로 미룸, PR 본문 명시). 구 interviews 클라이언트 그룹·구 화면은 미접촉(FE#3/4 정리 범위) — 신규는 `interviewRounds` 그룹으로 분리해 공존한다.

**Tech Stack:** Next.js 15 App Router / React 19 / TanStack Query / Vitest + MSW(요청 캡처) / Tailwind (manage 톤: slate·sky·purple)

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §10.1~10.3·§12 FE#2 / 백엔드 계약: `backend/src/main/java/com/duing/domain/interview/` 의 api·controller/dto
**리뷰 정책:** duing-code-reviewer(frontend/CLAUDE.md 기준) + codex 기본

---

## 핵심 결정

1. **타입은 수동 정의 + regen 보류**: 신규 응답·요청 타입을 `packages/types/src/interviewRound.ts`(신규 파일)에 백엔드 DTO 와 1:1 로 작성. generated 참조 금지(스키마에 아직 없음). drift 방지를 위해 각 타입에 출처 주석(`// = RoundCandidateResponse`). regen chore 때 별칭으로 교체.
2. **클라이언트는 `interviewRounds` 신규 그룹** — 구 `interviews` 그룹(dead API)과 분리, FE#3/4 가 구 그룹을 들어낼 때 충돌 없음.
3. **쿼리키 (스펙 §10.1)**: `interviewRoundKeys = { all, list(recruitmentId), detail(roundId), candidates(recruitmentId) }` — 신규 파일 `interviewRoundQueryKeys.ts` (구 `interviewQueryKeys` 미접촉). invalidation: 라운드 생성 → list+candidates / 슬롯 생성·수정·삭제 → detail / 발송 → detail+list / 라운드 수정 → detail+list / 취소(폐기) → list+candidates (§10.1 — cancel 도 재큐잉이므로 candidates 포함).
4. **wizard 상태는 클라이언트 useState** (Zustand 불요 — 단일 페이지 내 상태): `step(1~4)`, `selectedApplicationIds`(Step1 ephemeral), `roundId`(Step2 persist 후). Step2 완료 후 라운드 데이터는 전부 서버 상태(react query) — 이어하기와 같은 경로.
5. **DRAFT 감지 = 목록 쿼리에서 status==='DRAFT' 탐색** → 다이얼로그 [이어하기](roundId 세팅, **Step2 진입** — 프리필+수정(PATCH)) / [폐기](cancel mutation → Step1). 이어하기가 Step2 부터인 이유: deadline 미설정 DRAFT 를 구제하는 자연 경로 (발송 조건 deadline≠null).
6. **Step2 의 부수효과 명시 (§10.3)**: 제출 버튼 위에 "서류 검토 중 N명은 생성 즉시 면접 대상으로 전환됩니다" 안내 (N = 선택 중 UNDER_REVIEW 수). 이어하기 모드에선 멤버 변경 불가(BE 계약에 멤버 추가 API 없음) — 멤버 표시는 read-only.
7. **Step3 슬롯 패턴 폼은 구 컴포넌트를 _components 로 복제·개조** (`SlotPatternForm`·`generateSlotsFromPattern`·`SlotPreviewList` — 스펙 §10.3 "재사용". 구 파일은 dead API 페이지 소속이라 import 재사용 대신 복제: FE#3/4 가 구 페이지를 삭제할 때 wizard 가 깨지면 안 된다. 복제 시 capacity 필수 입력으로 개조).
8. **Step4 발송 버튼 = 서버 가드 1:1** (§10.3): `슬롯≥1 && 멤버≥1 && deadline≠null` 클라이언트 비활성 + 미충족 사유 텍스트. 발송 성공 → 같은 페이지에 완료 화면(알림 발송 N명) + [면접 관리로] 링크.
9. **진입점은 기존 interview/page.tsx 에 버튼 1개 추가** (`rounds/new` 링크) — 구 페이지 전체 교체는 FE#3. 수정 최소(스타일은 기존 버튼 클래스).
10. **테스트 3층**: api 클라이언트(URL·body 캡처 3건) / hooks(invalidation 2건) / web wizard(흐름 9건 — MSW). 기존 각 층의 테스트 파일 패턴이 정답.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `frontend/packages/types/src/interviewRound.ts` (+`index.ts` export) | 신규 계약 타입 (수동, 출처 주석) |
| Modify | `frontend/packages/api/src/client.ts` | `interviewRounds` 그룹 8 메서드 |
| Create | `frontend/packages/hooks/src/interviewRoundQueryKeys.ts` | 쿼리키 |
| Create | `frontend/packages/hooks/src/interviewRound.ts` (+`index.ts` export) | 훅 10개 |
| Create | `frontend/packages/api/test/interviewRound.test.ts` | URL·body 캡처 3건 |
| Create | `frontend/packages/hooks/test/interviewRound.test.tsx` | invalidation 2건 |
| Create | `apps/web/.../interview/rounds/new/page.tsx` | wizard 서버 진입 |
| Create | `apps/web/.../interview/rounds/new/_components/RoundWizard.tsx` | 클라이언트 컨테이너 (step·DRAFT 감지) |
| Create | `apps/web/.../rounds/new/_components/WizardStepper.tsx` / `Step1Candidates.tsx` / `Step2RoundForm.tsx` / `Step3Slots.tsx` / `Step4Review.tsx` / `DraftResumeDialog.tsx` | 단계 컴포넌트 |
| Create | `apps/web/.../rounds/new/_components/SlotPatternForm.tsx` + `_utils/generateSlotsFromPattern.ts` (구 파일 복제·capacity 개조) | 슬롯 패턴 |
| Modify | `apps/web/.../recruitments/[recruitmentId]/interview/page.tsx` | wizard 진입 버튼 1개 |
| Create | `apps/web/test/manage/interview-rounds/round-wizard.test.tsx` | wizard 흐름 9건 |

**백엔드 계약 참조 (구현 시 이 파일들을 읽고 1:1 매핑 — 필드명·타입이 정답):**

| FE 타입/메서드 | 백엔드 파일 |
|---|---|
| `InterviewRoundCandidate` | `controller/dto/response/RoundCandidateResponse.java` (BE#2) |
| `InterviewRoundSummary` | `controller/dto/response/RoundSummaryResponse.java` (BE#6) |
| `InterviewRoundDetail` | `controller/dto/response/RoundDetailResponse.java` (BE#6 — counts·members·slots 중첩) |
| `CreateInterviewRoundPayload`/`CreateRoundResponse` | `controller/dto/request/CreateInterviewRoundRequest.java`·`response/CreateRoundResponse.java` (BE#3) |
| `CreateRoundSlotsPayload`/`CreateRoundSlotsResponse` | `request/CreateInterviewSlotsRequest.java`·`response/CreateInterviewSlotsResponse.java` (BE#4) |
| `UpdateInterviewRoundPayload` | `request/UpdateInterviewRoundRequest.java` (BE#12) |
| `AvailabilityRequestResponse` | `response/AvailabilityRequestResponse.java` (BE#5 — `notifiedMemberCount`) |
| URL 경로 | `api/LeaderInterviewRoundApi.java`·`LeaderInterviewSlotApi.java` |

커밋 2개: ① 데이터 레이어 ② wizard UI.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/interview-round-wizard
```

---

### Task 2: 데이터 레이어 (타입 → 클라이언트 → 쿼리키 → 훅) + 테스트

**Files:** File Map 의 packages 6개.

- [ ] **Step 1: 타입** — `packages/types/src/interviewRound.ts` 신규. **백엔드 DTO 를 읽고 1:1** (아래는 형태 골격 — 필드는 백엔드가 정답):

```typescript
// 면접 라운드 (재설계) — 백엔드 DTO 1:1 수동 정의.
// generated/schema.d.ts 가 stale 이라(재생성은 live 서버 필요 — 별도 chore) 직접 정의한다.
// 각 타입의 출처: backend/src/main/java/com/duing/domain/interview/controller/dto/

export type RoundStatus = 'DRAFT' | 'COLLECTING' | 'ASSIGNING' | 'SCHEDULED' | 'CANCELLED';
export type RoundMemberStatus = 'INVITED' | 'RESPONDED' | 'NO_AVAILABLE_SLOT' | 'ASSIGNED' | 'EXCLUDED';

// = RoundCandidateResponse (BE#2)
export type InterviewRoundCandidate = { /* 백엔드 필드 1:1 */ };

// = RoundSummaryResponse (BE#6)
export type InterviewRoundSummary = { /* roundId, title, status, availabilityDeadline, location, totalMemberCount, respondedMemberCount */ };

// = RoundDetailResponse (BE#6 — Counts/Member/Slot 중첩 포함)
export type InterviewRoundDetail = { /* 중첩 타입 포함 1:1 */ };

// = CreateInterviewRoundRequest / CreateRoundResponse (BE#3)
export type CreateInterviewRoundPayload = { title: string; availabilityDeadline?: string; location?: string; applicationIds: number[] };
export type CreateInterviewRoundResult = { /* roundId ... */ };

// = CreateInterviewSlotsRequest / CreateInterviewSlotsResponse (BE#4)
export type CreateRoundSlotsPayload = { slots: { startTime: string; endTime: string; capacity: number }[] };
export type CreateRoundSlotsResult = { createdSlotIds: number[]; reinvitedMemberCount: number };

// = UpdateInterviewRoundRequest (BE#12 — 부분 수정, null/undefined = 무변경)
export type UpdateInterviewRoundPayload = { title?: string; location?: string; availabilityDeadline?: string };

// = AvailabilityRequestResponse (BE#5)
export type AvailabilityRequestResult = { notifiedMemberCount: number };
```

`packages/types/src/index.ts` 에 export 추가.

- [ ] **Step 2: 클라이언트** — `packages/api/src/client.ts` 의 `DuingApiClient` 타입과 구현에 신규 그룹 추가 (기존 `jsonOk`/`jsonVoid`/그룹 패턴 그대로, 경로는 `LeaderInterviewRoundApi`/`LeaderInterviewSlotApi` 가 정답):

```typescript
  interviewRounds: {
    candidates: (recruitmentId: number, includeUnderReview: boolean) =>
      jsonOk<InterviewRoundCandidate[]>(http.get(
        `leader/recruitments/${recruitmentId}/interview-round-candidates`,
        { searchParams: { includeUnderReview } })),
    list: (recruitmentId: number) =>
      jsonOk<InterviewRoundSummary[]>(http.get(`leader/recruitments/${recruitmentId}/interview-rounds`)),
    detail: (roundId: number) =>
      jsonOk<InterviewRoundDetail>(http.get(`leader/interview-rounds/${roundId}`)),
    create: (recruitmentId: number, payload: CreateInterviewRoundPayload) =>
      jsonOk<CreateInterviewRoundResult>(http.post(
        `leader/recruitments/${recruitmentId}/interview-rounds`, { json: payload })),
    update: (roundId: number, payload: UpdateInterviewRoundPayload) =>
      jsonVoid(http.patch(`leader/interview-rounds/${roundId}`, { json: payload })),
    cancel: (roundId: number) =>
      jsonVoid(http.post(`leader/interview-rounds/${roundId}/cancel`)),
    createSlots: (roundId: number, payload: CreateRoundSlotsPayload) =>
      jsonOk<CreateRoundSlotsResult>(http.post(`leader/interview-rounds/${roundId}/slots`, { json: payload })),
    deleteSlot: (slotId: number) =>
      jsonVoid(http.delete(`leader/interview-slots/${slotId}`)),
    requestAvailability: (roundId: number) =>
      jsonOk<AvailabilityRequestResult>(http.post(`leader/interview-rounds/${roundId}/request-availability`)),
  },
```

- [ ] **Step 3: 쿼리키 + 훅** — `interviewRoundQueryKeys.ts`:

```typescript
export const interviewRoundKeys = {
  all: ['interview-rounds'] as const,
  list: (recruitmentId: number) => [...interviewRoundKeys.all, 'list', recruitmentId] as const,
  detail: (roundId: number) => [...interviewRoundKeys.all, 'detail', roundId] as const,
  candidates: (recruitmentId: number) => [...interviewRoundKeys.all, 'candidates', recruitmentId] as const,
};
```

`interviewRound.ts` 훅 10개 (기존 훅 파일 패턴 — `useApiClient`+`useQueryClient`):
- `useInterviewRoundCandidatesQuery(recruitmentId, includeUnderReview)` — 키에 includeUnderReview 포함 (`[...candidates(id), includeUnderReview]`)
- `useInterviewRoundsQuery(recruitmentId)` / `useInterviewRoundDetailQuery(roundId, { enabled })`
- `useCreateInterviewRoundMutation(recruitmentId)` → invalidate list+candidates
- `useUpdateInterviewRoundMutation(recruitmentId, roundId)` → invalidate detail+list
- `useCancelInterviewRoundMutation(recruitmentId, roundId)` → invalidate list+candidates (§10.1 — 재큐잉)
- `useCreateRoundSlotsMutation(roundId)` → invalidate detail
- `useDeleteRoundSlotMutation(roundId)` → invalidate detail
- `useRequestAvailabilityMutation(recruitmentId, roundId)` → invalidate detail+list

`packages/hooks/src/index.ts` export 추가.

- [ ] **Step 4: 테스트** — `packages/api/test/interviewRound.test.ts` (기존 interview.test.ts 패턴): ① candidates 가 searchParams 포함 정확 URL GET ② create 가 정확 URL+body POST ③ requestAvailability 가 data 언래핑. `packages/hooks/test/interviewRound.test.tsx`: ① createRound 성공 시 list+candidates invalidate ② cancel 성공 시 list+candidates invalidate.

- [ ] **Step 5: 검증 + 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm typecheck && pnpm --filter @duing/api test && pnpm --filter @duing/hooks test
cd .. && git add frontend && git commit -m "feat(web): 면접 라운드 데이터 레이어 — 타입·클라이언트·훅"
```

---

### Task 3: wizard 테스트 (RED)

**Files:**
- Create: `apps/web/test/manage/interview-rounds/round-wizard.test.tsx`

- [ ] **Step 1: 흐름 테스트 9건 작성** (기존 manage 테스트 패턴 — ApiClientProvider+QueryClientProvider wrapper, MSW server.use, `RoundWizard` 직접 렌더 with props `{ clubId, recruitmentId }`):

1. `후보 목록이 서류 검토 중과 면접 대기 그룹으로 나뉘어 보인다` — includeUnderReview=true 기본, MSW 가 UNDER_REVIEW 1·INTERVIEW_PENDING 1 반환 → 그룹 헤더 2개 + 상태 뱃지.
2. `서류 검토 중 포함 토글을 끄면 대기열만 다시 조회한다` — 토글 off → includeUnderReview=false 요청 캡처.
3. `후보를 선택하지 않으면 다음 단계로 갈 수 없다` — 선택 0 → [다음] disabled, 선택 1 → enabled + 카운터 "1명 선택".
4. `라운드 생성 시 선택한 지원자와 입력값이 그대로 전송되고 서류 검토 중 전환 경고가 보인다` — Step2 진입, UNDER_REVIEW 포함 선택이면 경고 문구(N명 전환) 노출, 제출 → MSW 캡처 body `{title, availabilityDeadline, applicationIds}` 일치 단언.
5. `라운드 생성 후 슬롯 단계에서 패턴으로 슬롯을 일괄 생성한다` — Step3, 패턴 입력(날짜·시간 범위·간격·capacity) → [슬롯 생성] → MSW 캡처 slots 배열에 capacity 포함 단언 + 상세 재조회.
6. `발송 조건이 충족되지 않으면 발송 버튼이 비활성이고 사유가 보인다` — 상세 MSW 가 슬롯 0 반환 → disabled + "슬롯을 1개 이상 등록" 사유 텍스트.
7. `발송하면 알림 인원수와 함께 완료 화면이 보인다` — 조건 충족 상세 → [발송] → MSW `{notifiedMemberCount: 3}` → "3명에게 알림" 완료 화면.
8. `기존 DRAFT 라운드가 있으면 이어하기와 폐기를 선택할 수 있다` — list MSW 에 DRAFT 1건 → 다이얼로그 노출, [이어하기] → Step2 프리필(제목 표시).
9. `폐기를 선택하면 라운드가 취소되고 후보 선정부터 시작한다` — [폐기] → cancel POST 캡처 + Step1 노출.

- [ ] **Step 2: RED 확인** — `pnpm --filter web test 2>&1 | tail -10` → 신규 파일 FAIL (컴포넌트 부재). **커밋하지 않는다.**

---

### Task 4: wizard 구현 (GREEN)

**Files:** File Map 의 apps/web 신규 9개 + page.tsx 수정.

- [ ] **Step 1: 패턴 유틸 복제·개조** — 구 면접 페이지의 `generateSlotsFromPattern`(탐색 보고: `apps/web/components/interview/_utils/` 또는 구 interview `_components` — grep 으로 위치 확인) 을 `rounds/new/_utils/generateSlotsFromPattern.ts` 로 복제, 시그니처를 `{ date, startTime, endTime, durationMinutes, capacity }` → `{ startTime, endTime, capacity }[]` 로 개조 (capacity 필수). 단위 로직은 기존이 정답.

- [ ] **Step 2: 컴포넌트 트리 구현** — 모든 컴포넌트 `'use client'`, manage 톤(slate 텍스트·sky 활성·purple CTA·rose 에러) 기존 클래스 재사용:

`RoundWizard.tsx` (컨테이너) — 핵심 로직:

```tsx
const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
const [selectedApplicationIds, setSelectedApplicationIds] = useState<number[]>([]);
const [roundId, setRoundId] = useState<number | null>(null);
const roundsQuery = useInterviewRoundsQuery(recruitmentId);
const draftRound = roundsQuery.data?.find((round) => round.status === 'DRAFT') ?? null;
// DRAFT 감지 다이얼로그: roundId 가 아직 없고 draftRound 가 있으면 노출 (§10.3 — 이어하기/폐기 둘 다 UI).
// 이어하기 → setRoundId(draftRound.roundId); setStep(2);  폐기 → cancel.mutateAsync 후 Step1.
// step 2 진입 조건: roundId == null 이면 "생성 모드"(selectedApplicationIds 필요), 있으면 "이어하기 모드"(detailQuery 프리필 + PATCH 저장).
// step 3·4 는 roundId 필수 — detailQuery(roundId) 가 단일 진실 (멤버 수·슬롯·deadline).
```

`Step1Candidates.tsx` — `useInterviewRoundCandidatesQuery(recruitmentId, includeUnderReview)` (기본 true — 정기 wizard 진입 §10.3), 그룹 헤더 2개(`서류 검토 중`/`면접 대기`), 행 checkbox + 전체 선택, 상태 뱃지(`bg-amber-100 text-amber-700`/`bg-purple-100 text-purple-700` — applicants 화면 상수 재사용 가능하면 import), 하단 카운터 + [다음] (선택 0 → disabled).

`Step2RoundForm.tsx` — title(text, 필수)·availabilityDeadline(`datetime-local`, 필수 입력 강제 — 발송 조건의 사전 충족)·location(text, 선택). 생성 모드: UNDER_REVIEW 선택 수 N>0 이면 안내 `서류 검토 중 지원자 N명은 생성 즉시 면접 대상(INTERVIEW_PENDING)으로 전환됩니다` → `useCreateInterviewRoundMutation` → `setRoundId(result.roundId)` → Step3. 이어하기 모드: detail 프리필, 변경분만 `useUpdateInterviewRoundMutation`(무변경이면 호출 생략) → Step3. ApiError 메시지는 role="alert" 노출 (apply 패턴).

`Step3Slots.tsx` — `SlotPatternForm`(복제본: 날짜·시작·종료·면접시간(분)·capacity 입력) + 미리보기 목록 + [슬롯 생성] = `useCreateRoundSlotsMutation`. 생성된 슬롯은 `detailQuery.data.slots` 렌더 + 행별 [삭제](`useDeleteRoundSlotMutation` — 참조 있으면 서버 409 메시지 노출). [다음] → Step4.

`Step4Review.tsx` — detail 기준 요약(제목·마감·장소·멤버 N·슬롯 M) + 발송 조건 3종 체크리스트(미충족 항목 rose 텍스트) + [발송] (조건 미충족 disabled) → `useRequestAvailabilityMutation` → 완료 화면(`{notifiedMemberCount}명에게 면접 가능시간 요청을 보냈습니다` + `면접 관리로` 링크 — `toRoute` 로 interview/ 경로).

`WizardStepper.tsx` — 기존 `InterviewProgressStepper` 패턴 4단계 라벨 `['대상 선정', '라운드 정보', '슬롯 등록', '검토·발송']`.

`DraftResumeDialog.tsx` — `BulkPromoteDialog` 모달 패턴 (role="alertdialog"): "작성 중인 라운드가 있습니다 — {title}" + [이어하기]/[폐기하고 새로 만들기].

`rounds/new/page.tsx` — 서버 컴포넌트: params 추출 후 `<RoundWizard clubId recruitmentId />`.

- [ ] **Step 3: 진입 버튼** — 기존 `interview/page.tsx` 헤더 영역에 `rounds/new` Link 버튼 1개 추가 (`새 면접 라운드 만들기` — 기존 CTA 클래스). 다른 변경 금지.

- [ ] **Step 4: GREEN 확인** — `pnpm --filter web test` → wizard 9건 포함 전체 PASS.

---

### Task 5: 전체 검증 + 커밋

- [ ] **Step 1:** (pipefail 필수)

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
set -o pipefail
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: 4 게이트 전부 성공 — **각 명령의 exit code 를 개별 확인** (파이프로 가리지 말 것).

- [ ] **Step 2:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend
git commit -m "feat(web): 면접 라운드 생성 wizard — 선정·정보·슬롯·발송 4단계"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [ ] **Step 1: self-check** (금지 라인·EOF — repo 루트에서·계획 외 변경·pipefail 게이트 재확인)

- [ ] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/interview-round-wizard
gh pr create --base develop --title "feat(web): 면접 라운드 생성 wizard" --body "$(cat <<'EOF'
## 🚀 작업 내용

운영진이 면접 라운드를 만드는 4단계 wizard 입니다 — 대상 선정(서류 검토 중·면접 대기 그룹, 일괄 선택) → 라운드 정보(제목·마감·장소, 첫 저장이 일어나는 단계라 "서류 검토 중 N명이 면접 대상으로 전환됩니다"를 명시) → 슬롯 등록(패턴 일괄 생성, 정원 필수) → 검토·발송(조건 3종 체크리스트, 충족 시에만 발송). 발송 버튼 활성 조건은 서버 가드와 1:1 입니다.

모집당 작성 중(DRAFT) 라운드는 하나뿐이라, wizard 진입 시 기존 DRAFT 가 있으면 이어하기/폐기를 모두 선택지로 띄웁니다 — 이어하기는 라운드 정보 단계부터(마감 미설정 DRAFT 의 자연 구제 경로), 폐기는 취소 API 로 멤버를 대기열에 돌려보냅니다.

신규 백엔드 계약의 데이터 레이어(타입·클라이언트 그룹·쿼리키·훅 10개)를 함께 깔았고, 무효화 규칙(생성·폐기 → 목록+대기열, 슬롯 → 상세 등)은 설계 문서 §10.1 그대로입니다.

## 🤔 고민했던 내용

- OpenAPI 타입 재생성(pnpm gen:api)은 live 백엔드가 필요한데 로컬 기동 인프라가 없어 이번엔 보류하고, 신규 타입을 백엔드 DTO 와 1:1 수동 정의했습니다(출처 주석 포함). 백엔드를 띄울 수 있는 환경에서 별도 chore 로 재생성·별칭 교체가 필요합니다.
- 구 면접 관리 화면과 데이터 레이어는 건드리지 않고 신규 그룹으로 공존시켰습니다 — 구 화면 철거·재배선은 FE#3/4 범위입니다. 슬롯 패턴 폼은 구 컴포넌트를 wizard 쪽으로 복제·개조했습니다(구 페이지 삭제 시 wizard 가 깨지지 않도록).
- Step1 은 어떤 커밋도 일어나지 않는 안전 구역입니다 — 첫 persist 와 상태 전이가 Step2 제출 한 곳에 모입니다.

## 💬 리뷰 중점사항

- 무효화 규칙이 §10.1 매트릭스와 일치하는지 (특히 폐기 → 대기열 포함).
- Step2 의 전환 경고·이어하기 모드 분기.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §10.1~10.3·§12 FE#2
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §10.2 라우트(`rounds/new`) → Task 4, §10.3 전부 — DRAFT 감지(이어하기/폐기 둘 다)·Step1 ephemeral·Step2 부수효과 명시·Step3 패턴 재사용+capacity 필수·Step4 조건 1:1·후보 필터 UX(기본 true+토글+그룹 헤더+뱃지+카운터+일괄선택) → Step 컴포넌트들+테스트 1·2·3·4·6·8·9, §10.1 쿼리키·invalidation → Task 2 Step 3.
- **플레이스홀더**: 타입 골격의 `/* 백엔드 필드 1:1 */` 는 의도된 위임 — 백엔드 DTO 파일이 단일 진실이고 참조 표를 제공 (계획이 필드를 복사하면 오히려 drift 위험).
- **타입 일관성**: 클라이언트 메서드명 ↔ 훅 내 호출 ↔ 테스트 캡처 URL 일치, `interviewRoundKeys` 명칭이 훅·테스트에서 일관.
- **주의 메모**: ① 백엔드 응답 envelope 는 `{ok, data, message}` — jsonOk 가 처리 (기존 그대로). ② datetime-local 값은 초 없는 `YYYY-MM-DDTHH:mm` — 백엔드 LocalDateTime 파싱 호환 확인, 필요시 `:00` 패딩 (구 코드의 localDateTime 헬퍼 참조). ③ candidates 응답 필드명(특히 이름 필드)은 RoundCandidateResponse 가 정답 — 테스트 MSW 픽스처도 동일하게. ④ Step3 슬롯 삭제 409(참조 존재)는 서버 메시지 그대로 노출 (마감 후 응답 시작되면 발생 가능 — wizard 단계에선 보통 미발생). ⑤ `pnpm test` 전체 그린 필수 — 구 화면 테스트가 깨지면 공용 코드를 건드렸다는 신호로 BLOCKED.
