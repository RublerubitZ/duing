# 학교 제출(Submission Batch) PR-1 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APPROVED 시설 예약을 학교에 제출하는 업무(Submission Batch)를 독립 Aggregate 로 관리하는 백엔드 — V87 스키마 + 관리자 API 6종 + CSV Export 계층 + Audit.

**Architecture:** 새 도메인 `domain/facilitysubmission/`. booking·facility·user 는 스칼라 ID 참조. "제출됨"은 활성 Batch(cancelledAt IS NULL) 소속 item 존재로 파생. 취소는 삭제가 아닌 비즈니스 상태(cancelledAt) — `@SQLRestriction` 미적용. 중복 제출 방지는 booking 행잠금(ID 정렬) + 활성 EXISTS 검증(스펙 §4), 채번은 일자별 시퀀스 행잠금(§3).

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL(불필요 — 파생·JPQL 로 충분) / RestAssured + Testcontainers.

**스펙:** `docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md` (§ 번호는 이 문서 기준)

## Global Constraints

- 기존 예약 상태 머신·승인 로직·`FacilityBooking` 엔티티 상태 필드 **변경 금지** (리포지토리 메서드 추가만 허용)
- 커밋 메시지: Conventional Commits 한국어 (`feat(backend): ...`) — `[#이슈번호]` 형식·Co-Authored-By/🤖 라인 **금지**
- 모든 DTO 는 record, 검증 메시지 한국어. `api/` 인터페이스 없이 Controller 단독 작성 금지
- 사용자 대면 예외 메시지 한국어. 변수명 축약 금지(`dto`/`r`/`e` 금지)
- Service: 클래스 `@Transactional(readOnly = true)` + 쓰기 메서드만 `@Transactional` 오버라이드. **단, 감사 기록이 있는 조회(상세·CSV)는 반드시 쓰기 `@Transactional`** (readOnly×쓰기 = 실 PG 500)
- 테스트 날짜는 상대 날짜만(하드코딩 미래 절대날짜 금지), `@DisplayName` 은 요구사항 문장
- 시각: 도메인 시각은 `Clock` 주입(`seoulClock` 단일 빈) + `LocalDateTime.now(clock)`. DB 컬럼은 TIMESTAMP(레포 관례)
- submissionNo 형식 `SUB-YYYYMMDD-NNN`(NNN=3자리 0패딩, 1000 이상은 자릿수 자연 확장), CSV 파일명 `facility-submission-{submissionNo}.csv`
- CSV: UTF-8 BOM + CRLF, 14컬럼 순서 고정, 수식 인젝션 방지(`= + - @ \t` 선행 시 `'` 전치)
- Audit 4 이벤트만: CREATED / CANCELLED / CSV_DOWNLOADED / VIEWED — 목록 조회 기록 금지
- 빌드·테스트는 `backend/` 에서 실행(cwd 명시), `| tail` 로 exit code 가리지 말 것

**브랜치:** `feat/facility-submission-be` (develop 에서 분기). 구현 subagent 는 **push·PR 생성 금지**.

---

### Task 1: V87 마이그레이션 + 엔티티 4종 + 예외 + 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V87__create_facility_submission_tables.sql`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/FacilitySubmissionBatch.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/FacilitySubmissionItem.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/FacilitySubmissionSequence.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/FacilitySubmissionAudit.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/entity/SubmissionAuditAction.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/exception/FacilitySubmissionException.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionBatchRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionItemRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionAuditRepository.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE 목록에 신규 테이블 4개 추가 — **누락 시 테스트 간 데이터 오염**)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionPersistenceIntegrationTest.java`

**Interfaces:**
- Produces: 엔티티 4종·리포지토리 3종·`FacilitySubmissionException.*` — 이후 모든 태스크가 사용. 핵심: `FacilitySubmissionBatch.create(String submissionNo, Long facilityId, Long submittedById, LocalDateTime submittedAt, String memo)`, `batch.cancel(Long adminId, LocalDateTime cancelledAt)`, `FacilitySubmissionItem.of(Long batchId, Long bookingId)`, `FacilitySubmissionAudit.of(Long batchId, SubmissionAuditAction action, Long adminId, String ipAddress, String userAgent)`

- [ ] **Step 1: 실패하는 저장/로드 테스트 작성**

```java
package com.duing.domain.facilitysubmission.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilitySubmissionPersistenceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired UserRepository userRepository;
    @Autowired FacilityRepository facilityRepository;

    @Test
    @DisplayName("제출 Batch·Item·Audit 이 스키마와 일치하게 저장·조회된다")
    void batchItemAuditPersistAndLoad() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90001, "커뮤니티룸(1)", "1503호", 0));

        FacilitySubmissionBatch savedBatch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-001", facility.getId(), admin.getId(), LocalDateTime.now(), "8월 1차 제출"));
        FacilitySubmissionItem savedItem = itemRepository.save(
                FacilitySubmissionItem.of(savedBatch.getId(), 999L));
        FacilitySubmissionAudit savedAudit = auditRepository.save(FacilitySubmissionAudit.of(
                savedBatch.getId(), SubmissionAuditAction.CREATED, admin.getId(), "127.0.0.1", "JUnit"));

        FacilitySubmissionBatch foundBatch = batchRepository.findById(savedBatch.getId()).orElseThrow();
        assertThat(foundBatch.getSubmissionNo()).isEqualTo("SUB-20260801-001");
        assertThat(foundBatch.getCsvFileName()).isEqualTo("facility-submission-SUB-20260801-001.csv");
        assertThat(foundBatch.isCancelled()).isFalse();
        assertThat(itemRepository.findById(savedItem.getId()).orElseThrow().getBookingId()).isEqualTo(999L);
        assertThat(auditRepository.findById(savedAudit.getId()).orElseThrow().getAction())
                .isEqualTo(SubmissionAuditAction.CREATED);
    }

    @Test
    @DisplayName("취소된 Batch 도 조회에서 사라지지 않고 취소 상태로 남는다")
    void cancelledBatchRemainsVisible() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90002, "커뮤니티룸(2)", "1504호", 0));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-002", facility.getId(), admin.getId(), LocalDateTime.now(), null));

        batch.cancel(admin.getId(), LocalDateTime.now());
        batchRepository.save(batch);

        FacilitySubmissionBatch found = batchRepository.findById(batch.getId()).orElseThrow();
        assertThat(found.isCancelled()).isTrue();
        assertThat(found.getCancelledById()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("이미 취소된 Batch 를 다시 취소하면 예외가 발생한다")
    void cancellingTwiceThrows() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90003, "커뮤니티룸(3)", "1505호", 0));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-003", facility.getId(), admin.getId(), LocalDateTime.now(), null));
        batch.cancel(admin.getId(), LocalDateTime.now());

        assertThatThrownBy(() -> batch.cancel(admin.getId(), LocalDateTime.now()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);
    }

    @Test
    @DisplayName("501자 User-Agent 로도 Audit 저장이 컬럼 길이 초과 없이 성공한다")
    void oversizedUserAgentIsTruncated() {
        User admin = userRepository.save(UserFixture.admin());
        Facility facility = facilityRepository.save(Facility.create(90004, "커뮤니티룸(4)", "1506호", 0));
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                "SUB-20260801-004", facility.getId(), admin.getId(), LocalDateTime.now(), null));

        FacilitySubmissionAudit saved = auditRepository.save(FacilitySubmissionAudit.of(
                batch.getId(), SubmissionAuditAction.VIEWED, admin.getId(), "127.0.0.1", "A".repeat(501)));

        assertThat(auditRepository.findById(saved.getId()).orElseThrow().getUserAgent()).hasSize(500);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests FacilitySubmissionPersistenceIntegrationTest`
Expected: 컴파일 실패 (엔티티·리포지토리 미존재)

- [ ] **Step 3: V87 마이그레이션 작성**

```sql
-- 학교 제출(Submission Batch) — 스펙 docs/superpowers/specs/2026-07-19-facility-submission-batch-design.md
-- batch.cancelled_at 은 soft delete 가 아니라 비즈니스 상태다: 취소돼도 이력에 계속 표시(§2).
-- 중복 제출 방지는 애플리케이션이 보장한다(booking 행잠금 + 활성 EXISTS, §4) —
-- item 활성 여부가 batch 상태에 종속돼 단일 테이블 부분 유니크 인덱스를 걸 수 없다.
CREATE TABLE facility_submission_batch (
    id            BIGSERIAL PRIMARY KEY,
    submission_no VARCHAR(20)  NOT NULL UNIQUE,
    facility_id   BIGINT       NOT NULL REFERENCES facility (id),
    submitted_by  BIGINT       NOT NULL REFERENCES users (id),
    submitted_at  TIMESTAMP    NOT NULL,
    memo          VARCHAR(500),
    csv_file_name VARCHAR(100) NOT NULL,
    cancelled_at  TIMESTAMP,
    cancelled_by  BIGINT REFERENCES users (id),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

CREATE TABLE facility_submission_item (
    id         BIGSERIAL PRIMARY KEY,
    batch_id   BIGINT NOT NULL REFERENCES facility_submission_batch (id),
    booking_id BIGINT NOT NULL REFERENCES facility_booking (id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_facility_submission_item_batch ON facility_submission_item (batch_id);
CREATE INDEX idx_facility_submission_item_booking ON facility_submission_item (booking_id);

-- 일자별 채번(§3) — SELECT ... FOR UPDATE 로 직렬화. BaseEntity 미상속(자연키 PK).
CREATE TABLE facility_submission_seq (
    seq_date   DATE PRIMARY KEY,
    next_value INT NOT NULL
);

-- append-only 감사(§2) — auth_event 와 동일 원칙, 수정 메서드 없음.
CREATE TABLE facility_submission_audit (
    id         BIGSERIAL PRIMARY KEY,
    batch_id   BIGINT      NOT NULL REFERENCES facility_submission_batch (id),
    action     VARCHAR(20) NOT NULL,
    admin_id   BIGINT      NOT NULL REFERENCES users (id),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_facility_submission_audit_batch ON facility_submission_audit (batch_id, created_at);

ALTER TABLE facility_submission_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_submission_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_submission_seq ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_submission_audit ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: 엔티티 4종 + enum 작성**

`FacilitySubmissionBatch.java`:

```java
package com.duing.domain.facilitysubmission.entity;

import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 학교 제출 Batch. booking·facility·user 는 ID 스칼라 참조(facility 도메인 컨벤션).
 * cancelled_at 은 soft delete 가 아니라 비즈니스 상태 — 취소된 Batch 도 이력에 계속 표시되므로
 * @SQLRestriction 을 걸지 않는다(스펙 §2). deleted_at 은 BaseEntity 일관성으로만 존재, 항상 NULL.
 */
@Getter
@Entity
@Table(name = "facility_submission_batch")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionBatch extends BaseEntity {

    @Column(name = "submission_no", nullable = false, length = 20)
    private String submissionNo;

    @Column(name = "facility_id", nullable = false)
    private Long facilityId;

    @Column(name = "submitted_by", nullable = false)
    private Long submittedById;

    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;

    @Column(length = 500)
    private String memo;

    @Column(name = "csv_file_name", nullable = false, length = 100)
    private String csvFileName;

    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "cancelled_by")
    private Long cancelledById;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilitySubmissionBatch(String submissionNo, Long facilityId, Long submittedById,
                                    LocalDateTime submittedAt, String memo, String csvFileName) {
        this.submissionNo = submissionNo;
        this.facilityId = facilityId;
        this.submittedById = submittedById;
        this.submittedAt = submittedAt;
        this.memo = memo;
        this.csvFileName = csvFileName;
    }

    public static FacilitySubmissionBatch create(String submissionNo, Long facilityId, Long submittedById,
                                                 LocalDateTime submittedAt, String memo) {
        return FacilitySubmissionBatch.builder()
                .submissionNo(submissionNo)
                .facilityId(facilityId)
                .submittedById(submittedById)
                .submittedAt(submittedAt)
                .memo(memo)
                .csvFileName("facility-submission-" + submissionNo + ".csv")
                .build();
    }

    /** 제출 취소(§4) — booking·item 은 건드리지 않는다. 활성 판정은 이 필드 하나로 파생된다. */
    public void cancel(Long adminId, LocalDateTime cancelledAt) {
        if (isCancelled()) {
            throw new FacilitySubmissionException.BatchAlreadyCancelledException();
        }
        this.cancelledAt = cancelledAt;
        this.cancelledById = adminId;
    }

    public boolean isCancelled() {
        return cancelledAt != null;
    }
}
```

`FacilitySubmissionItem.java`:

```java
package com.duing.domain.facilitysubmission.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Batch 에 완전 종속되는 제출 항목 — 자체 취소 상태를 갖지 않는다(스펙 §2).
 * batch.cancelledAt != null 이면 이 item 도 비활성으로 간주한다.
 */
