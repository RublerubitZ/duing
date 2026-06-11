# BE#1 — V49 라운드 중심 스키마 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 면접 도메인의 중심을 recruitment → InterviewRound 로 옮기는 V49 drop & recreate 마이그레이션과 그에 따른 엔티티/코드 전환을 한 PR 로 수행한다.

**Architecture:** `ddl-auto: validate` 때문에 **마이그레이션 + 엔티티 전환 + main 재작성 + 테스트 정리가 단일 커밋으로 불가분**이다 (스키마와 엔티티가 어긋나면 컨텍스트 부팅 실패 → 전체 테스트 불능). 구 AT_APPLICATION API 6종과 서비스를 제거하므로 **이 PR 동안 면접 기능은 비활성** (출시 전 허용, 신규 round API 는 BE#2~). 이벤트/리스너/매칭서비스/Custom 조회는 보존한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / JUnit 5 + Testcontainers

**근거 스펙:** `docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md` §4(DDL)·§5.4(술어)·§7(동시성)·§12 BE#1·§13(제거/유지)
**리뷰 정책:** duing-code-reviewer + codex 기본, **codex adversarial(Migration·데이터무결성 관점) 필수**
**후속:** BE#2(라운드 후보 조회)부터 round API 추가. FE 는 이 PR 머지 후 짝 작업.

---

## 핵심 결정 (계획 수준에서 고정)

1. **`ddl-auto: validate` 제약**: V49 적용 순간 구 엔티티 검증이 깨지므로, RED 스키마 테스트(Task 2)만 선행하고 Task 3~4 전체를 **커밋 1개**로 만든다.
2. **지원자 조회는 `isVisibleToApplicant` 술어**: `getMyApplicationDetail` 의 deadline 은 DRAFT 라운드를 제외한 조회(`findVisibleToApplicantRoundByApplicationId`)를 쓴다 — 발송 전 라운드 정보가 지원자에게 새면 안 된다 (스펙 §5.4·§9.3). 배치용 `isActiveForPlacement` 조회는 BE#2~3 에서 추가한다.
3. **recruitment 상세의 `interviewAvailabilityDeadline` 은 null 고정**: 라운드가 여럿일 수 있어 모집 단위 단일 deadline 은 의미 상실. 응답 필드는 FE 재배선 전까지 유지하되 null 을 넣는다. `GeneralRecruitmentService` 의 interview 의존은 **제거** (round 의존으로 교체하지 않음).
4. **이벤트 3종·리스너 3종 무수정 보존** (스펙 §8 — INTERVIEW_UPDATED/CANCELLED 는 발행 경로 없는 보존). 리스너는 applicationId/slotId 만 사용하므로 컴파일 영향 없음.
5. **레포지토리는 사용처가 살아있는 메서드만 보존** (YAGNI — 삭제분은 후속 PR 에서 재정의): availability `countByApplicationId`/`findByApplicationId`/Custom, schedule `findByApplicationId`/`findByApplicationIdIn`/`findAssignedBetween`/Custom, slot 은 기본 JpaRepository 만.
6. **round/member status 에 DB CHECK 추가** (스펙 DDL 에는 schedule 만 명시였으나 V45 의 schedule CHECK 전례와 일관 — 5값/5값 IN 제약).
7. **테스트의 round 상태 세팅은 리플렉션 fixture** (`saveActiveClub` 의 ClubStatus 전례) — 상태 전이 메서드는 해당 API PR 에서 TDD 로 도입한다.
8. **schedule/availability 생성엔 member 행 선행 필수** — 신규 composite FK `(round_id, application_id) → interview_round_member` 때문. 모든 테스트 셋업이 round → member → slot → (availability|schedule) 순서를 지킨다.

## File Map (변경 전모)

**Create (main 9):**
| 파일 | 책임 |
|---|---|
| `backend/src/main/resources/db/migration/V49__recreate_interview_tables_round_based.sql` | drop 구 4테이블 → create 5테이블 |
| `domain/interview/entity/RoundStatus.java` | DRAFT·COLLECTING·ASSIGNING·SCHEDULED·CANCELLED |
| `domain/interview/entity/RoundMemberStatus.java` | INVITED·RESPONDED·NO_AVAILABLE_SLOT·ASSIGNED·EXCLUDED |
| `domain/interview/entity/InterviewRound.java` | 라운드 (deadline nullable, @Version, request_sequence) |
| `domain/interview/entity/InterviewRoundMember.java` | 멤버십+응답 상태 (soft delete 미사용) |
| `domain/interview/repository/InterviewRoundRepository.java` | findVisibleToApplicantRoundByApplicationId |
| `domain/interview/repository/InterviewRoundMemberRepository.java` | 기본 JpaRepository (테스트 셋업용) |
| `backend/src/test/.../interview/repository/InterviewRoundSchemaTest.java` | 신규 스키마 제약 검증 (구 InterviewSchemaTest 대체) |
| `backend/src/test/.../common/fixture/InterviewRoundFixture.java` | draft/withStatus(리플렉션) |

**Modify (main 8):** `InterviewSlot`(roundId)·`InterviewAvailability`(roundId)·`InterviewSchedule`(roundId, unique 어노테이션 제거)·`InterviewException`(prune)·`InterviewAvailabilityRepository`·`InterviewScheduleRepository`·`GeneralApplicationService`·`GeneralRecruitmentService`·`InterviewReminderJob` (9개 — Slot/Availability/Schedule 포함)

**Delete (main 36):** api 6 · controller 6 · controller/dto/request 6 · controller/dto/response 8 · `entity/InterviewConfig` · `entity/SlotLifecyclePhase` · service 8(`General*4` + 인터페이스 4 — `InterviewMatchingService` 제외) · service/dto/command 6 · service/dto/query `ScheduleListView`/`SlotListView` · `repository/InterviewConfigRepository` · `repository/InterviewSlotRepositoryCustom`+`Impl`

**Keep (무수정):** `InterviewMatchingService`+`MatchingInput`/`MatchingResult`, event 3종, listener 3종(`InterviewScheduled/Updated/CancelledListener`), `InterviewScheduleRepositoryCustom`+`Impl`, `InterviewAvailabilityRepositoryCustom`+`Impl`, `InterviewSlotTimeWindow`, `InterviewScheduleStatus`, `ApplicationRepositoryImpl`(QueryDSL join 은 applicationId/slotId 기반이라 생존)

**Tests:** Task 4 의 처분표 참조 (DELETE 13 / REWORK 12 / KEEP 2)

---

### Task 1: 브랜치 생성

- [x] **Step 1: develop 최신화 후 분기**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull origin develop
git checkout -b refactor/interview-round-schema
```

Expected: `Switched to a new branch 'refactor/interview-round-schema'`

---

### Task 2: 신규 스키마 테스트 작성 (RED)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/interview/repository/InterviewRoundSchemaTest.java`

구 `InterviewSchemaTest` 의 JdbcTemplate + `session_replication_role='replica'`(FK 우회) 패턴을 그대로 따른다. 이 시점엔 구 스키마라 새 테이블이 없어 **전부 FAIL** 해야 한다. 구 `InterviewSchemaTest` 는 Task 4 에서 삭제한다.

- [x] **Step 1: 테스트 작성**

```java
package com.duing.domain.interview.repository;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * V49 라운드 중심 interview_* 테이블의 DB 제약을 검증하는 스키마 통합 테스트.
 *
 * <p>JdbcTemplate 으로 SQL 을 직접 실행하고 위반 예외를 확인한다.
 * FK 제약을 우회하기 위해 테스트 직전 {@code SET session_replication_role = 'replica'} 를 실행한다.
 * PostgreSQL 에서 이 설정은 FK 트리거를 비활성화하지만 CHECK/UNIQUE 제약은 정상 동작한다.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
@Transactional
class InterviewRoundSchemaTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private void bypassForeignKeys() {
        jdbcTemplate.execute("SET session_replication_role = 'replica'");
    }

    @Test
    @DisplayName("interview_round.status 가 5개 상태 외 값이면 CHECK 위반이 발생한다")
    void rejectsInvalidRoundStatus() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round
                            (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                        VALUES (1, '1차 면접', 'INVALID_STATUS', 0, 0, now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("같은 모집에 DRAFT 라운드를 두 개 만들면 partial unique 위반이 발생한다")
    void rejectsSecondDraftRoundPerRecruitment() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_round
                    (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                VALUES (1, '1차 면접', 'DRAFT', 0, 0, now(), now())
                """);

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round
                            (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                        VALUES (1, '2차 면접', 'DRAFT', 0, 0, now(), now())
                        """))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    @DisplayName("같은 모집이라도 DRAFT 가 아닌 라운드와 DRAFT 라운드는 공존할 수 있다")
    void allowsDraftAfterNonDraftRound() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_round
                    (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                VALUES (1, '1차 면접', 'SCHEDULED', 1, 0, now(), now())
                """);
        jdbcTemplate.execute("""
                INSERT INTO interview_round
                    (recruitment_id, title, status, request_sequence, version, created_at, updated_at)
                VALUES (1, '2차 면접', 'DRAFT', 0, 0, now(), now())
                """);
        // 예외 없이 통과하면 성공
    }

    @Test
    @DisplayName("interview_round_member 는 같은 라운드에 같은 지원서를 중복 등록할 수 없다")
    void rejectsDuplicateMemberInRound() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_round_member
                    (round_id, application_id, status, created_at, updated_at)
                VALUES (1, 1, 'INVITED', now(), now())
                """);

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round_member
                            (round_id, application_id, status, created_at, updated_at)
                        VALUES (1, 1, 'RESPONDED', now(), now())
                        """))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    @DisplayName("interview_round_member.status 가 5개 상태 외 값이면 CHECK 위반이 발생한다")
    void rejectsInvalidMemberStatus() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_round_member
                            (round_id, application_id, status, created_at, updated_at)
                        VALUES (1, 1, 'NO_RESPONSE', now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot 의 end_time 이 start_time 이전이면 CHECK 위반이 발생한다")
    void rejectsSlotWithEndTimeBeforeStartTime() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_slot
                            (round_id, start_time, end_time, capacity, created_at, updated_at)
                        VALUES (1, now() + interval '1 hour', now(), 5, now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_slot.capacity 가 0 이하이면 CHECK 위반이 발생한다")
    void rejectsSlotWithNonPositiveCapacity() {
        bypassForeignKeys();

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_slot
                            (round_id, start_time, end_time, capacity, created_at, updated_at)
                        VALUES (1, now(), now() + interval '1 hour', 0, now(), now())
                        """))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("interview_schedule 은 같은 라운드의 같은 지원서에 활성 일정을 두 개 만들 수 없고, soft delete 후 재생성은 허용한다")
    void schedulePerRoundPartialUnique() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_schedule
                    (round_id, application_id, slot_id, status, assigned_at, created_at, updated_at)
                VALUES (1, 1, 1, 'ASSIGNED', now(), now(), now())
                """);

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_schedule
                            (round_id, application_id, slot_id, status, assigned_at, created_at, updated_at)
                        VALUES (1, 1, 2, 'ASSIGNED', now(), now(), now())
                        """))
                .isInstanceOf(DataAccessException.class);

        // 자동배정 재실행 경로: 기존 행 soft delete 후 재생성 허용 (스펙 §6.2)
        jdbcTemplate.execute("UPDATE interview_schedule SET deleted_at = now() WHERE round_id = 1");
        jdbcTemplate.execute("""
                INSERT INTO interview_schedule
                    (round_id, application_id, slot_id, status, assigned_at, created_at, updated_at)
                VALUES (1, 1, 2, 'ASSIGNED', now(), now(), now())
                """);
    }

    @Test
    @DisplayName("interview_availability 는 같은 지원서가 같은 슬롯을 중복 선택할 수 없다")
    void rejectsDuplicateAvailability() {
        bypassForeignKeys();

        jdbcTemplate.execute("""
                INSERT INTO interview_availability
                    (round_id, application_id, slot_id, created_at, updated_at)
                VALUES (1, 1, 1, now(), now())
                """);

        assertThatThrownBy(() ->
                jdbcTemplate.execute("""
                        INSERT INTO interview_availability
                            (round_id, application_id, slot_id, created_at, updated_at)
                        VALUES (1, 1, 1, now(), now())
                        """))
                .isInstanceOf(DataAccessException.class);
    }
}
```

- [x] **Step 2: RED 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test --tests "com.duing.domain.interview.repository.InterviewRoundSchemaTest"
```

Expected: **전부 FAIL** — `relation "interview_round" does not exist` 류 (`BadSqlGrammarException`). 컨텍스트 부팅은 정상 (구 스키마 + 구 엔티티 정합 유지 중). **커밋하지 않는다** — Task 3~4 와 단일 커밋.

---

### Task 3: V49 + 엔티티/레포 전환 + 구 도메인 제거 + main 재작성 (ATOMIC)

**체크포인트:** Task 3 끝에 `./gradlew compileJava` 그린. (테스트 컴파일은 Task 4 에서 해소 — 커밋은 Task 4 끝에 1개)

- [x] **Step 1: V49 마이그레이션 작성**

`backend/src/main/resources/db/migration/V49__recreate_interview_tables_round_based.sql`:

```sql
-- 면접 도메인 라운드 중심 재설계 (스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md §4)
-- 출시 전 · 운영 데이터 없음 — drop & recreate. V45 의 uk_application_id_recruitment_id 는 무해하므로 유지.
DROP TABLE IF EXISTS interview_availability;
DROP TABLE IF EXISTS interview_schedule;
DROP TABLE IF EXISTS interview_slot;
DROP TABLE IF EXISTS interview_config;

-- 1. InterviewRound — 면접 도메인의 새 중심
CREATE TABLE interview_round (
    id                       BIGSERIAL PRIMARY KEY,
    recruitment_id           BIGINT NOT NULL REFERENCES recruitment(id) ON DELETE RESTRICT,
    title                    VARCHAR(100) NOT NULL,
    status                   VARCHAR(20) NOT NULL
                             CHECK (status IN ('DRAFT', 'COLLECTING', 'ASSIGNING', 'SCHEDULED', 'CANCELLED')),
    -- DRAFT 동안 nullable, DRAFT→COLLECTING 발송 전이 시 NOT NULL 검증은 서비스 가드 (BE#5)
    availability_deadline    TIMESTAMP WITH TIME ZONE,
    location                 VARCHAR(200),
    assignment_completed_at  TIMESTAMP WITH TIME ZONE,
    -- MVP 는 Availability 요청/재알림 dedupKey 생성용. 향후 NotificationLog/InterviewRoundNotification 테이블로 이관 가능.
    request_sequence         INTEGER NOT NULL DEFAULT 0,
    -- 자동배정/확정/취소 동시 실행 race 차단용 낙관적 락 (application.version 전례 — V37)
    version                  BIGINT NOT NULL DEFAULT 0,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at               TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_interview_round_recruitment_status
    ON interview_round (recruitment_id, status);
-- 모집당 DRAFT 라운드 최대 1개 (V38 active-recruitment partial unique 전례)
CREATE UNIQUE INDEX uq_interview_round_draft_per_recruitment
    ON interview_round (recruitment_id)
    WHERE status = 'DRAFT' AND deleted_at IS NULL;

-- 2. InterviewRoundMember — 멤버십 + 응답 상태 단일 머신
CREATE TABLE interview_round_member (
    id                             BIGSERIAL PRIMARY KEY,
    round_id                       BIGINT NOT NULL REFERENCES interview_round(id) ON DELETE RESTRICT,
    application_id                 BIGINT NOT NULL REFERENCES application(id) ON DELETE RESTRICT,
    status                         VARCHAR(30) NOT NULL
                                   CHECK (status IN ('INVITED', 'RESPONDED', 'NO_AVAILABLE_SLOT', 'ASSIGNED', 'EXCLUDED')),
    alternative_availability_text  VARCHAR(500),
    created_at                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at                     TIMESTAMP WITH TIME ZONE,
    -- 일반 unique: 멤버는 soft delete 하지 않고 EXCLUDED 로 종결 → composite FK 타겟으로 사용 가능
    CONSTRAINT uk_interview_round_member UNIQUE (round_id, application_id)
);
CREATE INDEX idx_interview_round_member_application
    ON interview_round_member (application_id);

-- 3. InterviewSlot — recruitment_id → round_id 로 repoint
CREATE TABLE interview_slot (
    id          BIGSERIAL PRIMARY KEY,
    round_id    BIGINT NOT NULL REFERENCES interview_round(id) ON DELETE RESTRICT,
    start_time  TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time    TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity    INTEGER NOT NULL CHECK (capacity > 0),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMP WITH TIME ZONE,
    CHECK (end_time > start_time),
    UNIQUE (id, round_id)   -- composite FK 타겟 (V45 패턴)
);
CREATE INDEX idx_interview_slot_round_start
    ON interview_slot (round_id, start_time);

-- 4. InterviewAvailability — 라운드 멤버의 슬롯-고르기 응답
CREATE TABLE interview_availability (
    id              BIGSERIAL PRIMARY KEY,
    round_id        BIGINT NOT NULL,
    application_id  BIGINT NOT NULL,
    slot_id         BIGINT NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    -- 슬롯-라운드 정합
    FOREIGN KEY (slot_id, round_id)
        REFERENCES interview_slot(id, round_id) ON DELETE RESTRICT,
    -- 라운드 멤버만 응답 가능
    FOREIGN KEY (round_id, application_id)
        REFERENCES interview_round_member(round_id, application_id) ON DELETE RESTRICT
);
-- soft delete 후 재응답 허용 (V46 패턴)
CREATE UNIQUE INDEX uq_interview_availability_active
    ON interview_availability (application_id, slot_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_interview_availability_slot
    ON interview_availability (slot_id);

-- 5. InterviewSchedule — 라운드 내 최종 1:1 배정
CREATE TABLE interview_schedule (
    id              BIGSERIAL PRIMARY KEY,
    round_id        BIGINT NOT NULL,
    application_id  BIGINT NOT NULL,
    slot_id         BIGINT NOT NULL,
    -- status='CANCELLED' 은 MVP 미사용 (재배정은 soft delete 경로). future 재면접용 예약값.
    status          VARCHAR(20) NOT NULL CHECK (status IN ('ASSIGNED', 'CANCELLED')),
    assigned_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (slot_id, round_id)
        REFERENCES interview_slot(id, round_id) ON DELETE RESTRICT,
    FOREIGN KEY (round_id, application_id)
        REFERENCES interview_round_member(round_id, application_id) ON DELETE RESTRICT
);
-- 자동배정 재실행 시 soft delete 후 재생성 허용. 전역 UNIQUE 였던 application_id 는 per-round 로 완화 (스펙 §4)
CREATE UNIQUE INDEX uq_interview_schedule_active_per_round
    ON interview_schedule (round_id, application_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_interview_schedule_slot
    ON interview_schedule (slot_id);
```

- [x] **Step 2: enum 2개 신규 작성**

`backend/src/main/java/com/duing/domain/interview/entity/RoundStatus.java`:

```java
package com.duing.domain.interview.entity;

/**
 * InterviewRound 상태머신 (스펙 §5.1):
 * DRAFT → (발송) → COLLECTING → (자동배정) → ASSIGNING → (확정) → SCHEDULED(터미널)
 * DRAFT|COLLECTING|ASSIGNING → CANCELLED(터미널). ASSIGNING→COLLECTING 복귀 없음.
 * SCHEDULED 는 member.ASSIGNED 와의 이름 충돌을 피하고 future COMPLETED 확장 여지를 남긴 명명.
 */
public enum RoundStatus {
    DRAFT,
    COLLECTING,
    ASSIGNING,
    SCHEDULED,
    CANCELLED
}
```

`backend/src/main/java/com/duing/domain/interview/entity/RoundMemberStatus.java`:

```java
package com.duing.domain.interview.entity;

/**
 * InterviewRoundMember 상태머신 (스펙 §5.2):
 * INVITED ↔ RESPONDED|NO_AVAILABLE_SLOT (COLLECTING && 마감 전 재응답),
 * RESPONDED → ASSIGNED (확정 시에만), INVITED|RESPONDED|NO_AVAILABLE_SLOT → EXCLUDED.
 * 미응답(NO_RESPONSE)은 저장하지 않고 INVITED && now > round.availabilityDeadline 로 파생한다.
 */
public enum RoundMemberStatus {
    INVITED,
    RESPONDED,
    NO_AVAILABLE_SLOT,
    ASSIGNED,
    EXCLUDED
}
```

- [x] **Step 3: `InterviewRound` 엔티티 신규 작성**

`backend/src/main/java/com/duing/domain/interview/entity/InterviewRound.java`:

```java
package com.duing.domain.interview.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_round")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 바인드 파라미터로 version 을 전달한다 (Application 전례).
@SQLDelete(sql = "UPDATE interview_round SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewRound extends BaseEntity {

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Column(nullable = false, length = 100)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RoundStatus status;

    // DRAFT 동안 nullable — DRAFT→COLLECTING 발송 전이 가드에서 NOT NULL 을 요구한다 (BE#5).
    @Column(name = "availability_deadline")
    private LocalDateTime availabilityDeadline;

    @Column(length = 200)
    private String location;

    @Column(name = "assignment_completed_at")
    private LocalDateTime assignmentCompletedAt;

    // MVP 는 Availability 요청/재알림 dedupKey 생성용 — 발송·재알림·Rule 2 재초대 직전에 증가한다.
    // 향후 NotificationLog/InterviewRoundNotification 테이블로 이관 가능 (스펙 §4·§8).
    @Column(name = "request_sequence", nullable = false)
    private int requestSequence;

    // 자동배정/확정/취소 동시 실행 race 차단 (스펙 §7 — Application @Version 전례)
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewRound(Long recruitmentId, String title,
                           LocalDateTime availabilityDeadline, String location) {
        this.recruitmentId = recruitmentId;
        this.title = title;
        this.status = RoundStatus.DRAFT;
        this.availabilityDeadline = availabilityDeadline;
        this.location = location;
        this.requestSequence = 0;
    }

    public static InterviewRound create(Long recruitmentId, String title,
                                        LocalDateTime availabilityDeadline, String location) {
        return InterviewRound.builder()
                .recruitmentId(recruitmentId)
                .title(title)
                .availabilityDeadline(availabilityDeadline)
                .location(normalizeNullable(location))
                .build();
    }

    private static String normalizeNullable(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
```

(상태 전이 메서드는 의도적으로 없다 — 각 전이는 해당 API PR 에서 TDD 로 도입한다. YAGNI.)

- [x] **Step 4: `InterviewRoundMember` 엔티티 신규 작성**

`backend/src/main/java/com/duing/domain/interview/entity/InterviewRoundMember.java`:

```java
package com.duing.domain.interview.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 라운드 멤버십 + 응답 상태 단일 머신.
 * <p>
 * soft delete 를 사용하지 않는다 — 멤버 종결은 {@link RoundMemberStatus#EXCLUDED} 상태로 표현한다.
 * (round_id, application_id) 일반 UNIQUE 를 availability/schedule 의 composite FK 타겟으로
 * 쓰기 위한 결정이다 (스펙 §4 — partial unique 는 FK 타겟이 될 수 없다).
 */
@Getter
@Entity
@Table(name = "interview_round_member")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InterviewRoundMember extends BaseEntity {

    @Column(name = "round_id", nullable = false)
    private Long roundId;

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private RoundMemberStatus status;

    @Column(name = "alternative_availability_text", length = 500)
    private String alternativeAvailabilityText;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewRoundMember(Long roundId, Long applicationId) {
        this.roundId = roundId;
        this.applicationId = applicationId;
        this.status = RoundMemberStatus.INVITED;
    }

    public static InterviewRoundMember invite(Long roundId, Long applicationId) {
        return InterviewRoundMember.builder()
                .roundId(roundId)
                .applicationId(applicationId)
                .build();
    }
}
```

- [x] **Step 5: 기존 엔티티 3개 round 기반으로 수정 — 전체 교체**

`InterviewSlot.java` — `recruitmentId` → `roundId`, 나머지 유지:

```java
package com.duing.domain.interview.entity;

import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_slot")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_slot SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewSlot extends BaseEntity {

    @Column(name = "round_id", nullable = false)
    private Long roundId;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    @Column(nullable = false)
    private int capacity;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewSlot(Long roundId, LocalDateTime startTime, LocalDateTime endTime, int capacity) {
        this.roundId = roundId;
        this.startTime = startTime;
        this.endTime = endTime;
        this.capacity = capacity;
    }

    public static InterviewSlot create(Long roundId, LocalDateTime startTime, LocalDateTime endTime, int capacity) {
        return InterviewSlot.builder()
                .roundId(roundId)
                .startTime(startTime)
                .endTime(endTime)
                .capacity(capacity)
                .build();
    }

    public void updateTime(LocalDateTime newStartTime, LocalDateTime newEndTime) {
        this.startTime = newStartTime;
        this.endTime = newEndTime;
    }

    public void updateCapacity(int newCapacity) {
        if (newCapacity <= 0) {
            throw new InterviewException.CapacityBelowAssigned();
        }
        this.capacity = newCapacity;
    }
}
```

`InterviewAvailability.java` — `recruitmentId` → `roundId`:

```java
package com.duing.domain.interview.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_availability")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_availability SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewAvailability extends BaseEntity {

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "round_id", nullable = false)
    private Long roundId;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewAvailability(Long applicationId, Long slotId, Long roundId) {
        this.applicationId = applicationId;
        this.slotId = slotId;
        this.roundId = roundId;
    }

    public static InterviewAvailability create(Long applicationId, Long slotId, Long roundId) {
        return InterviewAvailability.builder()
                .applicationId(applicationId)
                .slotId(slotId)
                .roundId(roundId)
                .build();
    }
}
```

`InterviewSchedule.java` — `recruitmentId` → `roundId`, `applicationId` 의 `unique = true` 제거 (per-round partial unique 는 DB 전용), 미사용 `reassign`/`cancel` 제거 (확정/수동수정 PR 에서 재도입):

```java
package com.duing.domain.interview.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "interview_schedule")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE interview_schedule SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class InterviewSchedule extends BaseEntity {

    @Column(name = "application_id", nullable = false)
    private Long applicationId;

    @Column(name = "slot_id", nullable = false)
    private Long slotId;

    @Column(name = "round_id", nullable = false)
    private Long roundId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InterviewScheduleStatus status;

    @Column(name = "assigned_at", nullable = false)
    private LocalDateTime assignedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private InterviewSchedule(Long applicationId, Long slotId, Long roundId,
                               InterviewScheduleStatus status, LocalDateTime assignedAt) {
        this.applicationId = applicationId;
        this.slotId = slotId;
        this.roundId = roundId;
        this.status = status;
        this.assignedAt = assignedAt;
    }

    public static InterviewSchedule create(Long applicationId, Long slotId, Long roundId,
                                            LocalDateTime assignedAt) {
        return InterviewSchedule.builder()
                .applicationId(applicationId)
                .slotId(slotId)
                .roundId(roundId)
                .status(InterviewScheduleStatus.ASSIGNED)
                .assignedAt(assignedAt)
                .build();
    }
}
```

- [x] **Step 6: 구 도메인 파일 일괄 삭제**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git rm backend/src/main/java/com/duing/domain/interview/api/ApplicantInterviewSlotApi.java \
       backend/src/main/java/com/duing/domain/interview/api/InterviewAvailabilityApi.java \
       backend/src/main/java/com/duing/domain/interview/api/InterviewScheduleApi.java \
       backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewConfigApi.java \
       backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewScheduleApi.java \
       backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewSlotApi.java
git rm -r backend/src/main/java/com/duing/domain/interview/controller
git rm backend/src/main/java/com/duing/domain/interview/entity/InterviewConfig.java \
       backend/src/main/java/com/duing/domain/interview/entity/SlotLifecyclePhase.java
git rm backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewAvailabilityService.java \
       backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewConfigService.java \
       backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewScheduleService.java \
       backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewSlotService.java \
       backend/src/main/java/com/duing/domain/interview/service/InterviewAvailabilityService.java \
       backend/src/main/java/com/duing/domain/interview/service/InterviewConfigService.java \
       backend/src/main/java/com/duing/domain/interview/service/InterviewScheduleService.java \
       backend/src/main/java/com/duing/domain/interview/service/InterviewSlotService.java
git rm -r backend/src/main/java/com/duing/domain/interview/service/dto/command
git rm backend/src/main/java/com/duing/domain/interview/service/dto/query/ScheduleListView.java \
       backend/src/main/java/com/duing/domain/interview/service/dto/query/SlotListView.java
git rm backend/src/main/java/com/duing/domain/interview/repository/InterviewConfigRepository.java \
       backend/src/main/java/com/duing/domain/interview/repository/InterviewSlotRepositoryCustom.java \
       backend/src/main/java/com/duing/domain/interview/repository/InterviewSlotRepositoryImpl.java
```

**남는 것 (의도):** `InterviewMatchingService` + `MatchingInput`/`MatchingResult`, `InterviewSlotTimeWindow`, event 3종, `InterviewScheduleStatus`. `controller/` 디렉터리는 통째 삭제 (BE#2 부터 새 구조로 재생성).

- [x] **Step 7: `InterviewException` prune — 전체 교체**

삭제된 서비스 전용 예외를 제거하고, 살아있는 참조(`InterviewSlot.updateCapacity`)만 남긴다. 새 라운드 예외는 각 API PR 에서 추가한다.

```java
package com.duing.domain.interview.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class InterviewException extends ApplicationException {

    protected InterviewException(String message, HttpStatus status) {
        super(message, status);
    }

    // ── 409 슬롯 수정 ──────────────────────────────────────────────────────────

    public static final class CapacityBelowAssigned extends InterviewException {
        private static final String MESSAGE = "정원이 이미 배정된 인원수보다 적을 수 없습니다.";
        public CapacityBelowAssigned() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
}
```

- [x] **Step 8: 레포지토리 정비**

`InterviewRoundRepository.java` 신규:

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRound;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewRoundRepository extends JpaRepository<InterviewRound, Long> {

    /**
     * 지원자 노출(stepper·applicantPhase) 전용 — isVisibleToApplicant 술어 (스펙 §5.4).
     * DRAFT 라운드는 발송 전이므로 지원자에게 보이지 않는다.
     * 배치·중복방지 검증에는 isActiveForPlacement(DRAFT 포함) 조회를 써야 하며
     * 두 술어를 혼용하지 않는다 — placement 조회는 라운드 생성 PR(BE#2~3)에서 추가된다.
     * 불변식상 결과는 최대 1건이다 (placement-active 멤버십 최대 1개 ⊇ visible).
     */
    @Query("""
            select r
              from InterviewRound r, InterviewRoundMember m
             where m.roundId = r.id
               and m.applicationId = :applicationId
               and m.status <> com.duing.domain.interview.entity.RoundMemberStatus.EXCLUDED
               and r.status in (com.duing.domain.interview.entity.RoundStatus.COLLECTING,
                                com.duing.domain.interview.entity.RoundStatus.ASSIGNING,
                                com.duing.domain.interview.entity.RoundStatus.SCHEDULED)
            """)
    Optional<InterviewRound> findVisibleToApplicantRoundByApplicationId(@Param("applicationId") Long applicationId);
}
```

`InterviewRoundMemberRepository.java` 신규:

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewRoundMember;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewRoundMemberRepository extends JpaRepository<InterviewRoundMember, Long> {
}
```

`InterviewAvailabilityRepository.java` 전체 교체 (recruitment 기반·미사용 메서드 제거 — `countBySlotId`/`softDeleteByApplicationId`/`findByRecruitmentId` 는 삭제된 서비스 전용이었다, 후속 PR 에서 재정의):

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewAvailability;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewAvailabilityRepository
        extends JpaRepository<InterviewAvailability, Long>, InterviewAvailabilityRepositoryCustom {

    long countByApplicationId(Long applicationId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);
}
```

`InterviewScheduleRepository.java` 전체 교체 (`findByRecruitmentId`/`countBySlotIdAndStatus`/`existsBy*` 제거 — 삭제된 서비스 전용. `findAssignedBetween` JPQL 은 slot/application join 이라 무수정 생존):

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSchedule;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewScheduleRepository
        extends JpaRepository<InterviewSchedule, Long>, InterviewScheduleRepositoryCustom {

    Optional<InterviewSchedule> findByApplicationId(Long applicationId);

    /**
     * 응답 DTO 의 nested {@code interview} 채움용 — 지원 ID 다건을 한 번에 끌어와 N+1 을 방지한다.
     * CANCELLED 상태도 함께 반환되므로 호출자는 status 필터링을 명시해야 한다.
     */
    List<InterviewSchedule> findByApplicationIdIn(Collection<Long> applicationIds);

    /**
     * 면접 24h 전 리마인더 윈도 대상 조회. INTERVIEW_PENDING 상태 지원자만 포함한다.
     * ACCEPTED/REJECTED 로 이미 전이된 지원자는 ASSIGNED schedule 이 남아 있어도 리마인더 대상에서 제외된다 (Codex review BE-2).
     */
    @Query("""
            select s
              from InterviewSchedule s
              join InterviewSlot slot on slot.id = s.slotId
              join Application a on a.id = s.applicationId
             where s.status = com.duing.domain.interview.entity.InterviewScheduleStatus.ASSIGNED
               and a.status = com.duing.domain.application.entity.ApplicationStatus.INTERVIEW_PENDING
               and slot.startTime between :start and :end
               and slot.deletedAt is null
            """)
    List<InterviewSchedule> findAssignedBetween(
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);
}
```

`InterviewSlotRepository.java` 전체 교체 (Custom 분리 삭제, lock 메서드는 수동배정 PR 에서 재정의):

```java
package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewSlot;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewSlotRepository extends JpaRepository<InterviewSlot, Long> {
}
```

- [x] **Step 9: `GeneralApplicationService` round 기반 재작성**

`backend/src/main/java/com/duing/domain/application/service/GeneralApplicationService.java` 수정:

(a) import 교체 — 제거: `InterviewConfig`, `InterviewConfigRepository` / 추가: `InterviewRound`, `InterviewRoundRepository`

(b) 필드 교체 (같은 위치 — 단위 테스트 생성자 인자 순서 유지):

```java
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final InterviewRoundRepository interviewRoundRepository;
    private final InterviewSlotRepository interviewSlotRepository;
```

(기존 `interviewConfigRepository` 자리가 `interviewRoundRepository` 로 바뀐다 — 생성자 arity 13 유지)

(c) `getMyApplicationDetail` 의 면접 블록 교체:

```java
        // 지원자 stepper 의 Step 3 sub-state 분기를 위해 면접 진행 상황을 derived 필드로 노출한다.
        // - interviewAvailabilityCount: 본인이 제출한 면접 가능 시간 개수
        // - interview: 현재 배정된 면접 (ASSIGNED schedule 이 있으면 location 이 null 이어도 객체로 노출, 그 외엔 null)
        // - availabilityDeadline: 지원자에게 보이는 라운드의 마감 시각.
        //   isVisibleToApplicant 술어(DRAFT 제외)를 사용해 발송 전 라운드 정보가 새지 않는다 (스펙 §5.4·§9.3).
        // useInterview=false 모집은 면접 관련 레포지토리 호출 자체를 생략한다.
        if (!application.getRecruitment().isUseInterview()) {
            return MyApplicationDetailQuery.fromAll(application, 0, null, null);
        }

        long interviewAvailabilityCount =
                interviewAvailabilityRepository.countByApplicationId(applicationId);
        LocalDateTime availabilityDeadline = interviewRoundRepository
                .findVisibleToApplicantRoundByApplicationId(applicationId)
                .map(InterviewRound::getAvailabilityDeadline)
                .orElse(null);
        AssignedInterviewQuery interview = resolveAssignedInterview(applicationId);

        return MyApplicationDetailQuery.fromAll(
                application,
                Math.toIntExact(interviewAvailabilityCount),
                interview,
                availabilityDeadline);
```

(d) `getApplicantDetail` 의 면접 블록에서 config 조회 2줄 제거 후 호출 교체:

```java
            InterviewConfig interviewConfig = interviewConfigRepository
                    .findByRecruitmentId(application.getRecruitment().getId())
                    .orElse(null);
            interview = resolveAssignedInterview(applicationId, interviewConfig);
```

→

```java
            interview = resolveAssignedInterview(applicationId);
```

(e) `resolveAssignedInterview` 전체 교체 (location 을 round 에서 join):

```java
    /**
     * 응답 DTO 의 nested {@code interview} 채움용 단건 헬퍼.
     * ASSIGNED 상태 schedule 이 있고 그 schedule 에 매핑된 슬롯이 존재하면 {@link AssignedInterviewQuery} 를 반환한다.
     * location 은 schedule 이 속한 {@code InterviewRound.location} 에서 가져오며, round 가 없거나
     * location 이 비어 있어도 interview 자체는 노출하고 location 만 null 로 채운다 (Codex review BE-3 유지).
     * <p>
     * {@code InterviewSchedule} 의 CANCELLED 는 MVP 미사용 예약값이지만 방어적으로 status 조건을 명시한다.
     */
    private AssignedInterviewQuery resolveAssignedInterview(Long applicationId) {
        return interviewScheduleRepository.findByApplicationId(applicationId)
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .flatMap(schedule -> interviewSlotRepository.findById(schedule.getSlotId())
                        .map(slot -> new AssignedInterviewQuery(
                                slot.getStartTime(),
                                slot.getEndTime(),
                                interviewRoundRepository.findById(schedule.getRoundId())
                                        .map(InterviewRound::getLocation)
                                        .orElse(null))))
                .orElse(null);
    }
```

(f) `resolveInterviewBatch` 전체 교체:

```java
    /**
     * 응답 리스트 DTO 의 nested {@code interview} 채움용 batch 헬퍼.
     * 지원 ID 다건을 한 번에 끌어와 N+1 을 회피한다 — InterviewReminderJob 패턴과 동일.
     * <ol>
     *   <li>application_id IN (...) AND status=ASSIGNED InterviewSchedule 일괄 조회</li>
     *   <li>대상 schedule 들의 slot_id / round_id 를 batch 로 join</li>
     *   <li>{@code InterviewRound.location} 이 비어 있어도 interview 객체는 그대로 노출 (location 만 null)</li>
     * </ol>
     * 결과 Map 에 키가 없는 application 은 호출 측에서 {@code null} 로 표현되어 "면접 미배정" 을 의미한다.
     */
    private Map<Long, AssignedInterviewQuery> resolveInterviewBatch(List<Long> applicationIds) {
        if (applicationIds.isEmpty()) {
            return Collections.emptyMap();
        }

        List<InterviewSchedule> assignedSchedules = interviewScheduleRepository
                .findByApplicationIdIn(applicationIds).stream()
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .toList();
        if (assignedSchedules.isEmpty()) {
            return Collections.emptyMap();
        }

        Set<Long> slotIds = assignedSchedules.stream()
                .map(InterviewSchedule::getSlotId)
                .collect(Collectors.toSet());
        Set<Long> roundIds = assignedSchedules.stream()
                .map(InterviewSchedule::getRoundId)
                .collect(Collectors.toSet());

        Map<Long, InterviewSlot> slotById = interviewSlotRepository.findAllById(slotIds).stream()
                .collect(Collectors.toMap(InterviewSlot::getId, Function.identity()));
        Map<Long, InterviewRound> roundById = interviewRoundRepository.findAllById(roundIds).stream()
                .collect(Collectors.toMap(InterviewRound::getId, Function.identity()));

        Map<Long, AssignedInterviewQuery> result = new HashMap<>();
        for (InterviewSchedule schedule : assignedSchedules) {
            InterviewSlot slot = slotById.get(schedule.getSlotId());
            if (slot == null) {
                continue;
            }
            InterviewRound round = roundById.get(schedule.getRoundId());
            String location = round == null ? null : round.getLocation();
            result.put(schedule.getApplicationId(), new AssignedInterviewQuery(
                    slot.getStartTime(), slot.getEndTime(), location));
        }
        return result;
    }
```

(g) `getMyApplications` 의 주석에서 `config.location` 표현을 `round.location` 으로 갱신.

- [x] **Step 10: `GeneralRecruitmentService` 의 interview 의존 제거**

(a) import 2줄 제거: `com.duing.domain.interview.entity.InterviewConfig`, `com.duing.domain.interview.repository.InterviewConfigRepository`
(b) 필드 제거: `private final InterviewConfigRepository interviewConfigRepository;`
(c) 상세 조회의 deadline 블록 교체:

```java
        // useInterview=true 인 모집만 InterviewConfig 를 조회한다.
        // config 가 아직 없거나 useInterview=false 면 null 노출.
        LocalDateTime interviewAvailabilityDeadline = recruitment.isUseInterview()
                ? interviewConfigRepository.findByRecruitmentId(recruitmentId)
                        .map(InterviewConfig::getAvailabilityDeadline)
                        .orElse(null)
                : null;
```

→

```java
        // 면접 마감은 라운드(interview_round.availability_deadline) 단위로 관리된다.
        // 모집 상세의 단일 deadline 노출은 라운드 모델에서 의미가 없어 null 고정 —
        // 응답 필드는 FE 재배선(라운드 dashboard 전환) 전까지 호환용으로만 유지한다.
        LocalDateTime interviewAvailabilityDeadline = null;
```

(d) `RecruitmentDetailQuery.java` 의 javadoc 한 줄 교체: `interviewAvailabilityDeadline 은 InterviewConfig 가 없거나 useInterview=false 면 null 로 전달한다.` → `interviewAvailabilityDeadline 은 라운드 모델 전환 후 호환용 필드로 항상 null 이다 (FE 재배선 후 제거 예정).`

- [x] **Step 11: `InterviewReminderJob` round 기반 재작성**

config 의존을 round 로 교체 — 변경 요지: import `InterviewConfig(Repository)` → `InterviewRound(Repository)`, 필드 교체, `recruitmentIds`/`configByRecruitmentId` → `roundIds`/`roundById`, location 출처 `round.getLocation()`:

```java
        Set<Long> roundIds = targets.stream()
                .map(InterviewSchedule::getRoundId)
                .collect(Collectors.toSet());
```

```java
        Map<Long, InterviewRound> roundById = interviewRoundRepository.findAllById(roundIds).stream()
                .collect(Collectors.toMap(InterviewRound::getId, Function.identity()));
```

루프 내 config 블록 교체:

```java
                InterviewRound round = roundById.get(schedule.getRoundId());
                if (round == null) {
                    log.warn("INTERVIEW_REMINDER 알림 생략 — round 없음: scheduleId={}, roundId={}",
                            schedule.getId(), schedule.getRoundId());
                    continue;
                }
```

`buildReminderCommand(schedule, slot, round, application)` 시그니처/본문의 `config` → `round` 치환 (`round.getLocation()`). dedupKey·링크·메타데이터는 무변경.

- [x] **Step 12: main 컴파일 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew compileJava
```

Expected: **BUILD SUCCESSFUL** (QInterviewRound 등 Q-클래스 재생성 포함). KEEP 으로 분류한 `InterviewScheduleRepositoryImpl`/`InterviewAvailabilityRepositoryImpl` 이 혹시 구 `recruitmentId` 필드를 참조해 컴파일이 깨지면 해당 표현식만 `roundId` 로 치환한다 (조회 의미는 applicationId/slotId 기반이라 동일). 실패 시 누락 참조를 추적해 해소 — 이 시점에 main 에 `InterviewConfig`/`recruitmentId(슬롯·일정·가용)` 참조가 0건이어야 한다:

```bash
grep -rn "InterviewConfig\|SlotLifecyclePhase" backend/src/main/java --include="*.java"
```

Expected: 출력 없음

---

### Task 4: 테스트 정리 (전체 GREEN + 단일 커밋)

**처분표** (Task 3 까지의 변경으로 테스트 컴파일이 깨진 상태 — 전부 처리해야 `compileTestJava` 가 돈다):

| 처분 | 파일 |
|---|---|
| DELETE | `interview/controller/` 6개 전부, `interview/entity/InterviewConfigSlotLifecycleTest`, `interview/service/InterviewAutoAssignServiceTest`·`InterviewAvailabilityReplaceTest`·`InterviewConfigServiceTest`·`InterviewScheduleManualServiceTest`·`InterviewScheduleQueryTest`·`InterviewSlotServiceTest`, `interview/repository/InterviewAvailabilityRepositoryTest`·`InterviewScheduleRepositoryTest`·`InterviewSchemaTest`, `notification/event/InterviewScheduledEventTest`(구 InterviewScheduleService.assign 경유 — INTERVIEW_SCHEDULED 발행 커버리지는 확정 PR 에서 재작성), `common/fixture/InterviewConfigFixture` |
| REWORK | fixture 3개(아래 전문), `InterviewRoundFixture` 신규(아래 전문), 단위 5개(`ApplicantDetailServiceTest`·`MyApplicationDetailAccessTest`·`MyApplicationsQueryTest`·`ApplicationSubmitGuardsTest`·`ApplicationStatusServiceTest`), 통합 6개(`LeaderApplicantDetailInterviewTest`·`MyApplicationControllerStepperTest`·`ApplicantQueryTest`·`InterviewReminderJobTest`·`InterviewListenerIntegrationTest`·`ApplicationSubmitDecouplingTest`), recruitment 3개(`RecruitmentInterviewMetadataTest`·`RecruitmentCreateGuardsTest`·`RecruitmentUpdateAndCloseServiceTest`) |
| KEEP | `interview/service/InterviewMatchingServiceTest`, `draft/integration/SubmitDiscardsDraftTest` |

- [x] **Step 1: DELETE 일괄 실행**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git rm -r backend/src/test/java/com/duing/domain/interview/controller
git rm backend/src/test/java/com/duing/domain/interview/entity/InterviewConfigSlotLifecycleTest.java \
       backend/src/test/java/com/duing/domain/interview/service/InterviewAutoAssignServiceTest.java \
       backend/src/test/java/com/duing/domain/interview/service/InterviewAvailabilityReplaceTest.java \
       backend/src/test/java/com/duing/domain/interview/service/InterviewConfigServiceTest.java \
       backend/src/test/java/com/duing/domain/interview/service/InterviewScheduleManualServiceTest.java \
       backend/src/test/java/com/duing/domain/interview/service/InterviewScheduleQueryTest.java \
       backend/src/test/java/com/duing/domain/interview/service/InterviewSlotServiceTest.java \
       backend/src/test/java/com/duing/domain/interview/repository/InterviewAvailabilityRepositoryTest.java \
       backend/src/test/java/com/duing/domain/interview/repository/InterviewScheduleRepositoryTest.java \
       backend/src/test/java/com/duing/domain/interview/repository/InterviewSchemaTest.java \
       backend/src/test/java/com/duing/domain/notification/event/InterviewScheduledEventTest.java \
       backend/src/test/java/com/duing/common/fixture/InterviewConfigFixture.java
```

- [x] **Step 2: fixture 재작성**

`backend/src/test/java/com/duing/common/fixture/InterviewRoundFixture.java` 신규:

```java
package com.duing.common.fixture;

import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.RoundStatus;
import java.lang.reflect.Field;
import java.time.LocalDateTime;

public final class InterviewRoundFixture {

    private InterviewRoundFixture() {
    }

    public static InterviewRound draft(Long recruitmentId, LocalDateTime availabilityDeadline) {
        return InterviewRound.create(recruitmentId, "1차 면접", availabilityDeadline, null);
    }

    /**
     * 상태 전이 메서드는 해당 API PR(BE#3~)에서 TDD 로 도입된다. 그 전까지 테스트 셋업은
     * saveActiveClub 의 ClubStatus 리플렉션 전례를 따라 status 를 직접 세팅한다.
     */
    public static InterviewRound withStatus(Long recruitmentId, LocalDateTime availabilityDeadline,
                                            String location, RoundStatus status) {
        InterviewRound round = InterviewRound.create(recruitmentId, "1차 면접", availabilityDeadline, location);
        try {
            Field statusField = InterviewRound.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(round, status);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return round;
    }
}
```

`InterviewSlotFixture`/`InterviewAvailabilityFixture`/`InterviewScheduleFixture`: 기존 메서드명·구조를 유지한 채 첫 인자(또는 recruitmentId 인자)를 `roundId` 로 치환한다 — 각 파일을 읽고 `recruitmentId` 파라미터명과 `create/link/assigned` 호출의 해당 인자만 `roundId` 로 바꾼다 (엔티티 create 시그니처는 Task 3 Step 5 와 일치: slot `create(roundId, start, end, capacity)`, availability `create(applicationId, slotId, roundId)`, schedule `create(applicationId, slotId, roundId, assignedAt)`).

- [x] **Step 3: 단위 테스트 5개 — mock 교체**

5개 파일(`ApplicantDetailServiceTest`, `MyApplicationDetailAccessTest`, `MyApplicationsQueryTest`, `ApplicationSubmitGuardsTest`, `ApplicationStatusServiceTest`) 공통 변경:

```java
// 제거
import com.duing.domain.interview.repository.InterviewConfigRepository;
private final InterviewConfigRepository interviewConfigRepository = mock(InterviewConfigRepository.class);
// 추가
import com.duing.domain.interview.repository.InterviewRoundRepository;
private final InterviewRoundRepository interviewRoundRepository = mock(InterviewRoundRepository.class);
```

생성자 호출에서 `interviewConfigRepository,` 자리를 `interviewRoundRepository,` 로 교체 (위치 동일 — `interviewScheduleRepository,` 다음).

stub 교체 (해당 파일에만 존재):
- `interviewConfigRepository.findByRecruitmentId(...)` → deadline 검증 케이스: `interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId)` 가 `Optional.of(InterviewRoundFixture.withStatus(recruitmentId, deadline, location, RoundStatus.COLLECTING))` 또는 `Optional.empty()` 반환하도록.
- `interviewConfigRepository.findByRecruitmentIdIn(...)`(`MyApplicationsQueryTest` batch) → `interviewRoundRepository.findAllById(roundIds)` stub + schedule mock 의 `getRecruitmentId()` → `getRoundId()` 치환.
- location 검증 케이스: `config.getLocation()` stub → fixture round 의 location 인자로 표현.
- schedule mock/fixture 의 `getRecruitmentId()` 참조 전부 `getRoundId()` 로.

- [x] **Step 4: 통합 테스트 6개 — round 기반 셋업으로 재배선**

**공통 셋업 패턴** (FK 사슬: round → member → slot → availability|schedule — member 없이 availability/schedule 을 넣으면 FK 위반):

```java
InterviewRound round = roundRepository.save(
        InterviewRoundFixture.withStatus(recruitment.getId(),
                LocalDateTime.now().plusDays(7), null, RoundStatus.COLLECTING));
roundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
InterviewSlot slot = slotRepository.save(
        InterviewSlot.create(round.getId(),
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1), 5));
```

파일별 변경:
1. **`ApplicationSubmitDecouplingTest`**: `saveOpenConfig`/`saveClosedConfig` 헬퍼를 `saveCollectingRound(recruitmentId, deadline)`(위 fixture, COLLECTING) 로 교체, `saveSlot(recruitmentId)` → `saveSlot(roundId)`. 멤버는 만들지 않는다 (지원 시점엔 라운드 미소속이 정상 — 디커플링 그 자체). `InterviewConfigRepository` 필드 → `InterviewRoundRepository`. 두 테스트의 의미(슬롯 없이 제출 성공 / 마감 후 제출 성공)는 그대로.
2. **`MyApplicationControllerStepperTest`**: config 저장 → round(COLLECTING, deadline) + **member 생성** 으로 교체. slot/availability 생성은 roundId 로. deadline 단언은 동일하게 통과해야 한다 (visible 라운드의 deadline 노출). 추가 케이스 수정: DRAFT 라운드만 있는 경우 deadline 이 null 인지 단언하는 테스트가 없으므로 **신규 1건 추가**:

```java
    @Test
    @DisplayName("발송 전(DRAFT) 라운드의 마감 시각은 지원자에게 노출되지 않는다")
    void draftRoundDeadlineIsHiddenFromApplicant() {
        // given: useInterview 모집 + 본인 application + DRAFT 라운드 멤버십
        // (기존 테스트의 모집/지원 셋업 헬퍼 재사용)
        InterviewRound draftRound = roundRepository.save(
                InterviewRoundFixture.draft(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        roundMemberRepository.save(InterviewRoundMember.invite(draftRound.getId(), application.getId()));

        // when: 본인 지원 상세 조회 (기존 테스트의 호출 헬퍼 재사용)
        // then: availabilityDeadline == null (isVisibleToApplicant 가 DRAFT 를 제외)
    }
```

(given/when 의 모집·지원·조회 코드는 같은 파일의 기존 테스트 헬퍼를 그대로 사용 — 파일을 읽고 동일 패턴으로 완성한다. 단언 대상은 응답의 `availabilityDeadline` null.)
3. **`LeaderApplicantDetailInterviewTest`**: slot/availability/schedule 생성부를 공통 패턴으로 교체 — round 1개 생성 후 모든 fixture 에 `round.getId()` 전달, **availability/schedule 생성 전 member 생성 추가**. 단언(응답 구조) 무수정.
4. **`ApplicantQueryTest`**: fixture 인자 recruitmentId → roundId + member 선행 생성. 단언 무수정.
5. **`InterviewReminderJobTest`**: `InterviewConfigFixture` → round (location 은 `withStatus(..., "본관 201호", RoundStatus.SCHEDULED)` 로 직접 전달), slot/schedule 에 roundId + member 선행 생성. dedupKey/본문 단언 무수정 (location 출처만 바뀜).
6. **`InterviewListenerIntegrationTest`**: config 생성 제거 → round + member + slot(roundId) + schedule(roundId). 이벤트 직접 발행 패턴 유지, 단언 무수정.

- [x] **Step 5: recruitment 테스트 3개**

1. **`RecruitmentCreateGuardsTest`·`RecruitmentUpdateAndCloseServiceTest`**: `InterviewConfigRepository` mock 필드 + 생성자 인자 + import **제거** (교체 아님 — `GeneralRecruitmentService` 의 interview 의존 자체가 사라졌다).
2. **`RecruitmentInterviewMetadataTest`**: config 저장 제거. deadline 노출을 단언하던 케이스는 **"라운드 모델 전환 후 모집 상세의 interviewAvailabilityDeadline 은 항상 null 이다"** 로 의미를 뒤집어 유지 (호환 필드 회귀 방지). 면접 기간(interviewStartDate/EndDate — recruitment 자체 컬럼)·applicantCount 케이스는 무수정.

- [x] **Step 6: 전체 테스트 GREEN 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend
./gradlew test
```

Expected: **BUILD SUCCESSFUL, 0 failures** — `InterviewRoundSchemaTest` 9건 GREEN 포함. 잔여 참조 0건 확인:

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
grep -rn "InterviewConfig\|SlotLifecyclePhase\|interview_config" backend/src --include="*.java" --include="*.sql" | grep -v "db/migration/V4[5-8]"
```

Expected: V49 의 `DROP TABLE IF EXISTS interview_config` 1줄만 출력

- [x] **Step 7: 단일 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add -A backend/src
git commit -m "refactor(backend): 면접 도메인 라운드 중심 스키마 전환 (V49)"
```

---

### Task 5: 최종 검증 + PR 생성

- [x] **Step 1: PR 직전 self-check 7항목** (각 항목 실제 실행·확인)

1. `./gradlew test` BUILD SUCCESSFUL (Task 4 Step 6 재확인)
2. 변경 범위 = 스펙 §12 BE#1 + File Map: `git diff develop --stat` 대조, 요청 외 변경 0건
3. 다른 영역 영향 — **면접 기능 이 PR 동안 비활성** (구 API 6종 제거, FE 의 interview 훅/페이지는 404 를 받게 됨 — 출시 전 허용, PR 본문 명시). recruitment 상세의 `interviewAvailabilityDeadline` 은 null 고정.
4. 모든 task review 완료 (spec + quality + **codex adversarial — Migration·데이터무결성 관점 필수**)
5. 본 계획 체크박스 실행 후 재검증 마킹
6. 커밋 메시지 Conventional Commits, Co-Authored-By/Generated 라인 없음
7. EOF newline:

```bash
for f in $(git diff develop --name-only --diff-filter=d); do
  [ -n "$(tail -c1 "$f")" ] && echo "EOF newline 누락: $f"
done; true
```

- [x] **Step 2: push + PR 생성** (자동 머지 금지)

```bash
git push -u origin refactor/interview-round-schema
gh pr create --base develop --title "refactor(backend): 면접 도메인 라운드 중심 스키마 전환 (V49)" --body "$(cat <<'EOF'
## 🚀 작업 내용

면접 재설계의 본체입니다. 면접의 중심을 모집(recruitment)에서 면접 회차(InterviewRound)로 옮겼습니다. V49 마이그레이션이 구 면접 테이블 4개를 내리고 라운드 중심 5테이블(round / round_member / slot / availability / schedule)을 새로 만들며, 엔티티·레포지토리·조회 경로·리마인더 잡이 라운드 기준으로 재배선됐습니다.

스키마 검증(ddl-auto: validate) 특성상 마이그레이션과 코드 전환을 쪼갤 수 없어 단일 커밋입니다. 지원 시 슬롯 선택을 걷어낸 직전 PR(#340)에 이어, 이번 PR 로 구 AT_APPLICATION 시대의 API 6종과 면접 설정(InterviewConfig)이 완전히 사라집니다. **이 PR 이 머지되면 라운드 API(후속 PR)가 들어오기 전까지 면접 기능은 비활성입니다** — 출시 전이라 합의된 일시 상태입니다.

데이터 무결성 측면에서: 멤버만 응답/배정될 수 있도록 availability·schedule 이 (round_id, application_id) composite FK 로 round_member 를 참조하고, 모집당 DRAFT 라운드 1개 제약과 라운드당 지원자 1배정 partial unique 를 DB 레벨로 강제했습니다. 라운드에는 동시 확정/취소 race 차단용 낙관적 락(version)이 들어갔습니다.

## 🤔 고민했던 내용

- 지원자 화면에 노출되는 마감 시각은 "발송 전(DRAFT) 라운드가 보이면 안 된다"는 원칙에 따라 DRAFT 를 제외한 조회 술어(isVisibleToApplicant)로만 가져옵니다. 배치·중복방지용 술어(isActiveForPlacement, DRAFT 포함)와 분리해 둔 것은 설계 문서의 결정을 그대로 코드에 옮긴 것입니다.
- 모집 상세의 면접 마감 필드는 라운드가 여럿일 수 있는 모델에서 의미를 잃어 null 고정으로 두고 필드 자체는 프론트 재배선 전까지 유지했습니다.
- 삭제한 서비스 전용 레포지토리 메서드(잠금 조회, 슬롯 카운트 등)는 미리 남겨두지 않고 각 기능 PR 에서 TDD 로 재도입하기로 했습니다.

## 💬 리뷰 중점사항

- **V49 의 제약 설계가 스펙 §4 와 일치하는지** — partial unique 3종(DRAFT 라운드/availability/schedule), composite FK 2계통(slot-round, member-(round,application)), CHECK 4종.
- 라운드 조회 술어가 DRAFT 누출 없이 동작하는지 (MyApplicationControllerStepperTest 의 신규 케이스).
- 스키마 통합 테스트(InterviewRoundSchemaTest 9건)가 제약을 충분히 고정하는지.

스펙: docs/superpowers/specs/2026-06-11-interview-round-redesign-design.md
EOF
)"
```

Expected: PR URL 출력. **머지하지 않는다.**

---

## Self-Review (작성 후 점검 완료)

- **스펙 커버리지**: §4 DDL(5테이블·제약 전부) → Task 3 Step 1, §5.4 술어 분리 → Step 8/9 + 신규 테스트 케이스, §7 동시성(@Version) → DDL·엔티티, §12 BE#1 범위(엔티티/레포/구 도메인 제거/ReminderJob/조회 경로/테스트 정리) → Task 3~4, §13 유지 목록(매칭·이벤트·리스너) → File Map Keep. 범위 밖(라운드 생성·전이 메서드·placement 조회)은 의도적 미구현 — BE#2~ 에서 TDD 도입.
- **플레이스홀더**: 통합 테스트 재배선(Task 4 Step 4)은 파일별 변경 지침 + 공통 패턴 코드로 제공 — 기존 테스트의 헬퍼 구조를 보존하는 기계적 치환이라 전문 재작성보다 정확하다. 신규 테스트(스키마 9건·DRAFT 비노출 1건)는 전문/골격 제공.
- **타입 일관성**: `create(roundId, ...)` 시그니처가 엔티티(Step 5)·fixture(Task 4 Step 2)·셋업 패턴(Step 4)에서 일치. `findVisibleToApplicantRoundByApplicationId` 명칭이 Step 8/9/테스트에서 일치. 생성자 인자 위치(13-arg, config→round 동일 슬롯) 일치.
