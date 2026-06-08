# 면접 스케줄링 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영진이 등록한 면접 슬롯을 지원자가 지원서 제출과 단일 트랜잭션으로 선택하고, 운영진이 자동 배정을 1회 실행해 일정을 확정하는 흐름을 백엔드에 구현한다.

**Architecture:** 신규 `interview/` 도메인 (4 엔티티 · 13 API · 순수 함수 매칭 알고리즘) + 기존 `application/` 제출 트랜잭션 확장 + `notification/` 도메인의 consumer 역할. 이벤트 소유권은 `interview/event` 에 둔다. 자동 배정은 `interview_config` row 의 pessimistic lock 으로 1회만 실행.

**Tech Stack:** Spring Boot 3.4 · Java 21 · JPA · QueryDSL · Flyway · PostgreSQL · RestAssured · TestContainers · Fixture Monkey

**선행 spec:** [docs/superpowers/specs/2026-06-08-interview-scheduling-design.md](../specs/2026-06-08-interview-scheduling-design.md)

---

## Phase 의존성 그래프

```
Task 0 (작업 전 확인)
  ↓
Phase A — Foundation
  Task 1 (PR1) — V45 마이그레이션 + 엔티티 + 예외 + 이벤트 이동 + Fixture
    ↓
  Task 2 (PR2) — M1 POST config + M2 PATCH config
    ↓
  Task 3 (PR3) — M3 POST slots + M4 GET slots
    ↓
  Task 4 (PR4) — M5 PATCH slot + M6 DELETE slot
    ↓
Phase B — Applicant Flow
  Task 5 (PR5) — Application 제출 확장 (interviewSlotIds + 단일 트랜잭션)
    ↓
  Task 6 (PR6) — A1 PUT availabilities   ┐ 병렬
  Task 7 (PR7) — A2 GET my schedule       ┘
    ↓
Phase C — Matching + Manual
  Task 8 (PR8)  — InterviewMatchingService 순수 함수
    ↓
  Task 9 (PR9)  — M7 auto-assign + M8 GET schedules + M11 candidates
    ↓
  Task 10 (PR10) — M9 PUT schedule + M10 DELETE schedule
    ↓
Phase D — Notification Consumers
  Task 11 (PR11) — Updated/Cancelled 이벤트 리스너 (Task 1 머지 후 어디서나 병렬 가능)
```

---

## Task 0: 작업 전 확인 (1 brief PR 또는 첫 task 의 head 에 흡수)

**목적:** spec §10 의 사전 확인 4건을 코드 변경 전 정리. 발견 사항을 메모 파일로 남겨 이후 task 들이 일관된 결정 위에서 진행되도록 함.

**Files:**
- Create: `backend/docs/interview-scheduling-prework-notes.md`
- Read only: `backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java`, `backend/src/main/java/com/duing/domain/application/entity/Application.java`, `backend/src/main/java/com/duing/domain/notification/event/InterviewScheduledEvent.java`, `backend/src/main/java/com/duing/domain/notification/listener/InterviewScheduledListener.java`, `backend/src/main/java/com/duing/domain/notification/listener/RecruitmentOpenedListener.java`, `backend/src/main/resources/db/migration/V6__add_unique_index_application_recruitment_user.sql`

- [ ] **Step 1: 시간 타입 확인**

`Recruitment.getStartDate()` 의 반환 타입을 확인하고 메모 파일에 기록.
```bash
grep -n "private.*startDate\|getStartDate" backend/src/main/java/com/duing/domain/recruitment/entity/Recruitment.java
```
LocalDateTime / OffsetDateTime / LocalDate 중 어느 것인지 확정. plan 의 모든 후속 task 가 이 타입을 그대로 사용한다.

- [ ] **Step 2: application 의 기존 UNIQUE 제약 확인**

V6 마이그레이션과 application 엔티티 정의를 읽고 `(id, recruitment_id) UNIQUE` 추가가 기존 제약과 충돌하지 않음을 확인.
```bash
cat backend/src/main/resources/db/migration/V6__add_unique_index_application_recruitment_user.sql
grep -n "uniqueConstraints\|UniqueConstraint" backend/src/main/java/com/duing/domain/application/entity/Application.java
```

- [ ] **Step 3: `InterviewScheduledEvent` 기존 시그니처 확인**

기존 record 의 필드와 사용처(`InterviewScheduledListener`) 의 의존성을 파악. spec 이 요구하는 발행 정보(applicationId, slotId, startTime 등) 와 호환되는지 확인. 호환 안 되면 Task 1 안에서 시그니처 변경 + listener 동시 갱신 필요.
```bash
cat backend/src/main/java/com/duing/domain/notification/event/InterviewScheduledEvent.java
cat backend/src/main/java/com/duing/domain/notification/listener/InterviewScheduledListener.java
```

- [ ] **Step 4: `@TransactionalEventListener` 패턴 확인**

`RecruitmentOpenedListener` 가 `@TransactionalEventListener(phase = AFTER_COMMIT)` 를 쓰는지 확인. 다른 패턴이면 그 패턴에 정렬.
```bash
grep -n "TransactionalEventListener\|EventListener" backend/src/main/java/com/duing/domain/notification/listener/RecruitmentOpenedListener.java
```

- [ ] **Step 5: 발견 사항 정리 + 커밋**

`backend/docs/interview-scheduling-prework-notes.md` 에 4 항목 결과를 표로 정리. plan 의 나머지 task 가 이 메모를 참조한다.
```bash
git add backend/docs/interview-scheduling-prework-notes.md
git commit -m "docs(interview): pre-work notes for V45 + entities + event ownership"
```

---

## Task 1 (PR1): V45 마이그레이션 + 엔티티 + InterviewException + 이벤트 이동 + Fixture

**목적:** 면접 도메인의 영속 계층·예외 계층·이벤트 소유권 이동·테스트 fixture 를 한 번에 깔아 후속 task 들의 기반을 만든다.

**Files:**
- Create: `backend/src/main/resources/db/migration/V45__create_interview_tables.sql`
- Create: `backend/src/main/java/com/duing/domain/interview/entity/InterviewConfig.java`
- Create: `backend/src/main/java/com/duing/domain/interview/entity/InterviewSlot.java`
- Create: `backend/src/main/java/com/duing/domain/interview/entity/InterviewAvailability.java`
- Create: `backend/src/main/java/com/duing/domain/interview/entity/InterviewSchedule.java`
- Create: `backend/src/main/java/com/duing/domain/interview/entity/InterviewScheduleStatus.java`
- Create: `backend/src/main/java/com/duing/domain/interview/exception/InterviewException.java`
- Create: `backend/src/main/java/com/duing/domain/interview/event/InterviewScheduledEvent.java` (이동)
- Create: `backend/src/main/java/com/duing/domain/interview/event/InterviewUpdatedEvent.java`
- Create: `backend/src/main/java/com/duing/domain/interview/event/InterviewCancelledEvent.java`
- Create: `backend/src/test/java/com/duing/common/fixture/InterviewConfigFixture.java`
- Create: `backend/src/test/java/com/duing/common/fixture/InterviewSlotFixture.java`
- Create: `backend/src/test/java/com/duing/common/fixture/InterviewAvailabilityFixture.java`
- Create: `backend/src/test/java/com/duing/common/fixture/InterviewScheduleFixture.java`
- Create: `backend/src/test/java/com/duing/domain/interview/repository/InterviewSchemaTest.java`
- Delete: `backend/src/main/java/com/duing/domain/notification/event/InterviewScheduledEvent.java`
- Modify: `backend/src/main/java/com/duing/domain/notification/listener/InterviewScheduledListener.java` (import 경로만)
- Modify: `backend/src/main/java/com/duing/global/exception/GlobalExceptionHandler.java` (InterviewException 핸들러 추가)

- [ ] **Step 1: V45 마이그레이션 작성**

`backend/src/main/resources/db/migration/V45__create_interview_tables.sql` 파일을 생성하고 spec §4.1 의 SQL 을 그대로 옮긴다. composite FK · status CHECK · ON DELETE RESTRICT · `application(id, recruitment_id)` UNIQUE 모두 포함.

```sql
-- 1. InterviewConfig
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
    UNIQUE (id, recruitment_id)
);
CREATE INDEX idx_interview_slot_recruitment_start
    ON interview_slot (recruitment_id, start_time);

-- application 에 composite FK target 추가
ALTER TABLE application
    ADD CONSTRAINT uk_application_id_recruitment_id UNIQUE (id, recruitment_id);

-- 3. InterviewAvailability
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

-- 4. InterviewSchedule
CREATE TABLE interview_schedule (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT NOT NULL UNIQUE,
    slot_id         BIGINT NOT NULL,
    recruitment_id  BIGINT NOT NULL,
    status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('ASSIGNED', 'CANCELLED')),
    assigned_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    FOREIGN KEY (application_id, recruitment_id)
        REFERENCES application(id, recruitment_id) ON DELETE RESTRICT,
    FOREIGN KEY (slot_id, recruitment_id)
        REFERENCES interview_slot(id, recruitment_id) ON DELETE RESTRICT
);
CREATE INDEX idx_interview_schedule_slot ON interview_schedule (slot_id);
```

- [ ] **Step 2: InterviewScheduleStatus enum 작성**

```java
package com.duing.domain.interview.entity;

public enum InterviewScheduleStatus {
    ASSIGNED,
    CANCELLED
}
```

- [ ] **Step 3: 4개 엔티티 작성 — InterviewConfig**

Task 0 의 시간 타입 메모를 따른다. 아래는 LocalDateTime 가정 예시. 만약 메모가 OffsetDateTime 이면 전부 교체.