@Getter
@Entity
@Table(name = "facility_submission_item")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionItem extends BaseEntity {

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Column(name = "booking_id", nullable = false)
    private Long bookingId;

    private FacilitySubmissionItem(Long batchId, Long bookingId) {
        this.batchId = batchId;
        this.bookingId = bookingId;
    }

    public static FacilitySubmissionItem of(Long batchId, Long bookingId) {
        return new FacilitySubmissionItem(batchId, bookingId);
    }
}
```

`FacilitySubmissionSequence.java`:

```java
package com.duing.domain.facilitysubmission.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 일자별 제출번호 채번 행(§3) — 자연키(날짜) PK 라 BaseEntity 를 상속하지 않는다. */
@Getter
@Entity
@Table(name = "facility_submission_seq")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionSequence {

    @Id
    @Column(name = "seq_date")
    private LocalDate seqDate;

    @Column(name = "next_value", nullable = false)
    private int nextValue;

    /** 행잠금 하에서만 호출된다 — 현재 번호를 반환하고 다음 번호로 증가시킨다. */
    public int currentAndIncrement() {
        int currentValue = this.nextValue;
        this.nextValue = currentValue + 1;
        return currentValue;
    }
}
```

`SubmissionAuditAction.java`:

```java
package com.duing.domain.facilitysubmission.entity;

/** 감사 대상 이벤트(스펙 §2) — 이 4개 외(목록 조회 등)는 기록하지 않는다. */
public enum SubmissionAuditAction {
    CREATED,
    CANCELLED,
    CSV_DOWNLOADED,
    VIEWED
}
```

`FacilitySubmissionAudit.java` — `AuthTextTruncator` 는 user 도메인 package-private 라 재사용 불가, 서로게이트 안전 절단을 자체 보유:

```java
package com.duing.domain.facilitysubmission.entity;

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
 * 학교 제출 감사 로그 — append-only, 수정 메서드를 두지 않는다(auth_event 와 동일 원칙, 스펙 §2).
 * deleted_at 은 BaseEntity 일관성으로만 존재, 항상 NULL.
 */
