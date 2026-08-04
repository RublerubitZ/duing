# 지원 프로세스 상태 머신 단순화 설계 스펙 — UNDER_REVIEW 제거 · ON_HOLD 도입

- 작성일: 2026-08-04
- 상태: 확정 — 사용자 최종 수정안 9건 반영 (FSM useInterview 조건 명시 · ON_HOLD 도메인 정의 · 통계 계약 유지 · 면접 모집 일괄 합격 유지 · 지원자 라벨 기존 용어 유지 · 스테퍼 문구 정정 · 보류 UX 확정 · 릴리스 정책 명시 · 추가 체크리스트)
- 전제: `ApplicationStatus` = SUBMITTED / UNDER_REVIEW / INTERVIEW_PENDING / ACCEPTED / REJECTED, `@Enumerated(EnumType.STRING)` VARCHAR(20) 저장, DB CHECK 제약 없음 (상태 검증은 애플리케이션 FSM 전담). 상태 이력(`application_status_history`)도 동일하게 enum 문자열 저장.
- 배경 (운영진 피드백): ① 지원서를 열람하는 것 자체가 이미 서류심사인데 별도 "서류심사" 버튼을 눌러야 함 ② 일괄 합격/불합격도 서류심사 단계를 강제로 경유 ③ "아직 결정하지 않은 지원자"를 표현할 상태가 없음. → **UNDER_REVIEW(서류심사) 상태를 제거하고 ON_HOLD(보류)를 도입한다. 면접 프로세스는 유지한다.**

## Out of Scope (명시적 제외)

- `INTERVIEW_PENDING → ON_HOLD` 전이 — 면접 도메인이 INTERVIEW_PENDING 을 "면접 대기열 큐" 상태로 사용하며(배정/제외/취소·동시성 가드 전부 이 값 의존), 보류로 뺐다 넣으면 큐 의미가 붕괴한다. "면접 후 결과 대기"는 라운드 멤버십(`WAITING_NEXT_ROUND`)이 이미 표현. 필요 시 후속.
- 열람 메타데이터(`viewedAt`, `viewedBy`) — 열람은 상태가 아닌 행위. 열람 여부 표시 요구가 생기면 상태 추가가 아닌 별도 메타데이터로 후속 도입.
- 지원 상태 변경 알림 발송 — 현재 BE 에 미구현이며 이번에도 도입하지 않음 (기존 모달의 거짓 문구만 제거, §6-3).
- 동아리 폐쇄 일괄거절의 상태 이력 미기록 보완 — 현행도 이력을 남기지 않으며(`GeneralApplicationService.java:471-473`), 이번엔 전이 경로만 단순화하고 이력 정책은 현행 유지.
- 지원현황 아카이브 / 모집 종료(CLOSED) 읽기 전용 개편 — 본 리팩토링 완료 후의 후속 작업.
- Flyway 기존 마이그레이션 파일 수정 — `V10`/`V11` 주석에 UNDER_REVIEW 가 등장하지만 기존 파일은 절대 수정하지 않는다(프로젝트 절대 규칙). "완전 제거" 검증 grep 은 `db/migration/` 을 제외한다.

---

## 1. 새 상태 머신 (FSM)

### 1-1. ON_HOLD 도메인 정의

- **ON_HOLD(보류)는 운영진의 내부 관리용 상태이며 최종 결과가 아니다.** 회의 결과 대기·추가 확인 필요·내부 검토 중 등 "아직 결정하지 않음"을 표현한다.
- 지원자에게는 별도 상태로 노출하지 않는다 — 지원자 화면에서 SUBMITTED 와 동일하게 **"심사 중"** 으로 표시 (§6-4).
- `isTerminal()` = false → `isActive()` = true. 따라서 내 지원 목록의 ACTIVE/ARCHIVED scope(`ApplicationScope`)는 수정 없이 자동 대응.
- 코드 이름은 `PENDING` 이 아닌 `ON_HOLD` — 기존 `INTERVIEW_PENDING` 과의 혼동 방지 (사용자 확정).

### 1-2. 전이표 (useInterview 조건 명시 — FE/BE 동형 구현의 단일 기준)