```java
package com.duing.domain.interview.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

@Entity
@Getter
@Table(name = "interview_config")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterviewConfig {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recruitment_id", nullable = false, unique = true)
    private Long recruitmentId;

    @Column(name = "availability_deadline", nullable = false)
    private LocalDateTime availabilityDeadline;

    @Column(name = "assignment_completed_at")
    private LocalDateTime assignmentCompletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewConfig(Long recruitmentId, LocalDateTime availabilityDeadline) {
        LocalDateTime now = LocalDateTime.now();
        this.recruitmentId = recruitmentId;
        this.availabilityDeadline = availabilityDeadline;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static InterviewConfig create(Long recruitmentId, LocalDateTime availabilityDeadline) {
        return InterviewConfig.builder()
                .recruitmentId(recruitmentId)
                .availabilityDeadline(availabilityDeadline)
                .build();
    }

    public boolean isAvailabilitySubmissionAllowed(LocalDateTime now) {
        return now.isBefore(availabilityDeadline) && assignmentCompletedAt == null;
    }

    public boolean isAutoAssignable(LocalDateTime now) {
        return !now.isBefore(availabilityDeadline) && assignmentCompletedAt == null;
    }

    public void updateDeadline(LocalDateTime newDeadline) {
        this.availabilityDeadline = newDeadline;
        this.updatedAt = LocalDateTime.now();
    }

    public void markAssignmentCompleted(LocalDateTime now) {
        this.assignmentCompletedAt = now;
        this.updatedAt = now;
    }
}
```

- [ ] **Step 4: InterviewSlot 엔티티 작성**

```java
package com.duing.domain.interview.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

@Entity
@Getter
@Table(name = "interview_slot")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterviewSlot {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    @Column(nullable = false)
    private int capacity;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewSlot(Long recruitmentId, LocalDateTime startTime, LocalDateTime endTime, int capacity) {
        LocalDateTime now = LocalDateTime.now();
        this.recruitmentId = recruitmentId;
        this.startTime = startTime;
        this.endTime = endTime;
        this.capacity = capacity;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static InterviewSlot create(Long recruitmentId, LocalDateTime startTime,
                                       LocalDateTime endTime, int capacity) {
        return InterviewSlot.builder()
                .recruitmentId(recruitmentId)
                .startTime(startTime)
                .endTime(endTime)
                .capacity(capacity)
                .build();
    }

    public void updateTime(LocalDateTime startTime, LocalDateTime endTime) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.updatedAt = LocalDateTime.now();
    }

    public void updateCapacity(int capacity) {
        this.capacity = capacity;
        this.updatedAt = LocalDateTime.now();
    }
}
```

- [ ] **Step 5: InterviewAvailability 엔티티 작성**

```java
package com.duing.domain.interview.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

@Entity
@Getter
@Table(name = "interview_availability")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterviewAvailability {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewAvailability(Long applicationId, Long slotId, Long recruitmentId) {
        this.applicationId = applicationId;
        this.slotId = slotId;
        this.recruitmentId = recruitmentId;
        this.createdAt = LocalDateTime.now();
    }

    public static InterviewAvailability create(Long applicationId, Long slotId, Long recruitmentId) {
        return InterviewAvailability.builder()
                .applicationId(applicationId)
                .slotId(slotId)
                .recruitmentId(recruitmentId)
                .build();
    }
}
```

- [ ] **Step 6: InterviewSchedule 엔티티 작성**

```java
package com.duing.domain.interview.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.*;

@Entity
@Getter
@Table(name = "interview_schedule")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterviewSchedule {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "application_id", nullable = false, unique = true)
    private Long applicationId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InterviewScheduleStatus status;

    @Column(name = "assigned_at", nullable = false)
    private LocalDateTime assignedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewSchedule(Long applicationId, Long slotId, Long recruitmentId, LocalDateTime assignedAt) {
        LocalDateTime now = LocalDateTime.now();
        this.applicationId = applicationId;
        this.slotId = slotId;
        this.recruitmentId = recruitmentId;
        this.status = InterviewScheduleStatus.ASSIGNED;
        this.assignedAt = assignedAt;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static InterviewSchedule create(Long applicationId, Long slotId, Long recruitmentId, LocalDateTime assignedAt) {
        return InterviewSchedule.builder()
                .applicationId(applicationId)
                .slotId(slotId)
                .recruitmentId(recruitmentId)
                .assignedAt(assignedAt)
                .build();
    }

    public void reassign(Long newSlotId, LocalDateTime newAssignedAt) {
        this.slotId = newSlotId;
        this.status = InterviewScheduleStatus.ASSIGNED;
        this.assignedAt = newAssignedAt;
        this.updatedAt = newAssignedAt;
    }

    public void cancel(LocalDateTime now) {
        this.status = InterviewScheduleStatus.CANCELLED;
        this.updatedAt = now;
    }
}
```

- [ ] **Step 7: InterviewException 계층 작성**

spec §7.1 의 20 개 inner class 를 모두 정의. 핵심 골격:

```java
package com.duing.domain.interview.exception;

import org.springframework.http.HttpStatus;

public abstract class InterviewException extends RuntimeException {
    protected InterviewException(String message) { super(message); }
    public abstract HttpStatus status();
    public abstract String code();

    // === 404 ===
    public static final class InterviewConfigNotFound extends InterviewException {
        public InterviewConfigNotFound() { super("면접 설정을 찾을 수 없습니다"); }
        @Override public HttpStatus status() { return HttpStatus.NOT_FOUND; }
        @Override public String code() { return "INTERVIEW_CONFIG_NOT_FOUND"; }
    }
    public static final class SlotNotFound extends InterviewException {
        public SlotNotFound() { super("면접 슬롯을 찾을 수 없습니다"); }
        @Override public HttpStatus status() { return HttpStatus.NOT_FOUND; }
        @Override public String code() { return "INTERVIEW_SLOT_NOT_FOUND"; }
    }
    public static final class ScheduleNotFound extends InterviewException {
        public ScheduleNotFound() { super("면접 일정을 찾을 수 없습니다"); }
        @Override public HttpStatus status() { return HttpStatus.NOT_FOUND; }
        @Override public String code() { return "INTERVIEW_SCHEDULE_NOT_FOUND"; }
    }

    // === 409 — 라이프사이클 ===
    public static final class ConfigAlreadyExists extends InterviewException {
        public ConfigAlreadyExists() { super("이미 면접 설정이 존재합니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "INTERVIEW_CONFIG_ALREADY_EXISTS"; }
    }
    public static final class RecruitmentAlreadyStarted extends InterviewException {
        public RecruitmentAlreadyStarted() { super("이미 모집이 시작된 공고입니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "RECRUITMENT_ALREADY_STARTED"; }
    }
    public static final class AvailabilityPeriodClosed extends InterviewException {
        public AvailabilityPeriodClosed() { super("면접 가능시간 제출 기간이 종료되었습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "AVAILABILITY_PERIOD_CLOSED"; }
    }
    public static final class AvailabilityPeriodOpen extends InterviewException {
        public AvailabilityPeriodOpen() { super("면접 가능시간 제출 기간이 아직 종료되지 않았습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "AVAILABILITY_PERIOD_OPEN"; }
    }
    public static final class AssignmentAlreadyCompleted extends InterviewException {
        public AssignmentAlreadyCompleted() { super("이미 자동 배정이 완료된 모집입니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "ASSIGNMENT_ALREADY_COMPLETED"; }
    }
    public static final class NoSlotsAvailable extends InterviewException {
        public NoSlotsAvailable() { super("면접 슬롯이 없습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "INTERVIEW_NO_SLOTS"; }
    }
    public static final class NoCandidates extends InterviewException {
        public NoCandidates() { super("면접 대상자가 없습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "INTERVIEW_NO_CANDIDATES"; }
    }

    // === 409 — 슬롯 수정 ===
    public static final class SlotHasAvailability extends InterviewException {
        public SlotHasAvailability() { super("이미 지원자가 선택한 슬롯입니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "SLOT_HAS_AVAILABILITY"; }
    }
    public static final class SlotHasSchedule extends InterviewException {
        public SlotHasSchedule() { super("배정된 일정이 있는 슬롯입니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "SLOT_HAS_SCHEDULE"; }
    }
    public static final class CapacityBelowAssigned extends InterviewException {
        public CapacityBelowAssigned() { super("capacity 가 현재 배정 수보다 작을 수 없습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "CAPACITY_BELOW_ASSIGNED"; }
    }
    public static final class CapacityExceeded extends InterviewException {
        public CapacityExceeded() { super("슬롯 capacity 를 초과했습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "CAPACITY_EXCEEDED"; }
    }

    // === 409 — race ===
    public static final class AvailabilityConflict extends InterviewException {
        public AvailabilityConflict() { super("가능시간 저장 중 충돌이 발생했습니다"); }
        @Override public HttpStatus status() { return HttpStatus.CONFLICT; }
        @Override public String code() { return "AVAILABILITY_CONFLICT"; }
    }

    // === 400 ===
    public static final class DuplicateSlotInRequest extends InterviewException {
        public DuplicateSlotInRequest() { super("요청에 동일 슬롯이 중복되었습니다"); }
        @Override public HttpStatus status() { return HttpStatus.BAD_REQUEST; }
        @Override public String code() { return "DUPLICATE_SLOT_IN_REQUEST"; }
    }
    public static final class InvalidSlotSelection extends InterviewException {
        public InvalidSlotSelection() { super("올바르지 않은 슬롯 선택입니다"); }
        @Override public HttpStatus status() { return HttpStatus.BAD_REQUEST; }
        @Override public String code() { return "INVALID_SLOT_SELECTION"; }
    }
    public static final class InvalidApplicationStatus extends InterviewException {
        public InvalidApplicationStatus() { super("지원자 상태가 면접 대상이 아닙니다"); }
        @Override public HttpStatus status() { return HttpStatus.BAD_REQUEST; }
        @Override public String code() { return "INVALID_APPLICATION_STATUS"; }
    }
    public static final class InvalidDeadline extends InterviewException {
        public InvalidDeadline() { super("올바르지 않은 마감 시각입니다"); }
        @Override public HttpStatus status() { return HttpStatus.BAD_REQUEST; }
        @Override public String code() { return "INVALID_DEADLINE"; }
    }

    // === 403 ===
    public static final class NotApplicationOwner extends InterviewException {
        public NotApplicationOwner() { super("본인의 지원서만 접근할 수 있습니다"); }
        @Override public HttpStatus status() { return HttpStatus.FORBIDDEN; }
        @Override public String code() { return "NOT_APPLICATION_OWNER"; }
    }
}
```