@Getter
@Entity
@Table(name = "facility_submission_audit")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilitySubmissionAudit extends BaseEntity {

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SubmissionAuditAction action;

    @Column(name = "admin_id", nullable = false)
    private Long adminId;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilitySubmissionAudit(Long batchId, SubmissionAuditAction action, Long adminId,
                                    String ipAddress, String userAgent) {
        this.batchId = batchId;
        this.action = action;
        this.adminId = adminId;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    public static FacilitySubmissionAudit of(Long batchId, SubmissionAuditAction action, Long adminId,
                                             String ipAddress, String userAgent) {
        return FacilitySubmissionAudit.builder()
                .batchId(batchId)
                .action(action)
                .adminId(adminId)
                .ipAddress(truncate(ipAddress, 45))
                .userAgent(truncate(userAgent, 500))
                .build();
    }

    /** 공격자 제어 헤더의 컬럼 길이 초과가 감사 트랜잭션을 500 으로 만들지 않게 절단한다(서로게이트 쌍 보존). */
    private static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        int end = maxLength;
        if (Character.isHighSurrogate(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(0, end);
    }
}
```

- [ ] **Step 5: 예외 클래스 작성**

```java
package com.duing.domain.facilitysubmission.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FacilitySubmissionException extends ApplicationException {

    protected FacilitySubmissionException(String message, HttpStatus status) {
        super(message, status);
    }

    protected FacilitySubmissionException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class BatchNotFoundException extends FacilitySubmissionException {
        public BatchNotFoundException() {
            super("제출 내역을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class BatchAlreadyCancelledException extends FacilitySubmissionException {
        public BatchAlreadyCancelledException() {
            super("이미 취소된 제출입니다.", HttpStatus.CONFLICT);
        }
    }

    public static class EmptyBookingSelectionException extends FacilitySubmissionException {
        public EmptyBookingSelectionException() {
            super("제출할 예약을 선택해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class SubmissionBookingNotFoundException extends FacilitySubmissionException {
        public SubmissionBookingNotFoundException() {
            super("제출 대상 예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class MixedFacilityException extends FacilitySubmissionException {
        public MixedFacilityException() {
            super("한 번의 제출에는 같은 시설의 예약만 담을 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    /** all-or-nothing(스펙 §4) — 정상 UI 경로에선 발생하지 않고 동시 작업 레이스에서만 발생한다. */
    public static class BookingNotApprovedException extends FacilitySubmissionException {
        public static final String CODE = "FACILITY_SUBMISSION_NOT_APPROVED";

        public BookingNotApprovedException() {
            super("승인 완료 상태의 예약만 제출할 수 있습니다.", HttpStatus.CONFLICT, CODE);
        }
    }

    public static class AlreadySubmittedBookingException extends FacilitySubmissionException {
        public static final String CODE = "FACILITY_SUBMISSION_ALREADY_SUBMITTED";

        public AlreadySubmittedBookingException() {
            super("이미 제출된 예약이 포함되어 있습니다.", HttpStatus.CONFLICT, CODE);
        }
    }

    public static class InvalidCandidatePeriodException extends FacilitySubmissionException {
        public InvalidCandidatePeriodException() {
            super("조회 기간은 시작일부터 최대 31일까지 선택할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
```

- [ ] **Step 6: 리포지토리 3종 작성**

`FacilitySubmissionBatchRepository.java`:

```java
package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilitySubmissionBatchRepository extends JpaRepository<FacilitySubmissionBatch, Long> {

    /** 제출 이력(§5.3) — 취소 포함 최신순. id 내림차순 = 생성 역순(결정적 정렬). */
    Page<FacilitySubmissionBatch> findAllByOrderByIdDesc(Pageable pageable);

    Page<FacilitySubmissionBatch> findByFacilityIdOrderByIdDesc(Long facilityId, Pageable pageable);
}
```

`FacilitySubmissionItemRepository.java`:

```java
package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilitySubmissionItemRepository extends JpaRepository<FacilitySubmissionItem, Long> {

    List<FacilitySubmissionItem> findByBatchIdOrderByIdAsc(Long batchId);

    /** 활성(미취소 batch 소속) 제출의 bookingId→submissionNo — 후보 표시·중복 제출 검증 공용(§4·§5.1). */
    @Query("SELECT i.bookingId AS bookingId, b.submissionNo AS submissionNo "
            + "FROM FacilitySubmissionItem i JOIN FacilitySubmissionBatch b ON i.batchId = b.id "
            + "WHERE i.bookingId IN :bookingIds AND b.cancelledAt IS NULL")
    List<ActiveSubmissionProjection> findActiveByBookingIdIn(@Param("bookingIds") Collection<Long> bookingIds);

    /** 이력 행의 예약 건수(§5.3) — batch 별 집계. */
    @Query("SELECT i.batchId AS batchId, COUNT(i) AS bookingCount FROM FacilitySubmissionItem i "
            + "WHERE i.batchId IN :batchIds GROUP BY i.batchId")
    List<BatchItemCountProjection> countByBatchIdIn(@Param("batchIds") Collection<Long> batchIds);

    interface ActiveSubmissionProjection {
        Long getBookingId();

        String getSubmissionNo();
    }

    interface BatchItemCountProjection {
        Long getBatchId();

        long getBookingCount();
    }
}
```

`FacilitySubmissionAuditRepository.java`:

```java
package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilitySubmissionAuditRepository extends JpaRepository<FacilitySubmissionAudit, Long> {

    List<FacilitySubmissionAudit> findByBatchIdOrderByIdAsc(Long batchId);
}
```

- [ ] **Step 7: IntegrationTestBase TRUNCATE 목록에 추가**

`IntegrationTestBase.cleanDatabase()` 의 TRUNCATE 문자열 맨 앞(자식 먼저 원칙)에 4개 테이블 추가:

```java
        jdbcTemplate.execute(
                "TRUNCATE TABLE " +
                "facility_submission_audit, " +
                "facility_submission_item, " +
                "facility_submission_batch, " +
                "facility_submission_seq, " +
                "facility_booking_status_history, " +
                // ... 기존 목록 그대로 유지
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests FacilitySubmissionPersistenceIntegrationTest`
Expected: PASS (4/4) — Hibernate 스키마 검증 포함 (validate 모드에서 컬럼 타입 불일치면 컨텍스트 로드 실패)

- [ ] **Step 9: 커밋**

```bash
git add backend/src/main/resources/db/migration/V87__create_facility_submission_tables.sql \
  backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/common/IntegrationTestBase.java
git commit -m "feat(backend): 학교 제출 V87 스키마·엔티티·리포지토리 추가"
```

---

### Task 2: SubmissionNumberGenerator 채번 + 동시성 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/repository/FacilitySubmissionSequenceRepository.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/SubmissionNumberGenerator.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/SubmissionNumberGeneratorConcurrencyTest.java`

**Interfaces:**
- Consumes: Task 1 의 `FacilitySubmissionSequence`
- Produces: `SubmissionNumberGenerator.nextNumber(LocalDate submissionDate) → String` — **쓰기 트랜잭션 안에서만 호출**(행잠금 유지 계약). Task 3 의 생성 서비스가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import java.time.LocalDate;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SubmissionNumberGeneratorConcurrencyTest extends IntegrationTestBase {

    @Autowired SubmissionNumberGenerator numberGenerator;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    @DisplayName("같은 날짜의 제출번호는 001부터 순차 발급된다")
    void sequentialNumbersStartFrom001() {
        LocalDate submissionDate = LocalDate.now();
        String datePart = submissionDate.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);

        String first = transactionTemplate.execute(status -> numberGenerator.nextNumber(submissionDate));
        String second = transactionTemplate.execute(status -> numberGenerator.nextNumber(submissionDate));

        assertThat(first).isEqualTo("SUB-" + datePart + "-001");
        assertThat(second).isEqualTo("SUB-" + datePart + "-002");
    }

    @Test
    @DisplayName("다른 날짜는 카운터가 분리되어 각각 001부터 시작한다")
    void differentDatesHaveIndependentCounters() {
        LocalDate today = LocalDate.now();
        LocalDate tomorrow = today.plusDays(1);

        transactionTemplate.execute(status -> numberGenerator.nextNumber(today));
        String tomorrowFirst = transactionTemplate.execute(status -> numberGenerator.nextNumber(tomorrow));

        assertThat(tomorrowFirst).endsWith("-001");
    }

    @Test
    @DisplayName("동시 채번 10건에서도 제출번호가 중복 없이 연속 발급된다")
    void tenConcurrentRequestsProduceDistinctNumbers() throws InterruptedException {
        LocalDate submissionDate = LocalDate.now();
        Queue<String> issuedNumbers = new ConcurrentLinkedQueue<>();

        List<Throwable> failures = runConcurrently(10, () -> issuedNumbers.add(
                transactionTemplate.execute(status -> numberGenerator.nextNumber(submissionDate))));

        assertThat(failures).as("행잠금 채번은 경합에서도 실패가 없어야 한다").isEmpty();
        assertThat(issuedNumbers).hasSize(10).doesNotHaveDuplicates();
    }

    /** AuthRefreshConcurrencyTest 의 동시 실행 헬퍼를 복제한다(사이드 파일 패턴 일치). */
    private List<Throwable> runConcurrently(int threadCount, Runnable action) throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        for (int i = 0; i < threadCount; i++) {
            executorService.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    action.run();
                } catch (Throwable throwable) {
                    failures.add(throwable);
                } finally {
                    doneLatch.countDown();
                }
            });
        }
        assertThat(readyLatch.await(10, TimeUnit.SECONDS)).isTrue();
        startLatch.countDown();
        assertThat(doneLatch.await(30, TimeUnit.SECONDS))
                .as("동시 작업이 제한시간 안에 끝나야 한다(데드락 의심)").isTrue();
        executorService.shutdownNow();
        return List.copyOf(failures);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests SubmissionNumberGeneratorConcurrencyTest`
Expected: 컴파일 실패 (생성기 미존재)

- [ ] **Step 3: 리포지토리 + 생성기 구현**

`FacilitySubmissionSequenceRepository.java`:

```java
package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilitySubmissionSequenceRepository extends JpaRepository<FacilitySubmissionSequence, LocalDate> {

    /** 채번 행 선삽입(§3) — 이미 있으면 무시. 이후 행잠금 SELECT 가 반드시 행을 찾게 보장한다. */
    @Modifying
    @Query(value = "INSERT INTO facility_submission_seq (seq_date, next_value) VALUES (:seqDate, 1) "
            + "ON CONFLICT (seq_date) DO NOTHING", nativeQuery = true)
    void insertIfAbsent(@Param("seqDate") LocalDate seqDate);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT sequence FROM FacilitySubmissionSequence sequence WHERE sequence.seqDate = :seqDate")
    Optional<FacilitySubmissionSequence> findBySeqDateForUpdate(@Param("seqDate") LocalDate seqDate);
}
```

`SubmissionNumberGenerator.java`:

```java
package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionSequence;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 제출번호 채번(스펙 §3) — SUB-YYYYMMDD-NNN. 일자별 시퀀스 행을 FOR UPDATE 로 잠가 직렬화하고,
 * submission_no UNIQUE 제약이 최종 백스톱이다.
 * 호출자는 쓰기 트랜잭션 안에서 호출해야 한다 — 행잠금이 트랜잭션 커밋까지 유지된다.
 */
@Component
@RequiredArgsConstructor
public class SubmissionNumberGenerator {

    private static final DateTimeFormatter DATE_PART = DateTimeFormatter.BASIC_ISO_DATE;

    private final FacilitySubmissionSequenceRepository sequenceRepository;

    public String nextNumber(LocalDate submissionDate) {
        sequenceRepository.insertIfAbsent(submissionDate);
        FacilitySubmissionSequence sequence = sequenceRepository.findBySeqDateForUpdate(submissionDate)
                .orElseThrow(() -> new IllegalStateException("채번 행이 존재해야 합니다: " + submissionDate));
        return "SUB-%s-%03d".formatted(submissionDate.format(DATE_PART), sequence.currentAndIncrement());
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests SubmissionNumberGeneratorConcurrencyTest`
Expected: PASS (3/3)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 제출번호 일자별 행잠금 채번 구현"
```

---

### Task 3: Batch 생성·취소 서비스 + 동시성 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java` (메서드 1개 추가만 — 기존 코드 무변경)
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/FacilitySubmissionService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/command/CreateSubmissionBatchCommand.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/command/SubmissionActorContext.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/CreateSubmissionBatchResult.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionServiceIntegrationTest.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/FacilitySubmissionConcurrencyTest.java`

**Interfaces:**
- Consumes: Task 1 엔티티·리포지토리·예외, Task 2 `SubmissionNumberGenerator.nextNumber(LocalDate)`
- Produces: `FacilitySubmissionService.create(CreateSubmissionBatchCommand, SubmissionActorContext) → CreateSubmissionBatchResult(Long batchId, String submissionNo, String csvFileName)`, `FacilitySubmissionService.cancel(Long batchId, SubmissionActorContext)`, `SubmissionActorContext(Long adminId, String ipAddress, String userAgent)` — Task 6·7 이 사용. `FacilityBookingRepository.findAllByIdForUpdate(Collection<Long>) → List<FacilityBooking>`

- [ ] **Step 1: 실패하는 통합 테스트 작성**

테스트 픽스처는 booking 정책(마감·중앙동아리·역할)을 우회하기 위해 `FacilityBooking.request(...)` + `approve(...)` 직접 저장을 쓴다(FK 만족을 위해 User·Club·Facility 실행은 저장). 날짜는 전부 상대 날짜.

```java
package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralFacilitySubmissionServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private User applicant;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUpFixture() {
        admin = userRepository.save(UserFixture.admin());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("제출동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionActorContext actor() {
        return new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
    }

    /** 정책 우회 직접 저장 — 승인 완료 예약. startHour 로 시간 겹침을 피한다. */
    private FacilityBooking approvedBooking(int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    private FacilityBooking pendingBooking(int startHour) {
        return bookingRepository.save(FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE));
    }

    @Test
    @DisplayName("승인 완료 예약들로 Batch 가 생성되고 번호·CSV 파일명·감사가 남는다")
    void createBatchWithApprovedBookings() {
        FacilityBooking first = approvedBooking(9);
        FacilityBooking second = approvedBooking(11);

        CreateSubmissionBatchResult result = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(second.getId(), first.getId()), "  "), actor());

        assertThat(result.submissionNo()).matches("SUB-\\d{8}-\\d{3}");
        assertThat(result.csvFileName()).isEqualTo("facility-submission-" + result.submissionNo() + ".csv");
        assertThat(batchRepository.findById(result.batchId()).orElseThrow().getMemo())
                .as("공백 메모는 null 로 저장한다").isNull();
        assertThat(itemRepository.findByBatchIdOrderByIdAsc(result.batchId())).hasSize(2);
        List<FacilitySubmissionAudit> audits = auditRepository.findByBatchIdOrderByIdAsc(result.batchId());
        assertThat(audits).hasSize(1);
        assertThat(audits.get(0).getAction()).isEqualTo(SubmissionAuditAction.CREATED);
        assertThat(audits.get(0).getIpAddress()).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("승인 완료가 아닌 예약이 하나라도 섞이면 Batch 는 전혀 생성되지 않는다")
    void nonApprovedBookingRejectsWholeBatch() {
        FacilityBooking approved = approvedBooking(9);
        FacilityBooking pending = pendingBooking(11);

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(approved.getId(), pending.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.BookingNotApprovedException.class);
        assertThat(batchRepository.count()).isZero();
        assertThat(itemRepository.count()).isZero();
    }

    @Test
    @DisplayName("이미 제출된 예약이 포함되면 거부된다")
    void alreadySubmittedBookingRejects() {
        FacilityBooking booking = approvedBooking(9);
        submissionService.create(new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.AlreadySubmittedBookingException.class);
    }

    @Test
    @DisplayName("다른 시설의 예약이 섞이면 거부된다")
    void mixedFacilityRejects() {
        FacilityBooking mine = approvedBooking(9);
        Facility otherFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(2)", "1504호", 0));
        FacilityBooking other = FacilityBooking.request(
                otherFacility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(13, 0), LocalTime.of(14, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        other.approve(admin.getId(), null, LocalDateTime.now());
        bookingRepository.save(other);

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(mine.getId(), other.getId()), null), actor()))
                .isInstanceOf(FacilitySubmissionException.MixedFacilityException.class);
    }

    @Test
    @DisplayName("존재하지 않는 예약 ID 가 섞이면 거부된다")
    void unknownBookingIdRejects() {
        FacilityBooking booking = approvedBooking(9);

        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId(), 999_999L), null), actor()))
                .isInstanceOf(FacilitySubmissionException.SubmissionBookingNotFoundException.class);
    }

    @Test
    @DisplayName("빈 선택으로는 Batch 를 만들 수 없다")
    void emptySelectionRejects() {
        assertThatThrownBy(() -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(), null), actor()))
                .isInstanceOf(FacilitySubmissionException.EmptyBookingSelectionException.class);
    }

    @Test
    @DisplayName("제출 취소는 booking 을 건드리지 않고 감사를 남기며, 취소 후 같은 예약을 다시 제출할 수 있다")
    void cancelKeepsBookingAndAllowsResubmission() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult firstResult = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());

        submissionService.cancel(firstResult.batchId(), actor());

        assertThat(batchRepository.findById(firstResult.batchId()).orElseThrow().isCancelled()).isTrue();
        assertThat(bookingRepository.findById(booking.getId()).orElseThrow().getStatus())
                .isEqualTo(BookingStatus.APPROVED);
        assertThat(auditRepository.findByBatchIdOrderByIdAsc(firstResult.batchId()))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.CANCELLED);

        CreateSubmissionBatchResult secondResult = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        assertThat(secondResult.batchId()).isNotEqualTo(firstResult.batchId());
    }

    @Test
    @DisplayName("이미 취소된 Batch 를 다시 취소하면 409 예외가 발생한다")
    void cancellingTwiceThrowsConflict() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult result = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(result.batchId(), actor());

        assertThatThrownBy(() -> submissionService.cancel(result.batchId(), actor()))
                .isInstanceOf(FacilitySubmissionException.BatchAlreadyCancelledException.class);
    }

    @Test
    @DisplayName("존재하지 않는 Batch 취소는 404 예외가 발생한다")
    void cancellingUnknownBatchThrowsNotFound() {
        assertThatThrownBy(() -> submissionService.cancel(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }
}
```

- [ ] **Step 2: 실패하는 동시성 테스트 작성**

```java
package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.user.entity.User;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import com.duing.domain.user.repository.UserRepository;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilitySubmissionConcurrencyTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    @Test
    @DisplayName("같은 예약으로 동시에 Batch 2개를 만들면 정확히 하나만 성공한다")
    void concurrentCreatesForSameBookingAllowExactlyOne() throws InterruptedException {
        User admin = userRepository.save(UserFixture.admin());
        User applicant = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(Club.create("동시성동아리", ClubCategory.OTHER, "분과", "설명", null));
        Facility facility = facilityRepository.save(Facility.create(91000, "커뮤니티룸(1)", "1503호", 0));
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(9, 0), LocalTime.of(10, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        Long bookingId = bookingRepository.save(booking).getId();
        SubmissionActorContext actor = new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");

        List<Throwable> failures = runConcurrently(2, () -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(bookingId), null), actor));

        assertThat(failures).as("행잠금 직렬화로 정확히 한쪽만 거부돼야 한다").hasSize(1);
        assertThat(failures.get(0))
                .isInstanceOf(FacilitySubmissionException.AlreadySubmittedBookingException.class);
        assertThat(batchRepository.count()).isEqualTo(1);
        assertThat(itemRepository.count()).isEqualTo(1);
    }

    /** AuthRefreshConcurrencyTest 의 동시 실행 헬퍼를 복제한다(사이드 파일 패턴 일치). */
    private List<Throwable> runConcurrently(int threadCount, Runnable action) throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        for (int i = 0; i < threadCount; i++) {
            executorService.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    action.run();
                } catch (Throwable throwable) {
                    failures.add(throwable);
                } finally {
                    doneLatch.countDown();
                }
            });
        }
        assertThat(readyLatch.await(10, TimeUnit.SECONDS)).isTrue();
        startLatch.countDown();
        assertThat(doneLatch.await(30, TimeUnit.SECONDS))
                .as("동시 작업이 제한시간 안에 끝나야 한다(데드락 의심)").isTrue();
        executorService.shutdownNow();
        return List.copyOf(failures);
    }
}
```

- [ ] **Step 3: 실패 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionServiceIntegrationTest --tests FacilitySubmissionConcurrencyTest`
Expected: 컴파일 실패 (서비스 미존재)

- [ ] **Step 4: 리포지토리 잠금 메서드 + 커맨드 DTO + 서비스 구현**

`FacilityBookingRepository.java` 에 메서드 추가 (기존 import 에 `jakarta.persistence.LockModeType`, `org.springframework.data.jpa.repository.Lock` 추가):

```java
    /** 학교 제출 생성의 중복 방지 직렬화(제출 스펙 §4) — ID 오름차순 잠금으로 상호 데드락을 차단한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM FacilityBooking b WHERE b.id IN :bookingIds ORDER BY b.id ASC")
    List<FacilityBooking> findAllByIdForUpdate(@Param("bookingIds") Collection<Long> bookingIds);
```

`CreateSubmissionBatchCommand.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.command;

import java.util.List;

public record CreateSubmissionBatchCommand(List<Long> bookingIds, String memo) {
}
```

`SubmissionActorContext.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.command;

/** 감사 기록용 행위자 컨텍스트 — 컨트롤러가 UserPrincipal·HttpServletRequest 에서 조립한다. */
public record SubmissionActorContext(Long adminId, String ipAddress, String userAgent) {
}
```

`CreateSubmissionBatchResult.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

public record CreateSubmissionBatchResult(Long batchId, String submissionNo, String csvFileName) {
}
```

`FacilitySubmissionService.java`:

