# LEADER 권한 복구·승계 + 감사 로그 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OFFICER 승계 요청 + ADMIN 강제 LEADER 지정 + 권한 변경 감사 로그를 기존 `clubmember` 도메인에 추가한다.

**Architecture:** 두 신규 엔티티(`LeaderSuccessionRequest`, `ClubMemberHistory`)를 기존 `clubmember` 도메인에 추가하고, 권한 변경 서비스 메서드들이 각자 직접 history 행을 기록한다. 승계 승인/강제 지정은 기존 `transferLeader` 의 PESSIMISTIC_WRITE 패턴을 그대로 재사용한다. 별도 `notification` / `audit` 도메인 신설 없음.

**Tech Stack:** Spring Boot 3.4, Java 21, JPA + QueryDSL, Flyway (Postgres), TestContainers + RestAssured.

**Spec:** `docs/superpowers/specs/2026-05-20-leader-succession-design.md`

**Branch:** `feat/leader-succession` (이미 체크아웃됨, spec 커밋 포함)

---

## File Structure

신규 (`backend/src/main/java/com/duing/domain/clubmember/` 하위):

```
clubmember/
├── api/
│   ├── LeaderSuccessionApi.java           # POST /clubs/{clubId}/leader-succession-requests
│   └── AdminLeaderSuccessionApi.java      # /admin/leader-succession-requests + /admin/clubs/{}/leader + /admin/clubs/{}/member-history
├── controller/
│   ├── LeaderSuccessionController.java
│   ├── AdminLeaderSuccessionController.java
│   └── dto/request/
│   │   ├── CreateLeaderSuccessionRequestRequest.java
│   │   ├── ProcessLeaderSuccessionRequest.java
│   │   └── AssignAdminLeaderRequest.java
│   └── dto/response/
│       ├── SuccessionRequestSummaryResponse.java
│       ├── SuccessionRequestDetailResponse.java
│       └── ClubMemberHistoryResponse.java
├── entity/
│   ├── LeaderSuccessionRequest.java
│   ├── SuccessionStatus.java              # PENDING/APPROVED/REJECTED
│   ├── ClubMemberHistory.java
│   └── ClubMemberEventType.java           # ROLE_CHANGED/LEADER_TRANSFERRED/LEFT/REMOVED/ADMIN_LEADER_ASSIGNED/SUCCESSION_APPROVED
├── repository/
│   ├── LeaderSuccessionRequestRepository.java
│   ├── LeaderSuccessionRequestRepositoryCustom.java
│   ├── LeaderSuccessionRequestRepositoryImpl.java   # QueryDSL admin 검색
│   └── ClubMemberHistoryRepository.java
└── service/
    ├── LeaderSuccessionService.java                 # interface
    ├── GeneralLeaderSuccessionService.java          # impl (create/process)
    ├── AdminLeaderAssignmentService.java            # interface (LH-1 single)
    ├── GeneralAdminLeaderAssignmentService.java     # impl
    ├── ClubMemberHistoryRecorder.java               # 단일 책임 헬퍼 (history 행 insert)
    └── dto/
        ├── command/
        │   ├── CreateSuccessionCommand.java
        │   ├── ProcessSuccessionCommand.java
        │   └── AssignLeaderByAdminCommand.java
        └── query/
            └── SuccessionAdminSearchCondition.java
```

수정:
- `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java` — `requireOfficer(Long userId, Long clubId)` 추가
- `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java` — `updateRole / removeMember / leave / transferLeader` 4개 메서드 끝에 `historyRecorder.record(...)` 호출 추가
- `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java` — `existsByClubIdAndRole`, `findByClubIdAndRoleForUpdate` 추가

Flyway:
- `backend/src/main/resources/db/migration/V28__create_leader_succession_and_member_history.sql`

테스트:
- `backend/src/test/java/com/duing/domain/clubmember/entity/LeaderSuccessionRequestTest.java`
- `backend/src/test/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionServiceTest.java`
- `backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceTest.java`
- `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberHistoryRecorderTest.java`
- `backend/src/test/java/com/duing/domain/clubmember/LeaderSuccessionAcceptanceTest.java`

---

