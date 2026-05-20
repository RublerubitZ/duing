# 신고/제재(Report) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Club / Recruitment 을 대상으로 한 사용자 신고 접수 + ADMIN 처리(상태 변경) API 를 백엔드에 추가한다.

**Architecture:** 신규 `report` 도메인을 `com.duing.domain.report` 패키지에 추가하고, 다형 대상은 `(targetType enum, targetId)` 단일 테이블로 모델링한다. 처리 자체는 상태 머신(`PENDING → RESOLVED|DISMISSED`)만 관리하고 실제 제재 액션은 기존 ADMIN API(Club status 변경 등)를 재사용한다. 권한 검증은 기존 `ClubAuthService` / `@PreAuthorize("hasRole('ADMIN')")` 패턴을 따른다.

**Tech Stack:** Spring Boot 3.4, Java 21, JPA + QueryDSL, Flyway (Postgres), TestContainers + RestAssured, Fixture Monkey.

**Spec:** `docs/superpowers/specs/2026-05-20-report-moderation-design.md`

**Branch:** `feat/report-moderation` (`develop` 에서 분기)

---

## File Structure

신규 파일 (모두 `backend/src/main/java/com/duing/domain/report/` 아래):

```
report/
├── api/
│   ├── ReportApi.java                     # POST /reports (사용자)
│   └── AdminReportApi.java                # /admin/reports/** (ADMIN)
├── controller/
│   ├── ReportController.java
│   ├── AdminReportController.java
│   └── dto/
│       ├── request/
│       │   ├── CreateReportRequest.java
│       │   └── ProcessReportRequest.java
│       └── response/
│           ├── ReportSummaryResponse.java
│           └── ReportDetailResponse.java
├── entity/
│   ├── Report.java
│   ├── ReportTargetType.java              # CLUB, RECRUITMENT
│   ├── ReportReasonCode.java              # SPAM, FRAUD, INAPPROPRIATE, IMPERSONATION, OTHER
│   └── ReportStatus.java                  # PENDING, RESOLVED, DISMISSED
├── exception/
│   └── ReportException.java
├── repository/
│   ├── ReportRepository.java
│   ├── ReportRepositoryCustom.java
│   └── ReportRepositoryImpl.java          # QueryDSL: ADMIN 목록 동적 필터
└── service/
    ├── ReportService.java                 # interface
    ├── GeneralReportService.java          # impl
    └── dto/
        ├── command/
        │   ├── CreateReportCommand.java
        │   └── ProcessReportCommand.java
        └── query/
            └── ReportAdminSearchCondition.java
```

Flyway:
- `backend/src/main/resources/db/migration/V27__create_report.sql`

테스트:
- `backend/src/test/java/com/duing/domain/report/service/GeneralReportServiceTest.java`
- `backend/src/test/java/com/duing/domain/report/repository/ReportRepositoryImplTest.java`
- `backend/src/test/java/com/duing/domain/report/ReportAcceptanceTest.java`

---