```java
package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;

public interface FacilitySubmissionService {

    CreateSubmissionBatchResult create(CreateSubmissionBatchCommand command, SubmissionActorContext actor);

    void cancel(Long batchId, SubmissionActorContext actor);
}
```

`GeneralFacilitySubmissionService.java`:

```java
package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilitySubmissionService implements FacilitySubmissionService {

    private final FacilityBookingRepository bookingRepository;
    private final FacilitySubmissionBatchRepository batchRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final FacilitySubmissionAuditRepository auditRepository;
    private final SubmissionNumberGenerator numberGenerator;
    private final Clock clock;

    @Override
    @Transactional
    public CreateSubmissionBatchResult create(CreateSubmissionBatchCommand command, SubmissionActorContext actor) {
        List<Long> bookingIds = command.bookingIds().stream().distinct().sorted().toList();
        if (bookingIds.isEmpty()) {
            throw new FacilitySubmissionException.EmptyBookingSelectionException();
        }
        // ID 오름차순 행잠금(스펙 §4) — 겹치는 집합의 동시 생성이 반대 순서로 잠그는 데드락을 차단하고,
        // 잠금 하에서 아래 활성 EXISTS 검증을 직렬화한다(부분 유니크 인덱스 부재의 애플리케이션 보상).
        List<FacilityBooking> bookings = bookingRepository.findAllByIdForUpdate(bookingIds);
        if (bookings.size() != bookingIds.size()) {
            throw new FacilitySubmissionException.SubmissionBookingNotFoundException();
        }
        Long facilityId = bookings.get(0).getFacilityId();
        if (bookings.stream().anyMatch(booking -> !booking.getFacilityId().equals(facilityId))) {
            throw new FacilitySubmissionException.MixedFacilityException();
        }
        if (bookings.stream().anyMatch(booking -> booking.getStatus() != BookingStatus.APPROVED)) {
            throw new FacilitySubmissionException.BookingNotApprovedException();
        }
        if (!itemRepository.findActiveByBookingIdIn(bookingIds).isEmpty()) {
            throw new FacilitySubmissionException.AlreadySubmittedBookingException();
        }

        LocalDateTime submittedAt = LocalDateTime.now(clock);
        String submissionNo = numberGenerator.nextNumber(submittedAt.toLocalDate());
        FacilitySubmissionBatch batch = batchRepository.save(FacilitySubmissionBatch.create(
                submissionNo, facilityId, actor.adminId(), submittedAt, blankToNull(command.memo())));
        itemRepository.saveAll(bookingIds.stream()
                .map(bookingId -> FacilitySubmissionItem.of(batch.getId(), bookingId))
                .toList());
        auditRepository.save(FacilitySubmissionAudit.of(batch.getId(), SubmissionAuditAction.CREATED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        return new CreateSubmissionBatchResult(batch.getId(), submissionNo, batch.getCsvFileName());
    }

    @Override
    @Transactional
    public void cancel(Long batchId, SubmissionActorContext actor) {
        FacilitySubmissionBatch batch = batchRepository.findById(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        batch.cancel(actor.adminId(), LocalDateTime.now(clock));
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.CANCELLED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
    }

    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text.trim();
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionServiceIntegrationTest --tests FacilitySubmissionConcurrencyTest`
Expected: PASS (10/10)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitybooking/repository/FacilityBookingRepository.java \
  backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 학교 제출 Batch 생성·취소 서비스 구현"
```

---

### Task 4: 제출 대상(candidates) 조회 서비스

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/FacilitySubmissionQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionCandidatesQuery.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionCandidateBooking.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionSummaryCounts.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionCandidatesResult.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryServiceIntegrationTest.java`

**Interfaces:**
- Consumes: Task 1 리포지토리, Task 3 서비스(테스트 시드용), 기존 `FacilityBookingRepository.findByFacilityIdAndReservationDateBetweenAndStatusIn`
- Produces: `FacilitySubmissionQueryService.getCandidates(SubmissionCandidatesQuery) → SubmissionCandidatesResult(SubmissionSummaryCounts summary, List<SubmissionCandidateBooking> bookings)`. `SubmissionCandidateBooking(Long bookingId, Long clubId, String clubName, String applicantName, String contactPhone, LocalDate reservationDate, LocalTime startTime, LocalTime endTime, String purpose, Integer attendeeCount, BookingStatus status, boolean submitted, boolean selectable, String submissionNo, String decidedByName, LocalDateTime decidedAt)` — Task 5(상세)·Task 7(응답 DTO)이 재사용. **Task 5 가 이 인터페이스에 목록·상세 메서드를 추가한다.**

- [ ] **Step 1: 실패하는 테스트 작성**

픽스처 헬퍼(`approvedBooking`/`pendingBooking` 등)는 Task 3 통합 테스트와 동일 패턴을 복제한다(사이드 파일 패턴). 클럽 2개(필터 검증용)를 만들고, 상태별 예약을 시드한다.

```java
package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralFacilitySubmissionQueryServiceIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionQueryService queryService;
    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private User applicant;
    private Club club;
    private Facility facility;
    private final LocalDate baseDate = LocalDate.now().plusDays(7);

    @BeforeEach
    void setUpFixture() {
        admin = userRepository.save(UserFixture.admin());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("조회동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionCandidatesQuery periodQuery() {
        return new SubmissionCandidatesQuery(facility.getId(), baseDate.minusDays(1), baseDate.plusDays(1), null);
    }

    private FacilityBooking savedBooking(int startHour, BookingStatus targetStatus) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), baseDate,
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        if (targetStatus != BookingStatus.PENDING) {
            booking.approve(admin.getId(), null, LocalDateTime.now());
        }
        if (targetStatus == BookingStatus.CONFIRMED) {
            booking.confirmManually(LocalDateTime.now());
        }
        if (targetStatus == BookingStatus.REJECTED) {
            // reject 는 PENDING 에서만 가능 — 새로 만들어 reject 한다
            booking = FacilityBooking.request(
                    facility.getId(), club.getId(), applicant.getId(), baseDate,
                    LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                    "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
            booking.reject(admin.getId(), "사유", LocalDateTime.now());
        }
        return bookingRepository.save(booking);
    }

    @Test
    @DisplayName("기간 내 전체 예약이 반환되고 REJECTED 만 제외되며 submitted·selectable 이 정확히 파생된다")
    void candidatesDeriveFlagsAndExcludeRejected() {
        FacilityBooking pending = savedBooking(9, BookingStatus.PENDING);
        FacilityBooking awaiting = savedBooking(11, BookingStatus.APPROVED);
        FacilityBooking submitted = savedBooking(13, BookingStatus.APPROVED);
        FacilityBooking confirmed = savedBooking(15, BookingStatus.CONFIRMED);
        savedBooking(17, BookingStatus.REJECTED);
        String submissionNo = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(submitted.getId()), null),
                new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit")).submissionNo();

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings()).extracting(SubmissionCandidateBooking::bookingId)
                .containsExactly(pending.getId(), awaiting.getId(), submitted.getId(), confirmed.getId());
        SubmissionCandidateBooking awaitingRow = result.bookings().get(1);
        assertThat(awaitingRow.submitted()).isFalse();
        assertThat(awaitingRow.selectable()).isTrue();
        assertThat(awaitingRow.clubName()).isEqualTo(club.getName());
        assertThat(awaitingRow.applicantName()).isEqualTo(applicant.getName());
        assertThat(awaitingRow.decidedByName()).isEqualTo(admin.getName());
        SubmissionCandidateBooking submittedRow = result.bookings().get(2);
        assertThat(submittedRow.submitted()).isTrue();
        assertThat(submittedRow.selectable()).isFalse();
        assertThat(submittedRow.submissionNo()).isEqualTo(submissionNo);
        SubmissionCandidateBooking pendingRow = result.bookings().get(0);
        assertThat(pendingRow.selectable()).isFalse();
        assertThat(pendingRow.submissionNo()).isNull();
    }

    @Test
    @DisplayName("취소된 Batch 소속 예약은 다시 제출 대기(selectable)로 집계된다")
    void cancelledBatchBookingBecomesSelectableAgain() {
        FacilityBooking booking = savedBooking(9, BookingStatus.APPROVED);
        SubmissionActorContext actor = new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor).batchId();
        submissionService.cancel(batchId, actor);

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.bookings().get(0).submitted()).isFalse();
        assertThat(result.bookings().get(0).selectable()).isTrue();
        assertThat(result.summary().awaitingCount()).isEqualTo(1);
        assertThat(result.summary().submittedCount()).isZero();
    }

    @Test
    @DisplayName("summary 4개 값이 동일 필터 범위에서 정확히 집계된다")
    void summaryCountsMatchDefinition() {
        savedBooking(9, BookingStatus.PENDING);
        savedBooking(11, BookingStatus.APPROVED);
        FacilityBooking submitted = savedBooking(13, BookingStatus.APPROVED);
        savedBooking(15, BookingStatus.CONFIRMED);
        submissionService.create(new CreateSubmissionBatchCommand(List.of(submitted.getId()), null),
                new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit"));

        SubmissionCandidatesResult result = queryService.getCandidates(periodQuery());

        assertThat(result.summary().approvedCount()).as("APPROVED 전체(제출 여부 무관)").isEqualTo(2);
        assertThat(result.summary().awaitingCount()).as("APPROVED + 미제출").isEqualTo(1);
        assertThat(result.summary().submittedCount()).as("활성 Batch 소속").isEqualTo(1);
        assertThat(result.summary().confirmedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("clubId 필터를 주면 해당 동아리 예약만 반환된다")
    void clubFilterNarrowsBookings() {
        savedBooking(9, BookingStatus.APPROVED);
        Club otherClub = clubRepository.save(Club.create("타동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        FacilityBooking otherBooking = FacilityBooking.request(
                facility.getId(), otherClub.getId(), applicant.getId(), baseDate,
                LocalTime.of(11, 0), LocalTime.of(12, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        bookingRepository.save(otherBooking);

        SubmissionCandidatesResult result = queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate.minusDays(1), baseDate.plusDays(1), otherClub.getId()));

        assertThat(result.bookings()).hasSize(1);
        assertThat(result.bookings().get(0).clubId()).isEqualTo(otherClub.getId());
    }

    @Test
    @DisplayName("조회 기간이 31일을 넘거나 역순이면 400 예외가 발생한다")
    void invalidPeriodRejects() {
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.plusDays(31), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
        assertThatThrownBy(() -> queryService.getCandidates(new SubmissionCandidatesQuery(
                facility.getId(), baseDate, baseDate.minusDays(1), null)))
                .isInstanceOf(FacilitySubmissionException.InvalidCandidatePeriodException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionQueryServiceIntegrationTest`
Expected: 컴파일 실패

- [ ] **Step 3: 쿼리 DTO + 서비스 구현**

`SubmissionCandidatesQuery.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDate;

public record SubmissionCandidatesQuery(Long facilityId, LocalDate startDate, LocalDate endDate, Long clubId) {
}
```

`SubmissionCandidateBooking.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/** 시간표·목록 겸용 예약 행(스펙 §5.1) — submitted 는 활성 Batch 소속 여부, selectable 은 APPROVED && 미제출. */
public record SubmissionCandidateBooking(
        Long bookingId,
        Long clubId,
        String clubName,
        String applicantName,
        String contactPhone,
        LocalDate reservationDate,
        LocalTime startTime,
        LocalTime endTime,
        String purpose,
        Integer attendeeCount,
        BookingStatus status,
        boolean submitted,
        boolean selectable,
        String submissionNo,
        String decidedByName,
        LocalDateTime decidedAt
) {
}
```

`SubmissionSummaryCounts.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

/** Summary 카드 4종(스펙 §5.1) — bookings 와 동일 필터 범위에서 집계한다. */
public record SubmissionSummaryCounts(
        long approvedCount,
        long awaitingCount,
        long submittedCount,
        long confirmedCount
) {
}
```

`SubmissionCandidatesResult.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import java.util.List;

public record SubmissionCandidatesResult(SubmissionSummaryCounts summary, List<SubmissionCandidateBooking> bookings) {
}
```

`FacilitySubmissionQueryService.java`:

```java
package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;

public interface FacilitySubmissionQueryService {

    SubmissionCandidatesResult getCandidates(SubmissionCandidatesQuery query);
}
```

`GeneralFacilitySubmissionQueryService.java`:

