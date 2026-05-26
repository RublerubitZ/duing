# 중앙동아리 연간 재인증 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 중앙동아리 라운드 단위 재인증 워크플로우 (라운드 OPEN/CLOSED, LEADER 제출, ADMIN 처리, `lastVerifiedYear` 갱신, ADMIN 미인증 동아리 조회)를 기존 `club` 도메인에 추가한다.

**Architecture:** 두 신규 엔티티 (`RecertificationRound`, `RecertificationRequest`) + Club 컬럼 1개 추가 (`last_verified_year`). 자동 해제 / 스케줄러 없음. EXPIRED 판정은 RC-5 응답에서 계산값으로 노출. 동시성은 기존 패턴(조건부 unique 인덱스 + DataIntegrityViolation 캐치) 재사용.

**Tech Stack:** Spring Boot 3.4, Java 21, JPA + QueryDSL, Flyway (Postgres), TestContainers + RestAssured.

**Spec:** `docs/superpowers/specs/2026-05-20-central-club-recertification-design.md`

**Branch:** `feat/central-club-recertification` (이미 체크아웃됨, spec 커밋 포함)

---

## File Structure

신규 (`backend/src/main/java/com/duing/domain/club/` 하위 — 기존 club 도메인 확장):

```
club/
├── api/
│   ├── LeaderRecertificationApi.java                  # POST /clubs/{clubId}/recertification-requests
│   ├── AdminRecertificationRoundApi.java              # /admin/recertification-rounds (RR-1~3)
│   └── AdminRecertificationRequestApi.java            # /admin/recertification-requests (RC-2~4) + /admin/clubs/recertification-status (RC-5)
├── controller/
│   ├── LeaderRecertificationController.java
│   ├── AdminRecertificationRoundController.java
│   └── AdminRecertificationRequestController.java
├── controller/dto/
│   ├── request/
│   │   ├── CreateRecertificationRoundRequest.java
│   │   ├── CreateRecertificationRequestRequest.java
│   │   └── ProcessRecertificationRequest.java
│   └── response/
│       ├── RecertificationRoundResponse.java
│       ├── RecertificationRequestSummaryResponse.java
│       ├── RecertificationRequestDetailResponse.java
│       └── CentralClubRecertificationStatusResponse.java
├── entity/
│   ├── RecertificationRound.java
│   ├── RoundStatus.java                # OPEN, CLOSED
│   ├── RecertificationRequest.java
│   └── RecertificationStatus.java      # PENDING, APPROVED, REJECTED
├── repository/
│   ├── RecertificationRoundRepository.java
│   ├── RecertificationRequestRepository.java
│   ├── RecertificationRequestRepositoryCustom.java
│   └── RecertificationRequestRepositoryImpl.java       # QueryDSL admin 검색 + RC-5 EXPIRED 조회
└── service/
    ├── RecertificationRoundService.java               # interface
    ├── GeneralRecertificationRoundService.java
    ├── RecertificationRequestService.java             # interface
    ├── GeneralRecertificationRequestService.java
    └── dto/
        ├── command/
        │   ├── OpenRoundCommand.java
        │   ├── CloseRoundCommand.java
        │   ├── CreateRecertificationCommand.java
        │   └── ProcessRecertificationCommand.java
        └── query/
            ├── RoundAdminSearchCondition.java
            ├── RecertificationAdminSearchCondition.java
            └── CentralClubRecertificationStatusQuery.java
```

수정:
- `backend/src/main/java/com/duing/domain/club/entity/Club.java` — `last_verified_year` 컬럼 + `updateLastVerifiedYear(int year)` 메서드
- `backend/src/main/java/com/duing/domain/club/exception/ClubException.java` — 7개 새 inner exception
- `backend/src/main/java/com/duing/domain/club/repository/ClubRepository.java` — `findByIdForUpdate` 추가 (없다면)

Flyway:
- `backend/src/main/resources/db/migration/V29__create_recertification_round_and_request.sql`

테스트:
- `backend/src/test/java/com/duing/domain/club/entity/RecertificationRoundTest.java`
- `backend/src/test/java/com/duing/domain/club/entity/RecertificationRequestTest.java`
- `backend/src/test/java/com/duing/domain/club/service/GeneralRecertificationRoundServiceTest.java`
- `backend/src/test/java/com/duing/domain/club/service/GeneralRecertificationRequestServiceTest.java`
- `backend/src/test/java/com/duing/domain/club/CentralClubRecertificationAcceptanceTest.java`

---

