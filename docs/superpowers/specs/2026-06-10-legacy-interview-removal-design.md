# Legacy Interview Field Removal — Design

> Slot Lifecycle Policy 합의 위에서 면접 일정 Source of Truth 를 `InterviewSchedule` 로 일원화한다. Legacy `application.interviewAt`/`interviewLocation` 컬럼과 의존 코드 경로를 atomic 하게 제거한다.

- 작성일: 2026-06-10
- 전제: 운영 데이터 0 (실서비스 전, 테스트 데이터만)
- 선행: Phase 1 (Legacy 입력 버튼 숨김, PR #332) 머지 완료. UX 개선 (UNDER_REVIEW 자동 전이, PR #333) 머지 완료.

---

## 1. Goal & Non-Goals

### Goal
- 면접 일정의 진실 출처를 `InterviewSchedule` 로 단일화.
- `application.interviewAt`/`interviewLocation` 컬럼 및 그에 의존하는 모든 BE/FE 코드 경로 제거.
- 알림(Reminder) 흐름을 `InterviewSchedule` 기반으로 재작성하면서 사용자 경험(배정 즉시 + T-24h 이중 알림) 보존.
- BE/FE 양쪽이 develop 어느 시점에도 빌드/CI green 인 상태로 머지.

### Non-Goals (Out of Scope)
- Slot Lifecycle 후속 (rollback, audit trail, 재자동배정 트리거)
- 슬롯별 location 지원 — `InterviewSlot.location` 컬럼 신설은 별도 spec
- 알림 채널 확장 (이메일/푸시)
- T-24h 외 시점 리마인더 (T-1h, T-7d 등)
- 면접 `COMPLETED` / 노쇼 후처리 UI

---

## 2. Architecture Overview

### 데이터 출처

```
Application
  ⋈ InterviewSchedule  ON application.id = interview_schedule.application_id
                       AND interview_schedule.status = 'ASSIGNED'
  ⋈ InterviewSlot      ON interview_schedule.slot_id = interview_slot.id
  ⋈ InterviewConfig    ON interview_schedule.recruitment_id = interview_config.recruitment_id
```

- `InterviewSchedule.applicationId` 컬럼은 UNIQUE → Application 과 1:1.
- `InterviewConfig.recruitment_id` 는 UNIQUE (V45 확인됨) → 한 모집 1 config.
- LEFT JOIN 결과 0/1 row 보장.

### ASSIGNED 정책 (명시)

**응답의 `interview` (또는 `interviewStartAt`) 필드는 `InterviewSchedule.status = ASSIGNED` 일 때만 채워진다. 그 외 모든 상태(`COMPLETED`, 향후 추가될 `NO_SHOW`/`CANCELLED` 등)는 `null` 로 노출.**

이유:
- 본 spec 의 응답은 "현재 진행 중인 면접 일정"만 표현. 완료/취소 이력은 별개 관심사.
- `status` 필드를 응답에 노출하지 않기로 한 결정(아래 §3.1) 과 일관 — 단일 상태(ASSIGNED) 만 의미하므로 응답에 표현할 일이 없음.
- `Reminder Job` 도 동일하게 `ASSIGNED` 한정 조회 → 응답/알림 정책 일관.

### PR 분할 & 머지 순서

- **BE PR**: `backend/**` 만 변경. `backend-ci` 만 실행, `frontend-ci` 미실행.
- **FE PR**: `frontend/**` 만 변경 + BE PR 의 응답 형태에 맞춘 `schema.d.ts` 수동 갱신 포함. `frontend-ci` 가 BE 머지 전후 모두 green.
- 머지 순서: BE → FE. BE 머지 직후 FE PR 을 로컬에서 `git rebase develop` 후 force-push → `frontend-ci` 재실행 → 머지.
- develop CI 는 어떤 시점에도 red 가 아님.

---

## 3. Backend 변경

### 3.1 Response DTO 재설계

#### nested 적용 (3 개 응답)

`MyApplicationDetailResponse`, `ApplicantDetailResponse`, `ApplicationSummaryResponse` 모두:

```java
public record AssignedInterview(
    LocalDateTime startAt,
    LocalDateTime endAt,
    String location
) {}

// 응답 record 내부
AssignedInterview interview   // nullable
```

- 기존 `interviewAt`, `interviewLocation` 필드는 제거.
- `status` 필드 미포함 — ASSIGNED 만 노출 정책이므로 필드 자체 무의미 (YAGNI).
- `MyApplicationDetailResponse.interviewScheduleAssigned: boolean` 제거 — `interview != null` 로 자명.

#### 단일 scalar (1 개 응답)

`ApplicantResponse` 만 nested 가 아닌 scalar:

```java
LocalDateTime interviewStartAt   // nullable
```

**이유 (명시)**:
1. **리스트 row 컨텍스트** — 운영진 지원자 목록 (`GET /leader/recruitments/{id}/applications`) 의 row 표시. 현재 `ApplicantTable.tsx` 가 시작 시각 단일 값만 `toLocaleString` 으로 표시.
2. **location 의 row-level 중복** — location 은 모집 단위 단일 값. 운영진은 이미 모집 컨텍스트에서 알고 있음. row 마다 동일 location 반복 표시는 노이즈.
3. **endAt 미사용** — 리스트는 시작 시각으로 정렬·필터하면 충분. 종료 시각은 노이즈.
4. **YAGNI** — 일관성 위해 nested 를 강제하면 FE 가 `applicant.interview?.startAt` 로 한 단계 더 들어가야 하고, location/endAt 은 표시 안 함. 표현 단위가 다르다는 사실을 응답 구조에 반영하는 게 더 정확한 모델.

### 3.2 Repository / Query

- `MyApplicationDetailQuery`, `ApplicantDetailQuery`, `ApplicantQuery`, `ApplicationSummaryQuery` — 4 개 Query DTO 가 §2 JOIN 으로 면접 정보 채움.
- 단건 조회 (Detail) → JPA Repository 메서드 + `JOIN FETCH`.
- 목록 조회 (Applicant 리스트, Summary 리스트) → QueryDSL `BooleanExpression` 으로 기존 필터와 합쳐 단일 쿼리. N+1 회피.
- 공용 inner record 도입: `AssignedInterviewQuery(startAt, endAt, location)` — 4 곳에서 재사용.
- 기존 `ApplicationRepository.findInterviewBetween` 삭제 (Reminder 전용 쿼리).

### 3.3 Reminder Job 재작성

`InterviewReminderJob` 클래스명은 유지하고 내부 로직만 교체:

- 스케줄: 기존 `@Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")` 유지.
- 신규 조회 메서드: `InterviewScheduleRepository.findAssignedBetween(start, end)` — `InterviewSchedule (status=ASSIGNED) ⋈ InterviewSlot.startTime BETWEEN [now+23h, now+25h]`.
- 알림 본문: `slot.startTime` (포맷 동일 `yyyy.MM.dd HH:mm`) + `config.location` (config null 가드 — 미생성 모집은 reminder 대상 외).
- dedup_key 포맷 유지: `INTERVIEW_REMINDER:a={applicationId}:t={ISO slot.startTime}`.
  - **미래 동작**: 재배정으로 슬롯이 바뀌면 startTime 이 달라져 dedup_key 도 달라짐 → 새 reminder 발송. 동일 슬롯 재배정은 같은 dedup_key 로 한 번만. 별도 future-handling 불필요.
- 기존 테스트 `InterviewReminderJobTest` 재작성 — `InterviewSchedule(ASSIGNED) ⋈ slot.startTime` 윈도 매트릭스.

### 3.4 쓰기 경로 / Entity / API 제거

다음 항목 모두 삭제:

| 항목 | 위치 |
|---|---|
| Swagger 인터페이스 메서드 | `LeaderApplicationApi.updateInterview` |
| Controller 메서드 | `LeaderApplicationController.updateInterview` |
| Service 인터페이스 메서드 | `ApplicationService.updateInterview` |
| Service 구현 | `GeneralApplicationService.updateInterview` |
| Command record | `UpdateInterviewCommand` |
| Request record | `UpdateApplicationInterviewRequest` |
| Entity 메서드 (수동 입력) | `Application.updateInterview(LocalDateTime, String)` |
| Entity 메서드 (미사용) | `Application.scheduleInterview(LocalDateTime, String)` |
| Entity 필드 | `Application.interviewAt`, `Application.interviewLocation` |
| 알림 호출 사이트 | `notifyInterviewScheduled()` 가 `updateInterview` 안에서 호출되던 부분만 제거. 알림 헬퍼 자체는 `InterviewScheduledListener` 가 계속 사용. |
| 테스트 | `ApplicationInterviewServiceTest` |

### 3.5 Flyway

신규 파일 `V{next}__drop_application_interview_columns.sql`:

```sql
ALTER TABLE application DROP COLUMN IF EXISTS interview_at;
ALTER TABLE application DROP COLUMN IF EXISTS interview_location;
```

- 운영 데이터 0 이므로 `IF EXISTS` 가드만 두고 즉시 DROP.
- 기존 V11 마이그레이션은 수정 금지 (Flyway 원칙).

---

## 4. Frontend 변경

### 4.1 Schema regen (수동)

`packages/api/src/generated/schema.d.ts` — BE PR 응답 형태에 맞춰 수동 갱신:

- 3 개 응답 schema 의 `interviewAt`/`interviewLocation` 제거 → `interview: { startAt, endAt, location } | null` 추가.
- `ApplicantResponse` schema 에 `interviewStartAt: string | null` 추가 (기존 `interviewAt` 제거).
- `MyApplicationDetailResponse.interviewScheduleAssigned` 제거.
- `operations["updateInterview"]` + `paths["/leader/applications/{id}/interview"].patch` 제거.
- `UpdateApplicationInterviewRequest` schema 제거.

### 4.2 도메인 타입 (`packages/types/src/application.ts`)

- `UpdateInterviewPayload` 제거.
- `Applicant` 의 `interviewAt: string | null` → `interviewStartAt: string | null`.
- `ApplicationSummary`, `MyApplicationDetail`, `ApplicantDetail` 의 `interviewAt`/`interviewLocation` 제거 → `interview: AssignedInterview | null` 추가.
- `MyApplicationDetail.interviewScheduleAssigned` 제거.
- 신설:
  ```ts
  export type AssignedInterview = {
    startAt: string;
    endAt: string;
    location: string;
  };
  ```

### 4.3 API Client / Hooks

- `packages/api/src/client.ts` 의 `applications.updateInterview()` 메서드 + 인터페이스 시그니처 제거.
- `packages/hooks/src/applications.ts` 의 `useUpdateInterviewMutation` 제거 + `index.ts` export 제거.

### 4.4 컴포넌트

| 파일 | 변경 |
|---|---|
| `_components/InterviewModal.tsx` | **삭제** |
| `_components/StatusActionBar.tsx` | `InterviewModal` import 제거 / `showInterviewModal` state + setter 제거 / "면접 일정 입력" 버튼 블럭 제거 / 모달 렌더 블럭 제거 / Props 타입에서 `hasInterviewConfig` 제거 / `legacyInterviewInputAllowed` 도출 + 조건 제거 |
| `applicants/[applicationId]/_components/ApplicantDetailPage.tsx` | `hasInterviewConfig` 계산식 제거 + StatusActionBar 호출부에서 prop 제거 |
| `applicants/[applicationId]/_components/ApplicantProfilePanel.tsx` | `detail.interviewAt` / `detail.interviewLocation` 참조 → `detail.interview?.startAt` / `detail.interview?.location`. 조건부 렌더 유지 (`detail.interview && (...)`) |
| `applicants/_components/ApplicantTable.tsx` | `applicant.interviewAt` → `applicant.interviewStartAt` |
| `me/_components/SectionApply.tsx` | `interviewAt`/`interviewLocation` 참조 → `interview` 객체 |
| `me/applications/_pages/ApplicationsPage.tsx` | 동일 |

### 4.5 테스트

- **삭제**: 없음 (InterviewModal 전용 테스트 파일 미존재 — `status-action-bar.test.tsx` 안에서 간접 검증되어 왔음).
- **수정**: `test/manage/applicants/detail/status-action-bar.test.tsx`
  - `vi.mock` 의 `useUpdateInterviewMutation` 라인 제거.
  - 모든 케이스에서 `hasInterviewConfig` prop 제거.
  - 다음 케이스 삭제:
    - "INTERVIEW_PENDING + Config 미생성 → Legacy 버튼 노출"
    - "INTERVIEW_PENDING + Config 존재 → Legacy 버튼 숨김"
    - "INTERVIEW_PENDING + useInterview=false → Legacy 버튼 노출"
  - **신규 추가 (회귀 가드)**:
    ```ts
    it('어떤 상태/조합에서도 "면접 일정 입력" 버튼이 렌더되지 않는다', () => {
      render(
        <StatusActionBar
          applicationId={1}
          recruitmentId={1}
          currentStatus="INTERVIEW_PENDING"
          useInterview
        />,
      );
      expect(
        screen.queryByRole('button', { name: '면접 일정 입력' }),
      ).not.toBeInTheDocument();
    });
    ```
- **수정**: `test/me/section-apply.test.tsx`, `test/me/section-archived.test.tsx`, `test/manage/applicants/applicant-table-extension.test.tsx` — `interviewAt`/`interviewLocation` 직접 사용을 신규 형태로.

---

## 5. Testing 전략

### Backend
- **Query 테스트**: 4 개 Query DTO 의 JOIN 결과 검증. 매트릭스 — 배정 / 미배정 / `COMPLETED` (interview = null) 세 케이스.
- **Reminder Job 테스트** 재작성: T-24h 윈도 안/밖, ASSIGNED 외 상태 제외, config 미생성 모집 제외, dedup_key 중복 가드 동작.
- **통합 테스트**: `LeaderApplicationApi.updateInterview` 엔드포인트 호출 시 404 (또는 ResponseStatusException) — 엔드포인트 제거 검증.
- **Flyway 정합성**: 통합 테스트 컨테이너에서 `application` 테이블에 `interview_at`/`interview_location` 컬럼 부재 확인 (선택).

### Frontend
- 표시 컴포넌트 4 개 테스트 갱신 (위 §4.5).
- 회귀 가드 1 건 신규 (위 §4.5).

---

## 6. Risks

| Risk | 영향 | 완화 |
|---|---|---|
| BE 응답 nested 변경으로 schema drift | FE 빌드 실패 | FE PR 에 schema.d.ts 수동 갱신 포함. BE 머지 후 FE rebase + CI 재실행. |
| Query JOIN N+1 | 운영진 목록 페이지 지연 | QueryDSL fetch join 또는 명시적 `LEFT JOIN FETCH`. 통합 테스트에서 SQL count 검증. |
| 신규 ReminderJob 첫 실행 시 윈도 안 면접 누락 | 알림 미발송 | 운영 데이터 0 이므로 무영향. 운영 도입 시점에 별도 검증. |
| BE 머지 ~ FE 머지 사이 `frontend-ci` 미실행 구간 | FE side 의 stale schema 위험 | FE PR 의 schema.d.ts 가 BE PR 과 동일하면 머지 후 rebase 즉시 green. 머지 간격 분 단위. |
| `InterviewConfig` location null 인 데이터 (모집 단위 단순 누락) | 응답의 `interview.location` 값 부재 | spec 단계에서는 응답 자체를 `null` 처리 (Reminder 도 미발송). 운영 도입 전 운영자 가이드 필요. |

---

## 7. Decisions Log

| # | 결정 | 근거 |
|---|---|---|
| D1 | Phase 2 (dual-write) 폐기 | 운영 데이터 0 — backfill 불필요. |
| D2 | 응답에 nested `interview` 채택 | 평면 필드의 의미 불명확성 제거. endAt 표현 가능. |
| D3 | `interview.status` 미포함 | ASSIGNED 만 노출 정책 → 단일 상태 표현 무의미. YAGNI. |
| D4 | `ApplicantResponse` 는 scalar `interviewStartAt` | 리스트 row 표현 단위 일관. location/endAt 미사용. |
| D5 | Reminder T-24h + 배정 즉시 유지 | 지원자 경험 보존. |
| D6 | PR 분할: BE 1 + FE 1, BE → FE | atomic 머지 보장 + 리뷰 단위 명확. |
| D7 | dedup_key 포맷 유지 | 재배정 자동 처리. 별도 future-handling 불필요. |

---

## 8. References

- 충돌 검토 보고서 — 이전 대화 §3 (Legacy 사용처 매핑)
- PR #332 — Phase 1 (Legacy 입력 버튼 숨김)
- PR #333 — UNDER_REVIEW 자동 전이 UX
- Slot Lifecycle Policy spec — `docs/superpowers/specs/2026-06-10-slot-lifecycle-policy-design.md`
- Flyway V45 (`interview_config.recruitment_id UNIQUE`), V47 (`location` 추가)
