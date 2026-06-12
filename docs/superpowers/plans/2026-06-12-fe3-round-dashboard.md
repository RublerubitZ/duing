# FE#3 — 라운드 Dashboard + 구 면접 화면 철거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 7 은 리뷰 후 컨트롤러가 수행한다.**

**Goal:** `interview/rounds/[roundId]` dashboard — 상태 배너(단일 next action + **조기 배정 UX**), 카운트 카드, 멤버 테이블(파생 미응답·수동 배정·제외), 가능없음 전용 섹션, 슬롯 섹션, 배정 검토(재실행·수동 수정·**경고 2종 분리 확정 모달**), [재알림][마감 연장][취소] — 그리고 구 면접 관리 화면·잔여 dead 코드 전부 철거 (스펙 §10.4(조기 배정 UX 포함)·§10.5·§10.6·§12 FE#3).

**Architecture:** 데이터 레이어 → dashboard UI → 철거의 3 커밋. 핵심 인프라 변경 1건: **`ApiError` 에 `payload`(응답 body 의 data) 보존** — 현재 `toApiError`/`unwrap` 이 data 를 버려서 확정 409 의 경고 2종(`unresponded`/`respondedUnassigned`)을 렌더할 수 없다. 모든 화면 데이터는 BE#6 `detail`(이미 FE#2 데이터 레이어에 존재 — counts·members·slots·deadlinePassed) 단일 쿼리 + 액션 mutation 7종. 철거는 "유일 사용처 소멸" 원칙: 구 4단계 면접 관리 화면(언라우팅 상태)·구 operator 면접 훅·클라이언트 메서드·구 타입·FE#4 이월분(`applicantSlots` 키)을 일괄 제거하고 잔존 참조 0 을 grep 으로 증명.

**Tech Stack:** Next.js 15 / React 19 / TanStack Query / Vitest + MSW

**근거 스펙:** §10.1(invalidation)·§10.4(dashboard 구성 + 조기 배정 UX ①②③)·§10.5(가드레일 1:1)·§10.6(철거·재배선 잔여) / 백엔드 계약: `AutoAssignResponse`·`AssignScheduleRequest`·`ConfirmRoundResponse`·`UnresolvedMembersResponse`(BE#11 — 409 data)·`AvailabilityRequestResponse`·`UpdateInterviewSlotRequest` + `LeaderInterviewAssignmentApi`·`LeaderInterviewRoundApi`·`LeaderInterviewSlotApi`
**리뷰 정책:** duing-code-reviewer(frontend/CLAUDE.md) + codex 기본 (+ 확정 모달 payload·철거 잔존 중점)

---

## 핵심 결정

1. **`ApiError.payload` 추가** (`payload?: unknown` — `toApiError` 가 body.data 를 실어줌, 기존 시그니처 호환). 확정 mutation 의 409 처리에서 `UnresolvedMembersResponse` 형태로 좁혀(타입 가드 — `code === 'INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS'` 판별) 모달에 렌더. **as 금지 — 판별 함수 `isUnresolvedMembersPayload(value): value is ...` 작성.**
2. **클라이언트 확장 (interviewRounds 그룹)**: `autoAssign(roundId)`·`assignMemberSchedule(roundId, memberId, {slotId})`·`unassignMemberSchedule(roundId, memberId)`·`excludeMember(roundId, memberId)`·`confirm(roundId, force)`·`remind(roundId)`·`updateSlot(slotId, payload)` — 경로·메서드는 백엔드 Api 인터페이스 3종이 정답. 타입 신규: `AutoAssignResult`·`ConfirmRoundResult`·`UnresolvedMembersPayload`(BE DTO 1:1 — FE#2/4 전례).
3. **invalidation (§10.1)**: 제외·확정·취소 → `detail+list+candidates`(대기열 복귀), 자동배정·수동 배정/해제·재알림·슬롯 수정/삭제 → `detail`(+자동배정은 list 도 — 상태 전이). 훅 7종 신규.
4. **dashboard 구성 (§10.4)** — 컨테이너 `RoundDashboard` 가 `useInterviewRoundDetailQuery(roundId)` 단일 소스로 섹션에 분배:
   - `RoundStatusBanner`: 상태 한국어 + **단일 next action** (DRAFT→이어서 작성(wizard 링크) / COLLECTING→자동배정 또는 재알림 / ASSIGNING→확정 / SCHEDULED·CANCELLED→없음). **조기 배정 UX ①**: COLLECTING && `counts.invitedCount === 0` && 비EXCLUDED 멤버 ≥1 → 강조 배너 "전원 응답 완료 — 마감 전이지만 지금 배정할 수 있어요".
   - **조기 배정 UX ②**: [자동배정 실행] 은 COLLECTING·ASSIGNING 모두 노출(마감 무관 — 서버 1:1). COLLECTING && 미응답(invitedCount) N>0 이면 실행 전 확인 모달 "아직 응답하지 않은 N명은 배정에서 빠집니다". ASSIGNING 재실행은 "기존 배정이 다시 계산됩니다" 확인 모달(§6.2 — 수동 배정도 갈아엎음을 명시).
   - `RoundCountCards`: 응답완료·미응답(`deadlinePassed ? unrespondedCount : invitedCount` 라벨 구분 — 마감 전 "응답 대기"/후 "미응답")·가능없음·배정.
   - `RoundMemberTable`: 이름·학번·상태 뱃지(파생 미응답 강조)·선택 슬롯 수·배정 슬롯·행 액션([수동 배정] ASSIGNING 한정 → `MemberAssignModal`, [제외] → 확인 모달 — 사유 안내 "대기열로 복귀합니다").
   - `NoSlotSection`: NO_AVAILABLE_SLOT 멤버 alternativeText 목록 + [추가 슬롯 생성](슬롯 섹션 앵커/wizard Step3 패턴 재사용 아님 — 인라인 `SlotPatternForm` 복제본 재사용: wizard 의 것을 **공용 위치로 승격**해 양쪽 import — frontend/CLAUDE.md "두 곳 이상 사용 시 승격") + [제외].
   - `RoundSlotsSection`: 슬롯 행(시간·capacity·selectedCount/assignedCount) + DRAFT·COLLECTING 한정 [수정(capacity)]·[삭제](409 메시지 노출) + `SlotPatternForm` 으로 추가 생성(Rule 2 — 응답 중 추가 시 재초대 인원 토스트 `reinvitedMemberCount`).
   - `AssignmentReviewSection` (ASSIGNING): draft 배지 + 멤버별 배정 현황은 MemberTable 이 담당, 여기는 [자동배정 재실행]+[확정] 액션. **조기 배정 UX ③**: 확정 버튼 마감 무관.
   - `ConfirmRoundDialog`: [확정] → force=false 시도 → 409 payload 시 경고 2종 분리 렌더 — `unresponded`(상태 뱃지 포함)·`respondedUnassigned`(**강조** — 선택 슬롯 수 표시) + [강제 확정(미처리 N명 제외)] = force=true / 성공 시 "확정 완료 — N명 알림" 토스트.
   - 액션 바: [재알림](COLLECTING — 성공 토스트 `notifiedMemberCount`)·[마감 연장](COLLECTING — datetime 모달 → round PATCH, 연장만이라는 안내)·[라운드 취소](비터미널 — 확인 모달 "멤버는 대기열로 복귀합니다").
   - 랜딩(`InterviewRoundsLanding`) 비DRAFT 카드에 dashboard Link 연결 (FE#2 주석 해소).
5. **철거 (§10.6 + 이월분)** — 커밋 ③: 구 `interview/_components` 전부(`InterviewConfigSection`·`InterviewSlotSection`·`InterviewAutoAssignSection`·`InterviewScheduleManagementSection`·`AssignToSlotModal`·`SlotPatternForm`(구)·`SlotPreviewList`(구)·`InterviewProgressStepper` 등)·`_pages/InterviewManagementPage.tsx`·`_utils/deriveInterviewStep.ts`(구) + applicants 상세의 `ManualAssignModal`(dashboard 가 대체 — 호출부 버튼 제거) + 구 operator 훅·클라이언트(`interviews` 그룹 잔여 전체 — config/slots/schedules/autoAssign/assign/cancel/matching)·`interviewQueryKeys.ts` 전체·구 타입(`InterviewConfig`·`SlotListView`·`ScheduleListView` 등 — **`AvailabilityItem`·leader 지원자 상세가 쓰는 타입은 유지**)·관련 테스트. 각 삭제 전 잔존 참조 grep 0. `ApplicantInterviewScheduleCard`(leader)는 **백엔드가 계약을 유지해 동작 중 — 유지** (§10.6 재배선 불요 판정, PR 본문 명시).
6. **테스트**: 데이터 레이어(api 캡처 4·hooks invalidation 3 — 특히 확정 409 payload 보존) + dashboard ~14건 + 랜딩 링크 1건. 철거 커밋은 게이트 그린이 증명.

## File Map (요약 — 상세 경로는 기존 컨벤션)

| 커밋 | 구분 | 대상 |
|---|---|---|
| ① | Modify | `packages/api/src/client.ts` (ApiError.payload + 그룹 확장 7) / `packages/types/src/interviewRound.ts` (타입 3 + 판별 함수는 types 또는 api) / `packages/hooks/src/interviewRound.ts` (훅 7 + invalidation) / 테스트 2파일 확장 |
| ② | Create | `interview/rounds/[roundId]/page.tsx` + `_components/`: `RoundDashboard`·`RoundStatusBanner`·`RoundCountCards`·`RoundMemberTable`·`MemberAssignModal`·`NoSlotSection`·`RoundSlotsSection`·`AssignmentReviewSection`·`ConfirmRoundDialog`·액션 모달들 / `components/interview/SlotPatternForm` 승격(+wizard import 경로 수정) / 랜딩 링크 / `test/manage/interview-rounds/round-dashboard.test.tsx` |
| ③ | Delete | 핵심 결정 5 목록 전부 + 잔존 grep 0 |

---

### Task 1: 브랜치 생성

- [x] `git checkout develop && git pull origin develop && git checkout -b feat/interview-round-dashboard-ui`

### Task 2: 데이터 레이어 (커밋 ①)

- [x] **Step 1**: `ApiError` 에 `public readonly payload?: unknown` 추가(3번째 ctor 인자, 기존 호출 호환), `toApiError` 에서 `body.data` 전달. 기존 api 테스트 무회귀.
- [x] **Step 2**: 타입 — `AutoAssignResult`·`ConfirmRoundResult`·`UnresolvedMembersPayload`(+중첩 2) ← BE DTO 1:1 (각 `ConfirmRoundResponse.java`·`AutoAssignResponse.java`·`UnresolvedMembersResponse.java`). 판별 함수 `isUnresolvedMembersPayload` (code 리터럴+배열 존재 검사) — `packages/types` 에 동거.
- [x] **Step 3**: 클라이언트 7 메서드 (핵심 결정 2 — 경로는 백엔드 Api 3종 정답. confirm 은 `?force=` query). 훅 7종 + invalidation (핵심 결정 3).
- [x] **Step 4**: 테스트 — api: confirm 409 에서 `ApiError.payload` 에 data 보존 단언(MSW 409 + body)·autoAssign/exclude URL·body 캡처 / hooks: 확정·제외 invalidation(candidates 포함)·배정 invalidation(detail 만).
- [x] **Step 5**: `pnpm typecheck && pnpm --filter @duing/api test && pnpm --filter @duing/hooks test` → 커밋 `feat(web): 라운드 운영 데이터 레이어 — 배정·확정·제외 + ApiError payload`

### Task 3: dashboard 테스트 (RED)

- [x] **Step 1**: `round-dashboard.test.tsx` ~14건 (MSW detail 픽스처를 상태별 구성, 기존 wrapper 패턴):
1. `수집 중 dashboard 에 카운트 카드와 멤버 테이블이 보인다` (마감 전 — "응답 대기" 라벨)
2. `마감이 지나면 미응답 라벨과 파생 미응답 강조가 보인다` (deadlinePassed 픽스처)
3. `전원이 응답하면 조기 배정 배너가 보인다` (invitedCount 0)
4. `미응답자가 있는 채로 마감 전 자동배정을 누르면 N명 제외 경고 모달 후 실행된다` (확인 → POST 캡처)
5. `배정 검토 중 재실행은 재계산 경고 모달을 거친다`
6. `가능없음 멤버의 사유가 전용 섹션에 보인다`
7. `멤버를 제외하면 확인 모달 후 제외 요청이 간다` (POST 캡처)
8. `배정 검토 중 멤버에게 수동 배정 모달로 슬롯을 지정할 수 있다` (PUT 캡처 {slotId})
9. `확정이 거부되면 미응답·만석 두 그룹이 분리되어 보이고 강제 확정을 제안한다` (409 payload 픽스처 → 모달 렌더 → force=true 캡처)
10. `확정이 성공하면 알림 인원과 함께 완료된다` (200 → 토스트/배너)
11. `재알림 성공 시 발송 인원이 보인다`
12. `마감 연장 모달은 연장만 가능함을 안내하고 PATCH 를 보낸다` (캡처)
13. `라운드 취소는 대기열 복귀 안내 확인 후 실행된다`
14. `수집 중 슬롯 추가 생성 시 재초대 인원이 안내된다` (reinvitedMemberCount 토스트)
- [x] **Step 2**: 랜딩 테스트에 `진행 중 라운드 카드가 dashboard 로 링크된다` 1건 추가. RED 확인. **커밋 금지.**

### Task 4: dashboard 구현 (GREEN, 커밋 ②)

- [x] **Step 1**: `SlotPatternForm`·`generateRoundSlotsFromPattern` 을 `apps/web/components/interview/` 로 승격(wizard import 경로 수정 — 동작 무변경, wizard 테스트 그린 유지).
- [x] **Step 2**: 컨테이너+섹션 구현 (핵심 결정 4 명세 그대로 — 모달 a11y·cn()·manage 톤·기존 모달 패턴. 모든 mutation 버튼 isPending 가드 — FE#2 교훈).
- [x] **Step 3**: 랜딩 링크 연결. GREEN 확인 → 게이트 4종(명령별 exit code) → 커밋 `feat(web): 면접 라운드 dashboard — 응답 현황·배정 검토·확정`

### Task 5: 구 화면 철거 (커밋 ③)

- [x] **Step 1**: 핵심 결정 5 목록 삭제 — 각 대상 grep 잔존 0 확인 후 제거, 사용처 끊긴 export·테스트 동반 삭제. `ApplicantInterviewScheduleCard`·`AvailabilityItem` 유지 확인.
- [x] **Step 2**: 게이트 4종 그린 (다른 화면 테스트가 깨지면 철거 범위 초과 — BLOCKED) → 커밋 `refactor(web): 구 면접 관리 화면·dead 데이터 레이어 철거`

### Task 6: 전체 검증

- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (명령별 exit code) + repo 루트 EOF·금지 라인 검사

### Task 7: self-check + PR 생성 (컨트롤러 수행 — 구현 subagent 금지)

- [x] push + PR `feat(web): 면접 라운드 dashboard` — 본문: 🚀(dashboard 한 화면 운영 + 조기 배정 UX 사용자 요구 반영 + 철거) / 🤔(ApiError payload 설계·전원 응답 배너 기준·재실행 경고·ApplicantInterviewScheduleCard 유지 판정·SlotPatternForm 승격) / 💬(확정 409 payload 흐름·invalidation §10.1·철거 잔존 0). **머지 금지.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §10.4 전 섹션 + 조기 배정 UX ①②③ → 결정 4 + 테스트 3·4·5, §10.5 가드(자동배정 RESPONDED≥1 — 서버 409 메시지 노출로 갈음·확정 경고 2종) → ConfirmRoundDialog + 테스트 9, §10.6 철거 → Task 5, §10.1 → 결정 3 + hooks 테스트, Rule 2 안내 → 테스트 14.
- **플레이스홀더 없음** — UI 마크업·정확 필드는 확립된 전례(BE DTO 1:1·기존 패턴 정답) 위임 방식, 동작 명세는 테스트 14건이 고정.
- **주의 메모**: ① confirm 의 force 쿼리 직렬화(`searchParams: {force}`) — 백엔드 `@RequestParam(defaultValue="false")`. ② 멤버 테이블의 수동 배정 대상 = 비EXCLUDED (BE#10 — INVITED 포함). ③ detail 의 `members[].memberId` 가 경로 파라미터(BE#10 은 memberId, applicationId 아님). ④ 미응답 카운트 라벨: 마감 전 invitedCount="응답 대기"·후 unrespondedCount="미응답" (BE#6 counts 의미). ⑤ 철거 시 `packages/api/src/generated/schema.d.ts` 는 불가침(생성물).