- [ ] **Step 8: 이벤트 이동 — InterviewScheduledEvent 신규 위치 작성**

`backend/src/main/java/com/duing/domain/interview/event/InterviewScheduledEvent.java`. Task 0 메모에서 기존 시그니처 호환 여부 확인. 호환되면 기존 record 그대로 옮기고, 호환 안 되면 spec 의 발행 정보에 맞춰 record 정의.

기본 시그니처:
```java
package com.duing.domain.interview.event;

public record InterviewScheduledEvent(Long applicationId, Long slotId, Long recruitmentId) {}
```

- [ ] **Step 9: 신규 이벤트 2개 작성**

```java
package com.duing.domain.interview.event;

public record InterviewUpdatedEvent(Long applicationId, Long slotId, Long recruitmentId) {}
```
```java
package com.duing.domain.interview.event;

public record InterviewCancelledEvent(Long applicationId, Long slotId, Long recruitmentId) {}
```

- [ ] **Step 10: 기존 notification listener import 갱신 + 기존 event 파일 삭제**

```bash
# 기존 파일 삭제
rm backend/src/main/java/com/duing/domain/notification/event/InterviewScheduledEvent.java

# listener 의 import 경로를 com.duing.domain.notification.event → com.duing.domain.interview.event 로 변경
sed -i '' 's|com.duing.domain.notification.event.InterviewScheduledEvent|com.duing.domain.interview.event.InterviewScheduledEvent|g' \
    backend/src/main/java/com/duing/domain/notification/listener/InterviewScheduledListener.java
```

수동 확인:
```bash
grep -n "InterviewScheduledEvent" backend/src/main/java/com/duing/domain/notification/listener/InterviewScheduledListener.java
```

- [ ] **Step 11: GlobalExceptionHandler 에 InterviewException 핸들러 추가**

`backend/src/main/java/com/duing/global/exception/GlobalExceptionHandler.java` 에 다른 도메인 예외 핸들러 옆에 추가.

```java
@ExceptionHandler(InterviewException.class)
public ResponseEntity<ErrorResponse> handleInterviewException(InterviewException ex) {
    return ResponseEntity.status(ex.status())
            .body(new ErrorResponse(ex.code(), ex.getMessage()));
}
```

(import: `com.duing.domain.interview.exception.InterviewException`)

- [ ] **Step 12: Fixture 4 개 작성**

```java
// InterviewConfigFixture.java
package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewConfig;
import java.time.LocalDateTime;

public final class InterviewConfigFixture {
    private InterviewConfigFixture() {}
    public static InterviewConfig create(Long recruitmentId, LocalDateTime deadline) {
        return InterviewConfig.create(recruitmentId, deadline);
    }
    public static InterviewConfig createOpen(Long recruitmentId) {
        return InterviewConfig.create(recruitmentId, LocalDateTime.now().plusDays(7));
    }
    public static InterviewConfig createClosed(Long recruitmentId) {
        InterviewConfig config = InterviewConfig.create(recruitmentId, LocalDateTime.now().minusMinutes(1));
        return config;
    }
}
```
```java
// InterviewSlotFixture.java
package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewSlot;
import java.time.LocalDateTime;

public final class InterviewSlotFixture {
    private InterviewSlotFixture() {}
    public static InterviewSlot create(Long recruitmentId, LocalDateTime startTime, int capacity) {
        return InterviewSlot.create(recruitmentId, startTime, startTime.plusMinutes(30), capacity);
    }
}
```
```java
// InterviewAvailabilityFixture.java
package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewAvailability;

public final class InterviewAvailabilityFixture {
    private InterviewAvailabilityFixture() {}
    public static InterviewAvailability link(Long applicationId, Long slotId, Long recruitmentId) {
        return InterviewAvailability.create(applicationId, slotId, recruitmentId);
    }
}
```
```java
// InterviewScheduleFixture.java
package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewSchedule;
import java.time.LocalDateTime;

public final class InterviewScheduleFixture {
    private InterviewScheduleFixture() {}
    public static InterviewSchedule assigned(Long applicationId, Long slotId, Long recruitmentId) {
        return InterviewSchedule.create(applicationId, slotId, recruitmentId, LocalDateTime.now());
    }
}
```

- [ ] **Step 13: 스키마 검증 통합 테스트 작성**

`backend/src/test/java/com/duing/domain/interview/repository/InterviewSchemaTest.java`. composite FK + UNIQUE + CHECK 가 실제 DB 에서 동작함을 검증.

```java
package com.duing.domain.interview.repository;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.*;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class InterviewSchemaTest {

    @Autowired private JdbcTemplate jdbc;

    @Test
    @DisplayName("interview_schedule.status 가 ASSIGNED/CANCELLED 외 값이면 CHECK 위반이 발생한다")
    void scheduleStatusCheckRejectsInvalidValue() {
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO interview_schedule
                    (application_id, slot_id, recruitment_id, status, assigned_at)
                VALUES (1, 1, 1, 'PENDING', now())
            """))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot 의 end_time 이 start_time 이전이면 CHECK 위반이 발생한다")
    void slotCheckRejectsInvalidTime() {
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO interview_slot
                    (recruitment_id, start_time, end_time, capacity)
                VALUES (1, now() + interval '1 hour', now(), 1)
            """))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot.capacity 가 0 이하이면 CHECK 위반이 발생한다")
    void slotCheckRejectsNonPositiveCapacity() {
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO interview_slot
                    (recruitment_id, start_time, end_time, capacity)
                VALUES (1, now(), now() + interval '1 hour', 0)
            """))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

(repository 별 통합 테스트는 후속 task 에서 도메인 시나리오와 함께 추가. 본 task 는 DB 제약 검증만.)

- [ ] **Step 14: 빌드 + 테스트 실행**

```bash
cd backend
./gradlew compileJava
./gradlew test --tests "com.duing.domain.interview.repository.InterviewSchemaTest"
```
모두 통과 확인.

- [ ] **Step 15: 커밋**

```bash
git add backend/src/main/resources/db/migration/V45__create_interview_tables.sql \
        backend/src/main/java/com/duing/domain/interview/ \
        backend/src/test/java/com/duing/common/fixture/ \
        backend/src/test/java/com/duing/domain/interview/repository/ \
        backend/src/main/java/com/duing/global/exception/GlobalExceptionHandler.java \
        backend/src/main/java/com/duing/domain/notification/listener/InterviewScheduledListener.java
git add -u backend/src/main/java/com/duing/domain/notification/event/
git commit -m "feat(interview): V45 마이그레이션 + 4개 엔티티 + InterviewException + 이벤트 도메인 이동"
```

---

## Task 2 (PR2): M1 POST interview-config + M2 PATCH interview-config

**목적:** 면접 모집 활성화 + deadline 갱신 흐름.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/repository/InterviewConfigRepository.java`
- Create: `backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewConfigApi.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewConfigController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewConfigService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewConfigService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/CreateInterviewConfigCommand.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/UpdateInterviewConfigCommand.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/request/CreateInterviewConfigRequest.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/request/UpdateInterviewConfigRequest.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/response/CreateInterviewConfigResponse.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/InterviewConfigServiceTest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/controller/ManagerInterviewConfigControllerTest.java`

- [ ] **Step 1: Repository 작성**

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewConfig;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import java.util.Optional;

public interface InterviewConfigRepository extends JpaRepository<InterviewConfig, Long> {
    Optional<InterviewConfig> findByRecruitmentId(Long recruitmentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<InterviewConfig> findByRecruitmentIdForUpdate(Long recruitmentId);

    boolean existsByRecruitmentId(Long recruitmentId);
}
```

(PESSIMISTIC_WRITE 는 Task 9 의 auto-assign 에서 활용. 본 task 에서는 정의만.)

- [ ] **Step 2: Request/Response/Command DTO 작성**

```java
// CreateInterviewConfigRequest
package com.duing.domain.interview.dto.request;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
public record CreateInterviewConfigRequest(
        @NotNull(message = "마감 시각은 필수입니다")
        @Future(message = "마감 시각은 미래여야 합니다")
        LocalDateTime availabilityDeadline
) {}
```
```java
// UpdateInterviewConfigRequest — 모든 필드 nullable (= 변경하지 않음)
package com.duing.domain.interview.dto.request;
import java.time.LocalDateTime;
public record UpdateInterviewConfigRequest(LocalDateTime availabilityDeadline) {}
```
```java
// CreateInterviewConfigResponse
package com.duing.domain.interview.dto.response;
public record CreateInterviewConfigResponse(Long configId) {}
```
```java
// CreateInterviewConfigCommand
package com.duing.domain.interview.dto.command;
import java.time.LocalDateTime;
public record CreateInterviewConfigCommand(Long recruitmentId, Long actorUserId, LocalDateTime availabilityDeadline) {}
```
```java
// UpdateInterviewConfigCommand
package com.duing.domain.interview.dto.command;
import java.time.LocalDateTime;
public record UpdateInterviewConfigCommand(Long recruitmentId, Long actorUserId, LocalDateTime availabilityDeadline) {}
```

- [ ] **Step 3: Service 인터페이스 + 실패 테스트 작성**

```java
// InterviewConfigService
package com.duing.domain.interview.service;
import com.duing.domain.interview.dto.command.*;
public interface InterviewConfigService {
    Long create(CreateInterviewConfigCommand command);
    void update(UpdateInterviewConfigCommand command);
}
```

테스트 파일 — 첫 번째 실패 테스트:
```java
package com.duing.domain.interview.service;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.dto.command.CreateInterviewConfigCommand;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.*;
import com.duing.domain.user.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class InterviewConfigServiceTest {

    @Autowired private InterviewConfigService configService;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    @Test
    @DisplayName("운영진은 면접 설정을 생성할 수 있다")
    void createsConfigWhenManager() throws Exception {
        Club club = saveActiveClub("동아리");
        User leader = saveLeader(club);
        Recruitment recruitment = saveRecruitment(club);

        Long configId = configService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), leader.getId(), LocalDateTime.now().plusDays(7)));

        assertThat(configRepository.findById(configId)).isPresent();
    }

    // 헬퍼는 spec 의 ApplicationDraftServiceTest 패턴 참고
    // ...
}
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

