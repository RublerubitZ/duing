# 면접 스케줄링 시스템 설계 사양

작성일: 2026-06-08
대상 도메인:
- `backend/domain/interview/**` (신규)
- `backend/domain/application/**` (기존, 지원서 제출 트랜잭션 확장)
- `backend/domain/notification/**` (기존, 리스너 추가 + 기존 InterviewScheduled 자산 이동)
- `frontend/**` — 별도 spec 으로 분리 (본 spec 은 백엔드 + 도메인 계약 + DB)

선행 사양:
- 2026-06-07 지원자 관리 대시보드 설계 (`applicationEvaluation` 기반, `INTERVIEW_PENDING` 상태값 흐름 의존)

---

## 1. 배경

### 1.1 현재 상황

동아리 모집의 면접 일정 조율은 카카오톡·문자·인스타그램 DM 등 **외부 채널의 수동 커뮤니케이션** 으로 이뤄진다. 이 과정은 운영진과 지원자 모두에게 시간과 커뮤니케이션 비용을 발생시킨다.

코드베이스는 이미 면접 기능을 염두에 두고 다음 자산을 갖고 있다:
- `ApplicationStatus.INTERVIEW_PENDING` enum 값
- `NotificationType.INTERVIEW_SCHEDULED`, `INTERVIEW_REMINDER`
- `notification/event/InterviewScheduledEvent` + `notification/listener/InterviewScheduledListener`
- `notification/job/InterviewReminderJob` (현재 비활성)

그러나 슬롯 등록·가능시간 수집·자동 배정의 코어 도메인이 비어 있어, 면접 운영의 자동화가 막혀 있다.

### 1.2 본 spec 의 책임

다음 흐름을 시스템화한다:

```
운영진: 모집 생성 → InterviewConfig 활성화 → 슬롯 등록
지원자: 지원서 작성 → 슬롯 선택 → 단일 트랜잭션 제출
운영진: 서류 심사 → 면접 대상자 선정 (INTERVIEW_PENDING 으로 상태 전이)
시스템: 자동 배정 (Constrained Greedy Matching)
운영진: 필요 시 수동 조정
지원자: 마이페이지에서 일정 확인
```

이메일·카카오 알림톡·CONFIRMED 흐름·재조정 요청·다중 면접관·그룹 면접·캘린더 연동은 본 spec 의 책임이 아니다 (§9 Out of Scope).

---

## 2. 목표 / Non-목표

### 2.1 목표

- 신규 도메인 `interview/` 추가 — InterviewConfig, InterviewSlot, InterviewAvailability, InterviewSchedule 4 엔티티.
- 면접 모집 활성화 — `InterviewConfig` 존재 여부로 분기. 별도 `hasInterview` 플래그 없음.
- 지원자 가능시간 수집 — 지원서 제출과 **단일 트랜잭션** 으로 처리. `AT_APPLICATION` 타이밍.
- 자동 배정 — Constrained Greedy 알고리즘으로 capacity 준수 + 슬롯 쏠림 최소화.
- 수동 조정 — 운영진이 자동 배정 결과를 슬롯 이동/취소/추가 배정으로 보완.
- 알림 통합 — 기존 in-app `Notification` 도메인을 consumer 로 활용. 이벤트 소유권은 `interview/` 가 보유.
- 운영진 대시보드 API — 자동 배정 전 dry-run 후보 조회 + 배정 완료 후 슬롯별 일정 조회.
- 지원자 마이페이지 API — 본인 면접 일정 조회 (배정 여부 무관 200 응답).

### 2.2 Non-목표 (Out of Scope)

| 영역 | 제외 항목 | 비고 |
|---|---|---|
| 알림 | 이메일 / 카카오 알림톡 / SMS | 인프라 0 상태. Phase 2 에서 `NotificationSender` 추상화 후 도입 |
| 알림 | 면접 리마인더 자동 발송 (`InterviewReminderJob` 활성화) | 본 spec 은 ASSIGNED/UPDATED/CANCELLED 즉시 알림만 |
| 일정 | `CONFIRMED` 상태 + 지원자 확인 API (`POST /interview-schedules/{id}/confirm`) | 지원자 이행 의지 시그널이 필요할 때 Phase 2 에서 도입. enum 은 ASSIGNED·CANCELLED 만 |
| 일정 | 재조정 요청 / 재배정 / Availability Unlock API | `assignmentCompletedAt` 잠금만 사용. 잠금 해제는 운영진의 수동 조정으로만 가능 |
| 일정 | 우선순위 기반 매칭 (1순위/2순위/3순위) | MVP 는 평등 가중치 |
| 슬롯 | 반복 일정 자동 생성 (매주 같은 시간) | 슬롯은 항상 명시적 단건 등록 |
| 면접관 | 다중 면접관 / 면접관 캘린더 동기화 | 운영진 1명 면접 기준 |
| 면접 형식 | 그룹 면접 (N명 동시 진행) | capacity 는 "병렬 진행 가능 인원" 으로 해석되지 않으며 운영 보조 정보 |
| 외부 연동 | Google / Outlook Calendar 연동 | Future Phase |
| 데이터 | 면접 평가 점수 — `applicationEvaluation` 과의 연계 강화 | 본 spec 은 일정 도메인만. 평가는 별도 도메인 그대로 |
| UX | 슬롯 시간 겹침 경고 / 모집 게시 직전 슬롯 부족 경고 | Phase 2 |
| 운영 | `InterviewConfig.interviewType` / `location` / `instructions` / `reminderEnabled` 필드 | Record 시그니처는 확장 친화적으로 두되 컬럼 추가는 미래 |
| 프론트 | 운영진 슬롯 등록 페이지 / 지원자 가능시간 선택 UI / 면접 일정 확인 페이지 | 별도 frontend spec |