```java
package com.duing.domain.facilitysubmission.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionSummaryCounts;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFacilitySubmissionQueryService implements FacilitySubmissionQueryService {

    /** 후보 조회 상태 — REJECTED 는 운영 노이즈라 제외한다(스펙 §5.1). */
    private static final List<BookingStatus> CANDIDATE_STATUSES = List.of(
            BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED,
            BookingStatus.CONFLICT, BookingStatus.CANCELLED);
    private static final int MAX_PERIOD_DAYS = 31;

    private final FacilityBookingRepository bookingRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final UserRepository userRepository;
    private final ClubRepository clubRepository;

    @Override
    public SubmissionCandidatesResult getCandidates(SubmissionCandidatesQuery query) {
        validatePeriod(query.startDate(), query.endDate());
        List<FacilityBooking> bookings = bookingRepository
                .findByFacilityIdAndReservationDateBetweenAndStatusIn(
                        query.facilityId(), query.startDate(), query.endDate(), CANDIDATE_STATUSES)
                .stream()
                .filter(booking -> query.clubId() == null || booking.getClubId().equals(query.clubId()))
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();

        Map<Long, String> submissionNoByBookingId = activeSubmissionNos(bookings);
        Map<Long, String> clubNames = clubNames(bookings);
        Map<Long, String> userNames = userNames(bookings);

        List<SubmissionCandidateBooking> candidateBookings = bookings.stream()
                .map(booking -> toCandidate(booking, submissionNoByBookingId, clubNames, userNames))
                .toList();
        return new SubmissionCandidatesResult(summarize(candidateBookings), candidateBookings);
    }

    private void validatePeriod(LocalDate startDate, LocalDate endDate) {
        if (endDate.isBefore(startDate)
                || ChronoUnit.DAYS.between(startDate, endDate) + 1 > MAX_PERIOD_DAYS) {
            throw new FacilitySubmissionException.InvalidCandidatePeriodException();
        }
    }

    private Map<Long, String> activeSubmissionNos(List<FacilityBooking> bookings) {
        if (bookings.isEmpty()) {
            return Map.of();
        }
        return itemRepository.findActiveByBookingIdIn(
                        bookings.stream().map(FacilityBooking::getId).toList()).stream()
                .collect(Collectors.toMap(
                        FacilitySubmissionItemRepository.ActiveSubmissionProjection::getBookingId,
                        FacilitySubmissionItemRepository.ActiveSubmissionProjection::getSubmissionNo));
    }

    private Map<Long, String> clubNames(List<FacilityBooking> bookings) {
        List<Long> clubIds = bookings.stream().map(FacilityBooking::getClubId).distinct().toList();
        return clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName));
    }

    private Map<Long, String> userNames(List<FacilityBooking> bookings) {
        List<Long> userIds = bookings.stream()
                .flatMap(booking -> Stream.of(booking.getApplicantId(), booking.getDecidedById()))
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        return userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));
    }

    private SubmissionCandidateBooking toCandidate(FacilityBooking booking,
            Map<Long, String> submissionNoByBookingId, Map<Long, String> clubNames, Map<Long, String> userNames) {
        boolean submitted = submissionNoByBookingId.containsKey(booking.getId());
        boolean selectable = booking.getStatus() == BookingStatus.APPROVED && !submitted;
        return new SubmissionCandidateBooking(
                booking.getId(), booking.getClubId(), clubNames.get(booking.getClubId()),
                userNames.get(booking.getApplicantId()), blankToNull(booking.getContactPhone()),
                booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                booking.getPurpose(), booking.getAttendeeCount(), booking.getStatus(),
                submitted, selectable, submissionNoByBookingId.get(booking.getId()),
                booking.getDecidedById() != null ? userNames.get(booking.getDecidedById()) : null,
                booking.getDecidedAt());
    }

    private SubmissionSummaryCounts summarize(List<SubmissionCandidateBooking> candidateBookings) {
        long approvedCount = candidateBookings.stream()
                .filter(candidate -> candidate.status() == BookingStatus.APPROVED).count();
        long awaitingCount = candidateBookings.stream()
                .filter(SubmissionCandidateBooking::selectable).count();
        long submittedCount = candidateBookings.stream()
                .filter(SubmissionCandidateBooking::submitted).count();
        long confirmedCount = candidateBookings.stream()
                .filter(candidate -> candidate.status() == BookingStatus.CONFIRMED).count();
        return new SubmissionSummaryCounts(approvedCount, awaitingCount, submittedCount, confirmedCount);
    }

    /** V85 하위호환 — 기존 행의 빈 연락처는 null 로 노출한다(관리자 상세 응답과 동일 규칙). */
    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text;
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionQueryServiceIntegrationTest`
Expected: PASS (5/5)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 학교 제출 대상 조회·Summary 집계 구현"
```

---

### Task 5: 제출 이력 목록·Batch 상세 조회 (+VIEWED 감사)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/FacilitySubmissionQueryService.java` (메서드 2개 추가)
- Modify: `backend/src/main/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionQueryService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionBatchListItem.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/dto/query/SubmissionBatchDetailResult.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/GeneralFacilitySubmissionHistoryQueryIntegrationTest.java`

**Interfaces:**
- Consumes: Task 4 의 `SubmissionCandidateBooking`·데코레이션 헬퍼, Task 3 의 `SubmissionActorContext`
- Produces: `FacilitySubmissionQueryService.getBatches(Long facilityId, Pageable) → Page<SubmissionBatchListItem>`, `FacilitySubmissionQueryService.getDetail(Long batchId, SubmissionActorContext) → SubmissionBatchDetailResult(SubmissionBatchListItem batch, List<SubmissionCandidateBooking> bookings)` — Task 7 이 사용. `SubmissionBatchListItem(Long batchId, String submissionNo, Long facilityId, String facilityName, long bookingCount, LocalDateTime submittedAt, String submittedByName, String memo, boolean cancelled, LocalDateTime cancelledAt)`

- [ ] **Step 1: 실패하는 테스트 작성**

픽스처 헬퍼(`setUpFixture`/`approvedBooking`)는 Task 3 통합 테스트와 동일 패턴 복제(사이드 파일 패턴).

```java
package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralFacilitySubmissionHistoryQueryIntegrationTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionQueryService queryService;
    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private User applicant;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUpFixture() {
        admin = userRepository.save(UserFixture.admin());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("이력동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionActorContext actor() {
        return new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
    }

    private FacilityBooking approvedBooking(int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    @Test
    @DisplayName("제출 이력은 취소된 Batch 를 포함해 최신순으로 반환되고 건수·이름이 채워진다")
    void batchListIncludesCancelledWithNames() {
        FacilityBooking first = approvedBooking(9);
        FacilityBooking second = approvedBooking(11);
        Long olderBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(first.getId()), "1차"), actor()).batchId();
        Long newerBatchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(second.getId()), "2차"), actor()).batchId();
        submissionService.cancel(olderBatchId, actor());

        Page<SubmissionBatchListItem> page = queryService.getBatches(null, PageRequest.of(0, 20));

        assertThat(page.getContent()).extracting(SubmissionBatchListItem::batchId)
                .containsExactly(newerBatchId, olderBatchId);
        SubmissionBatchListItem cancelledRow = page.getContent().get(1);
        assertThat(cancelledRow.cancelled()).isTrue();
        assertThat(cancelledRow.bookingCount()).isEqualTo(1);
        assertThat(cancelledRow.facilityName()).isEqualTo(facility.getRoomName());
        assertThat(cancelledRow.submittedByName()).isEqualTo(admin.getName());
        assertThat(cancelledRow.memo()).isEqualTo("1차");
    }

    @Test
    @DisplayName("facilityId 필터를 주면 해당 시설의 이력만 반환된다")
    void facilityFilterNarrowsBatches() {
        FacilityBooking mine = approvedBooking(9);
        submissionService.create(new CreateSubmissionBatchCommand(List.of(mine.getId()), null), actor());
        Facility otherFacility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(2)", "1504호", 0));

        Page<SubmissionBatchListItem> page = queryService.getBatches(otherFacility.getId(), PageRequest.of(0, 20));

        assertThat(page.getContent()).isEmpty();
    }

    @Test
    @DisplayName("Batch 상세는 헤더와 예약 목록을 반환하고 조회 감사(VIEWED)를 남긴다")
    void detailReturnsBookingsAndRecordsViewedAudit() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), "상세 확인"), actor()).batchId();

        SubmissionBatchDetailResult detail = queryService.getDetail(batchId, actor());

        assertThat(detail.batch().batchId()).isEqualTo(batchId);
        assertThat(detail.batch().memo()).isEqualTo("상세 확인");
        assertThat(detail.bookings()).hasSize(1);
        assertThat(detail.bookings().get(0).bookingId()).isEqualTo(booking.getId());
        assertThat(detail.bookings().get(0).submitted()).isTrue();
        assertThat(auditRepository.findByBatchIdOrderByIdAsc(batchId))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.VIEWED);
    }

    @Test
    @DisplayName("취소된 Batch 도 상세 조회가 가능하고 소속 예약은 미제출 상태로 표시된다")
    void cancelledBatchDetailRemainsReadable() {
        FacilityBooking booking = approvedBooking(9);
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor()).batchId();
        submissionService.cancel(batchId, actor());

        SubmissionBatchDetailResult detail = queryService.getDetail(batchId, actor());

        assertThat(detail.batch().cancelled()).isTrue();
        assertThat(detail.bookings()).hasSize(1);
        assertThat(detail.bookings().get(0).submitted())
                .as("활성 제출 기준 재계산 — 취소된 Batch 소속은 미제출").isFalse();
    }

    @Test
    @DisplayName("존재하지 않는 Batch 상세 조회는 404 예외가 발생한다")
    void unknownBatchDetailThrowsNotFound() {
        assertThatThrownBy(() -> queryService.getDetail(999_999L, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionHistoryQueryIntegrationTest`
Expected: 컴파일 실패

- [ ] **Step 3: DTO + 서비스 메서드 구현**

`SubmissionBatchListItem.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDateTime;

/** 이력 행이자 상세 헤더(스펙 §5.3·§5.4). */
public record SubmissionBatchListItem(
        Long batchId,
        String submissionNo,
        Long facilityId,
        String facilityName,
        long bookingCount,
        LocalDateTime submittedAt,
        String submittedByName,
        String memo,
        boolean cancelled,
        LocalDateTime cancelledAt
) {
}
```

`SubmissionBatchDetailResult.java`:

```java
package com.duing.domain.facilitysubmission.service.dto.query;

import java.util.List;

public record SubmissionBatchDetailResult(SubmissionBatchListItem batch, List<SubmissionCandidateBooking> bookings) {
}
```

`FacilitySubmissionQueryService.java` 에 추가:

```java
    Page<SubmissionBatchListItem> getBatches(Long facilityId, Pageable pageable);

    /** 조회 감사(VIEWED)를 남기는 쓰기 동반 조회 — 구현은 readOnly 금지(스펙 §5.4). */
    SubmissionBatchDetailResult getDetail(Long batchId, SubmissionActorContext actor);
```

(import 추가: `SubmissionActorContext`, `SubmissionBatchDetailResult`, `SubmissionBatchListItem`, `org.springframework.data.domain.Page`, `org.springframework.data.domain.Pageable`)

`GeneralFacilitySubmissionQueryService.java` 에 추가 — 필드 주입 추가: `FacilitySubmissionBatchRepository batchRepository`, `FacilitySubmissionItemRepository`(기존), `FacilitySubmissionAuditRepository auditRepository`, `FacilityRepository facilityRepository`:

```java
    @Override
    public Page<SubmissionBatchListItem> getBatches(Long facilityId, Pageable pageable) {
        Page<FacilitySubmissionBatch> batchPage = facilityId != null
                ? batchRepository.findByFacilityIdOrderByIdDesc(facilityId, pageable)
                : batchRepository.findAllByOrderByIdDesc(pageable);
        List<FacilitySubmissionBatch> batches = batchPage.getContent();
        Map<Long, Long> bookingCounts = bookingCounts(batches);
        Map<Long, String> facilityNames = facilityNames(batches);
        Map<Long, String> submitterNames = submitterNames(batches);
        return batchPage.map(batch -> toListItem(batch,
                bookingCounts.getOrDefault(batch.getId(), 0L),
                facilityNames.get(batch.getFacilityId()),
                submitterNames.get(batch.getSubmittedById())));
    }

    // 감사 기록(VIEWED)이 포함된 조회 — 클래스 readOnly 를 쓰기 트랜잭션으로 오버라이드한다(전역 제약).
    @Override
    @Transactional
    public SubmissionBatchDetailResult getDetail(Long batchId, SubmissionActorContext actor) {
        FacilitySubmissionBatch batch = batchRepository.findById(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        List<Long> bookingIds = itemRepository.findByBatchIdOrderByIdAsc(batchId).stream()
                .map(FacilitySubmissionItem::getBookingId)
                .toList();
        List<FacilityBooking> bookings = bookingRepository.findAllById(bookingIds).stream()
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();
        Map<Long, String> submissionNoByBookingId = activeSubmissionNos(bookings);
        Map<Long, String> clubNames = clubNames(bookings);
        Map<Long, String> userNames = userNames(bookings);
        List<SubmissionCandidateBooking> bookingRows = bookings.stream()
                .map(booking -> toCandidate(booking, submissionNoByBookingId, clubNames, userNames))
                .toList();
        SubmissionBatchListItem header = toListItem(batch, bookingIds.size(),
                facilityNames(List.of(batch)).get(batch.getFacilityId()),
                submitterNames(List.of(batch)).get(batch.getSubmittedById()));
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.VIEWED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        return new SubmissionBatchDetailResult(header, bookingRows);
    }

    private SubmissionBatchListItem toListItem(FacilitySubmissionBatch batch, long bookingCount,
            String facilityName, String submittedByName) {
        return new SubmissionBatchListItem(batch.getId(), batch.getSubmissionNo(), batch.getFacilityId(),
                facilityName, bookingCount, batch.getSubmittedAt(), submittedByName, batch.getMemo(),
                batch.isCancelled(), batch.getCancelledAt());
    }

    private Map<Long, Long> bookingCounts(List<FacilitySubmissionBatch> batches) {
        if (batches.isEmpty()) {
            return Map.of();
        }
        return itemRepository.countByBatchIdIn(batches.stream().map(FacilitySubmissionBatch::getId).toList())
                .stream()
                .collect(Collectors.toMap(
                        FacilitySubmissionItemRepository.BatchItemCountProjection::getBatchId,
                        FacilitySubmissionItemRepository.BatchItemCountProjection::getBookingCount));
    }

    private Map<Long, String> facilityNames(List<FacilitySubmissionBatch> batches) {
        List<Long> facilityIds = batches.stream().map(FacilitySubmissionBatch::getFacilityId).distinct().toList();
        return facilityRepository.findAllById(facilityIds).stream()
                .collect(Collectors.toMap(Facility::getId, Facility::getRoomName));
    }

    private Map<Long, String> submitterNames(List<FacilitySubmissionBatch> batches) {
        List<Long> submitterIds = batches.stream().map(FacilitySubmissionBatch::getSubmittedById).distinct().toList();
        return userRepository.findAllById(submitterIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));
    }
```

(import 추가: `Facility`, `FacilityRepository`, `FacilitySubmissionBatch`, `FacilitySubmissionItem`, `FacilitySubmissionAudit`, `SubmissionAuditAction`, `FacilitySubmissionAuditRepository`, `FacilitySubmissionBatchRepository`, `SubmissionActorContext`, `SubmissionBatchDetailResult`, `SubmissionBatchListItem`, `Page`, `Pageable`)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests GeneralFacilitySubmissionHistoryQueryIntegrationTest --tests GeneralFacilitySubmissionQueryServiceIntegrationTest`
Expected: PASS (10/10 — Task 4 테스트 회귀 포함)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 제출 이력·Batch 상세 조회와 조회 감사 구현"
```

---

### Task 6: Export 계층 (SubmissionExportService + CSV Writer)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/ExportFormat.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/ExportFile.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/SubmissionExportRow.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/SubmissionExportData.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/SubmissionExportDataAssembler.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/CsvSubmissionWriter.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/SubmissionExportService.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/service/export/GeneralSubmissionExportService.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/export/CsvSubmissionWriterTest.java` (순수 유닛)
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/service/export/SubmissionExportServiceIntegrationTest.java`

**Interfaces:**
- Consumes: Task 1 리포지토리, Task 3 `SubmissionActorContext`
- Produces: `SubmissionExportService.export(Long batchId, ExportFormat format, SubmissionActorContext actor) → ExportFile(String fileName, String contentType, byte[] content)` — Task 7 CSV 엔드포인트가 사용. **확장 계약(스펙 §6): 새 포맷 = Writer 1개 + ExportFormat 값 추가, Service·Assembler 무변경.**

- [ ] **Step 1: 실패하는 CSV Writer 유닛 테스트 작성**

```java
package com.duing.domain.facilitysubmission.service.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CsvSubmissionWriterTest {

    private final CsvSubmissionWriter csvWriter = new CsvSubmissionWriter();

    /** 다음 주 월요일 — 상대 날짜(타임밤 금지) + 요일 한글 검증을 결정적으로 만든다. */
    private static final LocalDate NEXT_MONDAY =
            LocalDate.now().plusDays(8 - LocalDate.now().getDayOfWeek().getValue());

    private SubmissionExportData exportData(SubmissionExportRow... rows) {
        return new SubmissionExportData("SUB-20260801-001", "학생회관 강당", "8월 1차",
                "facility-submission-SUB-20260801-001.csv", List.of(rows));
    }

    private SubmissionExportRow row(String clubName, String purpose) {
        return new SubmissionExportRow(NEXT_MONDAY, LocalTime.of(18, 0), LocalTime.of(21, 0),
                clubName, "홍길동", "010-1234-5678", 30, purpose, "관리자",
                LocalDateTime.of(NEXT_MONDAY.minusDays(3), LocalTime.of(10, 30)));
    }

    @Test
    @DisplayName("CSV 는 UTF-8 BOM 으로 시작하고 CRLF 로 줄을 끝내며 14개 컬럼 헤더를 가진다")
    void bomCrlfAndHeaderColumns() {
        byte[] csvBytes = csvWriter.write(exportData(row("합주부", "정기 합주")));

        assertThat(Arrays.copyOfRange(csvBytes, 0, 3))
                .containsExactly((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        String csvText = new String(csvBytes, 3, csvBytes.length - 3, StandardCharsets.UTF_8);
        String[] lines = csvText.split("\r\n");
        assertThat(lines).hasSize(2);
        assertThat(lines[0].split(",", -1)).containsExactly(
                "제출번호", "시설명", "예약일", "요일", "예약 시작시간", "예약 종료시간",
                "동아리명", "신청자", "연락처", "사용인원", "사용목적", "승인자", "승인일시", "비고");
    }

    @Test
    @DisplayName("본문 행에 제출번호·시설명·한글 요일·승인일시가 채워진다")
    void bodyRowContainsDerivedFields() {
        byte[] csvBytes = csvWriter.write(exportData(row("합주부", "정기 합주")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).startsWith("SUB-20260801-001,학생회관 강당,");
        assertThat(bodyLine).contains(",월,");
        assertThat(bodyLine).contains("18:00,21:00");
        assertThat(bodyLine).endsWith(",8월 1차");
    }

    @Test
    @DisplayName("쉼표·따옴표가 든 값은 인용되고 따옴표는 이중으로 이스케이프된다")
    void commaAndQuoteAreEscaped() {
        byte[] csvBytes = csvWriter.write(exportData(row("합주,부", "말 그대로 \"연습\"")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).contains("\"합주,부\"");
        assertThat(bodyLine).contains("\"말 그대로 \"\"연습\"\"\"");
    }

    @Test
    @DisplayName("수식 선행 문자(= + - @)로 시작하는 값은 작은따옴표가 전치된다")
    void formulaInjectionIsNeutralized() {
        byte[] csvBytes = csvWriter.write(exportData(row("=SUM(A1:A9)", "@행사")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).contains("'=SUM(A1:A9)");
        assertThat(bodyLine).contains("'@행사");
    }

    @Test
    @DisplayName("null 값(인원·메모 등)은 빈 문자열로 출력된다")
    void nullValuesBecomeEmptyCells() {
        SubmissionExportData dataWithNulls = new SubmissionExportData("SUB-20260801-002", "체육관", null,
                "facility-submission-SUB-20260801-002.csv",
                List.of(new SubmissionExportRow(NEXT_MONDAY, LocalTime.of(9, 0), LocalTime.of(10, 0),
                        "농구부", "김철수", null, null, "연습", null, null)));

        String bodyLine = new String(csvWriter.write(dataWithNulls), StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine.split(",", -1)).hasSize(14);
        assertThat(bodyLine).endsWith(",,");
    }
}
```

- [ ] **Step 2: 실패하는 ExportService 통합 테스트 작성**

픽스처 헬퍼는 Task 3 패턴 복제(admin/applicant/club/facility + `approvedBooking(int)`).

```java
package com.duing.domain.facilitysubmission.service.export;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.service.FacilitySubmissionService;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SubmissionExportServiceIntegrationTest extends IntegrationTestBase {

    @Autowired SubmissionExportService exportService;
    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionAuditRepository auditRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private User applicant;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUpFixture() {
        admin = userRepository.save(UserFixture.admin());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("내보내기동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private SubmissionActorContext actor() {
        return new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
    }

    private FacilityBooking approvedBooking(int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    @Test
    @DisplayName("CSV Export 는 Batch 파일명·본문을 반환하고 다운로드 감사를 남긴다")
    void csvExportReturnsFileAndRecordsAudit() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), "비고 메모"), actor());

        ExportFile exportFile = exportService.export(created.batchId(), ExportFormat.CSV, actor());

        assertThat(exportFile.fileName()).isEqualTo(created.csvFileName());
        assertThat(exportFile.contentType()).isEqualTo("text/csv;charset=UTF-8");
        String csvText = new String(exportFile.content(), StandardCharsets.UTF_8);
        assertThat(csvText).contains(created.submissionNo());
        assertThat(csvText).contains(club.getName());
        assertThat(csvText).contains(applicant.getName());
        assertThat(csvText).contains("비고 메모");
        assertThat(auditRepository.findByBatchIdOrderByIdAsc(created.batchId()))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.CSV_DOWNLOADED);
    }

    @Test
    @DisplayName("취소된 Batch 도 이력 확인용 CSV 재다운로드가 가능하다")
    void cancelledBatchStillExports() {
        FacilityBooking booking = approvedBooking(9);
        CreateSubmissionBatchResult created = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(booking.getId()), null), actor());
        submissionService.cancel(created.batchId(), actor());

        ExportFile exportFile = exportService.export(created.batchId(), ExportFormat.CSV, actor());

        assertThat(exportFile.content()).isNotEmpty();
    }

    @Test
    @DisplayName("존재하지 않는 Batch Export 는 404 예외가 발생한다")
    void unknownBatchExportThrowsNotFound() {
        assertThatThrownBy(() -> exportService.export(999_999L, ExportFormat.CSV, actor()))
                .isInstanceOf(FacilitySubmissionException.BatchNotFoundException.class);
    }
}
```

- [ ] **Step 3: 실패 확인**

Run: `cd backend && ./gradlew test --tests CsvSubmissionWriterTest --tests SubmissionExportServiceIntegrationTest`
Expected: 컴파일 실패

- [ ] **Step 4: Export 계층 구현**

`ExportFormat.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

/** Export 포맷(스펙 §6) — 새 포맷은 값 추가 + Writer 1개로 수용한다(HWP·PDF Future). */
public enum ExportFormat {
    CSV
}
```

`ExportFile.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

public record ExportFile(String fileName, String contentType, byte[] content) {
}
```

`SubmissionExportRow.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record SubmissionExportRow(
        LocalDate reservationDate,
        LocalTime startTime,
        LocalTime endTime,
        String clubName,
        String applicantName,
        String contactPhone,
        Integer attendeeCount,
        String purpose,
        String deciderName,
        LocalDateTime decidedAt
) {
}
```

`SubmissionExportData.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

import java.util.List;

/** 포맷 중립 제출 데이터(스펙 §6) — Writer 는 이 데이터만 소비하므로 포맷 추가 시 Assembler 무변경. */
public record SubmissionExportData(
        String submissionNo,
        String facilityName,
        String memo,
        String csvFileName,
        List<SubmissionExportRow> rows
) {
}
```

`SubmissionExportDataAssembler.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionItem;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Batch(취소 포함)·소속 예약·이름들을 모아 포맷 중립 데이터로 조립한다(스펙 §6). */
@Component
@RequiredArgsConstructor
public class SubmissionExportDataAssembler {

