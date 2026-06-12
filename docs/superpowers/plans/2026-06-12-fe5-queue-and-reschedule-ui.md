# FE#5 — 대기열·단계표시 + SCHEDULED 재조정 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **구현 subagent 는 push·PR 생성·머지를 절대 하지 않는다 — Task 5 는 리뷰 후 컨트롤러가 수행한다.**

**Goal:** 재설계 마지막 FE PR — ① dashboard 에 BE#13 확정 후 재조정 UI(슬롯 관리 SCHEDULED 활성·멤버 [일정 변경]+알림 안내) ② 면접 관리 랜딩에 상시 대기열 섹션(§10.3 — includeUnderReview=false 기본) ③ 모집 상세에 면접 진행 단계표시+단일 next action(§10.5).

**Architecture:** 신규 데이터 레이어 0 — 전부 기존 쿼리(`candidates(false)`·`rounds list`·`detail`)와 기존 mutation 재사용. 커밋 2개: ① dashboard 재조정 UI(phase 조건 확장 — FE#3 컴포넌트 수정) ② 대기열 섹션+단계표시(신규 소형 컴포넌트 2).

**근거 스펙:** §6.4(재조정 — 해제 불가·변경 알림)·§10.3(대기열 진입 기본값)·§10.5(단계표시 가드레일 1:1)·§12 FE#5
**리뷰 정책:** duing(frontend/CLAUDE.md) + codex 기본

---

## 핵심 결정

1. **재조정 UI = phase 조건 확장** (FE#3 컴포넌트 수정, 신규 모달 없음):
   - `RoundSlotsSection`: 노출·편집 조건에 SCHEDULED 추가 (패턴 생성·참조없는 수정·삭제 — 배정 참조 409 는 서버 메시지 그대로). SCHEDULED 에선 Rule 2 재초대 토스트 대신 "수집이 끝난 라운드 — 재초대 없음" 무토스트 (reinvitedMemberCount 0).
   - `RoundMemberTable`: SCHEDULED 에서 ASSIGNED 멤버 행에 [일정 변경] (기존 `MemberAssignModal` 재사용 — 모달 내 안내 1줄 "변경 시 지원자에게 일정 변경 알림이 발송됩니다" — SCHEDULED 일 때만).
   - `RoundStatusBanner`: SCHEDULED next action 을 "없음" → "일정 변경 가능" 안내로.
   - 해제·제외는 SCHEDULED 에서 기존대로 미노출 (§6.4 — 변경 없음 확인만).
2. **대기열 섹션** (`InterviewRoundsLanding` 확장): `useInterviewRoundCandidatesQuery(recruitmentId, false)` — 카운트 + 상위 5명 이름·뱃지 미리보기 + [Round 생성](wizard 링크). 빈 큐는 "대기 중인 지원자가 없습니다". §10.3 상시 진입 기본값(false) 이 이 섹션의 존재 이유.
3. **모집 상세 단계표시** (`manage/.../recruitments/[recruitmentId]/page.tsx` 또는 해당 상세 컴포넌트에 칩 1개): `useInterviewRoundsQuery` 로 최신 라운드(생성 최신순 첫 항목 — BE#6 정렬) 상태를 §10.5 단계 라벨로: 라운드 없음 "면접 대상 선정 전"/DRAFT "라운드 작성 중"/COLLECTING "응답 대기 n/N"/ASSIGNING "배정 검토 중"/SCHEDULED "면접 확정"/CANCELLED 는 최신이어도 "면접 대상 선정 전" 취급(비활성 라운드). 칩 + [면접 관리] 링크가 next action. `useInterview=false` 모집은 미렌더. **모집 목록 카드에는 넣지 않음** — 모집마다 rounds 쿼리 N+1, 상세·면접 관리 화면으로 충분 (계획 명시 트레이드오프).
4. **테스트 ~9**: 재조정 4(SCHEDULED 슬롯 추가 노출·[일정 변경]→PUT 캡처+알림 안내 문구·배정 참조 409 메시지 노출·해제/제외 미노출) + 대기열 3(카운트·빈 상태·includeUnderReview=false 캡처) + 단계표시 2(COLLECTING n/N·라운드 없음).

## File Map

| 커밋 | 파일 | 변경 |
|---|---|---|
| ① | `rounds/[roundId]/_components/RoundSlotsSection.tsx`·`RoundMemberTable.tsx`·`MemberAssignModal.tsx`·`RoundStatusBanner.tsx` | phase 조건 확장 + 안내 문구 |
| ① | `test/manage/interview-rounds/round-dashboard.test.tsx` | 재조정 4건 추가 |
| ② | `interview/_pages/InterviewRoundsLanding.tsx` | 대기열 섹션 |
| ② | 모집 상세 컴포넌트 (grep — 상세 헤더/액션 영역) + `_components/InterviewStageChip.tsx` 신규 | 단계 칩 |
| ② | `test/manage/interview-rounds/rounds-landing.test.tsx` + 상세 테스트 | 5건 추가 |

---

### Task 1: 브랜치
- [ ] `git checkout develop && git pull origin develop && git checkout -b feat/queue-and-reschedule-ui`

### Task 2: 재조정 UI (커밋 ①)
- [ ] 테스트 4건 RED (기존 dashboard 테스트 픽스처에 SCHEDULED 변형 추가) → phase 조건 확장 구현 → GREEN → `feat(web): 확정 후 일정 변경 UI — SCHEDULED 슬롯 관리·재배정`

### Task 3: 대기열 + 단계표시 (커밋 ②)
- [ ] 테스트 5건 RED → `InterviewRoundsLanding` 대기열 섹션 + `InterviewStageChip`(+모집 상세 배치 — 기존 액션 버튼 영역 인접) 구현 → GREEN → `feat(web): 면접 대기열 섹션·모집 상세 진행 단계표시`

### Task 4: 전체 검증
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` (명령별 exit code) + repo 루트 self-check (체크박스·EOF·금지 라인)

### Task 5: push + PR (컨트롤러 — 머지 금지)
- [ ] PR `feat(web): 면접 대기열·진행 단계표시 + 확정 후 일정 변경 UI` — 🚀(재설계 마지막 조각 — BE#13 짝 UI·상시 대기열·단계 가드레일) / 🤔(목록 카드 N+1 트레이드오프·SCHEDULED 무토스트·해제/제외 미노출 유지) / 💬(phase 조건 경계·§10.5 라벨 1:1).

---

## Self-Review
- §6.4 → 결정 1 + 테스트 4건 (해제·제외 미노출 포함), §10.3 기본값 → 결정 2 + 캡처 테스트, §10.5 → 결정 3 + 2건 (n/N 은 detail 카운트가 아닌 list 의 respondedMemberCount/totalMemberCount — BE#6 필드).
- 주의: ① MemberAssignModal 의 후보 슬롯 목록은 detail.slots 그대로 (SCHEDULED 에서도 동일) — 정원 표시 포함이면 그대로. ② CANCELLED 최신 라운드 처리(결정 3)는 list 에서 비CANCELLED 첫 항목 탐색으로. ③ 상세 페이지가 Server Component 면 칩은 client 섬으로.