## Task 1: Flyway V29 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V29__create_recertification_round_and_request.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- recertification_round: 재인증 라운드
CREATE TABLE recertification_round (
    id          BIGSERIAL    PRIMARY KEY,
    year        INT          NOT NULL,
    label       VARCHAR(100) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    opened_by   BIGINT       NOT NULL REFERENCES users(id),
    opened_at   TIMESTAMP    NOT NULL,
    closed_by   BIGINT       REFERENCES users(id),
    closed_at   TIMESTAMP,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rr_status     CHECK (status IN ('OPEN','CLOSED')),
    CONSTRAINT chk_rr_close_pair CHECK (
        (status = 'OPEN'   AND closed_by IS NULL     AND closed_at IS NULL) OR
        (status = 'CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_rr_open_per_year
    ON recertification_round (year)
    WHERE status = 'OPEN' AND deleted_at IS NULL;

CREATE INDEX idx_rr_year_desc ON recertification_round (year DESC)
    WHERE deleted_at IS NULL;

-- recertification_request: 동아리별 재인증 제출
CREATE TABLE recertification_request (
    id              BIGSERIAL    PRIMARY KEY,
    round_id        BIGINT       NOT NULL REFERENCES recertification_round(id),
    club_id         BIGINT       NOT NULL REFERENCES club(id),
    leader_user_id  BIGINT       NOT NULL REFERENCES users(id),
    contact_email   VARCHAR(255) NOT NULL,
    contact_phone   VARCHAR(40)  NOT NULL,
    operating_year  INT          NOT NULL,
    notes           TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note     TEXT,
    handled_by      BIGINT       REFERENCES users(id),
    handled_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rcr_status         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    CONSTRAINT chk_rcr_notes_len      CHECK (notes IS NULL OR char_length(notes) <= 2000),
    CONSTRAINT chk_rcr_action_len     CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_rcr_handled_pair   CHECK (
        (status = 'PENDING' AND handled_by IS NULL     AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_rcr_active_pending
    ON recertification_request (round_id, club_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_rcr_admin_feed
    ON recertification_request (round_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_rcr_club_recent
    ON recertification_request (club_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- club: last_verified_year
ALTER TABLE club ADD COLUMN last_verified_year INT;
```

- [ ] **Step 2: 컴파일 검증**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/resources/db/migration/V29__create_recertification_round_and_request.sql
git commit -m "feat(backend): 재인증 라운드/요청 + club.last_verified_year 마이그레이션 (V29)"
```

---

## Task 2: Enum 2종

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/entity/RoundStatus.java`
- Create: `backend/src/main/java/com/duing/domain/club/entity/RecertificationStatus.java`

- [ ] **Step 1: `RoundStatus`**

```java
package com.duing.domain.club.entity;

public enum RoundStatus {
    OPEN, CLOSED;

    public boolean isClosed() {
        return this == CLOSED;
    }
}
```

- [ ] **Step 2: `RecertificationStatus`**

```java
package com.duing.domain.club.entity;

public enum RecertificationStatus {
    PENDING, APPROVED, REJECTED;

    public boolean isTerminal() {
        return this == APPROVED || this == REJECTED;
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/RoundStatus.java \
        backend/src/main/java/com/duing/domain/club/entity/RecertificationStatus.java
git commit -m "feat(backend): 재인증 enum(RoundStatus, RecertificationStatus) 정의"
```

---

## Task 3: ClubException 7개 inner class 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/exception/ClubException.java`

- [ ] **Step 1: 마지막 닫는 `}` 직전에 7개 inner class 추가**

```java
    public static class RoundNotFoundException extends ClubException {
        public RoundNotFoundException() {
            super("재인증 라운드를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class DuplicateOpenRoundException extends ClubException {
        public DuplicateOpenRoundException() {
            super("해당 연도에 이미 열린 재인증 라운드가 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class RoundAlreadyClosedException extends ClubException {
        public RoundAlreadyClosedException() {
            super("이미 종료된 재인증 라운드입니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class RecertificationRequestNotFoundException extends ClubException {
        public RecertificationRequestNotFoundException() {
            super("재인증 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class NotCentralClubException extends ClubException {
        public NotCentralClubException() {
            super("중앙동아리만 재인증을 제출할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class NoOpenRoundException extends ClubException {
        public NoOpenRoundException() {
            super("열린 재인증 라운드가 없습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class DuplicatePendingRecertificationException extends ClubException {
        public DuplicatePendingRecertificationException() {
            super("이미 처리 대기 중인 재인증 요청이 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class InvalidRecertificationTransitionException extends ClubException {
        public InvalidRecertificationTransitionException(String reason) {
            super("재인증 요청 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
```

(`HttpStatus` import 이미 존재.)

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/exception/ClubException.java
git commit -m "feat(backend): 재인증 도메인 ClubException inner class 추가"
```

---

## Task 4: `RecertificationRound` 엔티티 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/entity/RecertificationRound.java`
- Test: `backend/src/test/java/com/duing/domain/club/entity/RecertificationRoundTest.java`

- [ ] **Step 1: 단위 테스트 작성**

```java
package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecertificationRoundTest {

    @Test
    @DisplayName("라운드 생성 시 OPEN 상태이며 종료 정보는 비어 있다")
    void createInitializesOpen() {
        RecertificationRound round = RecertificationRound.open(2026, "2026 정기 재인증", 99L);
        assertThat(round.getStatus()).isEqualTo(RoundStatus.OPEN);
        assertThat(round.getYear()).isEqualTo(2026);
        assertThat(round.getOpenedBy()).isEqualTo(99L);
        assertThat(round.getOpenedAt()).isNotNull();
        assertThat(round.getClosedBy()).isNull();
        assertThat(round.getClosedAt()).isNull();
    }

    @Test
    @DisplayName("라운드를 닫으면 CLOSED 상태와 종료 정보가 설정된다")
    void closeSetsTerminalState() {
        RecertificationRound round = RecertificationRound.open(2026, "라운드", 1L);
        round.close(42L);
        assertThat(round.getStatus()).isEqualTo(RoundStatus.CLOSED);
        assertThat(round.getClosedBy()).isEqualTo(42L);
        assertThat(round.getClosedAt()).isNotNull();
    }

    @Test
    @DisplayName("이미 닫힌 라운드를 다시 닫으면 예외가 발생한다")
    void closeTwiceFails() {
        RecertificationRound round = RecertificationRound.open(2026, "라운드", 1L);
        round.close(42L);
        assertThatThrownBy(() -> round.close(42L))
                .isInstanceOf(ClubException.RoundAlreadyClosedException.class);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 컴파일 실패 (`RecertificationRound` 없음).

- [ ] **Step 3: 엔티티 구현**

```java
package com.duing.domain.club.entity;

import com.duing.domain.club.exception.ClubException;
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
@Table(name = "recertification_round")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE recertification_round SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class RecertificationRound extends BaseEntity {

    @Column(nullable = false) private int year;
    @Column(nullable = false, length = 100) private String label;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private RoundStatus status;

    @Column(name = "opened_by", nullable = false) private Long openedBy;
    @Column(name = "opened_at", nullable = false) private LocalDateTime openedAt;
    @Column(name = "closed_by") private Long closedBy;
    @Column(name = "closed_at") private LocalDateTime closedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private RecertificationRound(int year, String label, Long openedBy) {
        this.year = year;
        this.label = label;
        this.openedBy = openedBy;
        this.openedAt = LocalDateTime.now();
        this.status = RoundStatus.OPEN;
    }

    public static RecertificationRound open(int year, String label, Long openedBy) {
        return RecertificationRound.builder()
                .year(year).label(label).openedBy(openedBy)
                .build();
    }

    public void close(Long closedByUserId) {
        if (this.status.isClosed()) {
            throw new ClubException.RoundAlreadyClosedException();
        }
        this.status = RoundStatus.CLOSED;
        this.closedBy = closedByUserId;
        this.closedAt = LocalDateTime.now();
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.entity.RecertificationRoundTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/RecertificationRound.java \
        backend/src/test/java/com/duing/domain/club/entity/RecertificationRoundTest.java
git commit -m "feat(backend): RecertificationRound 엔티티 + 상태 전이 검증"
```

---

## Task 5: `RecertificationRequest` 엔티티 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/entity/RecertificationRequest.java`
- Test: `backend/src/test/java/com/duing/domain/club/entity/RecertificationRequestTest.java`

- [ ] **Step 1: 단위 테스트 작성**

```java
package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecertificationRequestTest {

    private RecertificationRequest sample() {
        return RecertificationRequest.create(
                10L, 20L, 99L,
                "leader@example.com", "010-1234-5678",
                2026, "메모");
    }

    @Test
    @DisplayName("재인증 요청 생성 시 PENDING 이며 처리 정보가 비어 있다")
    void createInitializesPending() {
        RecertificationRequest request = sample();
        assertThat(request.getStatus()).isEqualTo(RecertificationStatus.PENDING);
        assertThat(request.getHandledBy()).isNull();
        assertThat(request.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("APPROVED 처리 시 처리자/처리시각/메모가 저장된다")
    void processApproved() {
        RecertificationRequest request = sample();
        request.process(7L, RecertificationStatus.APPROVED, "확인");
        assertThat(request.getStatus()).isEqualTo(RecertificationStatus.APPROVED);
        assertThat(request.getHandledBy()).isEqualTo(7L);
        assertThat(request.getHandledAt()).isNotNull();
        assertThat(request.getActionNote()).isEqualTo("확인");
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        RecertificationRequest request = sample();
        request.process(7L, RecertificationStatus.REJECTED, null);
        assertThatThrownBy(() -> request.process(7L, RecertificationStatus.APPROVED, null))
                .isInstanceOf(ClubException.InvalidRecertificationTransitionException.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        RecertificationRequest request = sample();
        assertThatThrownBy(() -> request.process(7L, RecertificationStatus.PENDING, null))
                .isInstanceOf(ClubException.InvalidRecertificationTransitionException.class);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 컴파일 실패.

- [ ] **Step 3: 엔티티 구현**

```java
package com.duing.domain.club.entity;

import com.duing.domain.club.exception.ClubException;
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
@Table(name = "recertification_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE recertification_request SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class RecertificationRequest extends BaseEntity {

    @Column(name = "round_id", nullable = false) private Long roundId;
    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "leader_user_id", nullable = false) private Long leaderUserId;

    @Column(name = "contact_email", nullable = false, length = 255) private String contactEmail;
    @Column(name = "contact_phone", nullable = false, length = 40) private String contactPhone;
    @Column(name = "operating_year", nullable = false) private int operatingYear;

    @Column(columnDefinition = "TEXT") private String notes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private RecertificationStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private RecertificationRequest(Long roundId, Long clubId, Long leaderUserId,
                                   String contactEmail, String contactPhone,
                                   int operatingYear, String notes) {
        this.roundId = roundId;
        this.clubId = clubId;
        this.leaderUserId = leaderUserId;
        this.contactEmail = contactEmail;
        this.contactPhone = contactPhone;
        this.operatingYear = operatingYear;
        this.notes = notes;
        this.status = RecertificationStatus.PENDING;
    }

    public static RecertificationRequest create(Long roundId, Long clubId, Long leaderUserId,
                                                String contactEmail, String contactPhone,
                                                int operatingYear, String notes) {
        return RecertificationRequest.builder()
                .roundId(roundId).clubId(clubId).leaderUserId(leaderUserId)
                .contactEmail(contactEmail).contactPhone(contactPhone)
                .operatingYear(operatingYear).notes(notes)
                .build();
    }

    public void process(Long handlerUserId, RecertificationStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == RecertificationStatus.PENDING) {
            throw new ClubException.InvalidRecertificationTransitionException(
                    "처리 결과는 APPROVED 또는 REJECTED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new ClubException.InvalidRecertificationTransitionException("이미 종결된 요청입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.entity.RecertificationRequestTest"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/RecertificationRequest.java \
        backend/src/test/java/com/duing/domain/club/entity/RecertificationRequestTest.java
git commit -m "feat(backend): RecertificationRequest 엔티티 + 상태 전이 검증"
```

---

## Task 6: Club 엔티티 `lastVerifiedYear` + setter

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

- [ ] **Step 1: 필드 + 메서드 추가**

`Club.java` 의 `centralClub` 필드 아래에 새 컬럼 필드 삽입:

```java
    @Column(name = "last_verified_year")
    private Integer lastVerifiedYear;
```

`changeCentralClub` 메서드 아래에 setter 추가:

```java
    public void updateLastVerifiedYear(int year) {
        this.lastVerifiedYear = year;
    }
```

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/entity/Club.java
git commit -m "feat(backend): Club.lastVerifiedYear 필드 + updateLastVerifiedYear 메서드"
```

---

## Task 7: Command / Query DTOs

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/command/OpenRoundCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/command/CloseRoundCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/command/CreateRecertificationCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/command/ProcessRecertificationCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/RoundAdminSearchCondition.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/RecertificationAdminSearchCondition.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/query/CentralClubRecertificationStatusQuery.java`

- [ ] **Step 1: 7개 record 작성**

```java
// OpenRoundCommand.java
package com.duing.domain.club.service.dto.command;

public record OpenRoundCommand(int year, String label, Long openedBy) {}
```

```java
// CloseRoundCommand.java
package com.duing.domain.club.service.dto.command;

public record CloseRoundCommand(Long roundId, Long closedByUserId) {}
```

```java
// CreateRecertificationCommand.java
package com.duing.domain.club.service.dto.command;

public record CreateRecertificationCommand(
        Long clubId,
        Long requesterUserId,
        String contactEmail,
        String contactPhone,
        int operatingYear,
        String notes
) {}
```

```java
// ProcessRecertificationCommand.java
package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.RecertificationStatus;

public record ProcessRecertificationCommand(
        Long requestId,
        Long handlerAdminId,
        RecertificationStatus status,
        String actionNote
) {}
```

```java
// RoundAdminSearchCondition.java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.RoundStatus;

public record RoundAdminSearchCondition(RoundStatus status) {}
```

```java
// RecertificationAdminSearchCondition.java
package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.RecertificationStatus;

public record RecertificationAdminSearchCondition(
        Long roundId,
        RecertificationStatus status
) {}
```

```java
// CentralClubRecertificationStatusQuery.java
package com.duing.domain.club.service.dto.query;

public record CentralClubRecertificationStatusQuery(int operatingYear) {}
```

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/service/dto/
git commit -m "feat(backend): 재인증 Command/Query DTO 정의"
```

---

## Task 8: Repositories

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/repository/RecertificationRoundRepository.java`
- Create: `backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepository.java`
- Create: `backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepositoryImpl.java`

- [ ] **Step 1: `RecertificationRoundRepository`**

```java
package com.duing.domain.club.repository;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecertificationRoundRepository extends JpaRepository<RecertificationRound, Long> {

    Optional<RecertificationRound> findByStatus(RoundStatus status);

    Optional<RecertificationRound> findByYearAndStatus(int year, RoundStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RecertificationRound r WHERE r.id = :id")
    Optional<RecertificationRound> findByIdForUpdate(@Param("id") Long id);

    default Page<RecertificationRound> searchForAdmin(RoundAdminSearchCondition condition, Pageable pageable) {
        if (condition.status() == null) {
            return findAllByOrderByYearDescCreatedAtDesc(pageable);
        }
        return findAllByStatusOrderByYearDescCreatedAtDesc(condition.status(), pageable);
    }

    Page<RecertificationRound> findAllByOrderByYearDescCreatedAtDesc(Pageable pageable);

    Page<RecertificationRound> findAllByStatusOrderByYearDescCreatedAtDesc(
            RoundStatus status, Pageable pageable);
}
```

- [ ] **Step 2: `RecertificationRequestRepository`**

```java
package com.duing.domain.club.repository;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecertificationRequestRepository
        extends JpaRepository<RecertificationRequest, Long>, RecertificationRequestRepositoryCustom {

    Optional<RecertificationRequest> findByRoundIdAndClubIdAndStatus(
            Long roundId, Long clubId, RecertificationStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RecertificationRequest r WHERE r.id = :id")
    Optional<RecertificationRequest> findByIdForUpdate(@Param("id") Long id);
}
```

- [ ] **Step 3: `RecertificationRequestRepositoryCustom` + Impl (QueryDSL admin 검색 + RC-5)**

```java
// RecertificationRequestRepositoryCustom.java
package com.duing.domain.club.repository;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRequestRepositoryCustom {
    Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable);

    Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable);
}
```

```java
// RecertificationRequestRepositoryImpl.java
package com.duing.domain.club.repository;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.QClub;
import com.duing.domain.club.entity.QRecertificationRequest;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecertificationRequestRepositoryImpl implements RecertificationRequestRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable
    ) {
        QRecertificationRequest request = QRecertificationRequest.recertificationRequest;
        BooleanExpression roundEq = condition.roundId() == null ? null : request.roundId.eq(condition.roundId());
        BooleanExpression statusEq = condition.status() == null ? null : request.status.eq(condition.status());

        List<RecertificationRequest> content = queryFactory.selectFrom(request)
                .where(roundEq, statusEq)
                .orderBy(request.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(request.count()).from(request).where(roundEq, statusEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }

    @Override
    public Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable
    ) {
        QClub club = QClub.club;
        BooleanExpression isCentral = club.centralClub.isTrue();

        // EXPIRED = lastVerifiedYear IS NULL OR lastVerifiedYear < operatingYear
        BooleanExpression expiredExpr = club.lastVerifiedYear.isNull()
                .or(club.lastVerifiedYear.lt(query.operatingYear()));

        // Order: EXPIRED first (boolean true == 1 sort DESC), then lastVerifiedYear ASC NULLS FIRST.
        List<Club> content = queryFactory.selectFrom(club)
                .where(isCentral)
                .orderBy(
                        Expressions.cases()
                                .when(expiredExpr).then(1)
                                .otherwise(0).desc(),
                        club.lastVerifiedYear.asc().nullsFirst()
                )
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        List<CentralClubRecertificationStatusResponse> mapped = content.stream()
                .map(c -> new CentralClubRecertificationStatusResponse(
                        c.getId(),
                        c.getName(),
                        c.isCentralClub(),
                        c.getLastVerifiedYear(),
                        c.getLastVerifiedYear() == null
                                || c.getLastVerifiedYear() < query.operatingYear()
                ))
                .toList();

        var countQuery = queryFactory.select(club.count()).from(club).where(isCentral);
        return PageableExecutionUtils.getPage(mapped, pageable, countQuery::fetchOne);
    }
}
```

> 주: `CentralClubRecertificationStatusResponse` 는 Task 11 에서 작성된다. Task 8 컴파일을 위해서는
> Task 11 의 response DTO 를 먼저 만들거나, 본 Impl 작성을 Task 11 이후로 미뤄야 한다.
> 본 plan 은 **이 Task 안에서 response record 도 같이 생성**해 컴파일을 통과시킨다 — 위치만 `controller/dto/response/` 로
> 두고, 다음 Task 11 에서는 다른 응답 record 들만 추가하는 식으로 정리한다.

- [ ] **Step 4: `CentralClubRecertificationStatusResponse` 선행 생성**

Create `backend/src/main/java/com/duing/domain/club/controller/dto/response/CentralClubRecertificationStatusResponse.java`:

```java
package com.duing.domain.club.controller.dto.response;

public record CentralClubRecertificationStatusResponse(
        Long clubId,
        String clubName,
        boolean centralClub,
        Integer lastVerifiedYear,
        boolean expired
) {}
```

- [ ] **Step 5: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/repository/RecertificationRoundRepository.java \
        backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepository.java \
        backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepositoryCustom.java \
        backend/src/main/java/com/duing/domain/club/repository/RecertificationRequestRepositoryImpl.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/CentralClubRecertificationStatusResponse.java
git commit -m "feat(backend): 재인증 라운드/요청 리포지토리 + RC-5 EXPIRED 조회 QueryDSL"
```

---

## Task 9: `RecertificationRoundService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/RecertificationRoundService.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRoundService.java`
- Test: `backend/src/test/java/com/duing/domain/club/service/GeneralRecertificationRoundServiceTest.java`

- [ ] **Step 1: 통합 테스트**

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
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
class GeneralRecertificationRoundServiceTest {

    @Autowired RecertificationRoundService roundService;
    @Autowired RecertificationRoundRepository roundRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    @Test
    @DisplayName("ADMIN 이 라운드를 열면 OPEN 으로 저장된다")
    void openRoundSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        Long roundId = roundService.open(new OpenRoundCommand(2026, "2026 정기 재인증", admin.getId()));
        RecertificationRound saved = roundRepository.findById(roundId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RoundStatus.OPEN);
        assertThat(saved.getYear()).isEqualTo(2026);
    }

    @Test
    @DisplayName("동일 연도에 OPEN 라운드가 있으면 두 번째 열기는 409")
    void duplicateOpenFails() {
        User admin = saveUser(UserRole.ADMIN);
        roundService.open(new OpenRoundCommand(2026, "A", admin.getId()));
        assertThatThrownBy(() -> roundService.open(new OpenRoundCommand(2026, "B", admin.getId())))
                .isInstanceOf(ClubException.DuplicateOpenRoundException.class);
    }

    @Test
    @DisplayName("라운드 닫기 시 CLOSED 로 전이된다")
    void closeRoundSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        Long roundId = roundService.open(new OpenRoundCommand(2026, "라운드", admin.getId()));
        roundService.close(new CloseRoundCommand(roundId, admin.getId()));
        RecertificationRound saved = roundRepository.findById(roundId).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RoundStatus.CLOSED);
        assertThat(saved.getClosedBy()).isEqualTo(admin.getId());
    }

    @Test
    @DisplayName("이미 닫힌 라운드를 다시 닫으면 400")
    void closeTwiceFails() {
        User admin = saveUser(UserRole.ADMIN);
        Long roundId = roundService.open(new OpenRoundCommand(2026, "라운드", admin.getId()));
        roundService.close(new CloseRoundCommand(roundId, admin.getId()));
        assertThatThrownBy(() -> roundService.close(new CloseRoundCommand(roundId, admin.getId())))
                .isInstanceOf(ClubException.RoundAlreadyClosedException.class);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 컴파일 실패.

- [ ] **Step 3: 인터페이스 + 구현**

```java
// RecertificationRoundService.java
package com.duing.domain.club.service;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRoundService {
    Long open(OpenRoundCommand command);
    void close(CloseRoundCommand command);
    RecertificationRound getById(Long roundId);
    Page<RecertificationRound> searchForAdmin(RoundAdminSearchCondition condition, Pageable pageable);
}
```

```java
// GeneralRecertificationRoundService.java
package com.duing.domain.club.service;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecertificationRoundService implements RecertificationRoundService {

    private final RecertificationRoundRepository roundRepository;

    @Override
    @Transactional
    public Long open(OpenRoundCommand command) {
        roundRepository.findByYearAndStatus(command.year(), RoundStatus.OPEN)
                .ifPresent(existing -> { throw new ClubException.DuplicateOpenRoundException(); });
        try {
            return roundRepository.save(RecertificationRound.open(
                    command.year(), command.label(), command.openedBy()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubException.DuplicateOpenRoundException();
        }
    }

    @Override
    @Transactional
    public void close(CloseRoundCommand command) {
        RecertificationRound round = roundRepository.findByIdForUpdate(command.roundId())
                .orElseThrow(ClubException.RoundNotFoundException::new);
        round.close(command.closedByUserId());
    }

    @Override
    public RecertificationRound getById(Long roundId) {
        return roundRepository.findById(roundId)
                .orElseThrow(ClubException.RoundNotFoundException::new);
    }

    @Override
    public Page<RecertificationRound> searchForAdmin(RoundAdminSearchCondition condition, Pageable pageable) {
        return roundRepository.searchForAdmin(condition, pageable);
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.service.GeneralRecertificationRoundServiceTest"`
Expected: PASS (4 tests). Docker 환경 이슈로 컨텍스트 init 실패 시 DONE_WITH_CONCERNS — 코드는 그대로 진행.

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/service/RecertificationRoundService.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRoundService.java \
        backend/src/test/java/com/duing/domain/club/service/GeneralRecertificationRoundServiceTest.java
git commit -m "feat(backend): RecertificationRoundService — open/close + 중복 OPEN 차단"
```

---

## Task 10: `RecertificationRequestService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/RecertificationRequestService.java`
- Create: `backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRequestService.java`
- Test: `backend/src/test/java/com/duing/domain/club/service/GeneralRecertificationRequestServiceTest.java`

- [ ] **Step 1: 통합 테스트**

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRequestRepository;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
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
class GeneralRecertificationRequestServiceTest {

    @Autowired RecertificationRequestService requestService;
    @Autowired RecertificationRoundService roundService;
    @Autowired RecertificationRequestRepository requestRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    private Club saveCentralClub(boolean central) {
        Club club = clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
        if (central) {
            club.changeCentralClub(true);
            clubRepository.save(club);
        }
        return club;
    }

    private Long openRound(int year, User admin) {
        return roundService.open(new OpenRoundCommand(year, year + " 라운드", admin.getId()));
    }

    @Test
    @DisplayName("LEADER 가 중앙동아리 재인증을 제출하면 PENDING 으로 저장된다")
    void createSucceeds() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);

        Long id = requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, "메모"));

        RecertificationRequest saved = requestRepository.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(RecertificationStatus.PENDING);
        assertThat(saved.getLeaderUserId()).isEqualTo(leader.getId());
    }

    @Test
    @DisplayName("비-중앙동아리 제출은 400")
    void notCentralFails() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(false);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);

        assertThatThrownBy(() -> requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null)))
                .isInstanceOf(ClubException.NotCentralClubException.class);
    }

    @Test
    @DisplayName("OPEN 라운드가 없으면 400")
    void noOpenRoundFails() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null)))
                .isInstanceOf(ClubException.NoOpenRoundException.class);
    }

    @Test
    @DisplayName("동일 round×club PENDING 중복은 409")
    void duplicatePendingFails() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);
        CreateRecertificationCommand command = new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null);
        requestService.create(command);

        assertThatThrownBy(() -> requestService.create(command))
                .isInstanceOf(ClubException.DuplicatePendingRecertificationException.class);
    }

    @Test
    @DisplayName("APPROVED 처리 시 club.lastVerifiedYear 가 round.year 로 갱신된다")
    void approvedUpdatesLastVerifiedYear() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);
        Long requestId = requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null));

        requestService.process(new ProcessRecertificationCommand(
                requestId, admin.getId(), RecertificationStatus.APPROVED, "확인"));

        Club updated = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(updated.getLastVerifiedYear()).isEqualTo(2026);
        RecertificationRequest processed = requestRepository.findById(requestId).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(RecertificationStatus.APPROVED);
    }

    @Test
    @DisplayName("REJECTED 처리 시 club.lastVerifiedYear 는 변경되지 않는다")
    void rejectedKeepsLastVerifiedYear() {
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveCentralClub(true);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        openRound(2026, admin);
        Long requestId = requestService.create(new CreateRecertificationCommand(
                club.getId(), leader.getId(),
                "leader@example.com", "010-1234-5678", 2026, null));

        requestService.process(new ProcessRecertificationCommand(
                requestId, admin.getId(), RecertificationStatus.REJECTED, "거절"));

        Club updated = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(updated.getLastVerifiedYear()).isNull();
    }

    @Test
    @DisplayName("RC-5 EXPIRED 조회 — lastVerifiedYear < operatingYear 인 중앙동아리만 expired=true")
    void rc5ExpiredFilter() {
        User admin = saveUser(UserRole.ADMIN);
        Club expired = saveCentralClub(true);
        Club verified = saveCentralClub(true);
        verified.updateLastVerifiedYear(2026);
        clubRepository.save(verified);
        Club nonCentral = saveCentralClub(false);

        var page = requestService.findCentralClubStatuses(
                new CentralClubRecertificationStatusQuery(2026), PageRequest.of(0, 50));

        var ids = page.getContent().stream()
                .map(CentralClubRecertificationStatusResponse::clubId)
                .toList();
        assertThat(ids).contains(expired.getId(), verified.getId())
                .doesNotContain(nonCentral.getId());
        assertThat(page.getContent().stream()
                .filter(r -> r.clubId().equals(expired.getId()))
                .findFirst().orElseThrow().expired()).isTrue();
        assertThat(page.getContent().stream()
                .filter(r -> r.clubId().equals(verified.getId()))
                .findFirst().orElseThrow().expired()).isFalse();
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 컴파일 실패.

- [ ] **Step 3: 인터페이스 + 구현**

```java
// RecertificationRequestService.java
package com.duing.domain.club.service;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRequestService {
    Long create(CreateRecertificationCommand command);
    void process(ProcessRecertificationCommand command);
    RecertificationRequest getById(Long requestId);
    Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable);
    Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable);
}
```

```java
// GeneralRecertificationRequestService.java
package com.duing.domain.club.service;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRequestRepository;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecertificationRequestService implements RecertificationRequestService {

    private final RecertificationRequestRepository requestRepository;
    private final RecertificationRoundRepository roundRepository;
    private final ClubRepository clubRepository;

    @Override
    @Transactional
    public Long create(CreateRecertificationCommand command) {
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        if (!club.isCentralClub()) {
            throw new ClubException.NotCentralClubException();
        }
        RecertificationRound openRound = roundRepository.findByStatus(RoundStatus.OPEN)
                .orElseThrow(ClubException.NoOpenRoundException::new);

        requestRepository.findByRoundIdAndClubIdAndStatus(
                openRound.getId(), club.getId(), RecertificationStatus.PENDING)
                .ifPresent(existing -> { throw new ClubException.DuplicatePendingRecertificationException(); });

        try {
            return requestRepository.save(RecertificationRequest.create(
                    openRound.getId(), club.getId(), command.requesterUserId(),
                    command.contactEmail(), command.contactPhone(),
                    command.operatingYear(), command.notes()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubException.DuplicatePendingRecertificationException();
        }
    }

    @Override
    @Transactional
    public void process(ProcessRecertificationCommand command) {
        RecertificationRequest request = requestRepository.findByIdForUpdate(command.requestId())
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);

        request.process(command.handlerAdminId(), command.status(), command.actionNote());

        if (command.status() == RecertificationStatus.APPROVED) {
            RecertificationRound round = roundRepository.findById(request.getRoundId())
                    .orElseThrow(ClubException.RoundNotFoundException::new);
            Club club = clubRepository.findById(request.getClubId())
                    .orElseThrow(ClubException.ClubNotFoundException::new);
            club.updateLastVerifiedYear(round.getYear());
        }
    }

    @Override
    public RecertificationRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);
    }

    @Override
    public Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable
    ) {
        return requestRepository.searchForAdmin(condition, pageable);
    }

    @Override
    public Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable
    ) {
        return requestRepository.findCentralClubStatuses(query, pageable);
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.club.service.GeneralRecertificationRequestServiceTest"`
Expected: PASS (7 tests). Docker 환경 이슈로 컨텍스트 init 실패 시 DONE_WITH_CONCERNS — 코드는 그대로 진행.

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/service/RecertificationRequestService.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRequestService.java \
        backend/src/test/java/com/duing/domain/club/service/GeneralRecertificationRequestServiceTest.java
git commit -m "feat(backend): RecertificationRequestService — 제출/처리 + lastVerifiedYear 갱신 + RC-5"
```

---

## Task 11: Request / Response DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateRecertificationRoundRequest.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/CreateRecertificationRequestRequest.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/ProcessRecertificationRequest.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationRoundResponse.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationRequestSummaryResponse.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationRequestDetailResponse.java`

- [ ] **Step 1: Request DTO 3종**

```java
// CreateRecertificationRoundRequest.java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRecertificationRoundRequest(
        @Min(value = 2000, message = "연도는 2000 이상이어야 합니다.")
        @Max(value = 2100, message = "연도는 2100 이하여야 합니다.") int year,
        @NotBlank(message = "라운드 라벨은 필수입니다.")
        @Size(max = 100, message = "라벨은 100자 이하여야 합니다.") String label
) {
    public OpenRoundCommand toCommand(Long openedBy) {
        return new OpenRoundCommand(year, label, openedBy);
    }
}
```

```java
// CreateRecertificationRequestRequest.java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRecertificationRequestRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        @Email(message = "이메일 형식이 올바르지 않습니다.")
        @Size(max = 255, message = "이메일은 255자 이하여야 합니다.") String contactEmail,
        @NotBlank(message = "연락처는 필수입니다.")
        @Size(max = 40, message = "연락처는 40자 이하여야 합니다.") String contactPhone,
        @Min(value = 2000, message = "운영 연도는 2000 이상이어야 합니다.")
        @Max(value = 2100, message = "운영 연도는 2100 이하여야 합니다.") int operatingYear,
        @Size(max = 2000, message = "메모는 2000자 이하여야 합니다.") String notes
) {
    public CreateRecertificationCommand toCommand(Long clubId, Long requesterUserId) {
        return new CreateRecertificationCommand(
                clubId, requesterUserId, contactEmail, contactPhone, operatingYear, notes);
    }
}
```

```java
// ProcessRecertificationRequest.java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessRecertificationRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") RecertificationStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessRecertificationCommand toCommand(Long requestId, Long handlerAdminId) {
        return new ProcessRecertificationCommand(requestId, handlerAdminId, status, actionNote);
    }
}
```

- [ ] **Step 2: Response DTO 3종 (`CentralClubRecertificationStatusResponse` 는 Task 8 에서 이미 생성)**

```java
// RecertificationRoundResponse.java
package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import java.time.LocalDateTime;

public record RecertificationRoundResponse(
        Long id,
        int year,
        String label,
        RoundStatus status,
        UserRef openedBy,
        LocalDateTime openedAt,
        UserRef closedBy,
        LocalDateTime closedAt
) {
    public record UserRef(Long id, String name) {}

    public static RecertificationRoundResponse of(
            RecertificationRound round, UserRef openedBy, UserRef closedBy
    ) {
        return new RecertificationRoundResponse(
                round.getId(), round.getYear(), round.getLabel(), round.getStatus(),
                openedBy, round.getOpenedAt(), closedBy, round.getClosedAt()
        );
    }
}
```

```java
// RecertificationRequestSummaryResponse.java
package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.entity.RoundStatus;
import java.time.LocalDateTime;

public record RecertificationRequestSummaryResponse(
        Long id,
        RoundRef round,
        ClubRef club,
        UserRef leader,
        RecertificationStatus status,
        int operatingYear,
        LocalDateTime createdAt
) {
    public record RoundRef(Long id, int year, String label, RoundStatus status) {}
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static RecertificationRequestSummaryResponse of(
            RecertificationRequest request, RoundRef round, ClubRef club, UserRef leader
    ) {
        return new RecertificationRequestSummaryResponse(
                request.getId(), round, club, leader,
                request.getStatus(), request.getOperatingYear(), request.getCreatedAt()
        );
    }
}
```

```java
// RecertificationRequestDetailResponse.java
package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import java.time.LocalDateTime;
import java.util.List;

public record RecertificationRequestDetailResponse(
        Long id,
        RoundRef round,
        ClubRef club,
        UserRef currentLeader,
        List<UserRef> officers,
        UserRef submittedLeader,
        String contactEmail,
        String contactPhone,
        int operatingYear,
        String notes,
        RecertificationStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt,
        List<ClubMemberHistoryResponse> recentMemberHistory
) {
    public record RoundRef(Long id, int year, String label) {}
    public record ClubRef(Long id, String name, Integer lastVerifiedYear) {}
    public record UserRef(Long id, String name) {}

    public static RecertificationRequestDetailResponse of(
            RecertificationRequest request, RoundRef round, ClubRef club,
            UserRef currentLeader, List<UserRef> officers, UserRef submittedLeader,
            UserRef handler, List<ClubMemberHistoryResponse> recentMemberHistory
    ) {
        return new RecertificationRequestDetailResponse(
                request.getId(), round, club, currentLeader, officers, submittedLeader,
                request.getContactEmail(), request.getContactPhone(), request.getOperatingYear(),
                request.getNotes(), request.getStatus(), request.getActionNote(),
                handler, request.getHandledAt(), request.getCreatedAt(),
                recentMemberHistory
        );
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/controller/dto/request/ \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationRoundResponse.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationRequestSummaryResponse.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationRequestDetailResponse.java
git commit -m "feat(backend): 재인증 Request/Response DTO 정의"
```

---

## Task 12: ADMIN Round API + Controller (RR-1~3)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/api/AdminRecertificationRoundApi.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/AdminRecertificationRoundController.java`

- [ ] **Step 1: API**

```java
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateRecertificationRoundRequest;
import com.duing.domain.club.controller.dto.response.RecertificationRoundResponse;
import com.duing.domain.club.entity.RoundStatus;
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

@Tag(name = "재인증 라운드(총동연)", description = "총동연 전용 재인증 라운드 라이프사이클")
@SecurityRequirement(name = "BearerAuth")
public interface AdminRecertificationRoundApi {

    @Operation(summary = "라운드 열기")
    @PostMapping("/admin/recertification-rounds")
    ResponseEntity<ApiResponse<Long>> openRound(
            @Valid @RequestBody CreateRecertificationRoundRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "라운드 닫기")
    @PatchMapping("/admin/recertification-rounds/{roundId}/close")
    ResponseEntity<ApiResponse<Void>> closeRound(
            @PathVariable Long roundId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "라운드 목록")
    @GetMapping("/admin/recertification-rounds")
    ResponseEntity<ApiResponse<PageResponse<RecertificationRoundResponse>>> listRounds(
            @RequestParam(required = false) RoundStatus status,
            @Parameter(hidden = true) Pageable pageable
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRoundApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRoundRequest;
import com.duing.domain.club.controller.dto.response.RecertificationRoundResponse;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.RecertificationRoundService;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminRecertificationRoundController implements AdminRecertificationRoundApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final RecertificationRoundService roundService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> openRound(
            CreateRecertificationRoundRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long id = roundService.open(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> closeRound(
            Long roundId, @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        roundService.close(new CloseRoundCommand(roundId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<RecertificationRoundResponse>>> listRounds(
            RoundStatus status, Pageable pageable
    ) {
        Page<RecertificationRound> page = roundService.searchForAdmin(
                new RoundAdminSearchCondition(status), pageable);
        Page<RecertificationRoundResponse> mapped = page.map(round ->
                RecertificationRoundResponse.of(round, userRef(round.getOpenedBy()),
                        round.getClosedBy() == null ? null : userRef(round.getClosedBy()))
        );
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private RecertificationRoundResponse.UserRef userRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new RecertificationRoundResponse.UserRef(user.getId(), user.getName()))
                .orElse(new RecertificationRoundResponse.UserRef(userId, DELETED_LABEL));
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/api/AdminRecertificationRoundApi.java \
        backend/src/main/java/com/duing/domain/club/controller/AdminRecertificationRoundController.java
git commit -m "feat(backend): /admin/recertification-rounds (RR-1~3)"
```

---

## Task 13: LEADER Request API + Controller (RC-1) + ADMIN Request API + Controller (RC-2~5)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/api/LeaderRecertificationApi.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/LeaderRecertificationController.java`
- Create: `backend/src/main/java/com/duing/domain/club/api/AdminRecertificationRequestApi.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/AdminRecertificationRequestController.java`

- [ ] **Step 1: `LeaderRecertificationApi`**

```java
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateRecertificationRequestRequest;
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

@Tag(name = "재인증 제출", description = "LEADER 의 중앙동아리 재인증 제출 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderRecertificationApi {

    @Operation(summary = "재인증 제출 (LEADER)",
            description = "본인이 LEADER 인 중앙동아리에 한해 OPEN 라운드에 재인증 의사를 제출한다.")
    @PostMapping("/clubs/{clubId}/recertification-requests")
    ResponseEntity<ApiResponse<Long>> createRequest(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateRecertificationRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: `LeaderRecertificationController`**

```java
package com.duing.domain.club.controller;

import com.duing.domain.club.api.LeaderRecertificationApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRequestRequest;
import com.duing.domain.club.service.RecertificationRequestService;
import com.duing.domain.clubmember.service.ClubAuthService;
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
public class LeaderRecertificationController implements LeaderRecertificationApi {

    private final RecertificationRequestService requestService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createRequest(
            Long clubId,
            CreateRecertificationRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireLeader(currentUser.id(), clubId);
        Long requestId = requestService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(requestId));
    }
}
```

- [ ] **Step 3: `AdminRecertificationRequestApi`**

```java
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.ProcessRecertificationRequest;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestDetailResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestSummaryResponse;
import com.duing.domain.club.entity.RecertificationStatus;
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

@Tag(name = "재인증 제출(총동연)", description = "총동연 전용 재인증 검토/처리 + 미인증 동아리 조회")
@SecurityRequirement(name = "BearerAuth")
public interface AdminRecertificationRequestApi {

    @Operation(summary = "재인증 제출 목록")
    @GetMapping("/admin/recertification-requests")
    ResponseEntity<ApiResponse<PageResponse<RecertificationRequestSummaryResponse>>> listRequests(
            @RequestParam(required = false) Long roundId,
            @RequestParam(required = false) RecertificationStatus status,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "재인증 제출 상세")
    @GetMapping("/admin/recertification-requests/{requestId}")
    ResponseEntity<ApiResponse<RecertificationRequestDetailResponse>> getRequest(
            @PathVariable Long requestId
    );

    @Operation(summary = "재인증 처리")
    @PatchMapping("/admin/recertification-requests/{requestId}")
    ResponseEntity<ApiResponse<Void>> processRequest(
            @PathVariable Long requestId,
            @Valid @RequestBody ProcessRecertificationRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "중앙동아리 재인증 상태 조회 (EXPIRED 포함)")
    @GetMapping("/admin/clubs/recertification-status")
    ResponseEntity<ApiResponse<PageResponse<CentralClubRecertificationStatusResponse>>> listClubStatuses(
            @RequestParam int operatingYear,
            @Parameter(hidden = true) Pageable pageable
    );
}
```

- [ ] **Step 4: `AdminRecertificationRequestController`**

```java
package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminRecertificationRequestApi;
import com.duing.domain.club.controller.dto.request.ProcessRecertificationRequest;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestDetailResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestSummaryResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.RecertificationRequestService;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberHistoryRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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
public class AdminRecertificationRequestController implements AdminRecertificationRequestApi {

    private static final String DELETED_LABEL = "(삭제됨)";
    private static final int RECENT_HISTORY_LIMIT = 10;

    private final RecertificationRequestService requestService;
    private final RecertificationRoundRepository roundRepository;
    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRepository historyRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<RecertificationRequestSummaryResponse>>> listRequests(
            Long roundId, RecertificationStatus status, Pageable pageable
    ) {
        Page<RecertificationRequest> page = requestService.searchForAdmin(
                new RecertificationAdminSearchCondition(roundId, status), pageable);
        Page<RecertificationRequestSummaryResponse> mapped = page.map(request ->
                RecertificationRequestSummaryResponse.of(
                        request,
                        roundRef(request.getRoundId()),
                        clubRef(request.getClubId()),
                        userRefSummary(request.getLeaderUserId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<RecertificationRequestDetailResponse>> getRequest(Long requestId) {
        RecertificationRequest request = requestService.getById(requestId);
        var round = roundRepository.findById(request.getRoundId())
                .map(r -> new RecertificationRequestDetailResponse.RoundRef(r.getId(), r.getYear(), r.getLabel()))
                .orElse(new RecertificationRequestDetailResponse.RoundRef(request.getRoundId(), 0, DELETED_LABEL));
        var club = clubRepository.findById(request.getClubId())
                .map(c -> new RecertificationRequestDetailResponse.ClubRef(
                        c.getId(), c.getName(), c.getLastVerifiedYear()))
                .orElse(new RecertificationRequestDetailResponse.ClubRef(request.getClubId(), DELETED_LABEL, null));

        var currentLeader = clubMemberRepository.findFirstByClubIdAndRole(request.getClubId(), ClubMemberRole.LEADER)
                .map(member -> new RecertificationRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .orElse(null);

        List<RecertificationRequestDetailResponse.UserRef> officers = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(request.getClubId()).stream()
                .filter(member -> member.getRole() == ClubMemberRole.OFFICER)
                .map(member -> new RecertificationRequestDetailResponse.UserRef(
                        member.getUser().getId(), member.getUser().getName()))
                .toList();

        var submittedLeader = userRefDetail(request.getLeaderUserId()).orElse(null);
        var handler = request.getHandledBy() == null
                ? null
                : userRefDetail(request.getHandledBy()).orElse(null);

        Page<ClubMemberHistory> recent = historyRepository.findByClubIdOrderByCreatedAtDesc(
                request.getClubId(), PageRequest.of(0, RECENT_HISTORY_LIMIT));
        List<ClubMemberHistoryResponse> recentResponses = recent.getContent().stream()
                .map(history -> ClubMemberHistoryResponse.of(
                        history,
                        historyUserRef(history.getTargetUserId()),
                        historyUserRef(history.getActorUserId())))
                .toList();

        return ResponseEntity.ok(ApiResponse.success(RecertificationRequestDetailResponse.of(
                request, round, club, currentLeader, officers, submittedLeader, handler, recentResponses)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, ProcessRecertificationRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        requestService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<CentralClubRecertificationStatusResponse>>> listClubStatuses(
            int operatingYear, Pageable pageable
    ) {
        Page<CentralClubRecertificationStatusResponse> page = requestService.findCentralClubStatuses(
                new CentralClubRecertificationStatusQuery(operatingYear), pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    private RecertificationRequestSummaryResponse.RoundRef roundRef(Long roundId) {
        return roundRepository.findById(roundId)
                .map(r -> new RecertificationRequestSummaryResponse.RoundRef(
                        r.getId(), r.getYear(), r.getLabel(), r.getStatus()))
                .orElse(new RecertificationRequestSummaryResponse.RoundRef(
                        roundId, 0, DELETED_LABEL, null));
    }

    private RecertificationRequestSummaryResponse.ClubRef clubRef(Long clubId) {
        return clubRepository.findById(clubId)
                .map(c -> new RecertificationRequestSummaryResponse.ClubRef(c.getId(), c.getName()))
                .orElse(new RecertificationRequestSummaryResponse.ClubRef(clubId, DELETED_LABEL));
    }

    private RecertificationRequestSummaryResponse.UserRef userRefSummary(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new RecertificationRequestSummaryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new RecertificationRequestSummaryResponse.UserRef(userId, DELETED_LABEL));
    }

    private Optional<RecertificationRequestDetailResponse.UserRef> userRefDetail(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new RecertificationRequestDetailResponse.UserRef(user.getId(), user.getName()));
    }

    private ClubMemberHistoryResponse.UserRef historyUserRef(Long userId) {
        return userRepository.findById(userId)
                .map(user -> new ClubMemberHistoryResponse.UserRef(user.getId(), user.getName()))
                .orElse(new ClubMemberHistoryResponse.UserRef(userId, DELETED_LABEL));
    }
}
```

- [ ] **Step 5: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/club/api/LeaderRecertificationApi.java \
        backend/src/main/java/com/duing/domain/club/controller/LeaderRecertificationController.java \
        backend/src/main/java/com/duing/domain/club/api/AdminRecertificationRequestApi.java \
        backend/src/main/java/com/duing/domain/club/controller/AdminRecertificationRequestController.java
git commit -m "feat(backend): 재인증 제출 LEADER + ADMIN 컨트롤러 (RC-1~5)"
```

---

## Task 14: Acceptance Test

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/CentralClubRecertificationAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.club;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
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
class CentralClubRecertificationAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String leaderToken;
    private Long centralClubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = clubRepository.save(Club.create("중앙동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        club.changeCentralClub(true);
        clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        centralClubId = club.getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    @Test
    @DisplayName("ADMIN 이 라운드를 열고 LEADER 가 제출 후 ADMIN 이 승인하면 lastVerifiedYear 가 갱신된다")
    void fullFlow() {
        Long roundId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", "2026 정기 재인증"))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        Long requestId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "contactEmail", "leader@example.com",
                        "contactPhone", "010-1234-5678",
                        "operatingYear", 2026,
                        "notes", "메모"))
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "APPROVED", "actionNote", "확인"))
                .when().patch("/api/v1/admin/recertification-requests/" + requestId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        Club updated = clubRepository.findById(centralClubId).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(updated.getLastVerifiedYear()).isEqualTo(2026);
    }

    @Test
    @DisplayName("미인증 사용자 제출은 401")
    void unauthenticatedRejected() {
        RestAssured.given()
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "contactEmail", "x@example.com",
                        "contactPhone", "010-0",
                        "operatingYear", 2026))
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/recertification-rounds 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 의 미인증 동아리 조회 — operatingYear 기준 EXPIRED 가 포함된다")
    void rc5ListsExpired() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", "2026"))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/clubs/recertification-status?operatingYear=2026")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].clubId", equalTo(centralClubId.intValue()))
                .body("data.content[0].expired", equalTo(true));
    }

    @Test
    @DisplayName("동일 round×club PENDING 중복은 409")
    void duplicatePendingConflict() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", 2026, "label", "2026"))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());

        Map<String, Object> body = Map.of(
                "contactEmail", "l@example.com",
                "contactPhone", "010-1",
                "operatingYear", 2026);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }
}
```

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileTestJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/club/CentralClubRecertificationAcceptanceTest.java
git commit -m "test(backend): 중앙동아리 재인증 인수 테스트 — full flow + 401/403/409"
```

---

## Task 15: REQUIREMENTS 갱신 + PR

**Files:**
- Modify: `REQUIREMENTS.md` (§2.7 신설)

- [ ] **Step 1: 전체 컴파일 확인**

```bash
cd backend && ./gradlew compileJava compileTestJava 2>&1 | tail -5
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: REQUIREMENTS 에 §2.7 추가**

`REQUIREMENTS.md` 의 §2.6 (Leader Succession) 다음에 §2.7 추가:

```markdown
### 2.7 Central Club Recertification (중앙동아리 연간 재인증)

**엔티티 필드 (RecertificationRound)**: `id`, `year`, `label`, `status`(OPEN/CLOSED), `openedBy`, `openedAt`, `closedBy`, `closedAt`.
**엔티티 필드 (RecertificationRequest)**: `id`, `roundId`, `clubId`, `leaderUserId`, `contactEmail`, `contactPhone`, `operatingYear`, `notes`(≤2000), `status`(PENDING/APPROVED/REJECTED), `actionNote`, `handledBy`, `handledAt`.
**Club 변경**: `last_verified_year INT` 컬럼 추가.

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| RR-1 | 라운드 열기 (ADMIN) | `year`, `label` | `roundId` (201) | 401 / 403 / 409 동일 year OPEN 존재 |
| RR-2 | 라운드 닫기 (ADMIN) | `roundId` | 204 | 400 이미 CLOSED / 401 / 403 / 404 |
| RR-3 | 라운드 목록 (ADMIN) | `status?`, Pageable | `PageResponse<RecertificationRoundResponse>` (200) | 401 / 403 |
| RC-1 | 재인증 제출 (LEADER) | `clubId`, `contactEmail`, `contactPhone`, `operatingYear`, `notes?` | `requestId` (201) | 401 / 400 비-LEADER·비-중앙동아리·OPEN 라운드 없음 / 404 club / 409 PENDING 중복 |
| RC-2 | 재인증 목록 (ADMIN) | `roundId?`, `status?`, Pageable | `PageResponse<RecertificationRequestSummaryResponse>` (200) | 401 / 403 |
| RC-3 | 재인증 상세 (ADMIN) | `requestId` | `RecertificationRequestDetailResponse` (200) | 401 / 403 / 404 |
| RC-4 | 재인증 처리 (ADMIN) | `requestId`, `status`(APPROVED/REJECTED), `actionNote?` | 204. APPROVED 시 club.lastVerifiedYear=round.year | 400 잘못된 전이 / 401 / 403 / 404 |
| RC-5 | 미인증 동아리 조회 (ADMIN) | `operatingYear`, Pageable | `PageResponse<CentralClubRecertificationStatusResponse>` (200) | 401 / 403 |

**비기능 요구사항**
- 조건부 unique: `(year) WHERE status='OPEN'` — 연도당 OPEN 라운드 1개.
- 조건부 unique: `(round_id, club_id) WHERE status='PENDING'` — 라운드당 동아리당 PENDING 1건.
- 라운드 닫힘 후에도 기존 PENDING 은 ADMIN 이 계속 처리 가능. 새 제출만 차단.
- EXPIRED 판정은 계산값: `central_club AND (last_verified_year IS NULL OR last_verified_year < operatingYear)`.
- `central_club` 자동 해제 없음. ADMIN 이 RC-5 결과 보고 기존 C-5 API 로 수동 해제.
```

- [ ] **Step 3: REQUIREMENTS 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add REQUIREMENTS.md
git commit -m "docs: REQUIREMENTS 에 중앙동아리 재인증(RR/RC) 도메인 추가"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/central-club-recertification
gh pr create --base develop --title "feat: 중앙동아리 연간 재인증 — 라운드/제출/처리 + lastVerifiedYear" --body "$(cat <<'EOF'
## 🚀 작업 내용

- `club` 도메인을 확장해 라운드 라이프사이클 (RR-1~3), LEADER 의 중앙동아리 재인증 제출 (RC-1), ADMIN 의 검토·처리 (RC-2~4), 미인증 동아리(EXPIRED) 조회 (RC-5) 까지 8개 API 를 추가했다.
- `club.last_verified_year` 컬럼을 신설해 APPROVED 시점에 `round.year` 로 갱신한다.
- `central_club` 자동 해제는 의도적으로 도입하지 않았다 — ADMIN 이 RC-5 리스트를 보고 기존 C-5 API 로 수동 결정한다.

## 🤔 고민했던 내용

- "미인증" 을 어떻게 표현할지: 새 ClubStatus vs `last_verified_year` 계산값. 후자가 가볍고 기존 상태머신을 건드리지 않아 채택.
- 라운드 닫힘 시 PENDING 자동 REJECTED 여부: 운영 유연성을 위해 수동 처리 유지, 새 제출만 차단.
- EXPIRED 정렬: `CASE WHEN expired THEN 1 ELSE 0 END DESC` + `lastVerifiedYear ASC NULLS FIRST` 로 가장 오래된 EXPIRED 가 위로 오도록.

## 💬 리뷰 중점사항

- `GeneralRecertificationRequestService.process` APPROVED 분기에서 round/year 조회 후 `club.updateLastVerifiedYear` 호출 — 트랜잭션 일관성.
- 동일 year 에 OPEN 라운드 중복 차단: 조건부 unique index + `DataIntegrityViolationException` 캐치 패턴.
- RC-5 의 EXPIRED 계산이 응답·정렬 양쪽에서 일관되게 적용되는지.
- 로컬 Testcontainers/Docker 이슈로 통합 테스트 실행이 CI 의존 — CI 결과 확인 필요.
EOF
)"
```

---

## Self-Review Notes

스펙 §2~§9 매핑:

- §2 In Scope (라운드 OPEN/CLOSED · LEADER 제출 · ADMIN 처리 · `lastVerifiedYear` 갱신 · EXPIRED 조회 · 닫힘 후 PENDING 처리 허용) → Task 1·4·5·6·9·10·12·13.
- §2 Out of Scope → 본 plan 미포함.
- §3.1 Round 엔티티 → Task 1 + Task 4.
- §3.2 Request 엔티티 → Task 1 + Task 5.
- §3.3 Club `last_verified_year` → Task 1 + Task 6.
- §3.4 상태 머신 → Task 4·5 (엔티티 검증).
- §3.5 EXPIRED 계산 → Task 8 (RC-5 QueryDSL) + Task 10 (service).
- §3.6 Flyway → Task 1.
- §4 API (RR-1~3, RC-1~5) → Task 12 (RR-1~3), Task 13 (RC-1, RC-2~5).
- §5 권한 → 컨트롤러 `@PreAuthorize` (Task 12·13).
- §5.2 입력 검증 → Task 11.
- §5.3 동시성 → Task 9 (open dedup) + Task 10 (request dedup + processForUpdate).
- §6 노출 정책 → Task 13 (모든 ADMIN 경로).
- §7 테스트 → Task 4·5 (엔티티) + Task 9·10 (서비스) + Task 14 (인수).
- §8 마이그레이션 → Task 1.

Placeholder scan: 없음.

Type 일관성:
- `RecertificationStatus` (PENDING/APPROVED/REJECTED) — V29 CHECK + Java enum + 모든 DTO·서비스에서 동일.
- `RoundStatus` (OPEN/CLOSED) — 동일.
- `RecertificationRequest#process(Long, RecertificationStatus, String)` — Task 5 엔티티 + Task 10 서비스 일치.
- `RecertificationRound#open(int, String, Long)` / `close(Long)` — Task 4 + Task 9 일치.
- `Club#updateLastVerifiedYear(int)` — Task 6 + Task 10 일치.
- `ClubMember` 도메인의 `findFirstByClubIdAndRole`, `findAllByClubIdOrderedByRoleAndJoinedAt`, `ClubMemberHistoryResponse` 는 이미 PR #134 (Leader Succession) 에서 제공 — Task 11·13 에서 그대로 활용.