    private final FacilitySubmissionBatchRepository batchRepository;
    private final FacilitySubmissionItemRepository itemRepository;
    private final FacilityBookingRepository bookingRepository;
    private final FacilityRepository facilityRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    public SubmissionExportData assemble(Long batchId) {
        FacilitySubmissionBatch batch = batchRepository.findById(batchId)
                .orElseThrow(FacilitySubmissionException.BatchNotFoundException::new);
        String facilityName = facilityRepository.findById(batch.getFacilityId())
                .map(Facility::getRoomName)
                .orElse(null);
        List<Long> bookingIds = itemRepository.findByBatchIdOrderByIdAsc(batchId).stream()
                .map(FacilitySubmissionItem::getBookingId)
                .toList();
        List<FacilityBooking> bookings = bookingRepository.findAllById(bookingIds).stream()
                .sorted(Comparator.comparing(FacilityBooking::getReservationDate)
                        .thenComparing(FacilityBooking::getStartTime)
                        .thenComparing(FacilityBooking::getId))
                .toList();
        Map<Long, String> clubNames = clubRepository.findAllById(
                        bookings.stream().map(FacilityBooking::getClubId).distinct().toList()).stream()
                .collect(Collectors.toMap(Club::getId, Club::getName));
        Map<Long, String> userNames = userRepository.findAllById(bookings.stream()
                        .flatMap(booking -> Stream.of(booking.getApplicantId(), booking.getDecidedById()))
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName));

        List<SubmissionExportRow> rows = bookings.stream()
                .map(booking -> new SubmissionExportRow(
                        booking.getReservationDate(), booking.getStartTime(), booking.getEndTime(),
                        clubNames.get(booking.getClubId()), userNames.get(booking.getApplicantId()),
                        blankToNull(booking.getContactPhone()), booking.getAttendeeCount(),
                        booking.getPurpose(),
                        booking.getDecidedById() != null ? userNames.get(booking.getDecidedById()) : null,
                        booking.getDecidedAt()))
                .toList();
        return new SubmissionExportData(batch.getSubmissionNo(), facilityName, batch.getMemo(),
                batch.getCsvFileName(), rows);
    }

    private String blankToNull(String text) {
        return (text == null || text.isBlank()) ? null : text;
    }
}
```

`CsvSubmissionWriter.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.Locale;
import org.springframework.stereotype.Component;

/** 첫 번째 Export Writer(스펙 §6) — Excel 호환 CSV: UTF-8 BOM + CRLF + 수식 인젝션 방지. */
@Component
public class CsvSubmissionWriter {

    private static final byte[] UTF8_BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final String[] HEADER = {"제출번호", "시설명", "예약일", "요일", "예약 시작시간", "예약 종료시간",
            "동아리명", "신청자", "연락처", "사용인원", "사용목적", "승인자", "승인일시", "비고"};
    private static final DateTimeFormatter DATE_TIME_PATTERN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public byte[] write(SubmissionExportData exportData) {
        StringBuilder csv = new StringBuilder();
        appendRow(csv, HEADER);
        for (SubmissionExportRow row : exportData.rows()) {
            appendRow(csv, new String[] {
                    exportData.submissionNo(),
                    exportData.facilityName(),
                    row.reservationDate().toString(),
                    row.reservationDate().getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.KOREAN),
                    row.startTime().toString(),
                    row.endTime().toString(),
                    row.clubName(),
                    row.applicantName(),
                    row.contactPhone(),
                    row.attendeeCount() != null ? String.valueOf(row.attendeeCount()) : "",
                    row.purpose(),
                    row.deciderName(),
                    row.decidedAt() != null ? DATE_TIME_PATTERN.format(row.decidedAt()) : "",
                    exportData.memo()});
        }
        byte[] body = csv.toString().getBytes(StandardCharsets.UTF_8);
        byte[] withBom = new byte[UTF8_BOM.length + body.length];
        System.arraycopy(UTF8_BOM, 0, withBom, 0, UTF8_BOM.length);
        System.arraycopy(body, 0, withBom, UTF8_BOM.length, body.length);
        return withBom;
    }

    private void appendRow(StringBuilder csv, String[] cells) {
        for (int cellIndex = 0; cellIndex < cells.length; cellIndex++) {
            if (cellIndex > 0) {
                csv.append(',');
            }
            csv.append(escape(guardFormula(cells[cellIndex])));
        }
        csv.append("\r\n");
    }

    /** Excel 수식 인젝션 방지 — 위험 선행 문자에 작은따옴표를 전치한다(멤버 CSV 와 동일 규칙). */
    private String guardFormula(String cell) {
        if (cell == null || cell.isEmpty()) {
            return cell;
        }
        char firstChar = cell.charAt(0);
        if (firstChar == '=' || firstChar == '+' || firstChar == '-' || firstChar == '@' || firstChar == '\t') {
            return "'" + cell;
        }
        return cell;
    }

    private String escape(String cell) {
        if (cell == null) {
            return "";
        }
        if (cell.contains(",") || cell.contains("\"") || cell.contains("\n") || cell.contains("\r")) {
            return '"' + cell.replace("\"", "\"\"") + '"';
        }
        return cell;
    }
}
```

`SubmissionExportService.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;

public interface SubmissionExportService {