```bash
./gradlew test --tests "InterviewConfigServiceTest.createsConfigWhenManager"
```
Expected: FAIL — `GeneralInterviewConfigService` 가 아직 없어 bean autowire 실패.

- [ ] **Step 5: Service 구현 작성**

```java
package com.duing.domain.interview.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.dto.command.*;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.exception.RecruitmentException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewConfigService implements InterviewConfigService {

    private final InterviewConfigRepository configRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreateInterviewConfigCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        if (configRepository.existsByRecruitmentId(recruitment.getId())) {
            throw new InterviewException.ConfigAlreadyExists();
        }
        if (LocalDate.now().isAfter(recruitment.getStartDate())) {
            throw new InterviewException.RecruitmentAlreadyStarted();
        }
        validateDeadline(command.availabilityDeadline(), recruitment);

        InterviewConfig saved = configRepository.save(
                InterviewConfig.create(recruitment.getId(), command.availabilityDeadline()));
        return saved.getId();
    }

    @Override
    @Transactional
    public void update(UpdateInterviewConfigCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        InterviewConfig config = configRepository.findByRecruitmentId(recruitment.getId())
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);
        if (config.getAssignmentCompletedAt() != null) {
            throw new InterviewException.AssignmentAlreadyCompleted();
        }
        if (command.availabilityDeadline() != null) {
            validateDeadline(command.availabilityDeadline(), recruitment);
            config.updateDeadline(command.availabilityDeadline());
        }
    }

    private void validateDeadline(LocalDateTime deadline, Recruitment recruitment) {
        LocalDate deadlineDate = deadline.toLocalDate();
        if (deadlineDate.isBefore(recruitment.getStartDate())
                || deadlineDate.isAfter(recruitment.getEndDate())) {
            throw new InterviewException.InvalidDeadline();
        }
    }
}
```

(`Recruitment.getStartDate()` / `getEndDate()` 의 실제 반환 타입은 Task 0 메모에 따라 조정.)

- [ ] **Step 6: 테스트 재실행 → 통과 확인**

```bash
./gradlew test --tests "InterviewConfigServiceTest.createsConfigWhenManager"
```
Expected: PASS

- [ ] **Step 7: 추가 시나리오 테스트 작성 + 실행**

```
@DisplayName("운영진이 아닌 사용자가 면접 설정을 생성하면 403 이 반환된다"
@DisplayName("이미 면접 설정이 존재하는 모집은 두 번째 생성 시도가 409 ConfigAlreadyExists 를 반환한다"
@DisplayName("모집 시작 이후 면접 설정 생성은 409 RecruitmentAlreadyStarted 를 반환한다"
@DisplayName("recruitment 범위 밖 deadline 은 400 InvalidDeadline 을 반환한다"
@DisplayName("update 시 assignmentCompletedAt 이 채워진 모집은 409 AssignmentAlreadyCompleted 를 반환한다"
@DisplayName("update 시 deadline 이 null 이면 변경되지 않는다"
```

각 테스트의 본문은 위 happy path 패턴을 참고하여 작성. 모두 통과 확인.

- [ ] **Step 8: API 인터페이스 작성**

```java
// ManagerInterviewConfigApi.java
package com.duing.domain.interview.api;

import com.duing.domain.interview.dto.request.*;
import com.duing.domain.interview.dto.response.*;
import io.swagger.v3.oas.annotations.*;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Manager Interview Config")
@RequestMapping("/api/v1/recruitments/{recruitmentId}/interview-config")
public interface ManagerInterviewConfigApi {

    @Operation(summary = "면접 모집 활성화 + deadline 설정")
    @PostMapping
    ResponseEntity<CreateInterviewConfigResponse> create(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateInterviewConfigRequest request);

    @Operation(summary = "면접 설정 갱신")
    @PatchMapping
    ResponseEntity<Void> update(
            @PathVariable Long recruitmentId,
            @Valid @RequestBody UpdateInterviewConfigRequest request);
}
```

- [ ] **Step 9: Controller 작성**

```java
package com.duing.domain.interview.controller;

import com.duing.domain.interview.api.ManagerInterviewConfigApi;
import com.duing.domain.interview.dto.command.*;
import com.duing.domain.interview.dto.request.*;
import com.duing.domain.interview.dto.response.*;
import com.duing.domain.interview.service.InterviewConfigService;
import com.duing.global.security.AuthUser;
import com.duing.global.security.CurrentAuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ManagerInterviewConfigController implements ManagerInterviewConfigApi {

    private final InterviewConfigService service;

    @Override
    public ResponseEntity<CreateInterviewConfigResponse> create(
            Long recruitmentId, CreateInterviewConfigRequest request) {
        AuthUser actor = CurrentAuthUser.get();
        Long id = service.create(new CreateInterviewConfigCommand(
                recruitmentId, actor.userId(), request.availabilityDeadline()));
        return ResponseEntity.status(201).body(new CreateInterviewConfigResponse(id));
    }

    @Override
    public ResponseEntity<Void> update(Long recruitmentId, UpdateInterviewConfigRequest request) {
        AuthUser actor = CurrentAuthUser.get();
        service.update(new UpdateInterviewConfigCommand(
                recruitmentId, actor.userId(), request.availabilityDeadline()));
        return ResponseEntity.noContent().build();
    }
}
```

(`AuthUser` / `CurrentAuthUser` 의 정확한 import 는 기존 다른 controller 파일 참고하여 일치시킬 것.)

- [ ] **Step 10: Controller 통합 테스트 (RestAssured)**

```java
package com.duing.domain.interview.controller;

// 기존 controller 통합 테스트 패턴을 참고 — 운영진 JWT 발급 + happy path + 403/409 케이스
// (자세한 예시는 backend/src/test/java/com/duing/domain/notice/controller/* 의 RestAssured 테스트 참고)
```

- [ ] **Step 11: 전체 테스트 실행 + 커밋**

```bash
./gradlew test --tests "InterviewConfigServiceTest" --tests "ManagerInterviewConfigControllerTest"
git add backend/src/main/java/com/duing/domain/interview/{repository,api,controller,service,dto}/ \
        backend/src/test/java/com/duing/domain/interview/{service,controller}/
git commit -m "feat(interview): M1 POST interview-config + M2 PATCH interview-config"
```

---

## Task 3 (PR3): M3 POST slots + M4 GET slots

**목적:** 운영진의 면접 슬롯 bulk 생성 + 슬롯 목록 조회.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/repository/InterviewSlotRepository.java`
- Create: `backend/src/main/java/com/duing/domain/interview/repository/InterviewSlotRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/interview/repository/InterviewSlotRepositoryImpl.java`
- Create: `backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewSlotApi.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewSlotController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewSlotService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewSlotService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/CreateInterviewSlotsCommand.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/request/CreateInterviewSlotsRequest.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/response/CreateInterviewSlotsResponse.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/query/SlotListView.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/InterviewSlotServiceTest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/controller/ManagerInterviewSlotControllerTest.java`

- [ ] **Step 1: Repository (Custom 포함) 작성**

```java
public interface InterviewSlotRepository extends JpaRepository<InterviewSlot, Long>, InterviewSlotRepositoryCustom {
    List<InterviewSlot> findByRecruitmentIdOrderByStartTimeAsc(Long recruitmentId);
}
```
```java
public interface InterviewSlotRepositoryCustom {
    List<SlotListView> findSlotListViewByRecruitmentId(Long recruitmentId);
}
```
```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.dto.query.SlotListView;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.QInterviewAvailability;
import com.duing.domain.interview.entity.QInterviewSchedule;
import com.duing.domain.interview.entity.QInterviewSlot;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class InterviewSlotRepositoryImpl implements InterviewSlotRepositoryCustom {

    private final JPAQueryFactory query;

    @Override
    public List<SlotListView> findSlotListViewByRecruitmentId(Long recruitmentId) {
        QInterviewSlot slot = QInterviewSlot.interviewSlot;
        QInterviewAvailability availability = QInterviewAvailability.interviewAvailability;
        QInterviewSchedule schedule = QInterviewSchedule.interviewSchedule;

        return query.select(Projections.constructor(SlotListView.class,
                        slot.id,
                        slot.startTime,
                        slot.endTime,
                        slot.capacity,
                        Expressions.asNumber(JPAExpressions.select(availability.count())
                                .from(availability)
                                .where(availability.slotId.eq(slot.id))),
                        Expressions.asNumber(JPAExpressions.select(schedule.count())
                                .from(schedule)
                                .where(schedule.slotId.eq(slot.id)
                                        .and(schedule.status.eq(InterviewScheduleStatus.ASSIGNED))))))
                .from(slot)
                .where(slot.recruitmentId.eq(recruitmentId))
                .orderBy(slot.startTime.asc())
                .fetch();
    }
}
```

(QClass 는 `./gradlew compileJava` 시 자동 생성됨. 작업 전 QueryDSL annotation processor 설정이 build.gradle 에 활성화돼있는지 확인 — 다른 도메인의 `*RepositoryImpl` 이 동작하면 OK.)

- [ ] **Step 2: SlotListView 작성**

```java
package com.duing.domain.interview.dto.query;
import java.time.LocalDateTime;
public record SlotListView(
        Long slotId, LocalDateTime startTime, LocalDateTime endTime,
        int capacity, long availabilityCount, long assignedCount) {}