---

## 3. 도메인 배치

```
backend/src/main/java/com/duing/domain/
├── interview/                              # 신규 — 본 spec 의 핵심
│   ├── api/
│   │   ├── ManagerInterviewConfigApi.java
│   │   ├── ManagerInterviewSlotApi.java
│   │   ├── ManagerInterviewScheduleApi.java
│   │   └── InterviewScheduleApi.java        # 지원자용
│   ├── controller/
│   │   ├── ManagerInterviewConfigController.java
│   │   ├── ManagerInterviewSlotController.java
│   │   ├── ManagerInterviewScheduleController.java
│   │   └── InterviewScheduleController.java # 지원자용
│   ├── service/
│   │   ├── InterviewConfigService.java + GeneralInterviewConfigService.java
│   │   ├── InterviewSlotService.java + GeneralInterviewSlotService.java
│   │   ├── InterviewAvailabilityService.java + GeneralInterviewAvailabilityService.java
│   │   ├── InterviewScheduleService.java + GeneralInterviewScheduleService.java
│   │   └── InterviewMatchingService.java    # 순수 함수, 인터페이스 1개
│   ├── repository/
│   │   ├── InterviewConfigRepository.java
│   │   ├── InterviewSlotRepository.java (+ Custom + Impl)
│   │   ├── InterviewAvailabilityRepository.java
│   │   └── InterviewScheduleRepository.java (+ Custom + Impl)
│   ├── entity/
│   │   ├── InterviewConfig.java
│   │   ├── InterviewSlot.java
│   │   ├── InterviewAvailability.java
│   │   ├── InterviewSchedule.java
│   │   └── InterviewScheduleStatus.java     # ASSIGNED, CANCELLED
│   ├── dto/
│   │   ├── command/  (Create / Update / Delete / AutoAssign / ManualAssign)
│   │   ├── query/    (Slot / Schedule / Candidates)
│   │   ├── request/  (외부 노출 record)
│   │   └── response/
│   ├── event/
│   │   ├── InterviewScheduledEvent.java     # notification/event 에서 이동
│   │   ├── InterviewUpdatedEvent.java       # 신규
│   │   └── InterviewCancelledEvent.java     # 신규
│   └── exception/InterviewException.java
│
├── application/                            # 기존 — 협력 지점만 확장
│   └── service/GeneralApplicationService.java
│         └─ submit(...) 가 InterviewAvailabilityService.createAllInSubmission(...) 호출
│
├── recruitment/                            # 변경 없음
│
└── notification/
    └── listener/                            # consumer 만
        ├── InterviewScheduledListener.java       # import 경로 갱신
        ├── InterviewUpdatedListener.java         # 신규
        └── InterviewCancelledListener.java       # 신규
```

### 3.1 이벤트 소유권 결정

`InterviewScheduledEvent` 는 비즈니스 의미상 **면접 도메인이 발생시키는 이벤트** 이므로 `interview/event` 가 소유. Notification 도메인은 이벤트 consumer 만 수행. 향후 Audit Log / Analytics / Calendar Integration 등 추가 구독자가 생길 때도 인터페이스 변경 없이 확장된다.

기존 `notification/event/InterviewScheduledEvent.java` 와 `notification/listener/InterviewScheduledListener.java` 의 import 경로는 PR1 에서 일괄 갱신.

---

## 4. 데이터 모델

### 4.1 V45 마이그레이션

`backend/src/main/resources/db/migration/V45__create_interview_tables.sql`

```sql
-- 1. InterviewConfig (recruitment 1:1, optional)
CREATE TABLE interview_config (
    id                        BIGSERIAL PRIMARY KEY,
    recruitment_id            BIGINT NOT NULL UNIQUE
                              REFERENCES recruitment(id) ON DELETE RESTRICT,
    availability_deadline     TIMESTAMP WITH TIME ZONE NOT NULL,
    assignment_completed_at   TIMESTAMP WITH TIME ZONE,
    created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. InterviewSlot
CREATE TABLE interview_slot (
    id              BIGSERIAL PRIMARY KEY,
    recruitment_id  BIGINT NOT NULL REFERENCES recruitment(id) ON DELETE RESTRICT,
    start_time      TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time        TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity        INTEGER NOT NULL CHECK (capacity > 0),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CHECK (end_time > start_time),
    UNIQUE (id, recruitment_id)   -- composite FK target 용
);
CREATE INDEX idx_interview_slot_recruitment_start
    ON interview_slot (recruitment_id, start_time);

-- application 에 composite FK target 추가 (id 는 이미 PK 이므로 redundant 이나 FK 요구사항)
ALTER TABLE application
    ADD CONSTRAINT uk_application_id_recruitment_id UNIQUE (id, recruitment_id);

-- 3. InterviewAvailability (지원자 ↔ 슬롯 N:M, 동일 recruitment 강제)
CREATE TABLE interview_availability (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT NOT NULL,
    slot_id         BIGINT NOT NULL,
    recruitment_id  BIGINT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (application_id, slot_id),
    FOREIGN KEY (application_id, recruitment_id)
        REFERENCES application(id, recruitment_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id, recruitment_id)
        REFERENCES interview_slot(id, recruitment_id) ON DELETE RESTRICT
);
CREATE INDEX idx_interview_availability_slot
    ON interview_availability (slot_id);

-- 4. InterviewSchedule (지원자 1:1, 미배정은 record 없음)
CREATE TABLE interview_schedule (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT NOT NULL UNIQUE,
    slot_id         BIGINT NOT NULL,
    recruitment_id  BIGINT NOT NULL,
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('ASSIGNED', 'CANCELLED')),
    assigned_at     TIMESTAMP WITH TIME ZONE NOT NULL,   -- 현재 배정 시각 (재배정 시 갱신)
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    FOREIGN KEY (application_id, recruitment_id)
        REFERENCES application(id, recruitment_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id, recruitment_id)
        REFERENCES interview_slot(id, recruitment_id) ON DELETE RESTRICT
);
CREATE INDEX idx_interview_schedule_slot ON interview_schedule (slot_id);
```