## Task 1: Flyway 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V27__create_report.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- report: 동아리/모집공고 신고 접수 + ADMIN 처리 기록
CREATE TABLE report (
    id            BIGSERIAL    PRIMARY KEY,
    reporter_id   BIGINT       NOT NULL REFERENCES users(id),
    target_type   VARCHAR(30)  NOT NULL,
    target_id     BIGINT       NOT NULL,
    reason_code   VARCHAR(30)  NOT NULL,
    detail        TEXT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note   TEXT,
    handled_by    BIGINT       REFERENCES users(id),
    handled_at    TIMESTAMP,
    deleted_at    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_report_target_type CHECK (target_type IN ('CLUB','RECRUITMENT')),
    CONSTRAINT chk_report_reason_code CHECK (
        reason_code IN ('SPAM','FRAUD','INAPPROPRIATE','IMPERSONATION','OTHER')
    ),
    CONSTRAINT chk_report_status      CHECK (status IN ('PENDING','RESOLVED','DISMISSED')),
    CONSTRAINT chk_report_detail_len  CHECK (detail IS NULL OR char_length(detail) <= 1000),
    CONSTRAINT chk_report_action_note_len CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_report_handled_pair CHECK (
        (status = 'PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

-- 중복 신고 방지: 동일 (reporter, target) 의 PENDING 신고는 1건만
CREATE UNIQUE INDEX uq_report_active_pending
    ON report (reporter_id, target_type, target_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

-- ADMIN 목록 정렬용
CREATE INDEX idx_report_admin_feed
    ON report (status, created_at DESC)
    WHERE deleted_at IS NULL;

-- 대상별 조회용
CREATE INDEX idx_report_target
    ON report (target_type, target_id)
    WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 애플리케이션 부팅 확인**

Run: `./gradlew :backend:bootRun --args='--spring.profiles.active=local' -t` 또는 `./gradlew :backend:test --tests "com.duing.DuingApplicationTests"` (스모크)
Expected: Flyway 가 V27 을 정상 적용. `report` 테이블 생성 확인.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V27__create_report.sql
git commit -m "feat(backend): report 도메인 Flyway 마이그레이션 추가 (V27)"
```

---

## Task 2: Enum 3종 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/entity/ReportTargetType.java`
- Create: `backend/src/main/java/com/duing/domain/report/entity/ReportReasonCode.java`
- Create: `backend/src/main/java/com/duing/domain/report/entity/ReportStatus.java`

- [ ] **Step 1: ReportTargetType 작성**

```java
package com.duing.domain.report.entity;

public enum ReportTargetType {
    CLUB, RECRUITMENT
}
```

- [ ] **Step 2: ReportReasonCode 작성**

```java
package com.duing.domain.report.entity;

public enum ReportReasonCode {
    SPAM, FRAUD, INAPPROPRIATE, IMPERSONATION, OTHER
}
```

- [ ] **Step 3: ReportStatus 작성 + 종결 판정**

```java
package com.duing.domain.report.entity;

public enum ReportStatus {
    PENDING, RESOLVED, DISMISSED;

    public boolean isTerminal() {
        return this == RESOLVED || this == DISMISSED;
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/entity/
git commit -m "feat(backend): Report 도메인 enum(targetType/reasonCode/status) 정의"
```

---

## Task 3: ReportException 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/exception/ReportException.java`

- [ ] **Step 1: 예외 클래스 작성**

```java
package com.duing.domain.report.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ReportException extends ApplicationException {

    protected ReportException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ReportNotFoundException extends ReportException {
        private static final String MESSAGE = "신고를 찾을 수 없습니다.";
        public ReportNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class ReportTargetNotFoundException extends ReportException {
        private static final String MESSAGE = "신고 대상이 존재하지 않습니다.";
        public ReportTargetNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class SelfReportNotAllowedException extends ReportException {
        private static final String MESSAGE = "운영 중인 동아리/모집공고는 신고할 수 없습니다.";
        public SelfReportNotAllowedException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static class DuplicatePendingReportException extends ReportException {
        private static final String MESSAGE = "이미 처리 대기 중인 신고가 있습니다.";
        public DuplicatePendingReportException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidReportTransitionException extends ReportException {
        public InvalidReportTransitionException(String reason) {
            super("신고 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/exception/ReportException.java
git commit -m "feat(backend): ReportException 계층 정의"
```

---

## Task 4: Report 엔티티 작성 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/entity/Report.java`
- Test: `backend/src/test/java/com/duing/domain/report/entity/ReportTest.java`

- [ ] **Step 1: 엔티티 단위 테스트 작성 (실패)**

```java
package com.duing.domain.report.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.report.exception.ReportException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReportTest {

    @Test
    @DisplayName("신고 생성 시 기본 상태는 PENDING 이며 처리 정보는 비어 있다")
    void createInitializesPendingState() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.INAPPROPRIATE, "내용");
        assertThat(report.getStatus()).isEqualTo(ReportStatus.PENDING);
        assertThat(report.getHandledBy()).isNull();
        assertThat(report.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("처리 시 RESOLVED/DISMISSED 로만 전이 가능하다")
    void processTransitionsToTerminal() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.SPAM, null);
        report.process(99L, ReportStatus.RESOLVED, "조치 완료");
        assertThat(report.getStatus()).isEqualTo(ReportStatus.RESOLVED);
        assertThat(report.getHandledBy()).isEqualTo(99L);
        assertThat(report.getHandledAt()).isNotNull();
        assertThat(report.getActionNote()).isEqualTo("조치 완료");
    }

    @Test
    @DisplayName("이미 종결된 신고를 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.SPAM, null);
        report.process(99L, ReportStatus.DISMISSED, null);
        assertThatThrownBy(() -> report.process(99L, ReportStatus.RESOLVED, null))
                .isInstanceOf(ReportException.InvalidReportTransitionException.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.SPAM, null);
        assertThatThrownBy(() -> report.process(99L, ReportStatus.PENDING, null))
                .isInstanceOf(ReportException.InvalidReportTransitionException.class);
    }
}
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.report.entity.ReportTest"`
Expected: 컴파일 실패 (Report 클래스 없음).

- [ ] **Step 3: Report 엔티티 구현**

```java
package com.duing.domain.report.entity;

import com.duing.domain.report.exception.ReportException;
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
@Table(name = "report")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE report SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Report extends BaseEntity {

    @Column(name = "reporter_id", nullable = false) private Long reporterId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 30) private ReportTargetType targetType;

    @Column(name = "target_id", nullable = false) private Long targetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason_code", nullable = false, length = 30) private ReportReasonCode reasonCode;

    @Column(columnDefinition = "TEXT") private String detail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private ReportStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private Report(Long reporterId, ReportTargetType targetType, Long targetId,
                   ReportReasonCode reasonCode, String detail) {
        this.reporterId = reporterId;
        this.targetType = targetType;
        this.targetId = targetId;
        this.reasonCode = reasonCode;
        this.detail = detail;
        this.status = ReportStatus.PENDING;
    }

    public static Report create(Long reporterId, ReportTargetType targetType, Long targetId,
                                ReportReasonCode reasonCode, String detail) {
        return Report.builder()
                .reporterId(reporterId)
                .targetType(targetType)
                .targetId(targetId)
                .reasonCode(reasonCode)
                .detail(detail)
                .build();
    }

    public void process(Long handlerUserId, ReportStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == ReportStatus.PENDING) {
            throw new ReportException.InvalidReportTransitionException(
                    "처리 결과는 RESOLVED 또는 DISMISSED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new ReportException.InvalidReportTransitionException("이미 종결된 신고입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.report.entity.ReportTest"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/entity/Report.java \
        backend/src/test/java/com/duing/domain/report/entity/ReportTest.java
git commit -m "feat(backend): Report 엔티티 + 상태 전이 검증 단위 테스트"
```

---

## Task 5: Repository 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/repository/ReportRepository.java`
- Create: `backend/src/main/java/com/duing/domain/report/repository/ReportRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/report/repository/ReportRepositoryImpl.java`

- [ ] **Step 1: JpaRepository 인터페이스 작성**

```java
package com.duing.domain.report.repository;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReportRepository extends JpaRepository<Report, Long>, ReportRepositoryCustom {

    Optional<Report> findByReporterIdAndTargetTypeAndTargetIdAndStatus(
            Long reporterId, ReportTargetType targetType, Long targetId, ReportStatus status);
}
```

- [ ] **Step 2: Custom 인터페이스 + QueryDSL 구현**

```java
package com.duing.domain.report.repository;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ReportRepositoryCustom {
    Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable);
}
```

```java
package com.duing.domain.report.repository;

import com.duing.domain.report.entity.QReport;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ReportRepositoryImpl implements ReportRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable) {
        QReport r = QReport.report;
        BooleanExpression statusEq = condition.status() == null ? null : r.status.eq(condition.status());
        BooleanExpression targetEq = condition.targetType() == null ? null : r.targetType.eq(condition.targetType());

        List<Report> content = queryFactory.selectFrom(r)
                .where(statusEq, targetEq)
                .orderBy(r.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(r.count()).from(r).where(statusEq, targetEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
```

- [ ] **Step 3: 컴파일 확인 (QReport 자동 생성)**

Run: `./gradlew :backend:compileJava`
Expected: PASS. QueryDSL APT 가 `QReport` 생성.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/repository/
git commit -m "feat(backend): ReportRepository + QueryDSL 동적 필터 구현"
```

---

## Task 6: Command / Query DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/service/dto/command/CreateReportCommand.java`
- Create: `backend/src/main/java/com/duing/domain/report/service/dto/command/ProcessReportCommand.java`
- Create: `backend/src/main/java/com/duing/domain/report/service/dto/query/ReportAdminSearchCondition.java`

- [ ] **Step 1: 세 record 작성**

```java
package com.duing.domain.report.service.dto.command;

import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportTargetType;

public record CreateReportCommand(
        Long reporterId,
        ReportTargetType targetType,
        Long targetId,
        ReportReasonCode reasonCode,
        String detail
) {}
```

```java
package com.duing.domain.report.service.dto.command;

import com.duing.domain.report.entity.ReportStatus;

public record ProcessReportCommand(
        Long reportId,
        Long handlerUserId,
        ReportStatus status,
        String actionNote
) {}
```

```java
package com.duing.domain.report.service.dto.query;

import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;

public record ReportAdminSearchCondition(
        ReportStatus status,
        ReportTargetType targetType
) {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/service/dto/
git commit -m "feat(backend): Report Command/Query DTO 정의"
```

---

## Task 7: ReportService + 구현체 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/service/ReportService.java`
- Create: `backend/src/main/java/com/duing/domain/report/service/GeneralReportService.java`
- Test: `backend/src/test/java/com/duing/domain/report/service/GeneralReportServiceTest.java`

- [ ] **Step 1: 서비스 인터페이스 작성**

```java
package com.duing.domain.report.service;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ReportService {
    Long create(CreateReportCommand command);
    void process(ProcessReportCommand command);
    Report getById(Long reportId);
    Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable);
}
```

- [ ] **Step 2: 실패하는 서비스 통합 테스트 작성**

```java
package com.duing.domain.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.exception.ReportException;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class GeneralReportServiceTest {

    @Autowired ReportService reportService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User createUser(UserRole role) {
        long n = sequence.incrementAndGet();
        return userRepository.save(User.signUp(
                String.valueOf(2000000 + n), "사용자" + n,
                "user" + n + "@daegu.ac.kr", "hashed",
                College.IT, Grade.SECOND, role));
    }

    private Club createClub(String name) {
        return clubRepository.save(Club.create(
                name, ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("정상 신고를 생성하면 PENDING 상태로 저장된다")
    void createPendingReport() {
        User reporter = createUser(UserRole.STUDENT);
        Club club = createClub("타깃동아리");

        Long reportId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.INAPPROPRIATE, "부적절"));

        Report saved = reportService.getById(reportId);
        assertThat(saved.getStatus()).isEqualTo(ReportStatus.PENDING);
        assertThat(saved.getReporterId()).isEqualTo(reporter.getId());
    }

    @Test
    @DisplayName("동일 신고자가 동일 대상에 PENDING 신고가 있으면 중복 예외가 발생한다")
    void duplicatePendingReportFails() {
        User reporter = createUser(UserRole.STUDENT);
        Club club = createClub("타깃");
        CreateReportCommand command = new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null);
        reportService.create(command);

        assertThatThrownBy(() -> reportService.create(command))
                .isInstanceOf(ReportException.DuplicatePendingReportException.class);
    }

    @Test
    @DisplayName("종결된 신고가 있더라도 동일 대상 재신고는 허용된다")
    void reportAgainAfterTerminalAllowed() {
        User reporter = createUser(UserRole.STUDENT);
        User admin = createUser(UserRole.ADMIN);
        Club club = createClub("타깃");
        Long firstId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));
        reportService.process(new ProcessReportCommand(
                firstId, admin.getId(), ReportStatus.DISMISSED, "무효"));

        Long secondId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));
        assertThat(secondId).isNotEqualTo(firstId);
    }

    @Test
    @DisplayName("대상 Club 이 존재하지 않으면 404 예외가 발생한다")
    void targetClubNotFound() {
        User reporter = createUser(UserRole.STUDENT);
        assertThatThrownBy(() -> reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, 999_999L,
                ReportReasonCode.SPAM, null)))
                .isInstanceOf(ReportException.ReportTargetNotFoundException.class);
    }

    @Test
    @DisplayName("자신이 운영하는 동아리는 신고할 수 없다 (셀프신고 차단)")
    void selfReportRejected() {
        User leader = createUser(UserRole.STUDENT);
        Club club = createClub("내동아리");
        clubMemberRepository.save(ClubMember.create(leader.getId(), club.getId(), ClubMemberRole.LEADER));

        assertThatThrownBy(() -> reportService.create(new CreateReportCommand(
                leader.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null)))
                .isInstanceOf(ReportException.SelfReportNotAllowedException.class);
    }

    @Test
    @DisplayName("ADMIN 이 신고를 RESOLVED 로 처리하면 처리자/처리시각이 저장된다")
    void processResolved() {
        User reporter = createUser(UserRole.STUDENT);
        User admin = createUser(UserRole.ADMIN);
        Club club = createClub("타깃");
        Long reportId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));

        reportService.process(new ProcessReportCommand(
                reportId, admin.getId(), ReportStatus.RESOLVED, "조치 완료"));

        Report processed = reportService.getById(reportId);
        assertThat(processed.getStatus()).isEqualTo(ReportStatus.RESOLVED);
        assertThat(processed.getHandledBy()).isEqualTo(admin.getId());
        assertThat(processed.getHandledAt()).isNotNull();
        assertThat(processed.getActionNote()).isEqualTo("조치 완료");
    }

    @Test
    @DisplayName("이미 종결된 신고를 다시 처리하면 예외가 발생한다")
    void processAlreadyTerminalFails() {
        User reporter = createUser(UserRole.STUDENT);
        User admin = createUser(UserRole.ADMIN);
        Club club = createClub("타깃");
        Long reportId = reportService.create(new CreateReportCommand(
                reporter.getId(), ReportTargetType.CLUB, club.getId(),
                ReportReasonCode.SPAM, null));
        reportService.process(new ProcessReportCommand(
                reportId, admin.getId(), ReportStatus.RESOLVED, null));

        assertThatThrownBy(() -> reportService.process(new ProcessReportCommand(
                reportId, admin.getId(), ReportStatus.DISMISSED, null)))
                .isInstanceOf(ReportException.InvalidReportTransitionException.class);
    }
}
```

> 주: `Club.create` / `ClubMember.create` / `User.signUp` 시그니처는 현 코드베이스 시그니처를 따라야 함. 컴파일 오류가 나면 해당 도메인의 fixture 시그니처를 그대로 사용한다(다른 `*ServiceTest` 의 헬퍼 구성을 그대로 모방).

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.report.service.GeneralReportServiceTest"`
Expected: 컴파일 실패 (GeneralReportService 없음).

- [ ] **Step 4: GeneralReportService 구현**

```java
package com.duing.domain.report.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.exception.ReportException;
import com.duing.domain.report.repository.ReportRepository;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralReportService implements ReportService {

    private final ReportRepository reportRepository;
    private final ClubRepository clubRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    @Transactional
    public Long create(CreateReportCommand command) {
        Long contextClubId = resolveContextClubId(command.targetType(), command.targetId());
        if (canManage(command.reporterId(), contextClubId)) {
            throw new ReportException.SelfReportNotAllowedException();
        }

        reportRepository.findByReporterIdAndTargetTypeAndTargetIdAndStatus(
                command.reporterId(), command.targetType(), command.targetId(), ReportStatus.PENDING)
                .ifPresent(existing -> { throw new ReportException.DuplicatePendingReportException(); });

        Report saved;
        try {
            saved = reportRepository.save(Report.create(
                    command.reporterId(), command.targetType(), command.targetId(),
                    command.reasonCode(), command.detail()));
        } catch (DataIntegrityViolationException raceCondition) {
            throw new ReportException.DuplicatePendingReportException();
        }
        return saved.getId();
    }

    @Override
    @Transactional
    public void process(ProcessReportCommand command) {
        Report found = reportRepository.findById(command.reportId())
                .orElseThrow(ReportException.ReportNotFoundException::new);
        found.process(command.handlerUserId(), command.status(), command.actionNote());
    }

    @Override
    public Report getById(Long reportId) {
        return reportRepository.findById(reportId)
                .orElseThrow(ReportException.ReportNotFoundException::new);
    }

    @Override
    public Page<Report> searchForAdmin(ReportAdminSearchCondition condition, Pageable pageable) {
        return reportRepository.searchForAdmin(condition, pageable);
    }

    private Long resolveContextClubId(ReportTargetType targetType, Long targetId) {
        return switch (targetType) {
            case CLUB -> clubRepository.findById(targetId)
                    .orElseThrow(ReportException.ReportTargetNotFoundException::new)
                    .getId();
            case RECRUITMENT -> {
                Recruitment recruitment = recruitmentRepository.findById(targetId)
                        .orElseThrow(ReportException.ReportTargetNotFoundException::new);
                yield recruitment.getClubId();
            }
        };
    }

    private boolean canManage(Long userId, Long clubId) {
        return clubMemberRepository.findByClubIdAndUserId(clubId, userId)
                .map(member -> member.canManageClub())
                .orElse(false);
    }
}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `./gradlew :backend:test --tests "com.duing.domain.report.service.GeneralReportServiceTest"`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/service/ \
        backend/src/test/java/com/duing/domain/report/service/GeneralReportServiceTest.java
git commit -m "feat(backend): GeneralReportService — 셀프신고/중복/처리 상태머신 구현"
```

---

## Task 8: Request / Response DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/controller/dto/request/CreateReportRequest.java`
- Create: `backend/src/main/java/com/duing/domain/report/controller/dto/request/ProcessReportRequest.java`
- Create: `backend/src/main/java/com/duing/domain/report/controller/dto/response/ReportSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/report/controller/dto/response/ReportDetailResponse.java`

- [ ] **Step 1: CreateReportRequest**

```java
package com.duing.domain.report.controller.dto.request;

import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.dto.command.CreateReportCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateReportRequest(
        @NotNull(message = "신고 대상 종류는 필수입니다.") ReportTargetType targetType,
        @NotNull(message = "신고 대상 ID는 필수입니다.") @Positive Long targetId,
        @NotNull(message = "신고 사유 코드는 필수입니다.") ReportReasonCode reasonCode,
        @Size(max = 1000, message = "신고 상세는 1000자 이하여야 합니다.") String detail
) {
    public CreateReportCommand toCommand(Long reporterId) {
        return new CreateReportCommand(reporterId, targetType, targetId, reasonCode, detail);
    }
}
```

- [ ] **Step 2: ProcessReportRequest**

```java
package com.duing.domain.report.controller.dto.request;

import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.service.dto.command.ProcessReportCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessReportRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") ReportStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessReportCommand toCommand(Long reportId, Long handlerUserId) {
        return new ProcessReportCommand(reportId, handlerUserId, status, actionNote);
    }
}
```

- [ ] **Step 3: ReportSummaryResponse**

```java
package com.duing.domain.report.controller.dto.response;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import java.time.LocalDateTime;

public record ReportSummaryResponse(
        Long id,
        ReportTargetType targetType,
        Long targetId,
        String targetLabel,
        ReportReasonCode reasonCode,
        ReportStatus status,
        LocalDateTime createdAt
) {
    public static ReportSummaryResponse of(Report report, String targetLabel) {
        return new ReportSummaryResponse(
                report.getId(), report.getTargetType(), report.getTargetId(),
                targetLabel, report.getReasonCode(), report.getStatus(),
                report.getCreatedAt()
        );
    }
}
```

- [ ] **Step 4: ReportDetailResponse**

```java
package com.duing.domain.report.controller.dto.response;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportReasonCode;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import java.time.LocalDateTime;

public record ReportDetailResponse(
        Long id,
        UserRef reporter,
        ReportTargetType targetType,
        Long targetId,
        String targetLabel,
        ReportReasonCode reasonCode,
        String detail,
        ReportStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static ReportDetailResponse of(Report report, String targetLabel,
                                          UserRef reporter, UserRef handler) {
        return new ReportDetailResponse(
                report.getId(), reporter,
                report.getTargetType(), report.getTargetId(), targetLabel,
                report.getReasonCode(), report.getDetail(),
                report.getStatus(), report.getActionNote(),
                handler, report.getHandledAt(), report.getCreatedAt()
        );
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/controller/dto/
git commit -m "feat(backend): Report Request/Response DTO 정의"
```

---

## Task 9: ReportApi + ReportController (POST /reports)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/api/ReportApi.java`
- Create: `backend/src/main/java/com/duing/domain/report/controller/ReportController.java`

- [ ] **Step 1: ReportApi 인터페이스 작성**

```java
package com.duing.domain.report.api;

import com.duing.domain.report.controller.dto.request.CreateReportRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "신고", description = "Club/Recruitment 신고 제출 API")
@SecurityRequirement(name = "BearerAuth")
public interface ReportApi {

    @Operation(summary = "신고 제출", description = "로그인 사용자가 동아리/모집공고를 신고한다.")
    @PostMapping("/reports")
    ResponseEntity<ApiResponse<Long>> createReport(
            @Valid @RequestBody CreateReportRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: ReportController 작성**

```java
package com.duing.domain.report.controller;

import com.duing.domain.report.api.ReportApi;
import com.duing.domain.report.controller.dto.request.CreateReportRequest;
import com.duing.domain.report.service.ReportService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ReportController implements ReportApi {

    private final ReportService reportService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createReport(
            CreateReportRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long reportId = reportService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(reportId));
    }
}
```

- [ ] **Step 3: SecurityConfig 가 `/api/v1/reports` 를 인증 필요로 등록하는지 확인**

Run: `grep -rn "reports\|admin" backend/src/main/java/com/duing/global/config/ | head -20`
Expected: 기존 정책이 `/api/v1/admin/**` 만 ADMIN, 그 외 인증 필요 패턴이면 별도 수정 불필요. 아니라면 `SecurityConfig` 에 `requestMatchers("/api/v1/reports").authenticated()` 추가.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/api/ReportApi.java \
        backend/src/main/java/com/duing/domain/report/controller/ReportController.java
git commit -m "feat(backend): POST /api/v1/reports — 사용자 신고 제출 API"
```

---

## Task 10: AdminReportApi + AdminReportController

**Files:**
- Create: `backend/src/main/java/com/duing/domain/report/api/AdminReportApi.java`
- Create: `backend/src/main/java/com/duing/domain/report/controller/AdminReportController.java`

- [ ] **Step 1: AdminReportApi 인터페이스**

```java
package com.duing.domain.report.api;

import com.duing.domain.report.controller.dto.request.ProcessReportRequest;
import com.duing.domain.report.controller.dto.response.ReportDetailResponse;
import com.duing.domain.report.controller.dto.response.ReportSummaryResponse;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "신고(총동연)", description = "총동연 전용 신고 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminReportApi {

    @Operation(summary = "신고 목록 조회")
    @GetMapping("/admin/reports")
    ResponseEntity<ApiResponse<PageResponse<ReportSummaryResponse>>> getReports(
            @RequestParam(required = false) ReportStatus status,
            @RequestParam(required = false) ReportTargetType targetType,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "신고 상세 조회")
    @GetMapping("/admin/reports/{reportId}")
    ResponseEntity<ApiResponse<ReportDetailResponse>> getReport(@PathVariable Long reportId);

    @Operation(summary = "신고 처리")
    @PatchMapping("/admin/reports/{reportId}")
    ResponseEntity<ApiResponse<Void>> processReport(
            @PathVariable Long reportId,
            @Valid @RequestBody ProcessReportRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: AdminReportController 작성**

```java
package com.duing.domain.report.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.report.api.AdminReportApi;
import com.duing.domain.report.controller.dto.request.ProcessReportRequest;
import com.duing.domain.report.controller.dto.response.ReportDetailResponse;
import com.duing.domain.report.controller.dto.response.ReportSummaryResponse;
import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.ReportService;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminReportController implements AdminReportApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final ReportService reportService;
    private final ClubRepository clubRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ReportSummaryResponse>>> getReports(
            ReportStatus status, ReportTargetType targetType, Pageable pageable
    ) {
        Page<Report> page = reportService.searchForAdmin(
                new ReportAdminSearchCondition(status, targetType), pageable);
        Page<ReportSummaryResponse> mapped = page.map(report ->
                ReportSummaryResponse.of(report, resolveTargetLabel(report)));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<ReportDetailResponse>> getReport(Long reportId) {
        Report report = reportService.getById(reportId);
        ReportDetailResponse.UserRef reporter = resolveUserRef(report.getReporterId()).orElse(null);
        ReportDetailResponse.UserRef handler = report.getHandledBy() == null
                ? null
                : resolveUserRef(report.getHandledBy()).orElse(null);
        ReportDetailResponse body = ReportDetailResponse.of(
                report, resolveTargetLabel(report), reporter, handler);
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processReport(
            Long reportId, ProcessReportRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        reportService.process(request.toCommand(reportId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    private String resolveTargetLabel(Report report) {
        return switch (report.getTargetType()) {
            case CLUB -> clubRepository.findById(report.getTargetId())
                    .map(Club::getName).orElse(DELETED_LABEL);
            case RECRUITMENT -> recruitmentRepository.findById(report.getTargetId())
                    .map(Recruitment::getTitle).orElse(DELETED_LABEL);
        };
    }

    private Optional<ReportDetailResponse.UserRef> resolveUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new ReportDetailResponse.UserRef(user.getId(), user.getName()));
    }
}
```

- [ ] **Step 3: 컴파일 확인**

Run: `./gradlew :backend:compileJava`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/report/api/AdminReportApi.java \
        backend/src/main/java/com/duing/domain/report/controller/AdminReportController.java
git commit -m "feat(backend): /api/v1/admin/reports — ADMIN 신고 조회/처리 API"
```

---

## Task 11: Acceptance 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/report/ReportAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.report;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ReportAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String studentToken;
    private String adminToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User student = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        studentToken = jwtTokenProvider.createAccessToken(student.getId(), student.getRole().name());
        adminToken = jwtTokenProvider.createAccessToken(admin.getId(), admin.getRole().name());
        clubId = clubRepository.save(Club.create("타깃동아리", ClubCategory.ACADEMIC,
                null, "설명", null)).getId();
    }

    private User saveUser(UserRole role) {
        long n = sequence.incrementAndGet();
        return userRepository.save(User.signUp(
                String.valueOf(2_100_000 + n), "사용자" + n,
                "user" + n + "@daegu.ac.kr", "hashed",
                College.IT, Grade.SECOND, role));
    }

    @Test
    @DisplayName("로그인한 학생이 동아리 신고를 제출하면 201과 신고 ID 가 반환된다")
    void createReportSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "targetType", "CLUB",
                        "targetId", clubId,
                        "reasonCode", "INAPPROPRIATE",
                        "detail", "부적절한 운영"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("미인증 사용자의 신고 제출은 401")
    void unauthenticatedReportRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("targetType", "CLUB", "targetId", clubId,
                        "reasonCode", "SPAM"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("자신이 LEADER 인 동아리 신고는 400")
    void selfReportReturnsBadRequest() {
        User leader = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.create(leader.getId(), clubId, ClubMemberRole.LEADER));
        String leaderToken = jwtTokenProvider.createAccessToken(leader.getId(), leader.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("targetType", "CLUB", "targetId", clubId, "reasonCode", "SPAM"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 신고자 × 동일 대상 PENDING 중복은 409")
    void duplicatePendingReturnsConflict() {
        Map<String, Object> body = Map.of(
                "targetType", "CLUB", "targetId", clubId, "reasonCode", "SPAM");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("STUDENT 는 /admin/reports 에 접근할 수 없다 (403)")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/reports")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 이 신고를 RESOLVED 로 처리하면 204")
    void adminProcessesReport() {
        Long reportId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of("targetType", "CLUB", "targetId", clubId, "reasonCode", "SPAM"))
                .when().post("/api/v1/reports")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "RESOLVED", "actionNote", "조치 완료"))
                .when().patch("/api/v1/admin/reports/" + reportId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/reports/" + reportId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo(ReportStatus.RESOLVED.name()))
                .body("data.handledBy.id", notNullValue());
    }
}
```

- [ ] **Step 2: 테스트 실행**

Run: `./gradlew :backend:test --tests "com.duing.domain.report.ReportAcceptanceTest"`
Expected: PASS (6 tests). Docker(Testcontainers) 가 실행 중이어야 함.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/report/ReportAcceptanceTest.java
git commit -m "test(backend): Report API 인수 테스트 — 201/401/400/409/403/204 케이스"
```

---

## Task 12: 전체 빌드 + REQUIREMENTS 업데이트 + PR

**Files:**
- Modify: `REQUIREMENTS.md` (도메인 추가 — `2.5 Report` 섹션 신설)

- [ ] **Step 1: 전체 테스트 실행**

Run: `./gradlew :backend:test`
Expected: 모든 테스트 PASS.

- [ ] **Step 2: REQUIREMENTS.md 에 Report 도메인 명세 추가**

`REQUIREMENTS.md` 의 `2.4 Application` 다음에 `### 2.5 Report (신고)` 섹션을 추가하고, 본 spec(`docs/superpowers/specs/2026-05-20-report-moderation-design.md`)의 §2~§6 요약 표를 옮겨 적는다. RP-1 ~ RP-4 API 표는 그대로 복사.

- [ ] **Step 3: Commit**

```bash
git add REQUIREMENTS.md
git commit -m "docs: REQUIREMENTS 에 Report(신고) 도메인 추가 (RP-1~RP-4)"
```

- [ ] **Step 4: Push + PR 생성**

```bash
git push -u origin feat/report-moderation
gh pr create --base develop --title "feat: 신고/제재(Report) 도메인 — Club/Recruitment 신고 접수 + ADMIN 처리" --body "$(cat <<'EOF'
## 🚀 작업 내용

Club 과 Recruitment 를 대상으로 한 사용자 신고 접수 및 ADMIN 의 신고 처리(상태 관리) API 를 추가했다. 다형 대상은 `(targetType, targetId)` 단일 테이블로 모델링했고, 실제 제재(예: Club 상태 변경) 은 기존 ADMIN API 를 ADMIN 이 별도로 호출하는 흐름을 유지한다.

## 🤔 고민했던 내용

- 다형 대상을 어떻게 표현할지: joined inheritance / 분리 테이블 / 단일 테이블+enum 중에 단일 테이블+enum 을 택했다. 대상 추가가 쉽고 QueryDSL/Flyway 가 단순해진다.
- 셀프 신고를 어디서 막을지: 컨트롤러가 아닌 도메인 서비스에서 `ClubMemberRepository` 를 통해 일관되게 검증하도록 했다.
- 중복 신고 차단을 DB 와 서비스 양쪽에서 걸었다(조건부 유니크 인덱스 + pre-check). 동시성 충돌은 `DataIntegrityViolationException` 을 409 로 매핑한다.

## 💬 리뷰 중점사항

- `report` 도메인 패키지의 폴더 구조가 기존 `notice` 도메인 패턴과 일치하는지
- 셀프신고/중복신고 검증 위치와 예외 매핑 적절성
- 조건부 유니크 인덱스가 의도대로 동작하는지 (재신고 허용 시나리오 인수 테스트 확인)
EOF
)"
```

---

## Self-Review Notes

스펙 §2(스코프) ~ §9(후속) 항목을 한 번 더 매핑:

- §2 In Scope (Club/Recruitment 대상, 사유 enum+detail, status 머신, 중복방지) → Tasks 1·2·4·5·7 에서 모두 구현.
- §2 Out of Scope → 본 plan 에 포함하지 않음.
- §3.1 엔티티 필드 → Task 4 `Report.java` 의 컬럼들과 1:1 대응.
- §3.2 상태 머신 → `Report#process` 안의 검증 (Task 4) + `process` 서비스 호출 경로 (Task 7).
- §3.3 DB 제약 (조건부 유니크, CHECK) → Task 1 `V27` 에 모두 포함.
- §4 API 4개(RP-1~4) → Tasks 9 (RP-1) / 10 (RP-2,3,4).
- §5 셀프신고 검증 → Task 7 `GeneralReportService#canManage`.
- §5 권한 → Task 9 `@PreAuthorize("isAuthenticated()")` + Task 10 `@PreAuthorize("hasRole('ADMIN')")`.
- §6 공개/감사 노출 → ReportSummary/Detail Response 는 `/admin` 경로에서만 반환 (Task 10).
- §7 테스트 — 서비스 단위 (Task 7) + 컨트롤러/보안 (Task 11) + soft-deleted 대상 라벨 (Task 10 `DELETED_LABEL`).
- §8 마이그레이션 노트 → Task 1 새 파일만 추가.

검증 사항:
- `User.signUp` / `Club.create` / `ClubMember.create` 의 정확한 시그니처는 실제 구현 시점에 해당 도메인 코드를 다시 읽어 맞춘다 (테스트 코드 헬퍼만 영향).
- `JwtTokenProvider#createAccessToken` 정확한 시그니처는 기존 `NoticeAdminAcceptanceTest` 의 사용법을 그대로 따른다 (테스트 작성 시 동일하게 호출).
- `Recruitment#getClubId()` 의 정확한 이름은 Task 7 구현 시 확인. 다르면(`getClub().getId()` 등) 그에 맞춘다.

Type 일관성:
- `ReportStatus` / `ReportTargetType` / `ReportReasonCode` enum 값을 모든 SQL CHECK · Java enum · DTO 에서 동일 문자열로 사용 확인.
- `Report#process(Long, ReportStatus, String)` 시그니처를 서비스(Task 7) 와 단위 테스트(Task 4) 양쪽에서 동일하게 사용.