| 현재 상태 | 비면접 모집 (useInterview=false) | 면접 모집 (useInterview=true) |
|---|---|---|
| SUBMITTED | ACCEPTED, REJECTED, ON_HOLD | INTERVIEW_PENDING, REJECTED, ON_HOLD |
| ON_HOLD | ACCEPTED, REJECTED | INTERVIEW_PENDING, REJECTED |
| INTERVIEW_PENDING | ACCEPTED, REJECTED (현행 유지) | ACCEPTED, REJECTED (현행 유지) |
| ACCEPTED | 없음 (최종) | 없음 (최종) |
| REJECTED | 없음 (최종) | 없음 (최종) |

정책:
- **면접 모집에서 SUBMITTED/ON_HOLD → ACCEPTED 직행은 불허** — 합격은 반드시 INTERVIEW_PENDING 을 경유 (현행 정책 유지).
- **INTERVIEW_PENDING → ON_HOLD 불허** (Out of Scope 참조).
- 자기 자신으로의 전이(no-op)는 현행대로 불허.

### 1-3. 상태(State)와 행위(Action) 분리 원칙

- 지원서 열람은 운영진의 행위이며 상태를 변경하지 않는다.
- 운영진은 지원서 검토 후 바로 합격 / 불합격 / 보류 / (면접 모집) 면접 대상 선정을 수행한다. 중간 단계 강제 없음.

### 1-4. 변경 지점

- BE: `application/entity/ApplicationStatus.java` — UNDER_REVIEW 제거·ON_HOLD 추가, `isTerminal()` 유지. `application/entity/Application.java:97-104` `isAllowedTransition` 을 §1-2 표대로 교체.
- FE: `applicants/_components/applicationStatusTransitions.ts` `TRANSITIONS` 를 §1-2 표대로 교체 (BE 와 수동 미러 — 동형 유지가 리뷰 관문).
- FE 타입: `packages/types/src/application.ts:9-26` 유니온·`APPLICATION_STATUSES` 배열 동기 수정. `UpdateApplicationStatusPayload`/`BulkUpdateApplicationStatusPayload` 의 `Exclude<ApplicationStatus, 'SUBMITTED'>` 는 ON_HOLD 를 자동 포함하므로 구조 변경 없음.

## 2. 데이터 마이그레이션

새 Flyway 파일 **V103**(가입 코드 시리즈 정책 확정으로 V102 까지 점유 — V103 확정) 하나로 값 치환만 수행한다. CHECK 제약·시드가 없어 DDL 불필요.

```sql
-- UNDER_REVIEW 제거에 따른 기존 데이터 치환. 행 삭제 없음.
UPDATE application SET status = 'SUBMITTED' WHERE status = 'UNDER_REVIEW';
UPDATE application_status_history SET previous_status = 'SUBMITTED' WHERE previous_status = 'UNDER_REVIEW';
UPDATE application_status_history SET new_status = 'SUBMITTED' WHERE new_status = 'UNDER_REVIEW';
```

- **이력 테이블 치환은 필수** — `ApplicationStatusHistory.previousStatus/newStatus` 가 enum 으로 역직렬화되므로(`ApplicationStatusHistory.java:33-39`), 값을 남기고 상수만 지우면 지원자 상세 이력 조회가 500 으로 터진다.
- **soft delete 필터를 걸지 않는다** — `deleted_at` 이 있는 행도 enum 로딩 경로에 들어올 수 있으므로 전체 행 치환.
- 치환으로 생기는 무의미 이력(`SUBMITTED → SUBMITTED`)은 DB 에 보존하고, 타임라인 표시에서 `previousStatus !== newStatus` 필터 한 줄로 숨긴다 (`StatusTimeline.tsx`).
- 마이그레이션 검증 테스트: 치환 후 이력 포함 지원자 상세 조회가 정상 동작.

## 3. 면접 도메인 수정