### 4.2 설계 결정 메모

- `TIMESTAMP WITH TIME ZONE` 통일. JVM 도메인 타입은 **기존 엔티티 컨벤션을 따른다** (§10.1 작업 전 확인).
- `interview_schedule.application_id UNIQUE` → 지원자 1명 = 0~1 일정. CANCELLED 후 재배정은 동일 row UPDATE.
- composite FK 로 application 과 slot 의 `recruitment_id` 동일성을 DB 레벨에서 강제. 서비스 레이어 누락 시 마지막 방어선.
- `interview_slot` 의 시간 겹침은 DB 제약 없음 — capacity 1 슬롯 두 개를 같은 시간에 두는 운영도 허용 (multi-track 면접 future 대비).
- soft delete 미사용. 면접 일정 취소는 `status = CANCELLED` 로만 표현.
- `assigned_at` = "현재 배정 시각" — 재배정 / 슬롯 이동 / CANCELLED → ASSIGNED 재전환 시 모두 갱신.

### 4.3 엔티티 매핑

```java
@Entity
@Table(name = "interview_config")
public class InterviewConfig {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recruitment_id", nullable = false, unique = true)
    private Long recruitmentId;

    @Column(name = "availability_deadline", nullable = false)
    private LocalDateTime availabilityDeadline;     // §10.1 타입 통일 확인

    @Column(name = "assignment_completed_at")
    private LocalDateTime assignmentCompletedAt;

    // createdAt / updatedAt — BaseTimeEntity 상속 패턴 따름

    public boolean isAvailabilitySubmissionAllowed(LocalDateTime now) {
        return now.isBefore(availabilityDeadline) && assignmentCompletedAt == null;
    }
    public boolean isAutoAssignable(LocalDateTime now) {
        return !now.isBefore(availabilityDeadline) && assignmentCompletedAt == null;
    }
    public void markAssignmentCompleted(LocalDateTime now) { this.assignmentCompletedAt = now; }
}
```

`InterviewSlot`, `InterviewAvailability`, `InterviewSchedule` 도 같은 패턴. `@Builder` 는 생성자에, 모든 FK 는 `Long` ID 컬럼으로 보관 (`@ManyToOne` 미사용 — 도메인 경계 명확화). 필요한 경우 service 에서 application/recruitment repository 호출.

---

## 5. API 명세

### 5.1 Manager API (LEADER / OFFICER)

| # | Method | Path | 책임 | 응답 |
|---|---|---|---|---|
| M1 | POST | `/api/v1/recruitments/{recruitmentId}/interview-config` | 면접 모집 활성화 + deadline 설정 | 201 `{ configId }` |
| M2 | PATCH | `/api/v1/recruitments/{recruitmentId}/interview-config` | 설정 갱신 (현재는 deadline 만) | 204 |
| M3 | POST | `/api/v1/recruitments/{recruitmentId}/interview-slots` | 슬롯 bulk 생성 | 201 `{ slotIds }` |
| M4 | GET | `/api/v1/recruitments/{recruitmentId}/interview-slots` | 슬롯 목록 + availability/assigned 카운트 | 200 |
| M5 | PATCH | `/api/v1/interview-slots/{slotId}` | 시간/capacity 수정 | 204 |
| M6 | DELETE | `/api/v1/interview-slots/{slotId}` | 슬롯 삭제 | 204 |
| M7 | POST | `/api/v1/recruitments/{recruitmentId}/interview-schedules/auto-assign` | 자동 배정 1회 실행 | 200 `AutoAssignResultResponse` |
| M8 | GET | `/api/v1/recruitments/{recruitmentId}/interview-schedules` | 운영진 대시보드 — 슬롯별 일정 | 200 |
| M9 | PUT | `/api/v1/applications/{applicationId}/interview-schedule` | 수동 배정/이동 (idempotent) | 204 |
| M10 | DELETE | `/api/v1/applications/{applicationId}/interview-schedule` | 일정 취소 (status=CANCELLED) | 204 |
| M11 | GET | `/api/v1/recruitments/{recruitmentId}/interview-matching-candidates` | dry-run 후보 조회 | 200 `MatchingCandidatesResponse` |

### 5.2 Applicant API (STUDENT, 본인 application 한정)

| # | Method | Path | 책임 | 응답 |
|---|---|---|---|---|
| A1 | PUT | `/api/v1/applications/{applicationId}/interview-availabilities` | 가능시간 전체 교체 (`@Size(min=1)`) | 204 |
| A2 | GET | `/api/v1/applications/{applicationId}/interview-schedule` | 본인 면접 일정 조회 | 200 `MyInterviewScheduleResponse` |

