# BE#14 + FE#6 — 지원자 상세 면접 카드 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).
> **구현 subagent 는 push·PR 생성·머지 금지** — push/PR 은 리뷰 후 컨트롤러.

**Goal:** 운영진 지원자 상세의 면접 카드를 라운드 맥락 카드로 개편 — ① BE#14: 지원자 상세 응답에 면접 라운드 요약 필드 보강 ② FE#6: 카드 개편(라운드 제목·단계·멤버 상태·가능없음 사유 + **dashboard 딥링크**), 오배선된 [수동 배정 변경] 버튼과 `PromoteToInterviewPendingDialog`(§10.6 철거 누락분) 제거 — 선정 경로를 목록 일괄 선정·wizard 2갈래로.

**PR 2개 순차**: BE#14 머지 후 FE#6 시작 (FE 가 신규 필드 의존).

**근거:** 사용자 결정 3건 (2026-06-12: 딥링크 교체·다이얼로그 제거·BE 보강) + 스펙 §10.6
**리뷰 정책:** BE — duing+codex / FE — duing+codex (양쪽 spec 리뷰 포함)

---

## PR ① BE#14 — 지원자 상세 라운드 요약 (브랜치 `feat/applicant-detail-round-summary`, 커밋 1)

1. **응답 필드**: `ApplicantDetailResponse` 에 `interviewRound` 추가 (기존 `interviewAvailabilities`·`assignedSlot` 유지 — 호환):

```java
// 운영진 화면이므로 raw status 노출 (dashboard 와 동일 — 지원자 SSOT 가림과 무관)
public record InterviewRoundBrief(
        Long roundId, String title, RoundStatus roundStatus,
        RoundMemberStatus memberStatus,
        boolean unresponded,                 // 파생: INVITED && now > deadline (§5.3 — clock 주입)
        String alternativeAvailabilityText   // NO_AVAILABLE_SLOT 사유 (그 외 null)
) {}
InterviewRoundBrief interviewRound  // placement-active 멤버십 없으면 null (= 대기열/선정 전)
```

2. **조회**: 기존 detailQuery 서비스 경로에서 `findVisibleMembershipByApplicationId` 가 아닌 **placement-active 멤버십**(DRAFT 포함 — 운영진은 DRAFT 도 본다) 조회 필요 → `InterviewRoundMemberRepositoryCustom` 에 `findPlacementActiveMembershipByApplicationId` 추가 (기존 visible 쿼리에서 status 집합만 {DRAFT 포함 4종} — `hasNoPlacementActiveMembership` 술어의 역형태 재사용). round join 으로 `VisibleMembership` record 재사용.
3. **파생**: `unresponded` 는 BE#6 `deadlinePassed && INVITED` 와 동일 규칙 — `LocalDateTime.now(clock)`.
4. **테스트** (기존 `LeaderApplicantDetailInterviewTest` 확장 ~5건): DRAFT 멤버십도 brief 노출 / COLLECTING 마감 후 INVITED → unresponded true / NO_AVAILABLE_SLOT → 사유 텍스트 / 멤버십 없음 → null / EXCLUDED-only → null(대기열 복귀 상태).
5. 커밋: `feat(backend): 지원자 상세 응답에 면접 라운드 요약 추가`. 전체 테스트 그린 + self-check 후 push·PR (`feat(backend): 지원자 상세 면접 라운드 요약`, 본문에 FE#6 짝 명시). **머지는 사용자.**

## PR ② FE#6 — 카드 개편 + 잔재 철거 (브랜치 `feat/applicant-interview-card`, 커밋 1, BE#14 머지 후)

1. **타입**: `ApplicantDetail`(packages/types) 에 `interviewRound: InterviewRoundBrief | null` 수동 1:1 추가 (기존 `InterviewRoundStatus`/`InterviewRoundMemberStatus` union 재사용).
2. **카드 개편** (`ApplicantInterviewScheduleCard` 재작성 — props `{ detail 의 interviewRound·interviewAvailabilities·assignedSlot, clubId, recruitmentId, applicationStatus }`):
   - **라운드 있음**: 헤더 = 라운드 title + 단계 칩(dashboard 라벨 재사용: 작성 중/응답 수집 중/배정 검토 중/확정/취소) + **[면접 관리에서 조정 →]** Link(`interview/rounds/{roundId}`). 본문 = 멤버 상태 행(INVITED→"응답 대기"·unresponded 면 "미응답" rose / RESPONDED→"응답 완료 — 선택 N개" / NO_AVAILABLE_SLOT→"가능한 시간 없음" + 사유 인용 박스 / ASSIGNED→"면접 확정" / EXCLUDED 는 placement-active 가 아니므로 도달 없음) + 현재 배정(기존) + 선택 시간 목록(기존, "현재 배정" 뱃지 유지).
   - **라운드 null + status INTERVIEW_PENDING**: "면접 대기열에 있음 — 다음 라운드 선정을 기다립니다" + [면접 관리] 링크.
   - **라운드 null + 그 외**: "면접 대상 선정 전 — 면접 관리의 라운드 만들기에서 선정합니다" (UNDER_REVIEW) / 합불 터미널이면 카드 미렌더.
   - [수동 배정 변경] 버튼·`onOpenManualAssign` prop 삭제.
3. **철거**: `PromoteToInterviewPendingDialog.tsx` + `ApplicantDetailPage` 의 `showPromoteDialog`·`PROMOTABLE_STATUS` 배선 + 관련 테스트 — 잔존 참조 grep 0. (목록의 BulkPromoteDialog 는 유지 — 선정 경로 ① 그대로.)
4. **테스트** (~6): 라운드 카드(제목·칩·딥링크 href) / 가능없음 사유 노출 / 미응답 rose / 대기열 안내 / 선정 전 안내 / 수동배정 버튼·promote 다이얼로그 부재.
5. 커밋: `feat(web): 지원자 상세 면접 카드 — 라운드 맥락·dashboard 딥링크 (선정 다이얼로그 철거)`. 게이트 4종(명령별 exit code) + self-check 후 push·PR. **머지는 사용자.**

---

## Self-Review
- 결정 1(딥링크) → FE 2 카드 헤더, 결정 2(2갈래) → FE 3 철거, 결정 3(BE 보강) → PR ①. §10.6 잔여(Promote 철거) 해소.
- 주의: ① BE brief 의 멤버십 선택은 placement-active (visible 아님 — DRAFT 포함, 운영진 화면). ② FE 칩 라벨은 dashboard 의 기존 라벨 상수 재사용(중복 정의 금지 — 공용 승격 필요 시 components/interview 로). ③ `LeaderApplicantDetailInterviewTest` 의 기존 단언(availabilities·assignedSlot) 무회귀. ④ FE 테스트의 상세 페이지 MSW 픽스처에 interviewRound 필드 추가 — 기존 테스트 깨지면 픽스처만 보강.