- **후보 조회**: `InterviewRoundMemberRepositoryImpl.java:58-64` `candidateStatuses` — `(INTERVIEW_PENDING ∪ UNDER_REVIEW)` → `(INTERVIEW_PENDING ∪ SUBMITTED ∪ ON_HOLD)`. 큐 판정(`INTERVIEW_PENDING ∧ placement-active 멤버십 없음`)은 불변.
- **파라미터 리네임**: `includeUnderReview` → `includeUndecided`. **의미: `includeUndecided=true` 면 미결정 상태(SUBMITTED + ON_HOLD) 후보를 포함, false 면 INTERVIEW_PENDING 만.** 체인: repo → `GeneralInterviewRoundService` → controller → `LeaderInterviewRoundApi`(Swagger) → OpenAPI 재생성(`schema.d.ts`) → `client.ts` → `useInterviewRoundCandidatesQuery` → `Step1Candidates` 토글 → `RoundWizard` 카운트(`underReviewSelectedCount` → `undecidedSelectedCount`) → `Step2RoundForm` 경고 문구까지 전 체인. 운영진 전용 API 이며 FE 와 동일 릴리스라 하위호환 계층은 두지 않는다.
- **승격 전이**: `GeneralInterviewRoundService.java:163-169` — 라운드 생성 시 `UNDER_REVIEW → INTERVIEW_PENDING` 승격을 `SUBMITTED/ON_HOLD → INTERVIEW_PENDING` 으로 교체 (이력 기록 유지). INTERVIEW_PENDING 후보 재수용 no-op·`FORCE_INCREMENT` 잠금 정책은 현행 유지.
- **후보 상태 가드**: `GeneralInterviewRoundService.java:134` — 허용 집합을 `SUBMITTED/ON_HOLD/INTERVIEW_PENDING` 으로.
- **위저드 문구**: Step1 그룹 헤더 "서류 검토 중" → "미결정(지원·보류)", Step2 경고 배너의 enum 명 노출 문구 정리.
- **동아리 폐쇄 일괄거절**: `GeneralApplicationService.java:462-473` — 현행 `SUBMITTED→UNDER_REVIEW→REJECTED` 2단 우회를 새 FSM 의 `SUBMITTED→REJECTED` 직행으로 단순화. activeStatuses 목록은 `SUBMITTED/ON_HOLD/INTERVIEW_PENDING`.
- **지원자 면접 단계 파생**: `ApplicantInterviewPhase.java:42-51` — `DOCUMENT_REVIEW` phase 제거. SUBMITTED/ON_HOLD 는 `NOT_APPLICABLE`. FE `interviewPhaseGuide.ts` 의 단계 인덱스 동기 수정.
- 면접 리마인더 JPQL(`InterviewScheduleRepository.java:43,52`, `status = INTERVIEW_PENDING`)·배정/제외/취소 무전이 정책은 영향 없음 (현행 유지).

## 4. 통계 API

- **summary — 기존 계약 유지, 상태 필드만 교체**: `StatsSummaryQuery`/`StatsSummaryResponse` 는 `total / capacity / ratio` 를 그대로 유지하고, `underReview` 만 `onHold` 로 교체한다. `submitted` 는 별도 제공 유지. **계약(Contract): `total` 은 항상 `submitted + onHold + interviewPending + accepted + rejected` 와 동일해야 하며, 이 등식이 테스트 기준이다.** (운영진 화면 지원자 수가 `summary.total` 을 사용 — 제거 금지.)
- **funnel — documentPassed 개념 제거**: `StatsFunnelQuery` 에서 `documentPassed`(= 전체 − 지원, "서류심사 통과")·`underReviewCount` 제거. 유지 필드: `totalSubmitted`, `interviewEntered`(면접 모집만, 비면접 null 현행 유지 = interviewPending + accepted + rejected), `accepted`. FE `FunnelChart` 는 `지원 → 면접 진입(면접 모집만) → 합격` 으로 축소.
- **daily — 무영향**: 제출일(`created_at`) 기준 집계라 상태 무관.
- **FE 파생 표시**: "검토 대기" = `submitted + onHold` (`dashboardSelectors.ts:41,111`, `RecruitmentKpiRow`, `ApplicantSummaryCard`, `SummaryCards` 라벨 "검토중" → "보류").

## 5. FE UI

### 5-1. 필터 (`ApplicantsFilterBar`)

- "서류 검토 중" 옵션 제거, **"보류" 옵션 추가**(무조건 노출). "면접 대상" 옵션의 useInterview 조건부 노출은 현행 유지.