A2 는 **배정 유무와 무관하게 200** 으로 응답:
```java
public record MyInterviewScheduleResponse(
    boolean assigned,
    InterviewScheduleDetail schedule   // assigned=false 이면 null
) {
    public record InterviewScheduleDetail(
        Long scheduleId, Long slotId,
        LocalDateTime startTime, LocalDateTime endTime,
        InterviewScheduleStatus status, LocalDateTime assignedAt
    ) {}
}
```

### 5.3 Application 도메인 확장

`POST /api/v1/clubs/{clubId}/recruitments/{recruitmentId}/applications` request 확장:

```java
public record SubmitApplicationRequest(
    @Valid List<ApplicationAnswerRequest> answers,
    @NotNull List<Long> interviewSlotIds   // 항상 배열. 일반 모집은 빈 배열, 면접 모집은 ≥1
) {}
```

`GeneralApplicationService.submit(...)` 의 단일 트랜잭션 검증 흐름:

1. `recruitment.interviewConfig == null && !interviewSlotIds.isEmpty()` → 400 `INVALID_SLOT_SELECTION`
2. `recruitment.interviewConfig != null && interviewSlotIds.isEmpty()` → 400 `INVALID_SLOT_SELECTION`
3. `now >= availabilityDeadline` → 409 `AVAILABILITY_PERIOD_CLOSED`
4. `interviewSlotIds` 의 중복 검출 → 400 `DUPLICATE_SLOT_IN_REQUEST`
5. 모든 `slotId` 가 동일 recruitment 소속인지 검증 (composite FK 가 최종 방어선)
6. Application insert → InterviewAvailability bulk insert → commit

### 5.4 주요 DTO

```java
// M1 / M2
public record CreateInterviewConfigRequest(@NotNull @Future LocalDateTime availabilityDeadline) {}
public record UpdateInterviewConfigRequest(LocalDateTime availabilityDeadline) {}   // 모든 필드 nullable
                                                                                   // = "변경하지 않음"
// M3 — bulk
public record CreateInterviewSlotsRequest(@NotEmpty @Valid List<SlotEntry> slots) {
    public record SlotEntry(
        @NotNull LocalDateTime startTime,
        @NotNull LocalDateTime endTime,
        @Min(1) int capacity
    ) {}
}

// M5
public record UpdateInterviewSlotRequest(
    LocalDateTime startTime, LocalDateTime endTime, Integer capacity   // 모두 nullable
) {}

// M7 응답
public record AutoAssignResultResponse(
    int totalCandidates,                       // INTERVIEW_PENDING 지원자 수
    int assignedCount,                         // 배정 성공
    int unassignedCount,                       // capacity 부족 등으로 미배정
    int noAvailabilityCount,                   // INTERVIEW_PENDING 이지만 가능시간 0개
    LocalDateTime assignmentCompletedAt
) {}

// M9
public record AssignInterviewScheduleRequest(@NotNull Long slotId) {}

// M11
public record MatchingCandidatesResponse(
    int totalCandidates,
    int candidatesWithAvailability,
    int candidatesWithoutAvailability,
    List<SlotCandidatesView> slots
) {
    public record SlotCandidatesView(
        Long slotId, LocalDateTime startTime,
        int capacity, int availabilityCount, int alreadyAssignedCount
    ) {}
}

// A1
public record UpdateAvailabilityRequest(@NotEmpty List<Long> slotIds) {}
```

### 5.5 시간 모집 라이프사이클 가드

| 조건 | M1 | M2 | M3 | M5 | M6 | M7 | M9 | M10 | A1 | Submit |
|---|---|---|---|---|---|---|---|---|---|---|
| recruitment 시작 후 | ❌ | ✅ | ❌ | △ | △ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `now >= availabilityDeadline` | — | ✅ | △ | △ | △ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `assignmentCompletedAt != null` | — | ❌ | ❌ | △ | △ | ❌ | ✅ | ✅ | ❌ | — |
| slot 에 availability ≥ 1 | — | — | — | 시간 ❌ / cap+ ✅ / cap- 조건부 | ❌ | — | — | — | — | — |
| slot 에 schedule ≥ 1 (ASSIGNED) | — | — | — | 시간 ❌ / cap- 조건부 | ❌ | — | — | — | — | — |

(△ = 운영진 라이프사이클 정책상 가능하나 본 spec 에선 추가 정책 없이 기본 허용)

---

## 6. 자동 배정 알고리즘

### 6.1 알고리즘 정의

**Constrained Greedy — Least Flexible Applicant First + Load Balancing**

```
Step 1. applicants 를 선택 슬롯 수 오름차순 정렬
        Tie-break: applicationId 오름차순 (deterministic)

Step 2. 각 applicant 에 대해
        candidates = applicant.selectedSlotIds
                       .filter(s -> assignedCount[s] < s.capacity)
        candidates 비면 → unassigned, 다음 applicant

Step 3. candidates 중 assignedCount[s] 가 가장 작은 슬롯 선택
        Tie-break 1: startTime 오름차순
        Tie-break 2: slotId 오름차순 (deterministic)

Step 4. assigned 에 (applicationId, slotId) 추가, in-memory assignedCount[s] += 1
```

복잡도: O(N log N) 정렬 + O(N · K) 매칭. 모집당 N ≤ 200 가정.

### 6.2 순수 함수 시그니처