```

- [ ] **Step 3: 서비스 시그니처 + 테스트 작성 (TDD)**

```java
public interface InterviewSlotService {
    List<Long> createBulk(CreateInterviewSlotsCommand command);
    List<SlotListView> listByRecruitment(Long recruitmentId, Long actorUserId);
}
```

서비스 테스트의 시나리오:
- `@DisplayName("운영진이 모집 시작 전 슬롯을 bulk 로 생성하면 모두 저장된다")`
- `@DisplayName("InterviewConfig 가 없는 모집에 슬롯을 생성하면 404 InterviewConfigNotFound 가 반환된다")`
- `@DisplayName("모집 시작 이후 슬롯 생성은 409 RecruitmentAlreadyStarted 가 반환된다")`
- `@DisplayName("슬롯 목록 조회는 슬롯별 availability 수와 assigned 수를 포함한다")`

- [ ] **Step 4: GeneralInterviewSlotService 구현**

```java
@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class GeneralInterviewSlotService implements InterviewSlotService {

    private final InterviewSlotRepository slotRepository;
    private final InterviewConfigRepository configRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubAuthService clubAuthService;

    @Override @Transactional
    public List<Long> createBulk(CreateInterviewSlotsCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

        if (!configRepository.existsByRecruitmentId(recruitment.getId())) {
            throw new InterviewException.InterviewConfigNotFound();
        }
        if (LocalDate.now().isAfter(recruitment.getStartDate())) {
            throw new InterviewException.RecruitmentAlreadyStarted();
        }

        List<InterviewSlot> entities = command.slots().stream()
                .map(s -> {
                    if (!s.endTime().isAfter(s.startTime())) {
                        throw new InterviewException.InvalidSlotSelection();
                    }
                    return InterviewSlot.create(recruitment.getId(), s.startTime(), s.endTime(), s.capacity());
                })
                .toList();
        List<InterviewSlot> saved = slotRepository.saveAll(entities);
        return saved.stream().map(InterviewSlot::getId).toList();
    }

    @Override
    public List<SlotListView> listByRecruitment(Long recruitmentId, Long actorUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());
        return slotRepository.findSlotListViewByRecruitmentId(recruitmentId);
    }
}
```

- [ ] **Step 5: DTO (Request/Response/Command)**

```java
public record CreateInterviewSlotsRequest(
        @NotEmpty @Valid List<SlotEntry> slots) {
    public record SlotEntry(
            @NotNull LocalDateTime startTime,
            @NotNull LocalDateTime endTime,
            @Min(1) int capacity) {}
}

public record CreateInterviewSlotsResponse(List<Long> slotIds) {}

public record CreateInterviewSlotsCommand(
        Long recruitmentId, Long actorUserId, List<SlotEntry> slots) {
    public record SlotEntry(LocalDateTime startTime, LocalDateTime endTime, int capacity) {}
}
```

- [ ] **Step 6: API + Controller 작성**

(M1/M2 패턴과 동일)

- [ ] **Step 7: Controller 통합 테스트 — happy path + 403 + 409 + 400**

- [ ] **Step 8: 빌드/테스트 + 커밋**

```bash
./gradlew test --tests "InterviewSlotServiceTest" --tests "ManagerInterviewSlotControllerTest"
git add backend/src/main/java/com/duing/domain/interview/ backend/src/test/java/com/duing/domain/interview/
git commit -m "feat(interview): M3 POST slots (bulk) + M4 GET slots"
```

---

## Task 4 (PR4): M5 PATCH slot + M6 DELETE slot

**목적:** 슬롯 시간/capacity 수정 + 삭제. spec §5.5 의 slot edit rule 적용.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewSlotRepository.java` (FOR UPDATE 추가)
- Modify: `backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewSlotApi.java` (PATCH/DELETE 추가)
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewSlotController.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/InterviewSlotService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewSlotService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/UpdateInterviewSlotCommand.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/request/UpdateInterviewSlotRequest.java`
- Create: `backend/src/main/java/com/duing/domain/interview/repository/InterviewAvailabilityRepository.java`
- Create: `backend/src/main/java/com/duing/domain/interview/repository/InterviewScheduleRepository.java`
- Modify: `backend/src/test/java/com/duing/domain/interview/service/InterviewSlotServiceTest.java`

- [ ] **Step 1: 추가 Repository — Availability / Schedule**

```java
public interface InterviewAvailabilityRepository extends JpaRepository<InterviewAvailability, Long> {
    long countBySlotId(Long slotId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM InterviewAvailability a WHERE a.applicationId = :applicationId")
    void deleteByApplicationId(@Param("applicationId") Long applicationId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);

    List<InterviewAvailability> findByRecruitmentId(Long recruitmentId);
}
```

(`clearAutomatically = true` 는 같은 트랜잭션 안 후속 saveAll 이 1차 캐시와 동기화되도록 하기 위함. PR2 의 컨벤션 문서 §2 참고.)
```java
public interface InterviewScheduleRepository extends JpaRepository<InterviewSchedule, Long> {
    long countBySlotIdAndStatus(Long slotId, InterviewScheduleStatus status);
    Optional<InterviewSchedule> findByApplicationId(Long applicationId);
}
```

- [ ] **Step 2: Slot Repository 에 FOR UPDATE 메서드 추가**

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
Optional<InterviewSlot> findByIdForUpdate(Long id);

@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT s FROM InterviewSlot s WHERE s.id IN :ids ORDER BY s.id ASC")
List<InterviewSlot> findAllByIdInForUpdate(@Param("ids") List<Long> ids);
```

- [ ] **Step 3: 시나리오 테스트 작성 (실패 상태)**

```
@DisplayName("availability 가 없는 슬롯의 시간 수정은 허용된다"
@DisplayName("availability 가 1건이라도 있는 슬롯의 시간 수정은 409 SlotHasAvailability 가 반환된다"
@DisplayName("capacity 증가는 항상 허용된다"
@DisplayName("capacity 감소가 현재 assigned 수보다 작으면 409 CapacityBelowAssigned 가 반환된다"
@DisplayName("availability 가 없고 schedule 도 없는 슬롯은 삭제할 수 있다"
@DisplayName("availability 가 있는 슬롯 삭제는 409 SlotHasAvailability 가 반환된다"
@DisplayName("schedule 이 ASSIGNED 인 슬롯 삭제는 409 SlotHasSchedule 가 반환된다"
```

- [ ] **Step 4: Service 메서드 추가**

```java
@Override @Transactional
public void update(UpdateInterviewSlotCommand command) {
    InterviewSlot slot = slotRepository.findByIdForUpdate(command.slotId())
            .orElseThrow(InterviewException.SlotNotFound::new);
    Recruitment recruitment = recruitmentRepository.findById(slot.getRecruitmentId())
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

    long availabilityCount = availabilityRepository.countBySlotId(slot.getId());
    long assignedCount = scheduleRepository.countBySlotIdAndStatus(slot.getId(), InterviewScheduleStatus.ASSIGNED);

    if (command.startTime() != null || command.endTime() != null) {
        if (availabilityCount > 0) {
            throw new InterviewException.SlotHasAvailability();
        }
        LocalDateTime newStart = command.startTime() != null ? command.startTime() : slot.getStartTime();
        LocalDateTime newEnd = command.endTime() != null ? command.endTime() : slot.getEndTime();
        if (!newEnd.isAfter(newStart)) {
            throw new InterviewException.InvalidSlotSelection();
        }
        slot.updateTime(newStart, newEnd);
    }
    if (command.capacity() != null) {
        if (command.capacity() < assignedCount) {
            throw new InterviewException.CapacityBelowAssigned();
        }
        slot.updateCapacity(command.capacity());
    }
}

@Override @Transactional
public void delete(Long slotId, Long actorUserId) {
    InterviewSlot slot = slotRepository.findByIdForUpdate(slotId)
            .orElseThrow(InterviewException.SlotNotFound::new);
    Recruitment recruitment = recruitmentRepository.findById(slot.getRecruitmentId())
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

    if (availabilityRepository.countBySlotId(slotId) > 0) {
        throw new InterviewException.SlotHasAvailability();
    }
    if (scheduleRepository.countBySlotIdAndStatus(slotId, InterviewScheduleStatus.ASSIGNED) > 0) {
        throw new InterviewException.SlotHasSchedule();
    }
    slotRepository.delete(slot);
}
```

- [ ] **Step 5: API/Controller 메서드 추가 + DTO**

```java
public record UpdateInterviewSlotRequest(
        LocalDateTime startTime, LocalDateTime endTime, Integer capacity) {}

public record UpdateInterviewSlotCommand(
        Long slotId, Long actorUserId,
        LocalDateTime startTime, LocalDateTime endTime, Integer capacity) {}
```
API 인터페이스에 `@PatchMapping("/interview-slots/{slotId}")`, `@DeleteMapping("/interview-slots/{slotId}")` 추가. 경로가 recruitmentId 를 갖지 않으므로 별도 API 인터페이스로 분리하거나 같은 인터페이스 안에서 다른 base path 로 매핑.

- [ ] **Step 6: Controller 통합 테스트**

- [ ] **Step 7: 빌드/테스트 + 커밋**

```bash
./gradlew test --tests "InterviewSlotServiceTest" --tests "ManagerInterviewSlotControllerTest"
git commit -am "feat(interview): M5 PATCH slot + M6 DELETE slot"
```

---

## Task 5 (PR5): 지원서 제출 API 확장 (interviewSlotIds + 단일 트랜잭션)

**목적:** 지원자가 지원서 제출 시점에 면접 가능 슬롯을 함께 선택하도록 application 도메인의 제출 API 를 확장.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/application/controller/dto/request/SubmitApplicationRequest.java` (또는 동등 위치 — 기존 제출 API 파악 후 결정)
- Modify: `backend/src/main/java/com/duing/domain/application/service/dto/command/SubmitApplicationCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewAvailabilityService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewAvailabilityService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/CreateAvailabilitiesInSubmissionCommand.java`
- Modify: `backend/src/test/java/com/duing/domain/application/...` (제출 통합 테스트 보강)

- [ ] **Step 1: 기존 제출 API 구조 파악**

```bash
grep -rn "SubmitApplicationRequest\|SubmitApplicationCommand" backend/src/main/java/com/duing/domain/application/
```
정확한 record 이름과 경로 확인.

- [ ] **Step 2: Request 에 `interviewSlotIds` 필드 추가**

```java
public record SubmitApplicationRequest(
        @Valid List<ApplicationAnswerRequest> answers,
        @NotNull(message = "interviewSlotIds 는 필수 (빈 배열 가능)") List<Long> interviewSlotIds
) {}
```

- [ ] **Step 3: Command 도 동일하게 확장**

- [ ] **Step 4: `InterviewAvailabilityService` 인터페이스 + 구현**

```java
public interface InterviewAvailabilityService {
    void createAllInSubmission(CreateAvailabilitiesInSubmissionCommand command);
}
```

```java
@Service @RequiredArgsConstructor
public class GeneralInterviewAvailabilityService implements InterviewAvailabilityService {