### 5-2. 벌크 액션 (`BulkActionBar` / `BulkConfirmDialog` / `BulkPromoteDialog`)

- 비면접 모집: `[일괄 합격] [보류] [일괄 불합격]`
- 면접 모집: `[면접 대상으로 선정] [일괄 합격] [보류] [일괄 불합격]`
- **면접 모집에서도 "일괄 합격" 은 유지한다** — INTERVIEW_PENDING 상태 지원자 일괄 합격은 현재 동작하는 기능이며 제거 시 리그레션. 전이 불가 상태가 섞이면 현행대로 건별 실패(`failures[]`)로 보고.
- "서류 검토 중" 버튼 제거. 중간 단계 강제 없음.

### 5-3. 확인 모달 · 보류 UX

- **최종 상태(합격/불합격)**: 벌크는 기존 `BulkConfirmDialog` 유지. **단건은 현재 확인 없이 즉시 처리되므로(`StatusActionBar.tsx:36-41` 직접 mutate) 공용 확인 모달을 신규 적용한다** — 문구는 "합격/불합격 처리하시겠습니까? 처리 후에는 지원자에게 결과가 반영됩니다." 계열, 기존 확인 모달 정책(#829 통일 컴포넌트)을 따른다.
- **단건 면접 대상 선정**: 현행대로 확인 없이 즉시 처리 (최종 상태 아님 — 범위 최소화).
- **단건 보류**: 확인 모달 없이 즉시 처리 (내부 상태·가역이므로).
- **벌크 보류**: 기존 확인 다이얼로그 유지(선택 N 명 확인 역할)하되, 경고 대신 안내 문구 — **"보류는 운영진 내부 관리 상태이며 지원자에게 노출되지 않습니다."**
- **거짓 문구 제거**: `BulkConfirmDialog.tsx:37` 합격 설명의 "알림이 발송될 수 있습니다" 삭제 — BE 에 지원 상태 알림이 존재하지 않음 (`NotificationType` 전수 확인).

### 5-4. 상태 라벨 (운영진/지원자 2벌, `_constants/application-status.ts`)

| Enum | 운영진 | 지원자 |
|---|---|---|
| SUBMITTED | 지원 완료 | **심사 중** |
| ON_HOLD | **보류** | **심사 중** |
| INTERVIEW_PENDING | 면접 대상 (유지) | 면접 대상 (유지) |
| ACCEPTED | 합격 (유지) | 최종 합격 (유지) |
| REJECTED | 불합격 (유지) | 최종 불합격 (유지) |

- 지원자에게 SUBMITTED 와 ON_HOLD 는 구분 불가해야 한다 — 라벨·스테퍼·상태 안내 전부 동일 표기.
- 뱃지 색상: UNDER_REVIEW 가 쓰던 amber 를 ON_HOLD 가 승계 (`ApplicantTable.STATUS_BADGE_CLASS` + `Step1Candidates` 2곳 동기).

### 5-5. 지원자 스테퍼·내 지원 화면

- **서류검토 단계를 제거하고, 면접 단계는 면접 모집에서만 표시한다** (단계 수 고정 표현 금지 — 컴포넌트마다 현재 단계 수가 다름).
- 대상: `me/applications/_pages/ApplicationsPage.tsx`(stateMap·`'doc-review'` 매핑 제거), `ApplicationStepper.tsx`, `me/_components/SectionApply.tsx`(`STATUS_STEP`·`statusNote`).
- **수동 유니온 사각지대 (컴파일 에러로 안 잡힘 — 체크리스트 필수)**: `SectionApply.tsx:11` `ActiveApplicationStatus` 에 ON_HOLD 추가, `SectionArchived.tsx:12` `ArchivedStatus` 는 ACCEPTED/REJECTED 뿐이라 변경 없음을 확인.

## 6. 릴리스 전략

- **PR 스택 (develop 순차 머지)**: PR-1 백엔드(Enum·FSM·마이그레이션·면접·통계·테스트) → PR-2 프론트(openapi 타입 재생성·UI·전이표·테스트). develop 은 배포 대상이 아니므로 중간 상태 안전.
- **prod 는 단일 릴리스로 묶어 BE 선배포 → FE 즉시 배포.** 중간 버전(구 FE + 신 BE) 간 API 호환성은 보장 대상이 아니다 — 구 FE 캐시가 `UNDER_REVIEW` 전이를 보내면 400 으로 거부되는 짧은 윈도우만 허용 (데이터 훼손 없음). 장기 호환 계층은 두지 않는다.
- **롤백 정책 (V95 치환 전례와 동일 패턴)**: 마이그레이션 직후의 BE 롤백은 안전 — 치환 결과(SUBMITTED)는 구 FSM 에서도 유효한 값. 단, **신버전 운영 중 ON_HOLD 데이터가 생성된 뒤 이전 이미지로 롤백하려면 역치환 UPDATE(`ON_HOLD → 'SUBMITTED'`, application + history 양쪽) 선행 필수** — 구 enum 이 ON_HOLD 를 역직렬화하지 못한다. 또한 **롤백 창 동안 구 코드가 새로 만든 UNDER_REVIEW 행은 재배포 시 V103 이 재실행되지 않아 그대로 남는다 — 재배포 전에 V103 의 치환 UPDATE 3문을 수동 재실행해 정리한다(멱등).** 방치하면 상수 제거(§1-4) 이후 코드에서 해당 행 로드 시 500 이 고착된다.

## 7. 테스트

- 기존 수정: BE 18파일(UNDER_REVIEW 참조) + INTERVIEW_PENDING 참조 22파일 중 전이 관련 + FE 17파일 + 통계 필드명(`underReview`/`interviewPending`) 사용 7파일.
- 신규 (BE):
  - §1-2 전이표 전수 — 허용 전이 전부 + 대표 불허 전이(면접 모집 SUBMITTED→ACCEPTED, INTERVIEW_PENDING→ON_HOLD, 최종 상태에서의 전이) — 면접/비면접 각각
  - 마이그레이션 후 이력 포함 상세 조회 정상 (UNDER_REVIEW 잔존 값 없음)
  - 폐쇄 일괄거절 SUBMITTED/ON_HOLD/INTERVIEW_PENDING → REJECTED 직행
  - summary `onHold` 집계·`total` 합산, funnel `documentPassed` 부재
  - 면접 후보 조회 `includeUndecided` 동작 (SUBMITTED·ON_HOLD 포함/제외)
- 신규 (FE):
  - 지원자 화면 SUBMITTED·ON_HOLD "심사 중" 동일 표기 (SectionApply·스테퍼)
  - 전이표 BE 동형 검증(기존 테스트 패턴), 벌크 바 구성(면접 모집 일괄 합격 존재), 보류 다이얼로그 안내 문구
  - 타임라인 `previous !== new` 필터
- 날짜 하드코딩 금지(상대 날짜) — 기존 timebomb 규칙 준수.

## 8. 추가 체크리스트 (구현·PR 전 확인)

- [ ] Swagger/OpenAPI 문서·example 의 UNDER_REVIEW 정리 — `LeaderApplicationApi`(example ×2), `ApplicationApi` scope 설명, `LeaderInterviewRoundApi` 설명
- [ ] `pnpm gen:api` 로 `schema.d.ts` 재생성 (유니온 리터럴 9곳 자동 반영)
- [ ] 수동 유니온 2곳 확인 — `SectionApply.ActiveApplicationStatus`(ON_HOLD 추가) · `SectionArchived.ArchivedStatus`(변경 없음 확인)
- [ ] 벌크 합격 모달 "알림이 발송될 수 있습니다" 문구 제거
- [ ] `db/migration/` 제외 전체 grep 으로 `UNDER_REVIEW` 0건 검증 (BE·FE·테스트·생성 타입 포함)
- [ ] FE/BE 전이표 동형 육안 대조 (§1-2 기준)

## 9. 최종 산출물 (구현 완료 보고)

변경 파일 목록 · 상태 머신 변경 내용 · 영향 범위 · 마이그레이션 결과 · 테스트 결과 · 변경된 API 계약(summary/funnel/includeUndecided) · QA 체크리스트 수행 결과.