```java
public class InterviewMatchingService {

    public record MatchingInput(
        List<ApplicantSelection> applicants,
        List<SlotState> slots
    ) {
        public record ApplicantSelection(Long applicationId, Set<Long> selectedSlotIds) {}
        public record SlotState(Long slotId, LocalDateTime startTime, int capacity) {}
    }

    public record MatchingResult(
        List<Assignment> assigned,
        List<Long> unassignedApplicationIds
    ) {
        public record Assignment(Long applicationId, Long slotId) {}
    }

    public MatchingResult match(MatchingInput input) { /* §6.1 의 4-step */ }
}
```

DB·시계·랜덤 의존 없음. 같은 입력 → 같은 출력.

### 6.3 M7 자동 배정 트랜잭션 흐름

```
GeneralInterviewScheduleService.autoAssign(recruitmentId)
  ├─ @Transactional 진입
  ├─ SELECT ... FOR UPDATE interview_config WHERE recruitment_id = ?
  │     → 동시 자동배정 호출 차단 (pessimistic lock)
  ├─ 검증
  │     ① now < availabilityDeadline                → 409 AVAILABILITY_PERIOD_OPEN
  │     ② assignmentCompletedAt != null             → 409 ASSIGNMENT_ALREADY_COMPLETED
  │     ③ 슬롯 ≥ 1                                  → 409 INTERVIEW_NO_SLOTS
  │     ④ status=INTERVIEW_PENDING 지원자 ≥ 1       → 409 INTERVIEW_NO_CANDIDATES
  │                                                  (assignmentCompletedAt 기록 안 함)
  ├─ MatchingInput 구성
  │     applicants: status=INTERVIEW_PENDING AND availability ≥ 1 (availability=0 은 noAvailabilityCount 로 별도 집계)
  │     slots: recruitment 의 전체 슬롯
  ├─ matchingService.match(input)
  ├─ assigned 결과 → InterviewSchedule upsert
  │     기존 record (CANCELLED) 있으면 UPDATE: status=ASSIGNED, slot_id=..., assigned_at=now
  │     없으면 INSERT
  ├─ interview_config.assignment_completed_at = now
  ├─ assigned 각 건마다 eventPublisher.publishEvent(InterviewScheduledEvent(...))
  │     publish 자체는 트랜잭션 내부 호출 — 컨텍스트에 버퍼링
  ├─ commit
  └─ AFTER_COMMIT: @TransactionalEventListener(AFTER_COMMIT) 리스너가 알림 생성
```

### 6.4 수동 조정 동시성 (M9 / M10)

```java
// M9 PUT — source + target slot 모두 lock
@Transactional
public void assign(Long applicationId, Long targetSlotId, Long actorUserId) {
    Application application = applicationRepository.getById(applicationId);
    Recruitment recruitment = application.getRecruitment();
    clubAuthorizationService.requireManager(recruitment.getClubId(), actorUserId);

    if (application.getStatus() != ApplicationStatus.INTERVIEW_PENDING) {
        throw new InterviewException.InvalidApplicationStatus();
    }

    Optional<InterviewSchedule> existing = scheduleRepository.findByApplicationId(applicationId);
    Long currentSlotId = existing.map(InterviewSchedule::getSlotId).orElse(null);

    // deadlock 방지: slot id 오름차순으로 lock 획득
    List<Long> slotIdsToLock = Stream.of(currentSlotId, targetSlotId)
        .filter(Objects::nonNull).distinct().sorted().toList();
    Map<Long, InterviewSlot> locked = slotRepository.findAllByIdInForUpdate(slotIdsToLock).stream()
        .collect(toMap(InterviewSlot::getId, s -> s));

    InterviewSlot target = locked.get(targetSlotId);
    long currentAssigned = scheduleRepository.countAssignedBySlotId(targetSlotId);
    if (existing.isEmpty() || !targetSlotId.equals(currentSlotId)) {
        if (currentAssigned >= target.getCapacity()) {
            throw new InterviewException.CapacityExceeded();
        }
    }

    LocalDateTime now = LocalDateTime.now();
    InterviewSchedule schedule = existing
        .map(s -> { s.reassign(targetSlotId, now); return s; })
        .orElseGet(() -> InterviewSchedule.create(applicationId, targetSlotId, recruitment.getId(), now));
    scheduleRepository.save(schedule);

    boolean isNewAssignment = existing.isEmpty()
        || existing.get().getStatus() == InterviewScheduleStatus.CANCELLED;
    boolean isMove = existing.isPresent()
        && existing.get().getStatus() == InterviewScheduleStatus.ASSIGNED
        && !targetSlotId.equals(currentSlotId);

    if (isNewAssignment) eventPublisher.publishEvent(new InterviewScheduledEvent(...));
    else if (isMove)     eventPublisher.publishEvent(new InterviewUpdatedEvent(...));
}
```

M10 DELETE 는 schedule row 단순 UPDATE (`status = CANCELLED`) — slot lock 불필요. 이벤트는 `InterviewCancelledEvent`.

### 6.5 이벤트 발행 매트릭스

| 트리거 | 이벤트 | 발행 위치 | 소비 시점 |
|---|---|---|---|
| M7 자동배정 성공 (N건) | `InterviewScheduledEvent × N` | service 트랜잭션 내부 | AFTER_COMMIT |
| M9 신규 배정 (record 신규 또는 CANCELLED→ASSIGNED) | `InterviewScheduledEvent` | service 트랜잭션 내부 | AFTER_COMMIT |
| M9 슬롯 이동 (ASSIGNED→ASSIGNED, slotId 변경) | `InterviewUpdatedEvent` | service 트랜잭션 내부 | AFTER_COMMIT |
| M10 일정 취소 | `InterviewCancelledEvent` | service 트랜잭션 내부 | AFTER_COMMIT |