## Task 1: Flyway V28 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V28__create_leader_succession_and_member_history.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- leader_succession_request: 잠수 LEADER 대상 승계 요청
CREATE TABLE leader_succession_request (
    id                  BIGSERIAL    PRIMARY KEY,
    club_id             BIGINT       NOT NULL REFERENCES club(id),
    requester_user_id   BIGINT       NOT NULL REFERENCES users(id),
    reason              TEXT         NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note         TEXT,
    handled_by          BIGINT       REFERENCES users(id),
    handled_at          TIMESTAMP,
    deleted_at          TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lsr_status        CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    CONSTRAINT chk_lsr_reason_len    CHECK (char_length(reason) <= 1000),
    CONSTRAINT chk_lsr_action_len    CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_lsr_handled_pair  CHECK (
        (status = 'PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

-- 동아리당 PENDING 1건
CREATE UNIQUE INDEX uq_lsr_active_pending
    ON leader_succession_request (club_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_lsr_admin_feed
    ON leader_succession_request (status, created_at DESC)
    WHERE deleted_at IS NULL;

-- club_member_history: 권한 변경 감사 로그
CREATE TABLE club_member_history (
    id              BIGSERIAL    PRIMARY KEY,
    club_id         BIGINT       NOT NULL,
    target_user_id  BIGINT       NOT NULL,
    actor_user_id   BIGINT       NOT NULL,
    event_type      VARCHAR(40)  NOT NULL,
    from_role       VARCHAR(20),
    to_role         VARCHAR(20),
    reason          TEXT,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cmh_event_type CHECK (event_type IN (
        'ROLE_CHANGED','LEADER_TRANSFERRED','LEFT','REMOVED',
        'ADMIN_LEADER_ASSIGNED','SUCCESSION_APPROVED'
    )),
    CONSTRAINT chk_cmh_from_role CHECK (from_role IS NULL OR from_role IN ('LEADER','OFFICER','MEMBER')),
    CONSTRAINT chk_cmh_to_role   CHECK (to_role   IS NULL OR to_role   IN ('LEADER','OFFICER','MEMBER')),
    CONSTRAINT chk_cmh_reason_len CHECK (reason IS NULL OR char_length(reason) <= 1000)
);

CREATE INDEX idx_cmh_club_recent ON club_member_history (club_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_cmh_target_recent ON club_member_history (target_user_id, created_at DESC)
    WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 컴파일 스모크**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V28__create_leader_succession_and_member_history.sql
git commit -m "feat(backend): leader_succession_request + club_member_history 마이그레이션 (V28)"
```

---

## Task 2: Enum 2종

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/entity/SuccessionStatus.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/entity/ClubMemberEventType.java`

- [ ] **Step 1: `SuccessionStatus`**

```java
package com.duing.domain.clubmember.entity;

public enum SuccessionStatus {
    PENDING, APPROVED, REJECTED;

    public boolean isTerminal() {
        return this == APPROVED || this == REJECTED;
    }
}
```

- [ ] **Step 2: `ClubMemberEventType`**

```java
package com.duing.domain.clubmember.entity;

public enum ClubMemberEventType {
    ROLE_CHANGED,
    LEADER_TRANSFERRED,
    LEFT,
    REMOVED,
    ADMIN_LEADER_ASSIGNED,
    SUCCESSION_APPROVED
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd ..
git add backend/src/main/java/com/duing/domain/clubmember/entity/SuccessionStatus.java \
        backend/src/main/java/com/duing/domain/clubmember/entity/ClubMemberEventType.java
git commit -m "feat(backend): 승계/감사로그 enum(SuccessionStatus, ClubMemberEventType) 정의"
```

---

## Task 3: `LeaderSuccessionRequest` 엔티티 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/entity/LeaderSuccessionRequest.java`
- Test: `backend/src/test/java/com/duing/domain/clubmember/entity/LeaderSuccessionRequestTest.java`

- [ ] **Step 1: 단위 테스트 작성**

```java
package com.duing.domain.clubmember.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.clubmember.exception.ClubMemberException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LeaderSuccessionRequestTest {

    @Test
    @DisplayName("승계 요청 생성 시 기본 상태는 PENDING 이며 처리 정보는 비어 있다")
    void createInitializesPending() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수 3개월");
        assertThat(request.getStatus()).isEqualTo(SuccessionStatus.PENDING);
        assertThat(request.getHandledBy()).isNull();
        assertThat(request.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("처리 시 APPROVED/REJECTED 로만 전이 가능하다")
    void processTransitionsToTerminal() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수");
        request.process(99L, SuccessionStatus.APPROVED, "확인 완료");
        assertThat(request.getStatus()).isEqualTo(SuccessionStatus.APPROVED);
        assertThat(request.getHandledBy()).isEqualTo(99L);
        assertThat(request.getHandledAt()).isNotNull();
        assertThat(request.getActionNote()).isEqualTo("확인 완료");
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수");
        request.process(99L, SuccessionStatus.REJECTED, null);
        assertThatThrownBy(() -> request.process(99L, SuccessionStatus.APPROVED, null))
                .isInstanceOf(ClubMemberException.InvalidSuccessionTransition.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수");
        assertThatThrownBy(() -> request.process(99L, SuccessionStatus.PENDING, null))
                .isInstanceOf(ClubMemberException.InvalidSuccessionTransition.class);
    }
}
```

- [ ] **Step 2: 테스트 실행해 컴파일 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.entity.LeaderSuccessionRequestTest"`
Expected: 컴파일 실패 (`LeaderSuccessionRequest`, `ClubMemberException.InvalidSuccessionTransition` 없음).

- [ ] **Step 3: `ClubMemberException.InvalidSuccessionTransition` 추가**

`backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java` 끝에 추가 (마지막 `}` 직전):

```java
    public static class InvalidSuccessionTransition extends ClubMemberException {
        public InvalidSuccessionTransition(String reason) {
            super("승계 요청 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
```

> 주: 기존 `ClubMemberException` 의 base constructor 시그니처를 확인 후 동일 패턴 따를 것. 다른 inner exception class 들과 같은 import / private constructor / public no-arg 또는 reason-arg 형식 확인.

- [ ] **Step 4: 엔티티 구현**

```java
package com.duing.domain.clubmember.entity;

import com.duing.domain.clubmember.exception.ClubMemberException;
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
@Table(name = "leader_succession_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE leader_succession_request SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class LeaderSuccessionRequest extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "requester_user_id", nullable = false) private Long requesterUserId;

    @Column(nullable = false, columnDefinition = "TEXT") private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private SuccessionStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private LeaderSuccessionRequest(Long clubId, Long requesterUserId, String reason) {
        this.clubId = clubId;
        this.requesterUserId = requesterUserId;
        this.reason = reason;
        this.status = SuccessionStatus.PENDING;
    }

    public static LeaderSuccessionRequest create(Long clubId, Long requesterUserId, String reason) {
        return LeaderSuccessionRequest.builder()
                .clubId(clubId)
                .requesterUserId(requesterUserId)
                .reason(reason)
                .build();
    }

    public void process(Long handlerUserId, SuccessionStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == SuccessionStatus.PENDING) {
            throw new ClubMemberException.InvalidSuccessionTransition(
                    "처리 결과는 APPROVED 또는 REJECTED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new ClubMemberException.InvalidSuccessionTransition("이미 종결된 요청입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
```

- [ ] **Step 5: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.entity.LeaderSuccessionRequestTest"`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/entity/LeaderSuccessionRequest.java \
        backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java \
        backend/src/test/java/com/duing/domain/clubmember/entity/LeaderSuccessionRequestTest.java
git commit -m "feat(backend): LeaderSuccessionRequest 엔티티 + 상태 전이 검증"
```

---

## Task 4: `ClubMemberHistory` 엔티티

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/entity/ClubMemberHistory.java`

- [ ] **Step 1: 엔티티 작성** (간단한 데이터 record-like 엔티티, 별도 단위 테스트 없음 — Repository 통합 테스트에서 검증)

```java
package com.duing.domain.clubmember.entity;

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
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "club_member_history")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_member_history SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubMemberHistory extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "target_user_id", nullable = false) private Long targetUserId;
    @Column(name = "actor_user_id", nullable = false) private Long actorUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40) private ClubMemberEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_role", length = 20) private ClubMemberRole fromRole;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_role", length = 20) private ClubMemberRole toRole;

    @Column(columnDefinition = "TEXT") private String reason;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubMemberHistory(Long clubId, Long targetUserId, Long actorUserId,
                              ClubMemberEventType eventType,
                              ClubMemberRole fromRole, ClubMemberRole toRole, String reason) {
        this.clubId = clubId;
        this.targetUserId = targetUserId;
        this.actorUserId = actorUserId;
        this.eventType = eventType;
        this.fromRole = fromRole;
        this.toRole = toRole;
        this.reason = reason;
    }

    public static ClubMemberHistory of(Long clubId, Long targetUserId, Long actorUserId,
                                       ClubMemberEventType eventType,
                                       ClubMemberRole fromRole, ClubMemberRole toRole, String reason) {
        return ClubMemberHistory.builder()
                .clubId(clubId).targetUserId(targetUserId).actorUserId(actorUserId)
                .eventType(eventType).fromRole(fromRole).toRole(toRole).reason(reason)
                .build();
    }
}
```

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd ..
git add backend/src/main/java/com/duing/domain/clubmember/entity/ClubMemberHistory.java
git commit -m "feat(backend): ClubMemberHistory 엔티티"
```

---

## Task 5: Repositories + ClubAuthService 확장

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/repository/LeaderSuccessionRequestRepository.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/repository/LeaderSuccessionRequestRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/repository/LeaderSuccessionRequestRepositoryImpl.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberHistoryRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java`

- [ ] **Step 1: 서비스 dto/query 디렉터리에 검색 조건 record 작성**

Create `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/SuccessionAdminSearchCondition.java`:

```java
package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.SuccessionStatus;

public record SuccessionAdminSearchCondition(
        SuccessionStatus status,
        Long clubId
) {}
```

- [ ] **Step 2: `LeaderSuccessionRequestRepository`**

```java
package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeaderSuccessionRequestRepository
        extends JpaRepository<LeaderSuccessionRequest, Long>, LeaderSuccessionRequestRepositoryCustom {

    Optional<LeaderSuccessionRequest> findByClubIdAndStatus(Long clubId, SuccessionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM LeaderSuccessionRequest r WHERE r.id = :id")
    Optional<LeaderSuccessionRequest> findByIdForUpdate(@Param("id") Long id);
}
```

- [ ] **Step 3: `LeaderSuccessionRequestRepositoryCustom` + `Impl`**

```java
package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface LeaderSuccessionRequestRepositoryCustom {
    Page<LeaderSuccessionRequest> searchForAdmin(SuccessionAdminSearchCondition condition, Pageable pageable);
}
```

```java
package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.QLeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class LeaderSuccessionRequestRepositoryImpl implements LeaderSuccessionRequestRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<LeaderSuccessionRequest> searchForAdmin(
            SuccessionAdminSearchCondition condition, Pageable pageable
    ) {
        QLeaderSuccessionRequest request = QLeaderSuccessionRequest.leaderSuccessionRequest;
        BooleanExpression statusEq = condition.status() == null ? null : request.status.eq(condition.status());
        BooleanExpression clubEq = condition.clubId() == null ? null : request.clubId.eq(condition.clubId());

        List<LeaderSuccessionRequest> content = queryFactory.selectFrom(request)
                .where(statusEq, clubEq)
                .orderBy(request.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(request.count()).from(request).where(statusEq, clubEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
```

- [ ] **Step 4: `ClubMemberHistoryRepository`**

```java
package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.ClubMemberHistory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubMemberHistoryRepository extends JpaRepository<ClubMemberHistory, Long> {

    Page<ClubMemberHistory> findByClubIdOrderByCreatedAtDesc(Long clubId, Pageable pageable);
}
```

- [ ] **Step 5: `ClubMemberRepository` 에 LEADER 존재 확인 + 락 메서드 추가**

`backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java` 에 메서드 추가:

```java
    boolean existsByClubIdAndRole(Long clubId, com.duing.domain.clubmember.entity.ClubMemberRole role);

    java.util.Optional<com.duing.domain.clubmember.entity.ClubMember>
            findByClubIdAndUserId(Long clubId, Long userId);   // 이미 존재 — 그대로 둠

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
        "SELECT m FROM ClubMember m WHERE m.club.id = :clubId AND m.role = :role")
    java.util.Optional<com.duing.domain.clubmember.entity.ClubMember>
            findByClubIdAndRoleForUpdate(@org.springframework.data.repository.query.Param("clubId") Long clubId,
                                         @org.springframework.data.repository.query.Param("role") com.duing.domain.clubmember.entity.ClubMemberRole role);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query(
        "SELECT m FROM ClubMember m WHERE m.club.id = :clubId AND m.user.id = :userId")
    java.util.Optional<com.duing.domain.clubmember.entity.ClubMember>
            findByClubIdAndUserIdForUpdate(@org.springframework.data.repository.query.Param("clubId") Long clubId,
                                            @org.springframework.data.repository.query.Param("userId") Long userId);
```

(존재하는 import 들과 일치하도록 import 문 정리 — 이미 `@Lock`, `@Query`, `@Param`, `LockModeType` import 가 있다면 fully-qualified 대신 단순 이름 사용.)

- [ ] **Step 6: `ClubAuthService.requireOfficer` 추가**

`backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java` 에 추가:

```java
    public ClubMember requireOfficer(Long userId, Long clubId) {
        ClubMember clubMember = findMembershipOrThrow(userId, clubId);
        if (clubMember.getRole() != ClubMemberRole.OFFICER) {
            throw new AccessDeniedException("해당 동아리의 운영진(OFFICER)만 가능한 작업입니다.");
        }
        return clubMember;
    }
```

- [ ] **Step 7: 컴파일 확인 (QueryDSL 가 `QLeaderSuccessionRequest` 생성)**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/repository/ \
        backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java \
        backend/src/main/java/com/duing/domain/clubmember/service/dto/query/SuccessionAdminSearchCondition.java
git commit -m "feat(backend): 승계요청·이력 리포지토리 + ClubAuthService.requireOfficer + ClubMember 락 메서드"
```

---

## Task 6: Command DTO 3종 + `ClubMemberHistoryRecorder` 헬퍼

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/CreateSuccessionCommand.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/ProcessSuccessionCommand.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/command/AssignLeaderByAdminCommand.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberHistoryRecorder.java`

- [ ] **Step 1: Commands**

```java
package com.duing.domain.clubmember.service.dto.command;

public record CreateSuccessionCommand(Long clubId, Long requesterUserId, String reason) {}
```

```java
package com.duing.domain.clubmember.service.dto.command;

import com.duing.domain.clubmember.entity.SuccessionStatus;

public record ProcessSuccessionCommand(
        Long requestId, Long handlerAdminId, SuccessionStatus status, String actionNote) {}
```

```java
package com.duing.domain.clubmember.service.dto.command;

public record AssignLeaderByAdminCommand(
        Long clubId, Long newLeaderUserId, Long actorAdminId, String reason) {}
```

- [ ] **Step 2: History recorder**

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ClubMemberHistoryRecorder {

    private final ClubMemberHistoryRepository historyRepository;

    public void record(Long clubId, Long targetUserId, Long actorUserId,
                       ClubMemberEventType eventType,
                       ClubMemberRole fromRole, ClubMemberRole toRole,
                       String reason) {
        historyRepository.save(ClubMemberHistory.of(
                clubId, targetUserId, actorUserId, eventType, fromRole, toRole, reason));
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd ..
git add backend/src/main/java/com/duing/domain/clubmember/service/dto/command/ \
        backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberHistoryRecorder.java
git commit -m "feat(backend): 승계 Command DTO + ClubMemberHistoryRecorder 헬퍼"
```

---

## Task 7: 기존 `GeneralClubMemberCommandService` 에 감사 로그 기록 추가 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java`
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberHistoryRecorderTest.java`

- [ ] **Step 1: 통합 테스트 작성 (실패 예상)**

Create `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberHistoryRecorderTest.java`:

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
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
class ClubMemberHistoryRecorderTest {

    @Autowired ClubMemberCommandService memberCommandService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubMemberHistoryRepository historyRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    private Club saveClub() {
        return clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("OFFICER → MEMBER 역할 변경 시 ROLE_CHANGED 이력 1행이 기록된다")
    void roleChangeRecordsHistory() {
        User leader = saveUser();
        User officer = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember officerMember = clubMemberRepository.save(
                ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        memberCommandService.updateRole(new UpdateMemberRoleCommand(
                leader.getId(), club.getId(), officerMember.getId(), ClubMemberRole.MEMBER));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), org.springframework.data.domain.PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        var row = rows.getContent().get(0);
        assertThat(row.getEventType()).isEqualTo(ClubMemberEventType.ROLE_CHANGED);
        assertThat(row.getFromRole()).isEqualTo(ClubMemberRole.OFFICER);
        assertThat(row.getToRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(row.getActorUserId()).isEqualTo(leader.getId());
        assertThat(row.getTargetUserId()).isEqualTo(officer.getId());
    }

    @Test
    @DisplayName("transferLeader 시 LEADER_TRANSFERRED 이력 2행이 기록된다")
    void transferLeaderRecordsTwoRows() {
        User leader = saveUser();
        User next = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember nextMember = clubMemberRepository.save(
                ClubMember.of(club, next, ClubMemberRole.OFFICER));

        memberCommandService.transferLeader(new TransferLeaderCommand(
                leader.getId(), club.getId(), nextMember.getId()));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), org.springframework.data.domain.PageRequest.of(0, 10));
        assertThat(rows.getContent())
                .hasSize(2)
                .allMatch(r -> r.getEventType() == ClubMemberEventType.LEADER_TRANSFERRED);
    }

    @Test
    @DisplayName("leaveClub 시 LEFT 이력이 본인을 actor 로 기록된다")
    void leaveRecordsLeft() {
        User member = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, saveUser()));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        memberCommandService.leave(new LeaveClubCommand(member.getId(), club.getId()));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), org.springframework.data.domain.PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        assertThat(rows.getContent().get(0).getEventType()).isEqualTo(ClubMemberEventType.LEFT);
        assertThat(rows.getContent().get(0).getActorUserId()).isEqualTo(member.getId());
        assertThat(rows.getContent().get(0).getToRole()).isNull();
    }

    @Test
    @DisplayName("removeMember 시 REMOVED 이력이 LEADER 를 actor 로 기록된다")
    void removeRecordsRemoved() {
        User leader = saveUser();
        User victim = saveUser();
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember victimMember = clubMemberRepository.save(
                ClubMember.of(club, victim, ClubMemberRole.MEMBER));

        memberCommandService.removeMember(new RemoveMemberCommand(
                leader.getId(), club.getId(), victimMember.getId()));

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), org.springframework.data.domain.PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        assertThat(rows.getContent().get(0).getEventType()).isEqualTo(ClubMemberEventType.REMOVED);
        assertThat(rows.getContent().get(0).getActorUserId()).isEqualTo(leader.getId());
    }
}
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.service.ClubMemberHistoryRecorderTest"`
Expected: 4개 테스트 모두 FAIL (이력 행 없음 — 0 size assertion mismatch).

- [ ] **Step 3: `GeneralClubMemberCommandService` 보강 — `ClubMemberHistoryRecorder` 주입 + 4개 메서드에 기록 추가**

`backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java` 수정 (DI 필드 + 각 메서드 끝에 record 호출):

필드 추가:
```java
    private final ClubMemberHistoryRecorder historyRecorder;
```

`updateRole` 메서드 — `target.changeRole(command.role());` 다음에:
```java
        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.ROLE_CHANGED,
                /* fromRole */ target.getRole() == command.role() ? null : null /* unused — see note */,
                command.role(), null);
```

> 주의: 위 코드 그대로 쓰면 `fromRole` 이 잘못된다. 변경 **전** role 을 잡아야 하므로 변경 전에 변수에 보관해야 한다. 아래로 대체:

`updateRole` 의 전체 메서드를 다음으로 교체:
```java
    @Override
    @Transactional
    public void updateRole(UpdateMemberRoleCommand command) {
        clubAuthService.requireLeader(command.requesterId(), command.clubId());

        if (command.role() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.InvalidRoleAssignment();
        }

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());

        if (target.getUser().getId().equals(command.requesterId())) {
            throw new ClubMemberException.CannotChangeOwnRole();
        }
        if (target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.CannotModifyLeader();
        }

        ClubMemberRole previousRole = target.getRole();
        target.changeRole(command.role());

        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.ROLE_CHANGED,
                previousRole, command.role(), null);
    }
```

`removeMember` 의 `clubMemberRepository.delete(target);` 직전에:
```java
        ClubMemberRole previousRole = target.getRole();
        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.REMOVED, previousRole, null, null);
        clubMemberRepository.delete(target);
```

`leave` 의 `clubMemberRepository.delete(membership);` 직전에:
```java
        ClubMemberRole previousRole = membership.getRole();
        historyRecorder.record(
                command.clubId(), command.requesterId(), command.requesterId(),
                ClubMemberEventType.LEFT, previousRole, null, null);
        clubMemberRepository.delete(membership);
```

`transferLeader` 의 마지막 `return new TransferLeaderQuery(...)` 직전에:
```java
        historyRecorder.record(
                command.clubId(), currentLeader.getUser().getId(), command.requesterId(),
                ClubMemberEventType.LEADER_TRANSFERRED,
                ClubMemberRole.LEADER, ClubMemberRole.OFFICER, null);
        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.LEADER_TRANSFERRED,
                target.getRole() /* 값은 이미 LEADER 로 바뀐 후라 부정확 */, ClubMemberRole.LEADER, null);
```

> 위의 두 번째 record 도 변경 전 role 캡쳐가 필요. `target.changeRole(LEADER)` 호출 직전에 `ClubMemberRole previousTargetRole = target.getRole();` 으로 저장한 뒤, record 호출 시 `previousTargetRole` 사용. 메서드 끝부분 정확한 패치는 다음과 같다:

`transferLeader` 메서드 끝부분(역할 변경 코드 + history)을 다음으로 대체:
```java
        ClubMemberRole previousTargetRole = target.getRole();

        currentLeader.changeRole(ClubMemberRole.OFFICER);
        target.changeRole(ClubMemberRole.LEADER);

        historyRecorder.record(
                command.clubId(), currentLeader.getUser().getId(), command.requesterId(),
                ClubMemberEventType.LEADER_TRANSFERRED,
                ClubMemberRole.LEADER, ClubMemberRole.OFFICER, null);
        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.LEADER_TRANSFERRED,
                previousTargetRole, ClubMemberRole.LEADER, null);

        return new TransferLeaderQuery(
                ClubMemberQuery.from(currentLeader),
                ClubMemberQuery.from(target)
        );
```

필요한 import 추가:
```java
import com.duing.domain.clubmember.entity.ClubMemberEventType;
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.service.ClubMemberHistoryRecorderTest"`
Expected: PASS (4 tests).

(TestContainers/Docker 환경 이슈로 로컬 실행 실패해도 코드는 그대로 진행 — 다른 동일 도메인 통합 테스트도 동일 증상.)

- [ ] **Step 5: 기존 `GeneralClubMemberCommandServiceTest` 등 회귀 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.*"`
Expected: 모두 PASS. Docker 이슈일 경우 컴파일만이라도 통과 확인.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/service/GeneralClubMemberCommandService.java \
        backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberHistoryRecorderTest.java
git commit -m "feat(backend): 기존 권한 변경 4개 경로에 ClubMemberHistory 자동 기록"
```

---

## Task 8: `LeaderSuccessionService` 작성 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/LeaderSuccessionService.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionService.java`
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionServiceTest.java`

- [ ] **Step 1: 도메인 예외 추가 (`ClubMemberException`)**

다음 클래스들을 `ClubMemberException` inner class 로 추가 (4개):

```java
    public static class SuccessionRequiresOfficer extends ClubMemberException {
        public SuccessionRequiresOfficer() {
            super("승계 요청은 해당 동아리의 OFFICER 만 제출할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class DuplicatePendingSuccession extends ClubMemberException {
        public DuplicatePendingSuccession() {
            super("이미 처리 대기 중인 승계 요청이 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class SuccessionRequestNotFound extends ClubMemberException {
        public SuccessionRequestNotFound() {
            super("승계 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class SuccessionRequesterNoLongerOfficer extends ClubMemberException {
        public SuccessionRequesterNoLongerOfficer() {
            super("요청자가 더 이상 OFFICER 가 아닙니다. 새 승계 요청이 필요합니다.",
                  HttpStatus.BAD_REQUEST);
        }
    }

    public static class SuccessionLeaderAbsent extends ClubMemberException {
        public SuccessionLeaderAbsent() {
            super("LEADER 가 없는 동아리는 승계가 아닌 ADMIN 강제 지정 경로를 사용하세요.",
                  HttpStatus.BAD_REQUEST);
        }
    }
```

(기존 `ClubMemberException` 의 base constructor 호출 패턴 그대로.)

- [ ] **Step 2: 통합 테스트 작성**

Create `backend/src/test/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionServiceTest.java`:

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class GeneralLeaderSuccessionServiceTest {

    @Autowired LeaderSuccessionService successionService;
    @Autowired LeaderSuccessionRequestRepository requestRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubMemberHistoryRepository historyRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    private Club saveClub() {
        return clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("OFFICER 가 정상 승계 요청을 제출하면 PENDING 으로 저장된다")
    void createSucceeds() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        Long id = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수 3개월"));
        LeaderSuccessionRequest saved = requestRepository.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(SuccessionStatus.PENDING);
        assertThat(saved.getRequesterUserId()).isEqualTo(officer.getId());
    }

    @Test
    @DisplayName("LEADER 본인의 승계 요청은 400")
    void leaderCannotRequest() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> successionService.create(new CreateSuccessionCommand(
                club.getId(), leader.getId(), "테스트")))
                .isInstanceOf(ClubMemberException.SuccessionRequiresOfficer.class);
    }

    @Test
    @DisplayName("MEMBER 의 승계 요청은 400")
    void memberCannotRequest() {
        User leader = saveUser(UserRole.STUDENT);
        User member = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> successionService.create(new CreateSuccessionCommand(
                club.getId(), member.getId(), "테스트")))
                .isInstanceOf(ClubMemberException.SuccessionRequiresOfficer.class);
    }

    @Test
    @DisplayName("동일 동아리 PENDING 승계가 있으면 중복은 409")
    void duplicatePendingFails() {
        User leader = saveUser(UserRole.STUDENT);
        User officerA = saveUser(UserRole.STUDENT);
        User officerB = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officerA, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, officerB, ClubMemberRole.OFFICER));

        successionService.create(new CreateSuccessionCommand(club.getId(), officerA.getId(), "A"));
        assertThatThrownBy(() -> successionService.create(new CreateSuccessionCommand(
                club.getId(), officerB.getId(), "B")))
                .isInstanceOf(ClubMemberException.DuplicatePendingSuccession.class);
    }

    @Test
    @DisplayName("APPROVED 처리 시 기존 LEADER 는 MEMBER 로, 요청자는 LEADER 로 바뀌고 history 2행이 기록된다")
    void approveSwapsRolesAndRecords() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));

        successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, "확인"));

        LeaderSuccessionRequest processed = requestRepository.findById(requestId).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(SuccessionStatus.APPROVED);

        ClubMember leaderMember = clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId()).orElseThrow();
        ClubMember officerMember = clubMemberRepository.findByClubIdAndUserId(club.getId(), officer.getId()).orElseThrow();
        assertThat(leaderMember.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(officerMember.getRole()).isEqualTo(ClubMemberRole.LEADER);

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent())
                .hasSize(2)
                .allMatch(r -> r.getEventType() == ClubMemberEventType.SUCCESSION_APPROVED);
    }

    @Test
    @DisplayName("REJECTED 처리 시 멤버 변경·history 모두 없다")
    void rejectChangesNothing() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));

        successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.REJECTED, "거절"));

        ClubMember leaderMember = clubMemberRepository.findByClubIdAndUserId(club.getId(), leader.getId()).orElseThrow();
        assertThat(leaderMember.getRole()).isEqualTo(ClubMemberRole.LEADER);
        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).isEmpty();
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 PATCH 하면 예외")
    void processTerminalFails() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));
        successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.REJECTED, null));

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.InvalidSuccessionTransition.class);
    }

    @Test
    @DisplayName("APPROVED 시점에 요청자가 OFFICER 아니게 됐으면 400")
    void approveRequiresStillOfficer() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember officerMember = clubMemberRepository.save(
                ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수"));
        // 요청자가 MEMBER 로 강등됨 (LEADER 가 직접 강등했다고 가정 — 테스트용으로 직접 변경)
        officerMember.changeRole(ClubMemberRole.MEMBER);
        clubMemberRepository.save(officerMember);

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.SuccessionRequesterNoLongerOfficer.class);
    }

    @Test
    @DisplayName("LEADER 가 부재한 동아리는 APPROVED 처리 불가 (강제 지정 경로 사용)")
    void approveRequiresLeaderPresent() {
        User officer = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        // LEADER 없이 OFFICER 만 등록 — 정상 흐름에선 발생하지 않지만 데이터 정합성 회귀용
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        // 요청은 OFFICER 검증 통과해 생성될 수 있음
        Long requestId = successionService.create(new CreateSuccessionCommand(
                club.getId(), officer.getId(), "잠수 (LEADER 부재)"));

        assertThatThrownBy(() -> successionService.process(new ProcessSuccessionCommand(
                requestId, admin.getId(), SuccessionStatus.APPROVED, null)))
                .isInstanceOf(ClubMemberException.SuccessionLeaderAbsent.class);
    }
}
```

- [ ] **Step 3: 인터페이스 + 구현**

`LeaderSuccessionService.java`:
```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface LeaderSuccessionService {
    Long create(CreateSuccessionCommand command);
    void process(ProcessSuccessionCommand command);
    LeaderSuccessionRequest getById(Long requestId);
    Page<LeaderSuccessionRequest> searchForAdmin(SuccessionAdminSearchCondition condition, Pageable pageable);
}
```

`GeneralLeaderSuccessionService.java`:
```java
package com.duing.domain.clubmember.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralLeaderSuccessionService implements LeaderSuccessionService {

    private final LeaderSuccessionRequestRepository requestRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubRepository clubRepository;
    private final ClubMemberHistoryRecorder historyRecorder;
    private final EntityManager entityManager;

    @Override
    @Transactional
    public Long create(CreateSuccessionCommand command) {
        if (clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubMemberException.NotFound();
        }
        ClubMember requester = clubMemberRepository
                .findByClubIdAndUserId(command.clubId(), command.requesterUserId())
                .orElseThrow(ClubMemberException.SuccessionRequiresOfficer::new);
        if (requester.getRole() != ClubMemberRole.OFFICER) {
            throw new ClubMemberException.SuccessionRequiresOfficer();
        }
        requestRepository.findByClubIdAndStatus(command.clubId(), SuccessionStatus.PENDING)
                .ifPresent(existing -> { throw new ClubMemberException.DuplicatePendingSuccession(); });

        try {
            return requestRepository.save(LeaderSuccessionRequest.create(
                    command.clubId(), command.requesterUserId(), command.reason()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubMemberException.DuplicatePendingSuccession();
        }
    }

    @Override
    @Transactional
    public void process(ProcessSuccessionCommand command) {
        LeaderSuccessionRequest request = requestRepository.findByIdForUpdate(command.requestId())
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);

        if (command.status() == SuccessionStatus.REJECTED) {
            request.process(command.handlerAdminId(), SuccessionStatus.REJECTED, command.actionNote());
            return;
        }

        entityManager.clear();

        ClubMember currentLeader = clubMemberRepository
                .findByClubIdAndRoleForUpdate(request.getClubId(), ClubMemberRole.LEADER)
                .orElseThrow(ClubMemberException.SuccessionLeaderAbsent::new);
        ClubMember requesterMember = clubMemberRepository
                .findByClubIdAndUserIdForUpdate(request.getClubId(), request.getRequesterUserId())
                .orElseThrow(ClubMemberException.SuccessionRequesterNoLongerOfficer::new);

        if (requesterMember.getRole() != ClubMemberRole.OFFICER) {
            throw new ClubMemberException.SuccessionRequesterNoLongerOfficer();
        }

        currentLeader.changeRole(ClubMemberRole.MEMBER);
        requesterMember.changeRole(ClubMemberRole.LEADER);

        historyRecorder.record(
                request.getClubId(), currentLeader.getUser().getId(), command.handlerAdminId(),
                ClubMemberEventType.SUCCESSION_APPROVED,
                ClubMemberRole.LEADER, ClubMemberRole.MEMBER, command.actionNote());
        historyRecorder.record(
                request.getClubId(), requesterMember.getUser().getId(), command.handlerAdminId(),
                ClubMemberEventType.SUCCESSION_APPROVED,
                ClubMemberRole.OFFICER, ClubMemberRole.LEADER, command.actionNote());

        request.process(command.handlerAdminId(), SuccessionStatus.APPROVED, command.actionNote());
    }

    @Override
    public LeaderSuccessionRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);
    }

    @Override
    public Page<LeaderSuccessionRequest> searchForAdmin(
            SuccessionAdminSearchCondition condition, Pageable pageable
    ) {
        return requestRepository.searchForAdmin(condition, pageable);
    }
}
```

- [ ] **Step 4: 테스트 실행, 9/9 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.service.GeneralLeaderSuccessionServiceTest"`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/service/LeaderSuccessionService.java \
        backend/src/main/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionService.java \
        backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java \
        backend/src/test/java/com/duing/domain/clubmember/service/GeneralLeaderSuccessionServiceTest.java
git commit -m "feat(backend): LeaderSuccessionService — 요청 생성/승인/거절 + 감사로그"
```

---

## Task 9: `AdminLeaderAssignmentService` (강제 지정) (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/AdminLeaderAssignmentService.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentService.java`
- Test: `backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceTest.java`

- [ ] **Step 1: 새 예외 클래스 추가**

`ClubMemberException` 에 추가:

```java
    public static class AdminAssignTargetNotMember extends ClubMemberException {
        public AdminAssignTargetNotMember() {
            super("강제 지정 대상은 해당 동아리의 ClubMember 여야 합니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class AdminAssignLeaderAlreadyExists extends ClubMemberException {
        public AdminAssignLeaderAlreadyExists() {
            super("이미 LEADER 가 존재하는 동아리는 정상 인계 경로를 사용하세요.",
                  HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 2: 통합 테스트 작성**

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class GeneralAdminLeaderAssignmentServiceTest {

    @Autowired AdminLeaderAssignmentService service;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubMemberHistoryRepository historyRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    private Club saveClub() {
        return clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("LEADER 부재 동아리의 MEMBER 를 LEADER 로 강제 지정하면 역할이 바뀌고 history 1행이 기록된다")
    void assignSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.of(club, candidate, ClubMemberRole.MEMBER));

        service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "전 회장 졸업"));

        ClubMember updated = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), candidate.getId()).orElseThrow();
        assertThat(updated.getRole()).isEqualTo(ClubMemberRole.LEADER);

        var rows = historyRepository.findByClubIdOrderByCreatedAtDesc(
                club.getId(), PageRequest.of(0, 10));
        assertThat(rows.getContent()).hasSize(1);
        var row = rows.getContent().get(0);
        assertThat(row.getEventType()).isEqualTo(ClubMemberEventType.ADMIN_LEADER_ASSIGNED);
        assertThat(row.getFromRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(row.getToRole()).isEqualTo(ClubMemberRole.LEADER);
        assertThat(row.getActorUserId()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("LEADER 가 이미 있는 동아리에 강제 지정하면 400")
    void rejectsWhenLeaderExists() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, candidate, ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "테스트")))
                .isInstanceOf(ClubMemberException.AdminAssignLeaderAlreadyExists.class);
    }

    @Test
    @DisplayName("후보가 ClubMember 가 아니면 404")
    void rejectsWhenCandidateNotMember() {
        User admin = saveUser(UserRole.ADMIN);
        User candidate = saveUser(UserRole.STUDENT);
        Club club = saveClub();

        assertThatThrownBy(() -> service.assign(new AssignLeaderByAdminCommand(
                club.getId(), candidate.getId(), admin.getId(), "테스트")))
                .isInstanceOf(ClubMemberException.AdminAssignTargetNotMember.class);
    }
}
```

- [ ] **Step 3: 인터페이스 + 구현**

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;

public interface AdminLeaderAssignmentService {
    void assign(AssignLeaderByAdminCommand command);
}
```

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminLeaderAssignmentService implements AdminLeaderAssignmentService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRecorder historyRecorder;

    @Override
    @Transactional
    public void assign(AssignLeaderByAdminCommand command) {
        ClubMember candidate = clubMemberRepository
                .findByClubIdAndUserIdForUpdate(command.clubId(), command.newLeaderUserId())
                .orElseThrow(ClubMemberException.AdminAssignTargetNotMember::new);

        if (clubMemberRepository.existsByClubIdAndRole(command.clubId(), ClubMemberRole.LEADER)) {
            throw new ClubMemberException.AdminAssignLeaderAlreadyExists();
        }

        ClubMemberRole previousRole = candidate.getRole();
        candidate.changeRole(ClubMemberRole.LEADER);

        historyRecorder.record(
                command.clubId(), candidate.getUser().getId(), command.actorAdminId(),
                ClubMemberEventType.ADMIN_LEADER_ASSIGNED,
                previousRole, ClubMemberRole.LEADER, command.reason());
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.clubmember.service.GeneralAdminLeaderAssignmentServiceTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/service/AdminLeaderAssignmentService.java \
        backend/src/main/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentService.java \
        backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java \
        backend/src/test/java/com/duing/domain/clubmember/service/GeneralAdminLeaderAssignmentServiceTest.java
git commit -m "feat(backend): AdminLeaderAssignmentService — LEADER 부재 시 강제 지정"
```

---

## Task 10: Request / Response DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/request/CreateLeaderSuccessionRequestRequest.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/request/ProcessLeaderSuccessionRequest.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/request/AssignAdminLeaderRequest.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/SuccessionRequestSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/SuccessionRequestDetailResponse.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberHistoryResponse.java`

- [ ] **Step 1: Request DTO 3종**

```java
package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateLeaderSuccessionRequestRequest(
        @NotBlank(message = "사유는 필수 입력값입니다.")
        @Size(max = 1000, message = "사유는 1000자 이하여야 합니다.") String reason
) {
    public CreateSuccessionCommand toCommand(Long clubId, Long requesterUserId) {
        return new CreateSuccessionCommand(clubId, requesterUserId, reason);
    }
}
```

```java
package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessLeaderSuccessionRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") SuccessionStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessSuccessionCommand toCommand(Long requestId, Long handlerAdminId) {
        return new ProcessSuccessionCommand(requestId, handlerAdminId, status, actionNote);
    }
}
```

```java
package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record AssignAdminLeaderRequest(
        @NotNull(message = "새 LEADER ID는 필수입니다.") @Positive Long newLeaderUserId,
        @NotBlank(message = "사유는 필수 입력값입니다.")
        @Size(max = 1000, message = "사유는 1000자 이하여야 합니다.") String reason
) {
    public AssignLeaderByAdminCommand toCommand(Long clubId, Long actorAdminId) {
        return new AssignLeaderByAdminCommand(clubId, newLeaderUserId, actorAdminId, reason);
    }
}
```

- [ ] **Step 2: Response DTO 3종**

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

public record SuccessionRequestSummaryResponse(
        Long id,
        Long clubId,
        String clubName,
        UserRef requester,
        SuccessionStatus status,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static SuccessionRequestSummaryResponse of(
            LeaderSuccessionRequest request, String clubName, UserRef requester
    ) {
        return new SuccessionRequestSummaryResponse(
                request.getId(), request.getClubId(), clubName,
                requester, request.getStatus(), request.getCreatedAt()
        );
    }
}
```

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import java.time.LocalDateTime;

public record SuccessionRequestDetailResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        UserRef currentLeader,
        String reason,
        SuccessionStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static SuccessionRequestDetailResponse of(
            LeaderSuccessionRequest request,
            ClubRef club, UserRef requester, UserRef currentLeader, UserRef handler
    ) {
        return new SuccessionRequestDetailResponse(
                request.getId(), club, requester, currentLeader,
                request.getReason(), request.getStatus(), request.getActionNote(),
                handler, request.getHandledAt(), request.getCreatedAt()
        );
    }
}
```

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record ClubMemberHistoryResponse(
        Long id,
        ClubMemberEventType eventType,
        UserRef target,
        UserRef actor,
        ClubMemberRole fromRole,
        ClubMemberRole toRole,
        String reason,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static ClubMemberHistoryResponse of(
            ClubMemberHistory history, UserRef target, UserRef actor
    ) {
        return new ClubMemberHistoryResponse(
                history.getId(), history.getEventType(), target, actor,
                history.getFromRole(), history.getToRole(),
                history.getReason(), history.getCreatedAt()
        );
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd ..
git add backend/src/main/java/com/duing/domain/clubmember/controller/dto/
git commit -m "feat(backend): 승계요청·이력 Request/Response DTO 정의"
```

---

## Task 11: 사용자 Api / Controller (`LeaderSuccessionController`)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/api/LeaderSuccessionApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/LeaderSuccessionController.java`

- [ ] **Step 1: API 인터페이스**

```java
package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.CreateLeaderSuccessionRequestRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "회장 승계", description = "잠수 LEADER 에 대한 OFFICER 승계 요청 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderSuccessionApi {

    @Operation(summary = "승계 요청 제출 (OFFICER)",
            description = "본인이 OFFICER 인 동아리의 LEADER 가 잠수 상태일 때 승계 의사를 제출한다.")
    @PostMapping("/clubs/{clubId}/leader-succession-requests")
    ResponseEntity<ApiResponse<Long>> createRequest(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateLeaderSuccessionRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.LeaderSuccessionApi;
import com.duing.domain.clubmember.controller.dto.request.CreateLeaderSuccessionRequestRequest;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
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
public class LeaderSuccessionController implements LeaderSuccessionApi {

    private final LeaderSuccessionService successionService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createRequest(
            Long clubId,
            CreateLeaderSuccessionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long requestId = successionService.create(
                request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(requestId));
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd ..
git add backend/src/main/java/com/duing/domain/clubmember/api/LeaderSuccessionApi.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/LeaderSuccessionController.java
git commit -m "feat(backend): POST /clubs/{clubId}/leader-succession-requests — OFFICER 승계 요청 제출"
```

---

## Task 12: ADMIN Api / Controller

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/api/AdminLeaderSuccessionApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/AdminLeaderSuccessionController.java`

- [ ] **Step 1: Admin API 인터페이스**

```java
package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.AssignAdminLeaderRequest;
import com.duing.domain.clubmember.controller.dto.request.ProcessLeaderSuccessionRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestDetailResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestSummaryResponse;
import com.duing.domain.clubmember.entity.SuccessionStatus;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회장 승계(총동연)", description = "총동연 전용 승계 처리 / 강제 지정 / 이력 조회")
@SecurityRequirement(name = "BearerAuth")
public interface AdminLeaderSuccessionApi {

    @Operation(summary = "승계 요청 목록")
    @GetMapping("/admin/leader-succession-requests")
    ResponseEntity<ApiResponse<PageResponse<SuccessionRequestSummaryResponse>>> listRequests(
            @RequestParam(required = false) SuccessionStatus status,
            @RequestParam(required = false) Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "승계 요청 상세")
    @GetMapping("/admin/leader-succession-requests/{requestId}")
    ResponseEntity<ApiResponse<SuccessionRequestDetailResponse>> getRequest(
            @PathVariable Long requestId
    );

    @Operation(summary = "승계 요청 처리")
    @PatchMapping("/admin/leader-succession-requests/{requestId}")
    ResponseEntity<ApiResponse<Void>> processRequest(
            @PathVariable Long requestId,
            @Valid @RequestBody ProcessLeaderSuccessionRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "ADMIN 강제 LEADER 지정 (LEADER 부재 동아리 한정)")
    @PostMapping("/admin/clubs/{clubId}/leader")
    ResponseEntity<ApiResponse<Void>> assignLeader(
            @PathVariable Long clubId,
            @Valid @RequestBody AssignAdminLeaderRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 권한 변경 이력 조회")
    @GetMapping("/admin/clubs/{clubId}/member-history")
    ResponseEntity<ApiResponse<PageResponse<ClubMemberHistoryResponse>>> listMemberHistory(
            @PathVariable Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.clubmember.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.api.AdminLeaderSuccessionApi;
import com.duing.domain.clubmember.controller.dto.request.AssignAdminLeaderRequest;
import com.duing.domain.clubmember.controller.dto.request.ProcessLeaderSuccessionRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestDetailResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestSummaryResponse;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.AdminLeaderAssignmentService;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminLeaderSuccessionController implements AdminLeaderSuccessionApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final LeaderSuccessionService successionService;
    private final AdminLeaderAssignmentService leaderAssignmentService;
    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRepository historyRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<SuccessionRequestSummaryResponse>>> listRequests(
            SuccessionStatus status, Long clubId, Pageable pageable
    ) {
        Page<LeaderSuccessionRequest> page = successionService.searchForAdmin(
                new SuccessionAdminSearchCondition(status, clubId), pageable);
        Page<SuccessionRequestSummaryResponse> mapped = page.map(request ->
                SuccessionRequestSummaryResponse.of(
                        request,
                        clubName(request.getClubId()),
                        toSummaryUserRef(request.getRequesterUserId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<SuccessionRequestDetailResponse>> getRequest(Long requestId) {
        LeaderSuccessionRequest request = successionService.getById(requestId);
        SuccessionRequestDetailResponse.ClubRef clubRef = clubRefOrDeleted(request.getClubId());
        SuccessionRequestDetailResponse.UserRef requester = toDetailUserRef(request.getRequesterUserId()).orElse(null);
        SuccessionRequestDetailResponse.UserRef currentLeader = currentLeaderRef(request.getClubId());
        SuccessionRequestDetailResponse.UserRef handler = request.getHandledBy() == null
                ? null
                : toDetailUserRef(request.getHandledBy()).orElse(null);
        return ResponseEntity.ok(ApiResponse.success(SuccessionRequestDetailResponse.of(
                request, clubRef, requester, currentLeader, handler)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, ProcessLeaderSuccessionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        successionService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> assignLeader(
            Long clubId, AssignAdminLeaderRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        if (clubRepository.findById(clubId).isEmpty()) {
            throw new ClubMemberException.NotFound();
        }
        leaderAssignmentService.assign(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ClubMemberHistoryResponse>>> listMemberHistory(
            Long clubId, Pageable pageable
    ) {
        if (clubRepository.findById(clubId).isEmpty()) {
            throw new ClubMemberException.NotFound();
        }
        Page<ClubMemberHistory> page = historyRepository.findByClubIdOrderByCreatedAtDesc(clubId, pageable);
        Page<ClubMemberHistoryResponse> mapped = page.map(history -> ClubMemberHistoryResponse.of(
                history,
                toHistoryUserRef(history.getTargetUserId()),
                toHistoryUserRef(history.getActorUserId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private String clubName(Long clubId) {
        return clubRepository.findById(clubId).map(Club::getName).orElse(DELETED_LABEL);
    }

    private SuccessionRequestDetailResponse.ClubRef clubRefOrDeleted(Long clubId) {
        return clubRepository.findById(clubId)
                .map(club -> new SuccessionRequestDetailResponse.ClubRef(club.getId(), club.getName()))
                .orElse(new SuccessionRequestDetailResponse.ClubRef(clubId, DELETED_LABEL));
    }

    private SuccessionRequestDetailResponse.UserRef currentLeaderRef(Long clubId) {
        Optional<ClubMember> leader = clubMemberRepository.findAll().stream()
                .filter(member -> member.getClub().getId().equals(clubId)
                        && member.getRole() == ClubMemberRole.LEADER)
                .findFirst();
        return leader
                .map(member -> new SuccessionRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .orElse(null);
    }

    private SuccessionRequestSummaryResponse.UserRef toSummaryUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new SuccessionRequestSummaryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new SuccessionRequestSummaryResponse.UserRef(userId, DELETED_LABEL));
    }

    private Optional<SuccessionRequestDetailResponse.UserRef> toDetailUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new SuccessionRequestDetailResponse.UserRef(user.getId(), user.getName()));
    }

    private ClubMemberHistoryResponse.UserRef toHistoryUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new ClubMemberHistoryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new ClubMemberHistoryResponse.UserRef(userId, DELETED_LABEL));
    }
}
```

> 주: `currentLeaderRef` 의 `findAll().stream()` 은 임시 — 작은 데이터셋이면 OK. 대규모 동아리에서는 `clubMemberRepository.findByClubIdAndRole(clubId, ClubMemberRole.LEADER)` 같은 메서드를 별도로 추가하는 게 낫다. 본 plan 범위 밖이지만 후속 개선 항목.
>
> 더 깔끔하게 하려면 ClubMemberRepository 에 `Optional<ClubMember> findFirstByClubIdAndRole(Long clubId, ClubMemberRole role);` 를 추가하고 이를 사용하라.

`currentLeaderRef` 의 깔끔한 버전 (권장 — Repository 메서드 추가):

`ClubMemberRepository` 에 추가:
```java
    java.util.Optional<com.duing.domain.clubmember.entity.ClubMember>
            findFirstByClubIdAndRole(Long clubId, com.duing.domain.clubmember.entity.ClubMemberRole role);
```

Controller 의 `currentLeaderRef` 본문 교체:
```java
    private SuccessionRequestDetailResponse.UserRef currentLeaderRef(Long clubId) {
        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(member -> new SuccessionRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .orElse(null);
    }
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd ..
git add backend/src/main/java/com/duing/domain/clubmember/api/AdminLeaderSuccessionApi.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/AdminLeaderSuccessionController.java \
        backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java
git commit -m "feat(backend): /admin/leader-succession-requests + /admin/clubs/{}/leader|member-history"
```

---

## Task 13: Acceptance Test (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubmember/LeaderSuccessionAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.clubmember;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
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
class LeaderSuccessionAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String officerToken;
    private Long clubId;
    private Long officerUserId;
    private Long leaderUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        leaderUserId = leader.getId();
        officerUserId = officer.getId();
        Club club = clubRepository.save(Club.create("타깃동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubId = club.getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    @Test
    @DisplayName("OFFICER 가 승계 요청을 제출하면 201 이 반환된다")
    void createRequestSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수 3개월"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("미인증 요청은 401")
    void unauthenticatedRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "테스트"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/leader-succession-requests 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().get("/api/v1/admin/leader-succession-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 이 승계 요청을 APPROVED 로 처리하면 204 + 역할이 교환된다")
    void adminApprovesSwapsRoles() {
        Long requestId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("reason", "잠수"))
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "APPROVED", "actionNote", "확인"))
                .when().patch("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        ClubMember leaderRow = clubMemberRepository.findByClubIdAndUserId(clubId, leaderUserId).orElseThrow();
        ClubMember officerRow = clubMemberRepository.findByClubIdAndUserId(clubId, officerUserId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(leaderRow.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        org.assertj.core.api.Assertions.assertThat(officerRow.getRole()).isEqualTo(ClubMemberRole.LEADER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/leader-succession-requests/" + requestId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.status", equalTo(SuccessionStatus.APPROVED.name()));
    }

    @Test
    @DisplayName("ADMIN 강제 LEADER 지정 + 이력 조회까지 정상 동작")
    void adminAssignLeaderAndHistory() {
        // 기존 LEADER 제거 (강제 부재 상태 만들기)
        clubMemberRepository.deleteAll(
                clubMemberRepository.findAll().stream()
                        .filter(m -> m.getClub().getId().equals(clubId)
                                && m.getRole() == ClubMemberRole.LEADER)
                        .toList());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("newLeaderUserId", officerUserId, "reason", "전 회장 졸업"))
                .when().post("/api/v1/admin/clubs/" + clubId + "/leader")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        ClubMember promoted = clubMemberRepository.findByClubIdAndUserId(clubId, officerUserId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(promoted.getRole()).isEqualTo(ClubMemberRole.LEADER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/" + clubId + "/member-history")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].eventType", equalTo("ADMIN_LEADER_ASSIGNED"));
    }

    @Test
    @DisplayName("동일 동아리 PENDING 승계 중복은 409")
    void duplicatePendingConflict() {
        Map<String, Object> body = Map.of("reason", "잠수");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/leader-succession-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }
}
```

- [ ] **Step 2: 컴파일 + 실행**

```bash
cd backend && ./gradlew compileTestJava
./gradlew test --tests "com.duing.domain.clubmember.LeaderSuccessionAcceptanceTest"
```
Expected: PASS (5 tests). Docker/TestContainers 환경 이슈로 실패 시 DONE_WITH_CONCERNS — 코드는 그대로 진행.

- [ ] **Step 3: Commit**

```bash
cd ..
git add backend/src/test/java/com/duing/domain/clubmember/LeaderSuccessionAcceptanceTest.java
git commit -m "test(backend): LeaderSuccession API 인수 테스트 — 201/401/403/409/204 케이스"
```

---

## Task 14: REQUIREMENTS 갱신 + PR

**Files:**
- Modify: `REQUIREMENTS.md` (§2.6 신설 또는 §1.3 의 outdated 문구 정리)

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd backend && ./gradlew test
```
Expected: 전체 PASS (Docker 이슈는 노트).

- [ ] **Step 2: REQUIREMENTS.md 보강**

`REQUIREMENTS.md` §1.3 의 "OFFICER 승급/강등·추방·탈퇴·인계 API 는 MVP 이후 확장" 문구를 다음으로 교체:

```
ClubMember 운영(승급/강등·추방·탈퇴·정상 인계)은 이미 제공. 본 도메인은 잠수 LEADER 대상
OFFICER 승계 요청·승인 + ADMIN 강제 LEADER 지정 + 권한 변경 감사 로그를 추가한다.
```

§2.4 다음에 새 절 §2.6 추가:

```markdown
### 2.6 Leader Succession (회장 승계 / 권한 복구)

**엔티티 필드 (LeaderSuccessionRequest)**: `id`, `clubId`(FK), `requesterUserId`(FK users), `reason`(≤1000),
`status`(PENDING/APPROVED/REJECTED), `actionNote`, `handledBy`, `handledAt`.

**감사 로그 (ClubMemberHistory)**: 모든 권한 변경(`ROLE_CHANGED`, `LEADER_TRANSFERRED`, `LEFT`, `REMOVED`,
`ADMIN_LEADER_ASSIGNED`, `SUCCESSION_APPROVED`)을 `(club_id, target_user_id, actor_user_id, event_type, from_role, to_role, reason)` 으로 기록.

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| LS-1 | 승계 요청 제출 (OFFICER) | `clubId`, `reason` | `requestId` (201) | 401 / 400 OFFICER 아님 / 404 club 없음 / 409 PENDING 중복 |
| LS-2 | 승계 목록 (ADMIN) | `status?`, `clubId?`, Pageable | `PageResponse<SuccessionRequestSummaryResponse>` (200) | 401/403 |
| LS-3 | 승계 상세 (ADMIN) | `requestId` | `SuccessionRequestDetailResponse` (200) | 401/403/404 |
| LS-4 | 승계 처리 (ADMIN) | `requestId`, `status`(APPROVED/REJECTED), `actionNote?` | 204 | 400 잘못된 전이 / LEADER 부재 / 요청자 OFFICER 아님 |
| LH-1 | ADMIN 강제 LEADER 지정 | `clubId`, `newLeaderUserId`, `reason` | 204 | 400 LEADER 존재 / 404 club·후보 없음 |
| LH-2 | 동아리 권한 이력 (ADMIN) | `clubId`, Pageable | `PageResponse<ClubMemberHistoryResponse>` (200) | 401/403/404 |

**비기능 요구사항**
- 조건부 유니크: `(club_id) WHERE status='PENDING' AND deleted_at IS NULL` — 동아리당 PENDING 1건.
- APPROVED 시 단일 트랜잭션 + PESSIMISTIC_WRITE 로 두 ClubMember 행 교환.
- ADMIN 강제 지정은 LEADER 존재 시 400 — 정상 인계 경로 사용.
- 모든 권한 변경은 ClubMemberHistory 에 자동 기록.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add REQUIREMENTS.md
git commit -m "docs: REQUIREMENTS 에 Leader Succession (LS/LH) 도메인 추가"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/leader-succession
gh pr create --base develop --title "feat: 회장 승계 + ADMIN 강제 LEADER 지정 + 권한 변경 감사 로그" --body "$(cat <<'EOF'
## 🚀 작업 내용

- `clubmember` 도메인을 확장해 잠수 LEADER 대상 OFFICER 승계 워크플로우(`LS-1~4`), ADMIN 의 강제 LEADER 지정(`LH-1`), 동아리별 권한 변경 이력(`LH-2`) 6개 API 를 추가했다.
- `ClubMemberHistory` 감사 테이블을 신설하고, 기존 `transferLeader / updateRole / leave / removeMember` 4개 경로가 권한 변경 시점에 history 행을 자동 기록하도록 보강했다.
- 새 흐름과 기존 정상 인계 흐름을 분리 — APPROVED 처리 시 LEADER 부재면 400 으로 막아 강제 지정 경로로 유도한다.

## 🤔 고민했던 내용

- 감사 로그 기록 위치: 이벤트 리스너 vs 서비스 직접 호출 → 도메인 경계 단순 추적이라 비동기·재시도 정책이 필요 없어 서비스 직접 호출로 결정.
- 승계 APPROVED 시 기존 LEADER 의 새 역할: MEMBER 강등이 가장 보수적이고 일관성 있어 채택 (OFFICER 유지는 잠수 LEADER 의 권한 행사 여지를 남김).
- ADMIN 강제 지정은 별도 워크플로우 vs OFFICER 승계와 통합 → 데이터 정합성 단순화를 위해 별도 단일 액션 endpoint 로 분리.
- 동아리당 PENDING 1건 제약: 조건부 unique index 로 DB 차원에서 보장 + 서비스 선조회로 race 시 메시지 일관성.

## 💬 리뷰 중점사항

- `GeneralClubMemberCommandService` 의 4개 기존 메서드 보강 — 변경 전 role 캡쳐 / actor 식별 / from↔to 역할 매핑이 정확한지.
- `LeaderSuccessionService.process` 의 PESSIMISTIC_WRITE 두 행 락 + LEADER 부재·OFFICER 무효 재검증 로직.
- ADMIN 강제 지정의 LEADER 존재 재검증 시점(락 획득 후) 적절성.
- 응답 DTO 의 ADMIN 전용 정보(handledBy/At, requester/actor name) 노출 정책 위반 없는지.
- 로컬 Testcontainers/Docker 이슈로 통합 테스트 실행이 CI 의존 — CI 결과 확인 필요.
EOF
)"
```

---

## Self-Review Notes

스펙 §2~§10 매핑:

- §2 In Scope (OFFICER 승계 요청 + ADMIN 처리, 강제 LEADER 지정, 권한 변경 감사 로그, ADMIN 조회) → Task 1(테이블) / 3·4(엔티티) / 7(자동 기록) / 8(승계) / 9(강제 지정) / 11·12(API).
- §2 Out of Scope → 본 plan 미포함.
- §3.1 LeaderSuccessionRequest → Task 1 + Task 3.
- §3.2 ClubMemberHistory → Task 1 + Task 4.
- §3.3 Flyway → Task 1.
- §4 API (LS-1~4, LH-1, LH-2) → Task 11 (LS-1) + Task 12 (나머지).
- §5 기존 코드 보강 (4개 메서드에 history 기록) → Task 7.
- §6.1 권한 정책 → Task 11 `@PreAuthorize("isAuthenticated()")` + Task 12 `@PreAuthorize("hasRole('ADMIN')")`. OFFICER 검증은 `LeaderSuccessionService.create` 가 `ClubMember` 직접 조회(Task 8) — `ClubAuthService.requireOfficer` 는 Task 5 에서 추가했지만 service 에서 직접 검사하므로 사실상 미사용. 향후 컨트롤러 단에서 guard 로 쓰려면 그 때 사용.
- §6.2 입력 검증 → Task 10.
- §6.3 동시성 → Task 8 (PESSIMISTIC_WRITE) + Task 9 (existsBy + findForUpdate).
- §7 노출 / 감사 정책 → Task 12 (admin path 분리, ADMIN-only fields).
- §8 테스트 → Task 3·7·8·9·13.
- §9 마이그레이션 → Task 1.

Type / 시그니처 일관성:
- `SuccessionStatus.isTerminal()` 사용 위치: Task 3 (엔티티), Task 8 의 종결 검사 — 시그니처 일치.
- `ClubMemberEventType` 6개 값: Task 1 SQL CHECK + Task 2 enum + Task 7·8·9 의 record 호출 모두 일치.
- `LeaderSuccessionRequest.process(Long, SuccessionStatus, String)` — Task 3 정의, Task 8 호출 인자 일치.
- `historyRecorder.record(...)` 시그니처 — Task 6 정의 후 Task 7·8·9 호출 인자 일치.
- `ClubMemberRepository.findByClubIdAndUserIdForUpdate / findByClubIdAndRoleForUpdate / existsByClubIdAndRole / findFirstByClubIdAndRole` — Task 5 와 Task 12 에서 추가 후 Task 8·9·12 에서 사용.

Placeholder scan: 없음.