    ExportFile export(Long batchId, ExportFormat format, SubmissionActorContext actor);
}
```

`GeneralSubmissionExportService.java`:

```java
package com.duing.domain.facilitysubmission.service.export;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GeneralSubmissionExportService implements SubmissionExportService {

    private final SubmissionExportDataAssembler exportDataAssembler;
    private final CsvSubmissionWriter csvWriter;
    private final FacilitySubmissionAuditRepository auditRepository;

    // 다운로드 감사 기록이 포함된 조회 — readOnly 금지(전역 제약).
    @Override
    @Transactional
    public ExportFile export(Long batchId, ExportFormat format, SubmissionActorContext actor) {
        SubmissionExportData exportData = exportDataAssembler.assemble(batchId);
        byte[] content = switch (format) {
            case CSV -> csvWriter.write(exportData);
        };
        auditRepository.save(FacilitySubmissionAudit.of(batchId, SubmissionAuditAction.CSV_DOWNLOADED,
                actor.adminId(), actor.ipAddress(), actor.userAgent()));
        return new ExportFile(exportData.csvFileName(), "text/csv;charset=UTF-8", content);
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests CsvSubmissionWriterTest --tests SubmissionExportServiceIntegrationTest`
Expected: PASS (8/8)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 학교 제출 Export 계층·Excel 호환 CSV 구현"
```

---

### Task 7: API 인터페이스 + Controller + 요청/응답 DTO + 인수 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/api/AdminFacilitySubmissionApi.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionController.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/request/CreateSubmissionBatchRequest.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionCandidatesResponse.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/CreateSubmissionBatchResponse.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionBatchSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/facilitysubmission/controller/dto/response/SubmissionBatchDetailResponse.java`
- Test: `backend/src/test/java/com/duing/domain/facilitysubmission/controller/AdminFacilitySubmissionAcceptanceTest.java`

**Interfaces:**
- Consumes: Task 3 `FacilitySubmissionService`, Task 4·5 `FacilitySubmissionQueryService`, Task 6 `SubmissionExportService`
- Produces: HTTP API 6종 (`/api/v1/admin/facility-bookings/submission[...]`) — PR-2 FE 가 소비하는 최종 계약

**⚠️ 라우팅 주의:** 기존 `GET /admin/facility-bookings/{bookingId}` (Long 템플릿) 과 `/admin/facility-bookings/submission` (리터럴) 은 다른 컨트롤러지만 Spring MVC 는 리터럴 우선 매칭한다 — `/summary` 선례 있음. 같은 원리로 `/submission/candidates` (리터럴) 이 `/submission/{batchId}` 보다 우선. 인수 테스트로 둘 다 고정한다.

- [ ] **Step 1: 실패하는 인수 테스트 작성**

ADMIN/STUDENT 토큰 발급은 `AdminFacilityBookingAcceptanceTest` 의 헬퍼 방식을 그대로 따른다.

```java
package com.duing.domain.facilitysubmission.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.SubmissionAuditAction;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionAudit;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionAuditRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFacilitySubmissionAcceptanceTest extends IntegrationTestBase {

    private static final String SUBMISSION_PATH = "/api/v1/admin/facility-bookings/submission";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired FacilitySubmissionAuditRepository auditRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime() % 1_000_000);

    private User admin;
    private String adminToken;
    private String studentToken;
    private User applicant;
    private Club club;
    private Facility facility;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        admin = userRepository.save(UserFixture.admin());
        User student = userRepository.save(UserFixture.unique());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
        applicant = userRepository.save(UserFixture.unique());
        club = clubRepository.save(Club.create("인수동아리-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null));
        facility = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 100_000), "커뮤니티룸(1)", "1503호", 0));
    }

    private FacilityBooking approvedBooking(int startHour) {
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0),
                "정기 합주", 20, FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        return bookingRepository.save(booking);
    }

    private String candidatesPath() {
        LocalDate baseDate = LocalDate.now().plusDays(7);
        return SUBMISSION_PATH + "/candidates?facilityId=" + facility.getId()
                + "&startDate=" + baseDate.minusDays(1) + "&endDate=" + baseDate.plusDays(1);
    }

    @Test
    @DisplayName("익명·일반 사용자 요청은 각각 401·403 이다")
    void anonymousIs401AndStudentIs403() {
        RestAssured.given()
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("submission 경로가 예약 상세 템플릿에 삼켜지지 않고 이력 200 을 반환한다")
    void submissionPathIsNotSwallowedByBookingDetailTemplate() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", notNullValue());
    }

    @Test
    @DisplayName("candidates 경로가 batchId 템플릿에 삼켜지지 않고 summary·bookings 를 반환한다")
    void candidatesPathIsNotSwallowedByBatchIdTemplate() {
        approvedBooking(9);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(candidatesPath())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.summary.awaitingCount", equalTo(1))
                .body("data.bookings[0].selectable", is(true))
                .body("data.bookings[0].clubName", equalTo(club.getName()));
    }

    @Test
    @DisplayName("생성→CSV 다운로드→상세→취소→재취소가 전 구간 계약대로 동작한다")
    void createDownloadDetailCancelFlow() {
        FacilityBooking booking = approvedBooking(9);

        Integer batchId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of(booking.getId()), "memo", "8월 1차"))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.submissionNo", notNullValue())
                .body("data.csvFileName", notNullValue())
                .extract().path("data.batchId");

        byte[] csvBytes = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId + "/csv")
                .then().statusCode(HttpStatus.OK.value())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.containsString("attachment; filename*=UTF-8''"))
                .extract().asByteArray();
        Assertions.assertThat(csvBytes.length).isGreaterThanOrEqualTo(3);
        Assertions.assertThat(csvBytes[0]).isEqualTo((byte) 0xEF);
        Assertions.assertThat(csvBytes[1]).isEqualTo((byte) 0xBB);
        Assertions.assertThat(csvBytes[2]).isEqualTo((byte) 0xBF);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.batch.bookingCount", equalTo(1))
                .body("data.bookings[0].bookingId", equalTo(booking.getId().intValue()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/" + batchId)
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 목록 조회는 감사 대상이 아니다 — 아래 containsExactly 가 이 호출의 미기록까지 증명한다
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.OK.value());

        // 감사 4종이 순서대로만 남는다: CREATED → CSV_DOWNLOADED → VIEWED → CANCELLED (목록 조회 미기록)
        Assertions.assertThat(auditRepository.findByBatchIdOrderByIdAsc(batchId.longValue()))
                .extracting(FacilitySubmissionAudit::getAction)
                .containsExactly(SubmissionAuditAction.CREATED, SubmissionAuditAction.CSV_DOWNLOADED,
                        SubmissionAuditAction.VIEWED, SubmissionAuditAction.CANCELLED);
        Assertions.assertThat(auditRepository.findByBatchIdOrderByIdAsc(batchId.longValue()).get(0).getIpAddress())
                .isNotBlank();
    }

    @Test
    @DisplayName("빈 bookingIds 로 생성하면 400 검증 오류가 발생한다")
    void emptyBookingIdsReturns400() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("bookingIds", List.of()))
                .when().post(SUBMISSION_PATH)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("존재하지 않는 Batch 상세·CSV·취소는 404 를 반환한다")
    void unknownBatchReturns404() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(SUBMISSION_PATH + "/999999/csv")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().delete(SUBMISSION_PATH + "/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && ./gradlew test --tests AdminFacilitySubmissionAcceptanceTest`
Expected: 컴파일 실패 (API·DTO 미존재)

- [ ] **Step 3: 요청/응답 DTO 작성**

`CreateSubmissionBatchRequest.java`:

```java
package com.duing.domain.facilitysubmission.controller.dto.request;

import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CreateSubmissionBatchRequest(
        @NotEmpty(message = "제출할 예약을 선택해주세요.")
        List<Long> bookingIds,
        @Size(max = 500, message = "메모는 500자 이하로 입력해주세요.")
        String memo
) {
    public CreateSubmissionBatchCommand toCommand() {
        return new CreateSubmissionBatchCommand(bookingIds, memo);
    }
}
```

`SubmissionCandidatesResponse.java`:

```java
package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public record SubmissionCandidatesResponse(Summary summary, List<Booking> bookings) {

    public record Summary(long approvedCount, long awaitingCount, long submittedCount, long confirmedCount) {
    }

    public record Booking(
            Long bookingId,
            Long clubId,
            String clubName,
            String applicantName,
            String contactPhone,
            LocalDate reservationDate,
            LocalTime startTime,
            LocalTime endTime,
            String purpose,
            Integer attendeeCount,
            BookingStatus status,
            boolean submitted,
            boolean selectable,
            String submissionNo,
            String decidedByName,
            LocalDateTime decidedAt
    ) {
        public static Booking from(SubmissionCandidateBooking candidate) {
            return new Booking(candidate.bookingId(), candidate.clubId(), candidate.clubName(),
                    candidate.applicantName(), candidate.contactPhone(), candidate.reservationDate(),
                    candidate.startTime(), candidate.endTime(), candidate.purpose(), candidate.attendeeCount(),
                    candidate.status(), candidate.submitted(), candidate.selectable(), candidate.submissionNo(),
                    candidate.decidedByName(), candidate.decidedAt());
        }
    }

    public static SubmissionCandidatesResponse from(SubmissionCandidatesResult result) {
        return new SubmissionCandidatesResponse(
                new Summary(result.summary().approvedCount(), result.summary().awaitingCount(),
                        result.summary().submittedCount(), result.summary().confirmedCount()),
                result.bookings().stream().map(Booking::from).toList());
    }
}
```

`CreateSubmissionBatchResponse.java`:

```java
package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.CreateSubmissionBatchResult;

public record CreateSubmissionBatchResponse(Long batchId, String submissionNo, String csvFileName) {

    public static CreateSubmissionBatchResponse from(CreateSubmissionBatchResult result) {
        return new CreateSubmissionBatchResponse(result.batchId(), result.submissionNo(), result.csvFileName());
    }
}
```

`SubmissionBatchSummaryResponse.java`:

```java
package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchListItem;
import java.time.LocalDateTime;

public record SubmissionBatchSummaryResponse(
        Long batchId,
        String submissionNo,
        Long facilityId,
        String facilityName,
        long bookingCount,
        LocalDateTime submittedAt,
        String submittedByName,
        String memo,
        boolean cancelled,
        LocalDateTime cancelledAt
) {
    public static SubmissionBatchSummaryResponse from(SubmissionBatchListItem listItem) {
        return new SubmissionBatchSummaryResponse(listItem.batchId(), listItem.submissionNo(),
                listItem.facilityId(), listItem.facilityName(), listItem.bookingCount(), listItem.submittedAt(),
                listItem.submittedByName(), listItem.memo(), listItem.cancelled(), listItem.cancelledAt());
    }
}
```

`SubmissionBatchDetailResponse.java`:

```java
package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitysubmission.service.dto.query.SubmissionBatchDetailResult;
import java.util.List;

public record SubmissionBatchDetailResponse(
        SubmissionBatchSummaryResponse batch,
        List<SubmissionCandidatesResponse.Booking> bookings
) {
    public static SubmissionBatchDetailResponse from(SubmissionBatchDetailResult detailResult) {
        return new SubmissionBatchDetailResponse(
                SubmissionBatchSummaryResponse.from(detailResult.batch()),
                detailResult.bookings().stream().map(SubmissionCandidatesResponse.Booking::from).toList());
    }
}
```

- [ ] **Step 4: API 인터페이스 + Controller 작성**

`AdminFacilitySubmissionApi.java`:

```java
package com.duing.domain.facilitysubmission.api;

import com.duing.domain.facilitysubmission.controller.dto.request.CreateSubmissionBatchRequest;
import com.duing.domain.facilitysubmission.controller.dto.response.CreateSubmissionBatchResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchDetailResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchSummaryResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionCandidatesResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 대관 학교 제출(총동연)", description = "APPROVED 예약의 학교 제출 Batch 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilitySubmissionApi {

    @Operation(summary = "제출 대상 조회", description = "기간 내 전체 예약(REJECTED 제외) + submitted/selectable 파생 + Summary 4종. 기간 최대 31일.")
    @GetMapping("/admin/facility-bookings/submission/candidates")
    ResponseEntity<ApiResponse<SubmissionCandidatesResponse>> getCandidates(
            @Parameter(description = "시설(필수)") @RequestParam Long facilityId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @Parameter(description = "동아리 필터") @RequestParam(required = false) Long clubId);

    @Operation(summary = "제출 Batch 생성", description = "all-or-nothing — 미APPROVED·기제출 예약이 섞이면 409 로 전체 거부.")
    @PostMapping("/admin/facility-bookings/submission")
    ResponseEntity<ApiResponse<CreateSubmissionBatchResponse>> create(
            @Valid @RequestBody CreateSubmissionBatchRequest createSubmissionBatchRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "제출 이력", description = "취소된 Batch 포함 최신순 페이지네이션.")
    @GetMapping("/admin/facility-bookings/submission")
    ResponseEntity<ApiResponse<PageResponse<SubmissionBatchSummaryResponse>>> getBatches(
            @Parameter(description = "시설 필터") @RequestParam(required = false) Long facilityId,
            @Parameter(hidden = true) Pageable pageable);

    @Operation(summary = "Batch 상세", description = "취소된 Batch 도 조회 가능. 조회 감사(VIEWED)를 남긴다.")
    @GetMapping("/admin/facility-bookings/submission/{batchId}")
    ResponseEntity<ApiResponse<SubmissionBatchDetailResponse>> getDetail(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "CSV 다운로드", description = "UTF-8 BOM Excel 호환. 취소된 Batch 도 이력 확인용 재다운로드 허용.")
    @GetMapping("/admin/facility-bookings/submission/{batchId}/csv")
    ResponseEntity<byte[]> downloadCsv(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);

    @Operation(summary = "제출 취소", description = "cancelled 상태 전환(완전 삭제 없음). 기취소 409.")
    @DeleteMapping("/admin/facility-bookings/submission/{batchId}")
    ResponseEntity<ApiResponse<Void>> cancel(@PathVariable Long batchId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser,
            @Parameter(hidden = true) HttpServletRequest httpServletRequest);
}
```

`AdminFacilitySubmissionController.java`:

```java
package com.duing.domain.facilitysubmission.controller;

import com.duing.domain.facilitysubmission.api.AdminFacilitySubmissionApi;
import com.duing.domain.facilitysubmission.controller.dto.request.CreateSubmissionBatchRequest;
import com.duing.domain.facilitysubmission.controller.dto.response.CreateSubmissionBatchResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchDetailResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionBatchSummaryResponse;
import com.duing.domain.facilitysubmission.controller.dto.response.SubmissionCandidatesResponse;
import com.duing.domain.facilitysubmission.service.FacilitySubmissionQueryService;
import com.duing.domain.facilitysubmission.service.FacilitySubmissionService;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesQuery;
import com.duing.domain.facilitysubmission.service.export.ExportFile;
import com.duing.domain.facilitysubmission.service.export.ExportFormat;
import com.duing.domain.facilitysubmission.service.export.SubmissionExportService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFacilitySubmissionController implements AdminFacilitySubmissionApi {

    private final FacilitySubmissionService submissionService;
    private final FacilitySubmissionQueryService queryService;
    private final SubmissionExportService exportService;

    @Override
    public ResponseEntity<ApiResponse<SubmissionCandidatesResponse>> getCandidates(
            Long facilityId, LocalDate startDate, LocalDate endDate, Long clubId) {
        return ResponseEntity.ok(ApiResponse.success(SubmissionCandidatesResponse.from(
                queryService.getCandidates(new SubmissionCandidatesQuery(facilityId, startDate, endDate, clubId)))));
    }

    @Override
    public ResponseEntity<ApiResponse<CreateSubmissionBatchResponse>> create(
            @Valid @RequestBody CreateSubmissionBatchRequest createSubmissionBatchRequest,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                CreateSubmissionBatchResponse.from(submissionService.create(
                        createSubmissionBatchRequest.toCommand(),
                        actorFrom(currentUser, httpServletRequest)))));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<SubmissionBatchSummaryResponse>>> getBatches(
            Long facilityId, Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                queryService.getBatches(facilityId, pageable).map(SubmissionBatchSummaryResponse::from))));
    }

    @Override
    public ResponseEntity<ApiResponse<SubmissionBatchDetailResponse>> getDetail(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return ResponseEntity.ok(ApiResponse.success(SubmissionBatchDetailResponse.from(
                queryService.getDetail(batchId, actorFrom(currentUser, httpServletRequest)))));
    }

    @Override
    public ResponseEntity<byte[]> downloadCsv(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        ExportFile exportFile = exportService.export(batchId, ExportFormat.CSV,
                actorFrom(currentUser, httpServletRequest));
        // RFC 5987 filename* — 한글 파일명 대비 percent-encoding(첨부 다운로드 선례와 동일).
        String encodedFileName =
                URLEncoder.encode(exportFile.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(exportFile.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedFileName)
                .header("X-Content-Type-Options", "nosniff")
                .body(exportFile.content());
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancel(Long batchId,
            @AuthenticationPrincipal UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        submissionService.cancel(batchId, actorFrom(currentUser, httpServletRequest));
        return ResponseEntity.noContent().build();
    }

    private SubmissionActorContext actorFrom(UserPrincipal currentUser, HttpServletRequest httpServletRequest) {
        return new SubmissionActorContext(currentUser.id(),
                httpServletRequest.getRemoteAddr(), httpServletRequest.getHeader("User-Agent"));
    }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests AdminFacilitySubmissionAcceptanceTest`
Expected: PASS (6/6)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/facilitysubmission/ \
  backend/src/test/java/com/duing/domain/facilitysubmission/
git commit -m "feat(backend): 학교 제출 관리자 API 6종 구현"
```

---

### Task 8: 전체 스위트 검증 + 마무리

**Files:** 신규 없음 (필요 시 회귀 수정만)

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL, 실패 0 — 출력에서 `BUILD SUCCESSFUL` 문자열을 직접 확인한다(`| tail` 금지). 기존 스위트 회귀(특히 facilitybooking 도메인·IntegrationTestBase 변경 영향)가 없어야 한다.

- [ ] **Step 2: 마무리 self-check**

아래를 확인하고, 위반이 있으면 수정 후 해당 태스크 테스트를 재실행한다:

1. 기존 Flyway 파일 수정 없음 (`git diff develop --name-only` 에 기존 마이그레이션 미포함)
2. `FacilityBooking` 변경이 `findAllByIdForUpdate` 추가뿐인지
3. 스펙 §5 API 계약(경로·상태코드·응답 형태)과 구현 일치
4. Audit 4 이벤트 외 기록 없음(목록 조회 미기록 테스트 존재)
5. 시크릿·절대 미래 날짜 하드코딩 없음
6. 커밋 메시지 전부 Conventional Commits 한국어, Claude 서명 없음

- [ ] **Step 3: 커밋 (수정 발생 시에만)**

```bash
git add -A && git commit -m "test(backend): 학교 제출 전체 스위트 회귀 정리"
```

**완료 후:** push·PR 생성은 하지 않는다 — 컨트롤러(메인 세션)가 최종 리뷰 뒤 사용자 지시로 진행한다.