`@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)` — 트랜잭션 롤백 시 알림 미발행.

---

## 7. 예외 · 권한 · 트랜잭션

### 7.1 InterviewException 계층

```java
public abstract class InterviewException extends RuntimeException {
    protected InterviewException(String message) { super(message); }
    public abstract HttpStatus status();
    public abstract String code();

    // === 404 ===
    public static final class InterviewConfigNotFound extends InterviewException { /* INTERVIEW_CONFIG_NOT_FOUND */ }
    public static final class SlotNotFound          extends InterviewException { /* INTERVIEW_SLOT_NOT_FOUND */ }
    public static final class ScheduleNotFound      extends InterviewException { /* INTERVIEW_SCHEDULE_NOT_FOUND */ }
    //   ScheduleNotFound 사용처: M10 DELETE 한정. A2 GET 은 200 응답으로 처리.

    // === 409 — 라이프사이클 분리 ===
    public static final class ConfigAlreadyExists         extends InterviewException { /* CONFIG_ALREADY_EXISTS */ }
    public static final class RecruitmentAlreadyStarted   extends InterviewException { /* RECRUITMENT_ALREADY_STARTED */ }
    public static final class AvailabilityPeriodClosed    extends InterviewException { /* AVAILABILITY_PERIOD_CLOSED — now >= deadline */ }
    public static final class AvailabilityPeriodOpen      extends InterviewException { /* AVAILABILITY_PERIOD_OPEN — M7 deadline 전 호출 */ }
    public static final class AssignmentAlreadyCompleted  extends InterviewException { /* ASSIGNMENT_ALREADY_COMPLETED — assignmentCompletedAt != null */ }
    public static final class NoSlotsAvailable            extends InterviewException { /* INTERVIEW_NO_SLOTS */ }
    public static final class NoCandidates                extends InterviewException { /* INTERVIEW_NO_CANDIDATES */ }

    // === 409 — 슬롯 수정 ===
    public static final class SlotHasAvailability extends InterviewException { /* SLOT_HAS_AVAILABILITY */ }
    public static final class SlotHasSchedule     extends InterviewException { /* SLOT_HAS_SCHEDULE */ }
    public static final class CapacityBelowAssigned extends InterviewException { /* CAPACITY_BELOW_ASSIGNED */ }
    public static final class CapacityExceeded    extends InterviewException { /* CAPACITY_EXCEEDED */ }

    // === 409 — race ===
    public static final class AvailabilityConflict extends InterviewException { /* AVAILABILITY_CONFLICT — A1 동시 PUT 시 unique violation 변환 */ }

    // === 400 ===
    public static final class DuplicateSlotInRequest   extends InterviewException { /* DUPLICATE_SLOT_IN_REQUEST */ }
    public static final class InvalidSlotSelection     extends InterviewException { /* INVALID_SLOT_SELECTION */ }
    public static final class InvalidApplicationStatus extends InterviewException { /* INVALID_APPLICATION_STATUS */ }
    public static final class InvalidDeadline          extends InterviewException { /* INVALID_DEADLINE — recruitment 범위 밖 / 과거 시각 */ }

    // === 403 ===
    public static final class NotApplicationOwner extends InterviewException { /* NOT_APPLICATION_OWNER */ }
}
```

기존 `GlobalExceptionHandler` 에 `@ExceptionHandler(InterviewException.class)` 추가 — `status()` / `code()` 사용해 ErrorResponse 매핑.

### 7.2 권한 매트릭스

| API | 인증 | 권한 검증 |
|---|---|---|
| M1 ~ M8, M11 | JWT | `clubAuthorizationService.requireManager(clubId, userId)` — LEADER 또는 OFFICER |
| M9, M10 | JWT | 동일 (application → recruitment → clubId) |
| A1, A2 | JWT | `application.userId == currentUserId` (`NotApplicationOwner`) |
| Submit 확장 | JWT | 기존 application 제출 규칙 그대로 |

권한 검증 위치: **service 진입부**. controller 는 dispatch 만 담당.

### 7.3 트랜잭션 매트릭스

| API | 트랜잭션 | Lock |
|---|---|---|
| M1, M2, M3 | 쓰기 | 없음 |
| M4 | 읽기 (`readOnly = true`) | 없음 |
| M5, M6 | 쓰기 | 해당 slot `SELECT FOR UPDATE` |
| M7 auto-assign | 쓰기 | `interview_config` row `SELECT FOR UPDATE` |
| M8, M11 | 읽기 | 없음 |
| M9 | 쓰기 | source + target slot **id 오름차순** `SELECT FOR UPDATE` |
| M10 | 쓰기 | schedule row 단순 UPDATE |
| A1 | 쓰기 | 없음 — unique violation 시 도메인 예외 변환 |
| A2 | 읽기 | 없음 |
| Submit 확장 | 쓰기 (기존) | application slot lock 없음 |

### 7.4 입력 검증 규칙

