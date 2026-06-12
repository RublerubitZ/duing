# FE#4 — 지원자 면접 응답 UI + Stepper 재배선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 6 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 지원자가 발송받은 면접 라운드에 응답하는 UI — 마이페이지 지원 상세에서 **applicantPhase 만 소비**해 면접 카드(슬롯 선택/가능없음/내 응답/확정 일정)와 stepper 안내를 렌더하고, 구 모델 기반 dead 코드를 정리한다 (스펙 §9.2·§9.3·§10.6·§12 FE#4).

**Architecture:** SSOT 원칙의 FE 절반 — **phase 를 재파생하지 않고 그대로 분기**한다(§9.3 "FE 재파생 금지"). 신규 `client.applicantInterview` 그룹(view/respond) + `myInterview(applicationId)` 쿼리키(§10.1). 상세 모달이 phase 를 한 번 조회해 stepper(단계·안내 문구)와 신규 `ApplicantInterviewCard`(phase 분기 카드)에 주입. 응답 모달은 기존 `SlotPickerByDateGroup`(FE#1 이 남겨둔 재료) 재사용 + "가능한 시간 없음" XOR 토글. 구 지원자 면접 데이터 흐름(슬롯 조회·가능시간 조회/수정·일정 조회 훅과 클라이언트 메서드·`EditAvailabilityModal`·`InterviewScheduleCard`·`deriveStepperSubState`)은 **이 PR 에서 삭제** — 유일 사용처가 전부 교체된다.

**Tech Stack:** Next.js 15 / React 19 / TanStack Query / Vitest + MSW

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §9.2 API 13·14·§9.3·§10.1·§10.6 / 백엔드 계약: `ApplicantInterviewResponse.java`(BE#7)·`RespondInterviewAvailabilityRequest.java`(BE#8)·`ApplicantInterviewApi.java`
**리뷰 정책:** duing-code-reviewer(frontend/CLAUDE.md) + codex 기본 (+ EXCLUDED 누출·phase 전수 분기 중점)

---

## 핵심 결정

1. **phase 분기 단일 모듈**: `_utils/interviewPhaseGuide.ts` — `phase → { stepIndex, title, description }` 순수 매핑 (stepper 와 카드가 공용). 10개 phase 전수 매핑을 단위 테스트로 고정. **재파생 없음** — 입력은 서버 phase 뿐이고 마감 비교는 "재응답 버튼 노출" 한 곳에만 (서버 409 가 최종 가드).
2. **stepper 활성 단계 = phase 우선**: NOT_APPLICABLE 이면 기존 status 분기 fallback(SUBMITTED 0 / ACCEPTED·REJECTED 4), 그 외 phase 가 결정 — DOCUMENT_REVIEW→1, {WAITING_*, AVAILABILITY_*, RESPONDED, NO_SLOT_REPORTED, SCHEDULING}→2, SCHEDULED→3. `deriveStepperSubState.ts` 와 그 테스트는 삭제(구 파생 — SSOT 위반물).
3. **카드 노출 범위**: AVAILABILITY_REQUESTED·AVAILABILITY_CLOSED·RESPONDED·NO_SLOT_REPORTED·SCHEDULING·SCHEDULED 만 카드 렌더 — 그 이전 단계(서류·대기)는 stepper 문구가 담당, NOT_APPLICABLE 은 양쪽 다 숨김 (§9.3 경계).
4. **응답 모달 = `RespondAvailabilityModal` 신규** (구 EditAvailabilityModal 삭제·대체): slots(`selected` 프리필) → SlotPickerByDateGroup, "가능한 시간이 없어요" 토글 ON 시 피커 비활성 + textarea(선택, 500자) — **XOR 을 UI 구조로 강제**. 저장 payload: 토글 OFF `{slotIds}` / ON `{noAvailableSlot: true, alternativeText?}`. 400/409 는 인라인 에러(서버 메시지).
5. **재응답 노출 규칙**: RESPONDED·NO_SLOT_REPORTED 카드의 [변경하기] 는 `availabilityDeadline` 이 미래일 때만 (phase 는 마감 후에도 RESPONDED 유지 — §9.3). AVAILABILITY_REQUESTED 는 항상 [시간 선택하기] (phase 자체가 마감 전 의미).
6. **dead code 동시 삭제** (유일 사용처 교체 — 탐색으로 확인): 훅 4(`useApplicantInterviewSlotsQuery`·`useInterviewAvailabilitiesQuery`·`useMyInterviewScheduleQuery`·`useUpdateInterviewAvailabilitiesMutation`) + client 메서드 4(`applicantSlots`·`getAvailabilities`·`updateAvailabilities`·`mySchedule`) + 쿼리키(`applicantSlots`·`availabilities`·`mySchedule`) + 컴포넌트 2(`EditAvailabilityModal`·`InterviewScheduleCard`) + `deriveStepperSubState.ts` + 각 테스트. 관련 구 타입(`ApplicantInterviewSlot` 등)은 `SlotPickerByDateGroup` props 가 의존하면 유지 — props 를 신 `SelectableSlot` 호환 구조로 보고 판단(구조 호환이면 타입만 교체).
7. **알림 타입**: `NotificationType` 에 `INTERVIEW_AVAILABILITY_REQUESTED` 추가 + 타입별 라벨/아이콘 매핑 지점(grep 으로 확인) 분기 추가 — linkUrl 은 백엔드가 `/me/applications/{id}` 로 보냄(기존 리스너) → 추가 라우팅 작업 없음.
8. **목록(ApplyRow)·`ApplicationSummary.interview` 는 미접촉** — 백엔드가 round 기반으로 재작성한 배정 일정 필드라 동작 중. 운영진 측 `ApplicantInterviewScheduleCard`(leader 지원자 상세) 재배선은 FE#3 dashboard 와 함께 (§10.6 의 잔여분 — PR 본문 명시).
9. **타입은 BE DTO 1:1 수동** (FE#2 전례·regen 보류 동일): `ApplicantInterviewView`(phase·deadline·slots[SelectableSlot]·myAlternativeText·scheduledInterview) ← `ApplicantInterviewResponse.java`, `RespondAvailabilityPayload` ← `RespondInterviewAvailabilityRequest.java`.

## File Map

| 구분 | 파일 | 책임 |
|---|---|---|
| Create | `packages/types/src/applicantInterview.ts` (+index export) | phase union·view·payload (BE 1:1) |
| Modify | `packages/api/src/client.ts` | `applicantInterview` 그룹 (view GET·respond PUT) + 구 메서드 4 삭제 |
| Modify | `packages/hooks/src/interviewRoundQueryKeys.ts` | `myInterview(applicationId)` 키 |
| Create | `packages/hooks/src/applicantInterview.ts` (+index export) | `useMyInterviewQuery`·`useRespondAvailabilityMutation`(invalidate myInterview) |
| Modify | `packages/hooks/src/interview.ts`·`interviewQueryKeys.ts` | 구 지원자 훅 4·키 3 삭제 |
| Modify | `packages/types/src/notification.ts` | `INTERVIEW_AVAILABILITY_REQUESTED` |
| Modify | 알림 타입 매핑 컴포넌트 (grep) | 라벨·아이콘 분기 |
| Create | `apps/web/app/me/applications/[applicationId]/_utils/interviewPhaseGuide.ts` | phase 전수 매핑 |
| Create | `.../_components/ApplicantInterviewCard.tsx` / `RespondAvailabilityModal.tsx` | phase 카드·응답 모달 |
| Modify | `.../_components/ApplicationStepper.tsx` | phase 기반 재배선 |
| Modify | `apps/web/app/me/applications/_components/ApplyDetailModal.tsx` | `useMyInterviewQuery` 주입·카드 교체 |
| Delete | `EditAvailabilityModal.tsx`·`InterviewScheduleCard.tsx`·`_utils/deriveStepperSubState.ts` + 테스트 3 | 구 모델 |
| Create/Modify | 테스트: `interviewPhaseGuide.test.ts`(전수)·`applicant-interview-card.test.tsx`(~10)·`ApplicationStepper.test.tsx`(재작성)·api/hooks 테스트 | |

커밋 2개: ① 데이터 레이어(타입·클라이언트·훅·알림 타입) ② 카드·stepper 재배선 + dead 정리.

---

### Task 1: 브랜치 생성

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b feat/applicant-interview-response
```

---

### Task 2: 데이터 레이어 + 알림 타입 (커밋 ①)

- [ ] **Step 1: 타입** — `packages/types/src/applicantInterview.ts` 신규, **`ApplicantInterviewResponse.java`(BE#7)·`RespondInterviewAvailabilityRequest.java`(BE#8) 를 읽고 1:1** (LocalDateTime→string, nullable→`| null`):

```typescript
// 지원자 면접 진행 — 백엔드 BE#7/8 DTO 1:1 수동 정의 (regen 보류 — FE#2 전례).
export type ApplicantInterviewPhase =
  | 'NOT_APPLICABLE' | 'DOCUMENT_REVIEW' | 'WAITING_ROUND' | 'WAITING_NEXT_ROUND'
  | 'AVAILABILITY_REQUESTED' | 'AVAILABILITY_CLOSED' | 'RESPONDED'
  | 'NO_SLOT_REPORTED' | 'SCHEDULING' | 'SCHEDULED';

// = ApplicantInterviewResponse (중첩 SelectableSlot·ScheduledInterview 포함 — 백엔드가 정답)
export type ApplicantInterviewView = { /* 1:1 */ };

// = RespondInterviewAvailabilityRequest — XOR 계약은 호출부가 보장
export type RespondAvailabilityPayload =
  | { slotIds: number[] }
  | { noAvailableSlot: true; alternativeText?: string };
```

- [ ] **Step 2: 클라이언트** — `client.ts` 에 신규 그룹 (경로는 `ApplicantInterviewApi.java` 가 정답):

```typescript
  applicantInterview: {
    view: (applicationId: number) =>
      jsonOk<ApplicantInterviewView>(http.get(`applications/${applicationId}/interview`)),
    respond: (applicationId: number, payload: RespondAvailabilityPayload) =>
      jsonVoid(http.put(`applications/${applicationId}/interview-availability`, { json: payload })),
  },
```

동시에 구 메서드 4 삭제(`applicantSlots`·`getAvailabilities`·`updateAvailabilities`·`mySchedule`) — **이 시점엔 사용처가 남아 typecheck 가 깨지므로, 삭제는 커밋 ② 로 미루고 여기선 추가만** 한다 (커밋 ① 은 추가 전용 — 빌드 그린 유지).

- [ ] **Step 3: 쿼리키·훅** — `interviewRoundQueryKeys.ts` 에 `myInterview: (applicationId) => [...interviewRoundKeys.all, 'my-interview', applicationId]` 추가. `packages/hooks/src/applicantInterview.ts` 신규:

```typescript
export function useMyInterviewQuery(applicationId: number, options?: { enabled?: boolean }) { /* queryFn: client.applicantInterview.view */ }

export function useRespondAvailabilityMutation(applicationId: number) {
  // onSuccess: invalidate interviewRoundKeys.myInterview(applicationId)
  //            + applicationQueryKeys.myDetail(applicationId)  // 상세의 잔여 면접 필드 동기화
}
```

- [ ] **Step 4: 알림 타입** — `notification.ts` union 에 `'INTERVIEW_AVAILABILITY_REQUESTED'` 추가, 알림 렌더 컴포넌트의 타입별 매핑(grep `INTERVIEW_SCHEDULED` 로 위치 확인)에 라벨(예: "면접 시간 선택 요청") 분기 추가 — 기존 매핑 스타일이 정답.

- [ ] **Step 5: 테스트 + 커밋** — api 테스트 2건(view 언래핑·respond XOR body 캡처 2형), hooks 테스트 1건(respond 성공 시 myInterview invalidate).

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm typecheck && pnpm --filter @duing/api test && pnpm --filter @duing/hooks test
cd .. && git add frontend && git commit -m "feat(web): 지원자 면접 진행 데이터 레이어 — phase 조회·응답"
```

---

### Task 3: 카드·stepper 테스트 (RED)

- [ ] **Step 1: `interviewPhaseGuide.test.ts`** — 10 phase 전수: 각 phase 의 stepIndex·문구 존재, NOT_APPLICABLE 은 guide null.

- [ ] **Step 2: `applicant-interview-card.test.tsx`** (~10건, MSW — view 픽스처를 phase 별 교체):

1. `응답 요청 단계에서는 마감과 함께 시간 선택 버튼이 보인다`
2. `시간 선택 모달에서 슬롯을 고르고 저장하면 선택한 슬롯이 그대로 전송된다` — body 캡처 `{slotIds:[...]}` + `noAvailableSlot` 부재
3. `가능한 시간이 없어요를 켜면 슬롯 피커가 비활성화되고 사유와 함께 전송된다` — 캡처 `{noAvailableSlot:true, alternativeText}` + `slotIds` 부재
4. `이미 응답한 경우 내가 고른 시간들이 보이고 마감 전이면 변경하기가 보인다` — slots selected 프리필 단언 포함
5. `마감이 지난 응답 완료 카드에는 변경하기가 없다` (deadline 과거 픽스처)
6. `가능없음으로 응답한 경우 내 사유가 보인다`
7. `마감된 미응답 카드는 마감 안내를 보여준다` (AVAILABILITY_CLOSED)
8. `배정 검토 중에는 조율 중 안내가 보인다` (SCHEDULING)
9. `확정되면 일시와 장소가 보인다` (SCHEDULED + scheduledInterview)
10. `응답 저장이 거부되면 서버 메시지가 모달 안에 보인다` (409 — 모달 유지)

- [ ] **Step 3: `ApplicationStepper.test.tsx` 재작성** — phase 기반: DOCUMENT_REVIEW→1단계 활성, AVAILABILITY_REQUESTED→2단계+문구, SCHEDULED→3단계, NOT_APPLICABLE+ACCEPTED→4단계 (4건).

- [ ] **Step 4: RED 확인** — 신규·재작성분 FAIL. **커밋하지 않는다.**

---

### Task 4: 구현 + dead 정리 (GREEN)

- [ ] **Step 1: `interviewPhaseGuide.ts`** — phase 전수 매핑 (NOT_APPLICABLE → null):

```typescript
export type InterviewPhaseGuide = { stepIndex: 1 | 2 | 3; title: string; description: string };
export function getInterviewPhaseGuide(phase: ApplicantInterviewPhase): InterviewPhaseGuide | null {
  // DOCUMENT_REVIEW: {1, '서류 검토 중', '운영진이 서류를 검토하고 있습니다.'}
  // WAITING_ROUND: {2, '면접 회차 대기', '운영진이 면접 회차를 준비 중입니다.'}
  // WAITING_NEXT_ROUND: {2, '다음 회차 대기', '다음 면접 회차 안내를 기다리고 있습니다.'}
  // AVAILABILITY_REQUESTED: {2, '가능 시간 선택', '면접 가능 시간을 선택해 주세요.'}
  // AVAILABILITY_CLOSED: {2, '제출 마감', '가능 시간 제출이 마감되었습니다. 운영진과 별도 연락이 있을 수 있습니다.'}
  // RESPONDED: {2, '응답 완료', '가능 시간을 제출했습니다. 운영진이 일정을 배정 중입니다.'}
  // NO_SLOT_REPORTED: {2, '조율 요청됨', '가능한 시간이 없다고 응답했습니다. 운영진이 별도로 조율합니다.'}
  // SCHEDULING: {2, '배정 검토 중', '운영진이 면접 일정을 조율하고 있습니다.'}
  // SCHEDULED: {3, '일정 확정', '면접 일정이 확정되었습니다.'}
  // NOT_APPLICABLE: null
}
```

- [ ] **Step 2: `ApplicantInterviewCard.tsx`** — props `{ applicationId }`, `useMyInterviewQuery`, 핵심 결정 3 의 노출 범위·결정 5 의 재응답 규칙대로 분기 렌더. SCHEDULED 는 일시(`formatSlotRange` 재사용)·장소. 모달 상태 보유.

- [ ] **Step 3: `RespondAvailabilityModal.tsx`** — 기존 모달 a11y 패턴(role=dialog·esc·backdrop — 비파괴라 esc 닫기 허용), `SlotPickerByDateGroup` 재사용(slots 의 selected 로 초기 selectedSlotIds 구성), 가능없음 토글+textarea, 저장=`useRespondAvailabilityMutation`(XOR payload — 토글 상태가 결정), 에러 인라인.

- [ ] **Step 4: stepper 재배선** — `ApplicationStepper` props 에 `phase: ApplicantInterviewPhase | null` 추가(로딩 중 null → 기존 status fallback), 활성 인덱스·문구를 guide 로. `ApplyDetailModal` 이 `useMyInterviewQuery(openApplicationId, {enabled})` 호출해 stepper·카드에 주입, `InterviewScheduleCard` 호출부를 `ApplicantInterviewCard` 로 교체.

- [ ] **Step 5: dead 정리** — 핵심 결정 6 목록 전부 삭제 (컴포넌트 2·유틸 1·훅 4·클라이언트 메서드 4·쿼리키 3·테스트 3). `SlotPickerByDateGroup` 의 props 타입이 구 `ApplicantInterviewSlot` 의존이면 신 타입 호환 구조(`{slotId,startTime,endTime}` Pick)로 교체. 구 타입 중 사용처가 0 이 된 것(`MyInterviewAvailabilities`·`MyInterviewSchedule` 등)도 삭제. **grep 으로 각 삭제 대상의 잔존 참조 0 확인.**

- [ ] **Step 6: GREEN + 게이트** — 신규·재작성 테스트 PASS 후 (명령별 exit code):

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

---

### Task 5: 커밋 ②

- [ ] **Step 1:**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add frontend
git commit -m "feat(web): 지원자 면접 응답 카드·stepper 를 applicantPhase 기반으로 재배선"
```

---

### Task 6: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [ ] **Step 1: self-check** (금지 라인·EOF — repo 루트·계획 외 변경·게이트 4종)

- [ ] **Step 2: push + PR** (자동 머지 금지)

```bash
git push -u origin feat/applicant-interview-response
gh pr create --base develop --title "feat(web): 지원자 면접 응답 UI — applicantPhase 소비" --body "$(cat <<'EOF'
## 🚀 작업 내용

재설계 흐름의 지원자 절반입니다. 운영진이 라운드를 발송하면 지원자는 마이페이지 지원 상세에서 면접 카드를 만나게 됩니다 — 가능 시간 선택(날짜별 슬롯 피커), "가능한 시간이 없어요" 응답(사유 텍스트), 제출 후엔 내가 고른 시간 확인과 마감 전 변경, 마감·조율 중·확정(일시·장소)까지 단계별로 다른 카드를 보여줍니다. 진행 막대(stepper)의 면접 구간 안내 문구도 같은 데이터로 움직입니다.

핵심은 서버가 파생한 진행 단계(applicantPhase)를 **그대로 소비만** 한다는 점입니다 — 프론트는 상태를 재조합하지 않습니다(설계 문서의 단일 진실 원칙). 제외 처리 같은 내부 상태는 서버가 중립 단계로 가려서 내려주므로 화면 분기 어디에도 등장하지 않습니다.

구 모델의 지원자 면접 코드(슬롯 조회·가능시간 수정 모달·일정 카드·stepper 파생 유틸과 훅·클라이언트 메서드)는 사용처가 전부 교체되어 이 PR 에서 정리했습니다. 면접 시간 요청 알림 타입 매핑도 추가했습니다.

## 🤔 고민했던 내용

- "가능한 시간이 없어요"와 슬롯 선택은 서버 계약상 둘 중 하나만 보낼 수 있어, 토글을 켜면 피커가 비활성화되는 구조로 — 잘못된 조합이 UI 에서 만들어질 수 없게 했습니다.
- 변경하기 버튼의 마감 비교만 클라이언트에서 합니다(버튼 노출용) — 경계를 뚫고 눌러도 서버 409 메시지가 모달 안에 그대로 보입니다.
- 운영진 쪽 지원자 상세의 면접 카드 재배선은 FE#3(dashboard)와 함께 묶는 게 맞아 남겨뒀습니다.

## 💬 리뷰 중점사항

- phase 10종 전수 매핑(가이드 유틸)과 카드 노출 범위가 §9.3 과 1:1 인지.
- XOR payload 가 캡처 테스트로 고정됐는지, dead 코드 삭제의 잔존 참조가 0 인지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §9.2·§9.3·§10.1·§10.6·§12 FE#4
EOF
)"
```

Expected: PR URL. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §9.2 API 13(phase·슬롯+selected·마감·일정 소비)·API 14(XOR 응답·재응답) → 카드·모달+테스트 2·3·4, §9.3(재파생 금지·전수 phase) → guide 유틸+전수 테스트, §10.1(`my-interview` 키·invalidation) → Task 2, §10.6 재배선(stepper·EditAvailabilityModal·알림 매핑) → Task 4 (ApplicantInterviewScheduleCard 는 FE#3 — 결정 8).
- **플레이스홀더**: 타입 1:1 위임(FE#2 전례)과 guide 문구 주석은 의도된 명세 — 구현 코드가 주석 문구를 그대로 사용.
- **타입 일관성**: `ApplicantInterviewPhase`·`ApplicantInterviewView`·`RespondAvailabilityPayload` 명칭이 클라이언트·훅·컴포넌트·테스트에서 일관. 쿼리키는 기존 `interviewRoundKeys` 확장.
- **주의 메모**: ① `applicationQueryKeys.myDetail` invalidate 는 기존 키 실명 확인 후 사용. ② 백엔드 view 의 slots 는 COLLECTING 일 때만 non-null — 카드 분기에서 null 안전 처리. ③ 기존 `ApplicationStepper` 의 `now` prop SSR 결정성 패턴 유지. ④ dead 삭제 후 `pnpm test` 전체 그린 필수 — 다른 화면 테스트가 깨지면 삭제 범위 초과 신호로 BLOCKED.