    private final InterviewConfigRepository configRepository;
    private final InterviewSlotRepository slotRepository;
    private final InterviewAvailabilityRepository availabilityRepository;

    @Override
    public void createAllInSubmission(CreateAvailabilitiesInSubmissionCommand command) {
        Long recruitmentId = command.recruitmentId();
        InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId).orElse(null);
        List<Long> slotIds = command.interviewSlotIds();

        if (config == null) {
            if (!slotIds.isEmpty()) throw new InterviewException.InvalidSlotSelection();
            return;
        }
        if (slotIds.isEmpty()) throw new InterviewException.InvalidSlotSelection();
        if (!config.isAvailabilitySubmissionAllowed(LocalDateTime.now())) {
            throw new InterviewException.AvailabilityPeriodClosed();
        }
        if (new HashSet<>(slotIds).size() != slotIds.size()) {
            throw new InterviewException.DuplicateSlotInRequest();
        }

        List<InterviewSlot> slots = slotRepository.findAllById(slotIds);
        if (slots.size() != slotIds.size()
                || slots.stream().anyMatch(s -> !s.getRecruitmentId().equals(recruitmentId))) {
            throw new InterviewException.InvalidSlotSelection();
        }

        List<InterviewAvailability> entities = slotIds.stream()
                .map(slotId -> InterviewAvailability.create(command.applicationId(), slotId, recruitmentId))
                .toList();
        try {
            availabilityRepository.saveAll(entities);
        } catch (DataIntegrityViolationException e) {
            throw new InterviewException.AvailabilityConflict();
        }
    }
}
```

- [ ] **Step 5: `GeneralApplicationService.submit(...)` 에서 availability service 호출**

기존 submit 로직 끝에 `availabilityService.createAllInSubmission(...)` 호출. 같은 트랜잭션 안에서 실행되어 application insert → availability insert → commit 흐름이 됨.

- [ ] **Step 6: 통합 테스트 시나리오**

```
@DisplayName("면접 모집에 가능시간을 0개 선택하면 지원서 제출이 실패한다"
@DisplayName("일반 모집(InterviewConfig 없음)에 interviewSlotIds 가 비어있으면 정상 제출된다"
@DisplayName("일반 모집에 interviewSlotIds 가 있으면 400 InvalidSlotSelection 이 반환된다"
@DisplayName("availabilityDeadline 이후 제출은 409 AVAILABILITY_PERIOD_CLOSED 가 반환된다"
@DisplayName("interviewSlotIds 에 중복이 있으면 400 DUPLICATE_SLOT_IN_REQUEST 가 반환된다"
@DisplayName("다른 recruitment 의 slotId 가 섞여있으면 400 INVALID_SLOT_SELECTION 이 반환된다"
@DisplayName("InterviewAvailability bulk insert 가 실패하면 application 도 롤백된다"
```

- [ ] **Step 7: 빌드/테스트 + 커밋**

```bash
./gradlew test
git commit -am "feat(application): 지원서 제출 API 에 interviewSlotIds 통합"
```

---

## Task 6 (PR6): A1 PUT availabilities (지원자 가능시간 수정)

**목적:** 지원자가 제출 후 deadline 전까지 자신의 가능시간을 수정.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/api/InterviewAvailabilityApi.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/InterviewAvailabilityController.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/InterviewAvailabilityService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewAvailabilityService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/UpdateAvailabilityCommand.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/request/UpdateAvailabilityRequest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/InterviewAvailabilityServiceTest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/controller/InterviewAvailabilityControllerTest.java`

- [ ] **Step 1: 인터페이스 메서드 추가**

```java
void replace(UpdateAvailabilityCommand command);
```

- [ ] **Step 2: Service 구현 — 본인 검증 + 전체 교체**

```java
@Override @Transactional
public void replace(UpdateAvailabilityCommand command) {
    Application application = applicationRepository.findById(command.applicationId())
            .orElseThrow(ApplicationException.NotFound::new);
    if (!application.getUserId().equals(command.actorUserId())) {
        throw new InterviewException.NotApplicationOwner();
    }
    Long recruitmentId = application.getRecruitment().getId();
    InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId)
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);
    if (config.getAssignmentCompletedAt() != null) {
        throw new InterviewException.AssignmentAlreadyCompleted();
    }
    if (!config.isAvailabilitySubmissionAllowed(LocalDateTime.now())) {
        throw new InterviewException.AvailabilityPeriodClosed();
    }
    List<Long> slotIds = command.slotIds();
    if (slotIds.isEmpty()) throw new InterviewException.InvalidSlotSelection();
    if (new HashSet<>(slotIds).size() != slotIds.size()) {
        throw new InterviewException.DuplicateSlotInRequest();
    }

    availabilityRepository.deleteByApplicationId(command.applicationId());
    List<InterviewAvailability> entities = slotIds.stream()
            .map(slotId -> InterviewAvailability.create(command.applicationId(), slotId, recruitmentId))
            .toList();
    try {
        availabilityRepository.saveAll(entities);
    } catch (DataIntegrityViolationException e) {
        throw new InterviewException.AvailabilityConflict();
    }
}
```

- [ ] **Step 3: 시나리오 테스트**

```
@DisplayName("지원자는 deadline 전 자신의 가능시간을 PUT 으로 교체할 수 있다"
@DisplayName("PUT 두 번 호출 시 두 번째 결과로 완전히 교체된다"
@DisplayName("다른 사용자의 application 에 PUT 호출 시 403 NotApplicationOwner 가 반환된다"
@DisplayName("deadline 이후 PUT 은 409 AvailabilityPeriodClosed 가 반환된다"
@DisplayName("assignmentCompletedAt 이 채워진 후 PUT 은 409 AssignmentAlreadyCompleted 가 반환된다"
@DisplayName("빈 slotIds 로 PUT 호출 시 400 InvalidSlotSelection 이 반환된다"
@DisplayName("동일 slotId 가 중복된 PUT 호출은 400 DuplicateSlotInRequest 가 반환된다"
```

- [ ] **Step 4: API/Controller 작성**

```java
@PutMapping("/api/v1/applications/{applicationId}/interview-availabilities")
ResponseEntity<Void> replace(@PathVariable Long applicationId,
                             @Valid @RequestBody UpdateAvailabilityRequest request);
```

```java
public record UpdateAvailabilityRequest(@NotEmpty List<Long> slotIds) {}
```

- [ ] **Step 5: Controller 통합 테스트 + 커밋**

```bash
./gradlew test --tests "InterviewAvailabilityServiceTest" --tests "InterviewAvailabilityControllerTest"
git commit -am "feat(interview): A1 PUT availabilities — 지원자 가능시간 전체 교체"
```

---

## Task 7 (PR7): A2 GET my interview-schedule

**목적:** 지원자가 본인 면접 일정을 조회. 배정 유무와 무관하게 200 응답.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/api/InterviewScheduleApi.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/InterviewScheduleController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewScheduleQueryService.java` (또는 기존 InterviewScheduleService 에 메서드 추가, Task 10 과 일관성 맞춤)
- Create: `backend/src/main/java/com/duing/domain/interview/dto/response/MyInterviewScheduleResponse.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/MyInterviewScheduleQueryTest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/controller/InterviewScheduleControllerTest.java`

- [ ] **Step 1: Response DTO**

```java
public record MyInterviewScheduleResponse(boolean assigned, InterviewScheduleDetail schedule) {
    public record InterviewScheduleDetail(
            Long scheduleId, Long slotId,
            LocalDateTime startTime, LocalDateTime endTime,
            InterviewScheduleStatus status, LocalDateTime assignedAt) {}
}
```

- [ ] **Step 2: 서비스 메서드**

```java
@Transactional(readOnly = true)
public MyInterviewScheduleResponse findMySchedule(Long applicationId, Long actorUserId) {
    Application application = applicationRepository.findById(applicationId)
            .orElseThrow(ApplicationException.NotFound::new);
    if (!application.getUserId().equals(actorUserId)) {
        throw new InterviewException.NotApplicationOwner();
    }
    return scheduleRepository.findByApplicationId(applicationId)
            .map(schedule -> {
                InterviewSlot slot = slotRepository.findById(schedule.getSlotId())
                        .orElseThrow(InterviewException.SlotNotFound::new);
                return new MyInterviewScheduleResponse(true,
                        new MyInterviewScheduleResponse.InterviewScheduleDetail(
                                schedule.getId(), slot.getId(),
                                slot.getStartTime(), slot.getEndTime(),
                                schedule.getStatus(), schedule.getAssignedAt()));
            })
            .orElseGet(() -> new MyInterviewScheduleResponse(false, null));
}
```

- [ ] **Step 3: 시나리오 테스트**

```
@DisplayName("본인 application 에 schedule 이 있으면 assigned=true 와 함께 200 응답한다"
@DisplayName("본인 application 에 schedule 이 없으면 assigned=false, schedule=null 로 200 응답한다"
@DisplayName("다른 사용자의 application 조회는 403 NotApplicationOwner 가 반환된다"
@DisplayName("application 자체가 없으면 404 가 반환된다"
@DisplayName("schedule 이 CANCELLED 상태여도 노출된다"
```

- [ ] **Step 4: API/Controller + Controller 테스트**

```java
@GetMapping("/api/v1/applications/{applicationId}/interview-schedule")
ResponseEntity<MyInterviewScheduleResponse> findMine(@PathVariable Long applicationId);
```

- [ ] **Step 5: 커밋**

```bash
./gradlew test --tests "MyInterviewScheduleQueryTest" --tests "InterviewScheduleControllerTest"
git commit -am "feat(interview): A2 GET my interview-schedule"
```

---

## Task 8 (PR8): InterviewMatchingService 순수 함수

**목적:** Constrained Greedy 매칭 알고리즘을 DB I/O 와 분리된 순수 함수로 구현. 모든 매칭 시나리오를 단위 테스트로 보장.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewMatchingService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/dto/MatchingInput.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/dto/MatchingResult.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/InterviewMatchingServiceTest.java`

본 task 는 TDD 풀스택. 각 시나리오마다 test → fail → impl → pass → commit 사이클.

- [ ] **Step 1: 입출력 DTO 작성**

```java
package com.duing.domain.interview.service.dto;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

public record MatchingInput(List<ApplicantSelection> applicants, List<SlotState> slots) {
    public record ApplicantSelection(Long applicationId, Set<Long> selectedSlotIds) {}
    public record SlotState(Long slotId, LocalDateTime startTime, int capacity) {}
}
```
```java
package com.duing.domain.interview.service.dto;
import java.util.List;

public record MatchingResult(List<Assignment> assigned, List<Long> unassignedApplicationIds) {
    public record Assignment(Long applicationId, Long slotId) {}
}
```

- [ ] **Step 2: 빈 알고리즘 + 첫 실패 테스트**

```java
@Component
public class InterviewMatchingService {
    public MatchingResult match(MatchingInput input) {
        return new MatchingResult(List.of(), List.of()); // 실패 유도
    }
}
```

테스트:
```java
@Test
@DisplayName("선택 슬롯 수가 적은 지원자가 먼저 배정된다")
void leastFlexibleFirst() {
    var applicants = List.of(
            new MatchingInput.ApplicantSelection(1L, Set.of(10L, 11L, 12L)),
            new MatchingInput.ApplicantSelection(2L, Set.of(10L)));
    var slots = List.of(
            new MatchingInput.SlotState(10L, LocalDateTime.parse("2026-03-20T10:00"), 1),
            new MatchingInput.SlotState(11L, LocalDateTime.parse("2026-03-20T11:00"), 1),
            new MatchingInput.SlotState(12L, LocalDateTime.parse("2026-03-20T12:00"), 1));

    var result = new InterviewMatchingService().match(new MatchingInput(applicants, slots));

    assertThat(result.assigned()).containsExactlyInAnyOrder(
            new MatchingResult.Assignment(2L, 10L),
            new MatchingResult.Assignment(1L, 11L)); // 또는 12L
}
```

테스트 실행 → FAIL.

- [ ] **Step 3: 4-step 알고리즘 본체 구현**

spec §4.3 의 Java 스케치를 그대로 반영:

```java
public MatchingResult match(MatchingInput input) {
    Map<Long, Integer> assignedCount = new HashMap<>();
    Map<Long, SlotState> slotById = input.slots().stream()
            .collect(toMap(SlotState::slotId, s -> s));

    List<Assignment> assigned = new ArrayList<>();
    List<Long> unassigned = new ArrayList<>();

    List<ApplicantSelection> ordered = input.applicants().stream()
            .sorted(Comparator
                    .comparingInt((ApplicantSelection a) -> a.selectedSlotIds().size())
                    .thenComparing(ApplicantSelection::applicationId))
            .toList();

    for (ApplicantSelection applicant : ordered) {
        Optional<Long> chosen = applicant.selectedSlotIds().stream()
                .map(slotById::get)
                .filter(Objects::nonNull)
                .filter(slot -> assignedCount.getOrDefault(slot.slotId(), 0) < slot.capacity())
                .min(Comparator
                        .comparingInt((SlotState s) -> assignedCount.getOrDefault(s.slotId(), 0))
                        .thenComparing(SlotState::startTime)
                        .thenComparing(SlotState::slotId))
                .map(SlotState::slotId);

        if (chosen.isPresent()) {
            assigned.add(new Assignment(applicant.applicationId(), chosen.get()));
            assignedCount.merge(chosen.get(), 1, Integer::sum);
        } else {
            unassigned.add(applicant.applicationId());
        }
    }
    return new MatchingResult(assigned, unassigned);
}
```

- [ ] **Step 4: 첫 테스트 통과 확인**

- [ ] **Step 5: 추가 시나리오 8 개 작성 (spec §4.8 의 1~8 번)**

각각 테스트 → 실행 → 통과 사이클.
```
@DisplayName("동일한 슬롯 후보 중 현재 배정 수가 가장 적은 슬롯이 선택된다"
@DisplayName("배정 수가 동률이면 가장 빠른 시간의 슬롯이 선택된다"
@DisplayName("capacity 가 모두 소진된 지원자는 미배정 결과에 포함된다"
@DisplayName("선택한 슬롯이 모두 만석이면 미배정으로 분류된다"
@DisplayName("동일 입력에 대해 매칭 결과는 항상 동일하다"
@DisplayName("단일 슬롯에 capacity 만큼만 배정되고 나머지는 미배정된다"
@DisplayName("가능시간이 없는 지원자는 입력에 포함되지 않으면 결과에 나타나지 않는다"
```

각 테스트의 입력값은 작고 명시적이어야 함 (3~5명 / 3~5 슬롯 수준).

- [ ] **Step 6: 커밋**

```bash
./gradlew test --tests "InterviewMatchingServiceTest"
git commit -am "feat(interview): InterviewMatchingService 순수 함수 매칭 알고리즘"
```

---

## Task 9 (PR9): M7 auto-assign + M8 GET schedules + M11 candidates

**목적:** 자동 배정 트랜잭션 실행 + 운영진 대시보드 일정/후보 조회.

**Files:**
- Create: `backend/src/main/java/com/duing/domain/interview/service/InterviewScheduleService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewScheduleService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewScheduleApi.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewScheduleController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/response/AutoAssignResultResponse.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/response/MatchingCandidatesResponse.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/query/ScheduleListView.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/InterviewAutoAssignServiceTest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/controller/ManagerInterviewScheduleControllerTest.java`

- [ ] **Step 1: Repository 보강 + 기존 ApplicationRepository 확인**

```bash
# ApplicationRepository 에 findByRecruitmentIdAndStatus 가 있는지 확인. 없으면 Step 의 본 task 안에서 추가.
grep -n "findByRecruitmentIdAndStatus\|findByRecruitmentId" backend/src/main/java/com/duing/domain/application/repository/ApplicationRepository.java
```

없으면 Task 9 안에서 다음을 ApplicationRepository 에 추가 (Task 5 와 충돌 시 둘 중 한 PR 에서만 추가):
```java
List<Application> findByRecruitmentIdAndStatus(Long recruitmentId, ApplicationStatus status);
```

InterviewScheduleRepository 메서드 추가:
```java
public interface InterviewScheduleRepository extends JpaRepository<InterviewSchedule, Long> {
    long countBySlotIdAndStatus(Long slotId, InterviewScheduleStatus status);
    Optional<InterviewSchedule> findByApplicationId(Long applicationId);
    List<InterviewSchedule> findByRecruitmentId(Long recruitmentId);
}
```

- [ ] **Step 2: 후보 조회 (Custom QueryDSL) — M11 용**

`InterviewSlotRepositoryCustom` 또는 별도 `InterviewAvailabilityRepositoryCustom` 에 슬롯별 신청자 수 / 이미 배정 수를 한 쿼리로 집계하는 메서드 추가. spec 의 `MatchingCandidatesResponse.SlotCandidatesView` 모양에 맞게.

- [ ] **Step 3: GeneralInterviewScheduleService.autoAssign 작성**

```java
@Transactional
public AutoAssignResultResponse autoAssign(Long recruitmentId, Long actorUserId) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

    InterviewConfig config = configRepository.findByRecruitmentIdForUpdate(recruitmentId)
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);
    LocalDateTime now = LocalDateTime.now();
    if (now.isBefore(config.getAvailabilityDeadline())) {
        throw new InterviewException.AvailabilityPeriodOpen();
    }
    if (config.getAssignmentCompletedAt() != null) {
        throw new InterviewException.AssignmentAlreadyCompleted();
    }

    List<InterviewSlot> slots = slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId);
    if (slots.isEmpty()) throw new InterviewException.NoSlotsAvailable();

    List<Application> candidates = applicationRepository
            .findByRecruitmentIdAndStatus(recruitmentId, ApplicationStatus.INTERVIEW_PENDING);
    if (candidates.isEmpty()) throw new InterviewException.NoCandidates();

    Map<Long, Set<Long>> availabilityByApplication = availabilityRepository
            .findByRecruitmentId(recruitmentId).stream()
            .collect(Collectors.groupingBy(InterviewAvailability::getApplicationId,
                    Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toSet())));

    List<MatchingInput.ApplicantSelection> matchInputApplicants = candidates.stream()
            .filter(a -> availabilityByApplication.containsKey(a.getId()))
            .map(a -> new MatchingInput.ApplicantSelection(a.getId(), availabilityByApplication.get(a.getId())))
            .toList();

    int noAvailabilityCount = candidates.size() - matchInputApplicants.size();

    MatchingResult result = matchingService.match(new MatchingInput(
            matchInputApplicants,
            slots.stream().map(s -> new MatchingInput.SlotState(s.getId(), s.getStartTime(), s.getCapacity())).toList()));

    for (MatchingResult.Assignment assignment : result.assigned()) {
        InterviewSchedule schedule = scheduleRepository.findByApplicationId(assignment.applicationId())
                .map(s -> { s.reassign(assignment.slotId(), now); return s; })
                .orElseGet(() -> InterviewSchedule.create(
                        assignment.applicationId(), assignment.slotId(), recruitmentId, now));
        scheduleRepository.save(schedule);
        eventPublisher.publishEvent(new InterviewScheduledEvent(
                assignment.applicationId(), assignment.slotId(), recruitmentId));
    }

    config.markAssignmentCompleted(now);

    return new AutoAssignResultResponse(
            candidates.size(),
            result.assigned().size(),
            result.unassignedApplicationIds().size(),
            noAvailabilityCount,
            now);
}
```

- [ ] **Step 4: M8 GET schedules + M11 candidates 메서드**

```java
@Transactional(readOnly = true)
public List<ScheduleListView> listSchedules(Long recruitmentId, Long actorUserId) {
    // 권한 + 슬롯별 그룹핑
}

@Transactional(readOnly = true)
public MatchingCandidatesResponse listCandidates(Long recruitmentId, Long actorUserId) {
    // 권한 + 통계 집계
}
```

- [ ] **Step 5: 시나리오 테스트 작성**

```
@DisplayName("availabilityDeadline 이전 호출 시 409 AvailabilityPeriodOpen 이 반환되고 assignmentCompletedAt 은 기록되지 않는다"
@DisplayName("assignmentCompletedAt 이 채워진 모집은 재호출 시 409 AssignmentAlreadyCompleted 가 반환된다"
@DisplayName("INTERVIEW_PENDING 지원자가 0명이면 409 NoCandidates 가 반환되고 assignmentCompletedAt 은 기록되지 않는다"
@DisplayName("INTERVIEW_PENDING + availability ≥ 1 지원자만 매칭 후보가 된다"
@DisplayName("자동배정 성공 후 assigned 지원자에게 InterviewScheduledEvent 가 발행된다"
@DisplayName("트랜잭션 롤백 시 InterviewScheduledEvent 는 발행되지 않는다" — DataAccessException 강제 유도
@DisplayName("동시 자동배정 호출 시 한 건만 성공한다" — CompletableFuture 로 병렬 호출
@DisplayName("M8 GET schedules 는 슬롯별로 그룹핑된 일정을 반환한다"
@DisplayName("M11 GET candidates 는 totalCandidates / candidatesWithAvailability / candidatesWithoutAvailability 를 반환한다"
```

- [ ] **Step 6: API/Controller + Controller 통합 테스트**

- [ ] **Step 7: 커밋**

```bash
./gradlew test --tests "InterviewAutoAssignServiceTest" --tests "ManagerInterviewScheduleControllerTest"
git commit -am "feat(interview): M7 auto-assign + M8 GET schedules + M11 candidates"
```

---

## Task 10 (PR10): M9 PUT schedule + M10 DELETE schedule

**목적:** 운영진의 수동 배정/이동/취소. source + target slot pessimistic lock.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/service/InterviewScheduleService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewScheduleService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewScheduleApi.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewScheduleController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/command/AssignInterviewScheduleCommand.java`
- Create: `backend/src/main/java/com/duing/domain/interview/dto/request/AssignInterviewScheduleRequest.java`
- Create: `backend/src/test/java/com/duing/domain/interview/service/InterviewScheduleManualServiceTest.java`

- [ ] **Step 1: 시나리오 테스트 작성**

```
@DisplayName("INTERVIEW_PENDING 이 아닌 지원자에 PUT 호출 시 400 InvalidApplicationStatus 가 반환된다"
@DisplayName("미배정 지원자에 PUT 호출 시 새 schedule 이 생성되고 InterviewScheduledEvent 가 발행된다"
@DisplayName("이미 ASSIGNED 인 지원자의 슬롯 이동은 InterviewUpdatedEvent 가 발행되고 assigned_at 이 갱신된다"
@DisplayName("CANCELLED 인 지원자의 재배정은 InterviewScheduledEvent 가 발행되고 status 가 ASSIGNED 로 전환된다"
@DisplayName("target slot capacity 가 가득 차 있으면 409 CapacityExceeded 가 반환된다"
@DisplayName("M10 호출 시 schedule 이 없으면 404 ScheduleNotFound 가 반환된다"
@DisplayName("M10 호출 후 status 가 CANCELLED 로 변경되고 InterviewCancelledEvent 가 발행된다"
@DisplayName("동시 수동 배정 호출 시 capacity 가 초과되지 않는다" — pessimistic lock 검증
```

- [ ] **Step 2: assign 메서드 구현**

spec §6.4 의 의사코드를 그대로 반영. source + target slot 을 id 오름차순으로 lock.

- [ ] **Step 3: cancel 메서드 구현**

```java
@Transactional
public void cancel(Long applicationId, Long actorUserId) {
    InterviewSchedule schedule = scheduleRepository.findByApplicationId(applicationId)
            .orElseThrow(InterviewException.ScheduleNotFound::new);
    Application application = applicationRepository.findById(applicationId)
            .orElseThrow(ApplicationException.NotFound::new);
    clubAuthService.requireManager(actorUserId, application.getRecruitment().getClub().getId());

    schedule.cancel(LocalDateTime.now());
    eventPublisher.publishEvent(new InterviewCancelledEvent(
            applicationId, schedule.getSlotId(), schedule.getRecruitmentId()));
}
```

- [ ] **Step 4: API/Controller + DTO**

```java
public record AssignInterviewScheduleRequest(@NotNull Long slotId) {}
public record AssignInterviewScheduleCommand(Long applicationId, Long slotId, Long actorUserId) {}
```

```java
@PutMapping("/api/v1/applications/{applicationId}/interview-schedule")
ResponseEntity<Void> assign(@PathVariable Long applicationId,
                            @Valid @RequestBody AssignInterviewScheduleRequest request);

@DeleteMapping("/api/v1/applications/{applicationId}/interview-schedule")
ResponseEntity<Void> cancel(@PathVariable Long applicationId);
```

- [ ] **Step 5: Controller 통합 테스트 + 커밋**

```bash
./gradlew test --tests "InterviewScheduleManualServiceTest" --tests "ManagerInterviewScheduleControllerTest"
git commit -am "feat(interview): M9 PUT schedule (manual assign/move) + M10 DELETE schedule"
```

---

## Task 11 (PR11): Notification consumers — Updated/Cancelled

**목적:** spec §6.5 의 이벤트 매트릭스 중 Updated/Cancelled 를 in-app 알림으로 변환. (Scheduled 는 Task 1 의 import 갱신으로 이미 동작.)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notification/listener/InterviewUpdatedListener.java`
- Create: `backend/src/main/java/com/duing/domain/notification/listener/InterviewCancelledListener.java`
- Modify: `backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java` (필요 시 INTERVIEW_UPDATED / INTERVIEW_CANCELLED 추가 — 기존 enum 확인 후 결정)
- Create: `backend/src/test/java/com/duing/domain/notification/listener/InterviewListenerIntegrationTest.java`

- [ ] **Step 1: 기존 NotificationType enum 확인**

```bash
cat backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java
```
`INTERVIEW_SCHEDULED` 외에 Updated/Cancelled 타입이 없으면 추가.

```java
public enum NotificationType {
    RECRUITMENT_OPENED,
    RECRUITMENT_DEADLINE,
    INTERVIEW_SCHEDULED,
    INTERVIEW_UPDATED,
    INTERVIEW_CANCELLED,
    INTERVIEW_REMINDER,
    NOTICE_TARGETED
}
```

- [ ] **Step 2: InterviewUpdatedListener 작성**

기존 `InterviewScheduledListener` 패턴 그대로:

```java
@Component
@RequiredArgsConstructor
public class InterviewUpdatedListener {

    private final NotificationRepository notificationRepository;
    private final ApplicationRepository applicationRepository;
    private final InterviewSlotRepository slotRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void on(InterviewUpdatedEvent event) {
        Application application = applicationRepository.findById(event.applicationId()).orElseThrow();
        InterviewSlot slot = slotRepository.findById(event.slotId()).orElseThrow();
        // Notification.create(...) 후 save. dedupKey 는 "interview-updated:" + scheduleId 또는 시간 기반.
    }
}
```

- [ ] **Step 3: InterviewCancelledListener 작성**

동일 패턴.

- [ ] **Step 4: 통합 테스트**

```
@DisplayName("InterviewUpdatedEvent 발행 시 대상 사용자에게 INTERVIEW_UPDATED 알림이 생성된다"
@DisplayName("InterviewCancelledEvent 발행 시 대상 사용자에게 INTERVIEW_CANCELLED 알림이 생성된다"
@DisplayName("이벤트 발행 후 트랜잭션이 롤백되면 알림이 생성되지 않는다"
@DisplayName("리스너 내부 예외는 면접 일정 자체에 영향을 주지 않는다"
```

- [ ] **Step 5: 빌드/테스트 + 커밋**

```bash
./gradlew test --tests "InterviewListenerIntegrationTest"
git commit -am "feat(notification): InterviewUpdatedEvent / InterviewCancelledEvent 리스너 추가"
```

---

## 마무리

- [ ] **모든 task 완료 후 통합 회귀 테스트**

```bash
./gradlew test
```
모든 기존 + 신규 테스트 통과 확인.

- [ ] **CI 통과 확인 후 단계별 PR 머지**

Phase A → B → C → D 순. Phase 안의 PR 간 의존성에 따라 순차/병렬.

---

## 변경 이력

- 2026-06-08 — 최초 작성. spec 의 11 PR 분할을 task 단위 step 으로 분해.