| 필드 | 규칙 | 위반 |
|---|---|---|
| `availabilityDeadline` | `@NotNull`, `@Future`, recruitment.startDate ≤ deadline ≤ recruitment.endDate | 400 `INVALID_DEADLINE` |
| `slot.startTime/endTime` | `@NotNull`, `endTime > startTime` | 400 |
| `slot.capacity` | `@Min(1)` | 400 |
| `slot.recruitmentId` | recruitment 시작 전 | 409 `RECRUITMENT_ALREADY_STARTED` |
| `interviewSlotIds` (Submit) | `@NotNull`, 중복 금지, 동일 recruitment | 400 |
| `slotIds` (A1) | `@NotEmpty`, 중복 금지 | 400 |

### 7.5 알림 멱등성 / 재시도

본 MVP 는 in-app `Notification` insert 만 → outbox 패턴 미도입. listener 내부 예외는 로그만 — 알림 실패가 면접 일정을 깨면 안 됨. 향후 이메일/카카오톡 도입 시 재시도/outbox 별도 spec.

---

## 8. 테스트 전략

### 8.1 4계층 테스트

**계층 1 — 도메인 단위 (no Spring)**

`InterviewMatchingService.match()` 순수 함수. TestContainers 불필요.

```
✅ "선택 슬롯 수가 적은 지원자가 먼저 배정된다"
✅ "동일한 슬롯 후보 중 현재 배정 수가 가장 적은 슬롯이 선택된다"
✅ "배정 수가 동률이면 가장 빠른 시간의 슬롯이 선택된다"
✅ "capacity 가 모두 소진된 지원자는 미배정 결과에 포함된다"
✅ "선택한 슬롯이 모두 만석이면 미배정으로 분류된다"
✅ "동일 입력에 대해 매칭 결과는 항상 동일하다"
✅ "단일 슬롯에 capacity 만큼만 배정되고 나머지는 미배정된다"
✅ "가능시간이 없는 지원자는 입력에 포함되지 않으면 결과에 나타나지 않는다"
```

**계층 2 — JPA 슬라이스 (`@DataJpaTest`)**

```
✅ "다른 recruitment 의 slot 과 application 으로 InterviewAvailability 생성 시 FK 위반이 발생한다"
✅ "(application_id, slot_id) 중복 insert 시 UNIQUE 위반이 발생한다"
✅ "InterviewSchedule 의 status 가 ASSIGNED/CANCELLED 외 값이면 CHECK 위반이 발생한다"
✅ "InterviewSchedule 재배정 시 assigned_at 이 갱신된다"
```

**계층 3 — 서비스 통합 (TestContainers)**

```
✅ "now < availabilityDeadline 일 때 자동배정 호출은 409 를 반환한다"
✅ "assignmentCompletedAt 이 이미 채워진 모집을 재호출하면 409 를 반환한다"
✅ "INTERVIEW_PENDING 지원자가 0명이면 409 를 반환하고 assignmentCompletedAt 은 기록되지 않는다"
✅ "자동배정 성공 후 assigned 지원자에게 InterviewScheduledEvent 가 발행된다"
✅ "동시 자동배정 호출 시 한 건만 성공한다"
✅ "트랜잭션 롤백 시 InterviewScheduledEvent 는 발행되지 않는다"

[Availability]
✅ "동일 슬롯이 selectedSlotIds 리스트 안에 중복으로 들어오면 400 을 반환한다"
✅ "PUT 두 번 호출 시 두 번째 호출 결과로 완전히 교체된다"
✅ "동시에 같은 application 에 대한 PUT 두 건이 들어와도 unique violation 으로 끝나지 않고 한 건만 성공한다"
✅ "(application_id, slot_id) 가 두 번 insert 되면 도메인 예외로 변환되어 409 를 반환한다"

[Submit 확장]
✅ "면접 모집에 가능시간을 0개 선택하면 지원서 제출이 실패한다"
✅ "지원서 제출 시 동일 슬롯이 중복으로 들어오면 400 을 반환하고 application 도 생성되지 않는다"
✅ "InterviewAvailability bulk insert 가 실패하면 application 도 롤백된다"

[수동 조정]
✅ "M9 호출 시 target slot capacity 가 가득 차 있으면 409 를 반환한다"
✅ "M9 슬롯 이동 시 source 슬롯 카운트가 감소하고 target 슬롯 카운트가 증가한다"
✅ "M10 호출 시 schedule 이 없으면 404 ScheduleNotFound 가 반환된다"
```

**계층 4 — API 통합 (RestAssured)**

각 API 별 happy path + 403 권한 거부 + 409 라이프사이클 위반 케이스. PR 별로 해당 API 의 테스트 포함.

### 8.2 Fixture 추가

`backend/.../common/fixture/` 에 다음 정적 메서드 추가 (PR1):
- `InterviewConfigFixture.create(recruitmentId, deadline)`
- `InterviewSlotFixture.create(recruitmentId, startTime, capacity)`
- `InterviewAvailabilityFixture.link(applicationId, slotId, recruitmentId)`
- `InterviewScheduleFixture.assigned(applicationId, slotId, recruitmentId)`

`@DisplayName` 은 모두 한국어 문장, 메서드명 금지.

---

## 9. PR 분할

총 11 PR. 백엔드 컨벤션의 "1 API = 1 PR" 원칙을 기본으로 하되, **CRUD 짝 (POST+PATCH, PATCH+DELETE) 과 자동배정 관련 GET (M8/M11) 은 의미 단위로 한 PR 에 묶는다**. 묶음 단위는 리뷰 부담과 통합 일관성을 모두 고려한 결과로, 본 spec 의 phase 그래프(§3 ~ §9)와 사용자가 합의한 분할.

```
Phase A — Foundation
  PR1  feat(interview): V45 마이그레이션 + 4개 엔티티 + InterviewException
       + notification/event/InterviewScheduledEvent → interview/event 이동
       + 기존 InterviewScheduledListener import 갱신
       + Fixture 추가
  PR2  feat(interview): M1 POST interview-config + M2 PATCH interview-config
  PR3  feat(interview): M3 POST slots (bulk) + M4 GET slots
  PR4  feat(interview): M5 PATCH slot + M6 DELETE slot

Phase B — Applicant Flow
  PR5  feat(application): 지원서 제출 API 확장 (interviewSlotIds + 단일 트랜잭션)
  PR6  feat(interview): A1 PUT availabilities                                ┐ 병렬 가능
  PR7  feat(interview): A2 GET my interview-schedule                          ┘

Phase C — Matching + Manual
  PR8  feat(interview): InterviewMatchingService 도메인 서비스 (순수 함수)
  PR9  feat(interview): M7 auto-assign + M8 GET schedules + M11 candidates
  PR10 feat(interview): M9 PUT schedule + M10 DELETE schedule

Phase D — Notification Consumers
  PR11 feat(notification): InterviewUpdatedEvent / InterviewCancelledEvent 리스너
       (Phase B 시작 시점부터 병렬 가능 — interview/event 가 PR1 에 포함됨)
```

각 PR 의 의존성:
- PR1 → PR2 → PR3 → PR4 (스키마 → CRUD)
- PR4 머지 후 → PR5 (application 확장은 slot 존재 가정)
- PR5 머지 후 → PR6, PR7 병렬
- PR4 머지 후 → PR8 → PR9 → PR10 (매칭은 슬롯 + 지원자 데이터 필요하므로 통합테스트 측면에서 PR5 도 머지된 상태에서 진행 권장)
- PR1 머지 후 → PR11 병렬 가능

---

## 10. 작업 전 확인 사항

### 10.1 시간 타입 통일

본 spec 의 엔티티 예시는 `LocalDateTime` 으로 표기되어 있으나, **PR1 작업 직전 `Recruitment.getStartDate()` 의 반환 타입을 확인하고 동일 타입으로 통일**한다. 기존 컨벤션이 `LocalDateTime` 이면 그대로, `OffsetDateTime` 이면 모든 신규 엔티티/DTO 를 `OffsetDateTime` 으로 정렬. 새 타입을 단독 도입하지 않는다.

### 10.2 `application` 테이블 `UNIQUE (id, recruitment_id)` 영향

- `id` 는 PK 이므로 implicit unique. composite UNIQUE 추가는 데이터 무결성 측면에선 redundant.
- 그러나 Postgres FK target 으로 사용하기 위한 **명시적 UNIQUE 제약** 이 요구되어 추가 필요.
- V6 의 `unique_application_recruitment_user (recruitment_id, user_id)` 와 의미·컬럼 모두 겹치지 않음.
- 제약명은 V6 의 네이밍 형식 확인 후 `uk_application_id_recruitment_id` 로 통일 (또는 V6 형식과 정렬).

### 10.3 `InterviewScheduledEvent` 기존 사용처

- `notification/event/InterviewScheduledEvent.java` 의 시그니처가 본 spec 의 발행 정보와 호환되는지 확인.
- 호환되지 않으면 PR1 내에서 시그니처 변경 + listener 동기화.
- 호환되면 패키지만 이동.

### 10.4 트랜잭션 이벤트 패턴

기존 `RecruitmentOpenedListener` 가 `@TransactionalEventListener(AFTER_COMMIT)` 을 쓰는지 확인. 다른 패턴이면 그 패턴에 정렬.

---

## 11. Success Metrics

| Metric | 정의 | 측정 |
|---|---|---|
| 일정 조율 메시지 수 감소 | 면접 일정 관련 외부 채널 메시지 횟수 | 운영진 사후 설문 (정성) |
| 자동배정 → 면접 진행까지 리드타임 | `interview_config.assignmentCompletedAt` ~ `interview_slot.startTime` 평균 | 분석 쿼리 |
| 자동배정 1회 성공률 | `assignedCount / totalCandidates` | M7 응답 누적 |
| 미배정자 비율 | `unassignedCount / totalCandidates` | M7 응답 누적 |
| 운영진 수동 조정 횟수 | M9 / M10 호출 수 | API 로그 |
| **Availability Completion Rate** | 면접 모집 지원자 중 availability ≥ 1 인 비율 | `candidatesWithAvailability / totalCandidates` (M11 응답) |

---

## 12. Future Enhancements

본 spec 의 record/엔티티 시그니처는 다음 확장을 친화적으로 받아들이도록 설계됐다:

- `InterviewConfig` 에 `interviewType` / `location` / `instructions` / `reminderEnabled` 필드 추가 (UpdateInterviewConfigRequest 가 모든 필드 nullable 방식이므로 backward compatible).
- `InterviewScheduleStatus` 에 `CONFIRMED` 추가 (지원자 확인 API 도입 시).
- `NotificationSender` 추상화 후 이메일/카카오톡 채널 추가.
- 면접 평가 점수 (`applicationEvaluation`) 와 자동 배정의 우선순위 가중치 연계.
- 다중 면접관 / 면접관 캘린더 동기화 — `interview_slot` 에 `interviewerId` 컬럼 + 별도 도메인 신설.

---

## 변경 이력

- 2026-06-08 — 최초 작성. 면접 스케줄링 MVP 11 PR 분할, AT_APPLICATION 타이밍, Constrained Greedy 알고리즘 확정.
