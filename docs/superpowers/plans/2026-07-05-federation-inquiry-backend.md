# 총동연 1:1 비밀문의 백엔드 (P1-PR3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생↔총동연 1:1 비밀문의 백엔드 전체 — V74, 상태머신(version echo), 학생 5종 + 관리자 5종 API, 알림 3종, 도배 가드. 스펙 `docs/superpowers/specs/2026-07-04-federation-qna-design.md` §4·§5의 문의 파트(P1-PR3).

**Architecture:** `domain/federation/`에 inquiry 축 추가. 상태 전이는 report의 `process()`+`isTerminal()` 대신 전이 그래프가 있으므로 `ClubStatus.canTransitionTo` 스타일 enum 캡슐화. 낙관락은 Application 전례(@Version + @SQLDelete version 조건 + flush 후 좁은 catch). 알림은 기존 Spring 이벤트 인프라(event record → `notification/listener`의 AFTER_COMMIT 리스너 → `createIfAbsent`). 관리자 목록의 작성자 표기는 `findAllById` + `AdminLabels.DELETED`(레포 다수 관례 — leftJoin 불사용이라 count/목록 조인 일치 이슈 자체가 없음).

**스펙 대비 정밀화 1건(의도적 편차):** v4 스펙의 "동시 전이 낙관락 충돌 시 catch→재조회→204 수렴"은 flush 실패가 트랜잭션을 rollback-only로 만들어 같은 트랜잭션 안에서 정상 응답으로 수렴할 수 없다(UnexpectedRollbackException). 대신 **충돌은 409로 반환하고, 이미 IN_PROGRESS면 쓰기 전에 멱등 204로 조기 반환** — 패자는 재시도(또는 FE refetch) 시 no-op 204로 수렴한다. FE(PR5)에 409 시 refetch 후 재시도 1회를 명세에 전달할 것.

**주의(전 태스크 공통):** 커밋 Conventional Commits 한국어·AI 서명 금지·push/PR 금지(사용자 지시 후). gradlew는 `backend/`에서, `| tail` 금지. 테스트는 상대 날짜만.

---

## File Structure

```
backend/src/main/resources/db/migration/V74__create_federation_inquiry.sql   [생성]
backend/src/main/java/com/duing/domain/federation/
├── entity/FederationInquiryStatus.java          [생성] canTransitionTo 캡슐화
├── entity/FederationInquiry.java                [생성] @Version + 도메인 메서드
├── entity/FederationInquiryAnswer.java          [생성] 1:1 partial unique
├── repository/FederationInquiryRepository.java  [생성] +native(24h 포함삭제 카운트, 삭제 판별)
├── repository/FederationInquiryRepositoryCustom.java / Impl.java  [생성] 학생/관리자 검색
├── repository/FederationInquiryAnswerRepository.java              [생성]
├── exception/FederationInquiryException.java    [생성] inner 6종
├── service/FederationInquiryService.java / GeneralFederationInquiryService.java  [생성]
├── service/dto/command/  Create·Update·ChangeStatus·Answer·UpdateAnswer 5종     [생성]
├── service/dto/query/    FederationInquiryAdminSearchCondition,
│                         FederationInquiryDetailQuery, AdminFederationInquiryRow [생성]
├── api/FederationInquiryApi.java / AdminFederationInquiryApi.java               [생성]
├── controller/FederationInquiryController.java / AdminFederationInquiryController.java [생성]
└── controller/dto/ request 5종 + response 4종                                   [생성]
backend/src/main/java/com/duing/domain/notification/
├── event/FederationInquiryReceivedEvent.java / AnsweredEvent / ClosedEvent      [생성]
├── listener/FederationInquiryReceivedListener / AnsweredListener / ClosedListener [생성]
└── entity/NotificationType.java                 [수정] 3개 값 추가
backend/src/main/java/com/duing/domain/user/repository/UserRepository.java       [수정] findAllByRole
backend/src/test/java/com/duing/common/IntegrationTestBase.java                  [수정] TRUNCATE 2테이블
backend/src/test/java/com/duing/domain/federation/FederationInquiryAcceptanceTest.java [생성]
```

SecurityConfig 무변경 — 문의 경로는 전부 인증 필요라 `anyRequest().authenticated()` + 클래스 어노테이션으로 커버(permitAll 추가 절대 금지 — 기존 회귀 테스트 `anonymousBlockedOnInquiryPrefix`가 잠금).

---

### Task 1: 브랜치 + V74 마이그레이션

**Files:** Create `backend/src/main/resources/db/migration/V74__create_federation_inquiry.sql`

- [ ] **Step 1:** `git checkout develop && git pull origin develop && git checkout -b feat/federation-inquiry-api`
- [ ] **Step 2:** 최신 버전 확인 — `ls backend/src/main/resources/db/migration/ | sort -t V -k2 -n | tail -2` → V73이 마지막이어야 함(아니면 다음 빈 번호로 조정 후 보고)
- [ ] **Step 3: V74 작성**

```sql
-- 총동연 1:1 비밀문의. 작성자와 총동연(ADMIN)만 열람 — 애플리케이션 레이어에서 통제.
-- (스펙 2026-07-04-federation-qna-design §4)
CREATE TABLE federation_inquiry (
    id            BIGSERIAL PRIMARY KEY,
    author_id     BIGINT NOT NULL REFERENCES users (id),
    title         VARCHAR(120) NOT NULL,
    content       TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    answered_at   TIMESTAMP WITH TIME ZONE,
    closed_at     TIMESTAMP WITH TIME ZONE,
    closed_reason VARCHAR(200),
    version       BIGINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_inquiry_status
        CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')),
    CONSTRAINT chk_federation_inquiry_status_pair
        CHECK ((status <> 'ANSWERED' OR answered_at IS NOT NULL)
           AND (status <> 'CLOSED' OR closed_at IS NOT NULL)),
    CONSTRAINT chk_federation_inquiry_content_length CHECK (char_length(content) <= 2000)
);
CREATE INDEX idx_federation_inquiry_author
    ON federation_inquiry (author_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_inquiry_status
    ON federation_inquiry (status, created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry ENABLE ROW LEVEL SECURITY;

CREATE TABLE federation_inquiry_answer (
    id          BIGSERIAL PRIMARY KEY,
    inquiry_id  BIGINT NOT NULL REFERENCES federation_inquiry (id),
    content     TEXT NOT NULL,
    answered_by BIGINT NOT NULL REFERENCES users (id),  -- 학생 응답엔 비노출
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_inquiry_answer_length CHECK (char_length(content) <= 4000)
);
-- 이중 답변 DB 백스톱 (1:1 강제, 스레드 확장 시 이 인덱스만 제거)
CREATE UNIQUE INDEX uq_federation_inquiry_answer
    ON federation_inquiry_answer (inquiry_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry_answer ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4:** `cd backend && ./gradlew test --tests "*RowLevelSecurity*"` → BUILD SUCCESSFUL
- [ ] **Step 5:** Commit — `feat(backend): 총동연 1:1 문의 테이블 마이그레이션(V74) 추가`

---

### Task 2: 엔티티 + 상태 enum

**Files:** Create `entity/FederationInquiryStatus.java`, `entity/FederationInquiry.java`, `entity/FederationInquiryAnswer.java`

- [ ] **Step 1: 상태 enum (ClubStatus.canTransitionTo 전례)**

```java
package com.duing.domain.federation.entity;

public enum FederationInquiryStatus {
    RECEIVED, IN_PROGRESS, ANSWERED, CLOSED;

    /** 관리자 상태 변경 API가 허용하는 전이. ANSWERED 는 답변 등록으로만 진입(수동 지정 불가). */
    public boolean canTransitionTo(FederationInquiryStatus next) {
        if (this == next) return false;
        return switch (this) {
            case RECEIVED -> next == IN_PROGRESS || next == CLOSED;
            case IN_PROGRESS -> next == CLOSED;
            case ANSWERED -> next == CLOSED;
            case CLOSED -> false;
        };
    }

    /** 작성자 수정 허용 — 관리자가 답변 작성을 시작(IN_PROGRESS)하기 전까지만. */
    public boolean isEditableByAuthor() {
        return this == RECEIVED;
    }

    /** 답변 등록 가능 상태. RECEIVED 직행은 version echo 필수(서비스에서 검증). */
    public boolean canReceiveAnswer() {
        return this == RECEIVED || this == IN_PROGRESS;
    }
}
```

- [ ] **Step 2: FederationInquiry 엔티티** — Application.java 전례: @Version + @SQLDelete version 조건("soft delete 도 OptimisticLock 적용 대상")

```java
package com.duing.domain.federation.entity;

import com.duing.domain.federation.exception.FederationInquiryException;
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
@Table(name = "federation_inquiry")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 파라미터로 version 을 전달 — 학생 삭제 vs 관리자 답변
// 레이스에서 한쪽이 반드시 0 row 로 충돌을 감지한다(Application 전례).
@SQLDelete(sql = "UPDATE federation_inquiry SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationInquiry extends BaseEntity {

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FederationInquiryStatus status;

    @Column(name = "answered_at")
    private LocalDateTime answeredAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "closed_reason", length = 200)
    private String closedReason;

    // 동시 커밋 충돌 감지 + FE version echo(stale-render 방어)의 기준값. Hibernate 가 직접 채운다.
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationInquiry(Long authorId, String title, String content) {
        this.authorId = authorId;
        this.title = title;
        this.content = content;
        this.status = FederationInquiryStatus.RECEIVED;
    }

    public static FederationInquiry create(Long authorId, String title, String content) {
        return FederationInquiry.builder().authorId(authorId).title(title).content(content).build();
    }

    public boolean isAuthor(Long userId) {
        return this.authorId.equals(userId);
    }

    /** 작성자 수정 — 관리자가 답변 작성을 시작하기 전(RECEIVED)까지만. */
    public void updateContent(String title, String content) {
        if (!this.status.isEditableByAuthor()) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "총동연이 답변을 작성 중이거나 처리된 문의는 수정할 수 없습니다.");
        }
        this.title = title;
        this.content = content;
    }

    /** 관리자 "답변 작성" CTA — RECEIVED 에서만. 이미 IN_PROGRESS 인 멱등 처리는 서비스에서. */
    public void startProgress() {
        if (!this.status.canTransitionTo(FederationInquiryStatus.IN_PROGRESS)) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "답변중으로 전환할 수 없는 상태입니다: " + this.status);
        }
        this.status = FederationInquiryStatus.IN_PROGRESS;
    }

    /** 답변 등록 시 자동 전이 — dirty checking 으로 version 이 증가한다(JPQL 벌크 금지). */
    public void markAnswered() {
        if (!this.status.canReceiveAnswer()) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        this.status = FederationInquiryStatus.ANSWERED;
        this.answeredAt = LocalDateTime.now();
    }

    public void close(String closedReason) {
        if (!this.status.canTransitionTo(FederationInquiryStatus.CLOSED)) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "종료할 수 없는 상태입니다: " + this.status);
        }
        this.status = FederationInquiryStatus.CLOSED;
        this.closedAt = LocalDateTime.now();
        this.closedReason = closedReason;
    }
}
```

- [ ] **Step 3: FederationInquiryAnswer 엔티티**

```java
package com.duing.domain.federation.entity;

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
@Table(name = "federation_inquiry_answer")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE federation_inquiry_answer SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationInquiryAnswer extends BaseEntity {

    // 1:1 강제는 DB partial unique(uq_federation_inquiry_answer)가 백스톱 — 연관관계 대신 id 보관.
    @Column(name = "inquiry_id", nullable = false)
    private Long inquiryId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "answered_by", nullable = false)
    private Long answeredBy;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationInquiryAnswer(Long inquiryId, String content, Long answeredBy) {
        this.inquiryId = inquiryId;
        this.content = content;
        this.answeredBy = answeredBy;
    }

    public static FederationInquiryAnswer create(Long inquiryId, String content, Long answeredBy) {
        return FederationInquiryAnswer.builder()
                .inquiryId(inquiryId).content(content).answeredBy(answeredBy).build();
    }

    public void updateContent(String content) {
        this.content = content;
    }
}
```

- [ ] **Step 4:** 예외 클래스가 아직 없어 컴파일이 깨지므로 Task 3의 예외 파일을 이 태스크에서 **함께 생성**한다(아래 Task 3 Step 1 코드 그대로). 그 후 `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL
- [ ] **Step 5:** Commit — `feat(backend): 총동연 문의 엔티티·상태머신·예외 추가` (entity/ + exception/)

---

### Task 3: 예외 + 리포지토리 + UserRepository 확장

**Files:** Create `exception/FederationInquiryException.java`(Task 2에서 생성됨 — 검증만), `repository/FederationInquiryRepository.java`, `repository/FederationInquiryRepositoryCustom.java`, `repository/FederationInquiryRepositoryImpl.java`, `repository/FederationInquiryAnswerRepository.java`, `service/dto/query/FederationInquiryAdminSearchCondition.java` / Modify `user/repository/UserRepository.java`

- [ ] **Step 1: 예외 (Task 2에서 생성 — 내용 검증)**

```java
package com.duing.domain.federation.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FederationInquiryException extends ApplicationException {

    protected FederationInquiryException(String message, HttpStatus status) {
        super(message, status);
    }

    // 타인 문의 접근도 404 — 존재 자체를 은닉한다(스펙 §5·§7).
    public static class FederationInquiryNotFoundException extends FederationInquiryException {
        private static final String MESSAGE = "문의를 찾을 수 없습니다.";
        public FederationInquiryNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    // admin 상세 전용 — 관리자는 접수 알림으로 존재를 이미 알아 은닉 실익이 없다(스펙 §4 삭제 정책).
    public static class InquiryDeletedException extends FederationInquiryException {
        private static final String MESSAGE = "작성자가 삭제한 문의입니다.";
        public InquiryDeletedException() { super(MESSAGE, HttpStatus.GONE); }
    }

    // version echo 불일치 — stale-render 방어(스펙 §4 상태머신).
    public static class InquiryContentChangedException extends FederationInquiryException {
        private static final String MESSAGE = "문의가 수정되었습니다. 새로고침 후 다시 시도해 주세요.";
        public InquiryContentChangedException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidInquiryStatusException extends FederationInquiryException {
        public InvalidInquiryStatusException(String reason) { super(reason, HttpStatus.CONFLICT); }
    }

    public static class InquiryAlreadyAnsweredException extends FederationInquiryException {
        private static final String MESSAGE = "이미 답변이 등록된 문의입니다.";
        public InquiryAlreadyAnsweredException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class TooManyOpenInquiriesException extends FederationInquiryException {
        private static final String MESSAGE = "처리 대기 중인 문의가 많아 새 문의를 등록할 수 없습니다. 답변 후 다시 시도해 주세요.";
        public TooManyOpenInquiriesException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
}
```

- [ ] **Step 2: admin 검색 조건**

```java
package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiryStatus;

public record FederationInquiryAdminSearchCondition(
        FederationInquiryStatus status,
        String keyword
) {
}
```

- [ ] **Step 3: 리포지토리들**

```java
package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationInquiryRepository extends JpaRepository<FederationInquiry, Long>, FederationInquiryRepositoryCustom {

    // 도배 가드 (a): 열린 RECEIVED 건수 — derived query 라 @SQLRestriction(soft delete 제외) 자동 적용.
    long countByAuthorIdAndStatus(Long authorId, FederationInquiryStatus status);

    // 도배 가드 (b): 최근 24시간 생성 건수 — '삭제→재작성' 루프 우회를 막기 위해 soft delete 포함이어야
    // 하므로 native. (@SQLRestriction 은 native 에 적용되지 않는다)
    @Query(value = "select count(*) from federation_inquiry "
            + "where author_id = :authorId and created_at >= now() - interval '24 hours'",
            nativeQuery = true)
    long countRecentIncludingDeleted(@Param("authorId") Long authorId);

    // admin 상세의 404/410 분기 — 삭제된 행 존재 여부를 native 로 판별.
    @Query(value = "select exists(select 1 from federation_inquiry where id = :inquiryId and deleted_at is not null)",
            nativeQuery = true)
    boolean existsDeletedById(@Param("inquiryId") Long inquiryId);
}
```

```java
package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationInquiryRepositoryCustom {

    Page<FederationInquiry> searchMine(Long authorId, FederationInquiryStatus status, Pageable pageable);

    Page<FederationInquiry> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable);
}
```

```java
package com.duing.domain.federation.repository;

import static com.duing.domain.federation.entity.QFederationInquiry.federationInquiry;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class FederationInquiryRepositoryImpl implements FederationInquiryRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FederationInquiry> searchMine(Long authorId, FederationInquiryStatus status, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationInquiry.authorId.eq(authorId),
                federationInquiry.deletedAt.isNull(),
                statusEq(status)
        };
        return fetchPage(predicates, pageable);
    }

    @Override
    public Page<FederationInquiry> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                federationInquiry.deletedAt.isNull(),
                statusEq(condition.status()),
                keywordContains(condition.keyword())
        };
        return fetchPage(predicates, pageable);
    }

    private Page<FederationInquiry> fetchPage(BooleanExpression[] predicates, Pageable pageable) {
        List<FederationInquiry> content = queryFactory
                .selectFrom(federationInquiry)
                .where(predicates)
                .orderBy(federationInquiry.createdAt.desc(), federationInquiry.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(federationInquiry.count())
                .from(federationInquiry)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression statusEq(FederationInquiryStatus status) {
        return status != null ? federationInquiry.status.eq(status) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        return StringUtils.hasText(keyword)
                ? federationInquiry.title.containsIgnoreCase(keyword)
                        .or(federationInquiry.content.containsIgnoreCase(keyword))
                : null;
    }
}
```

```java
package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiryAnswer;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FederationInquiryAnswerRepository extends JpaRepository<FederationInquiryAnswer, Long> {

    Optional<FederationInquiryAnswer> findByInquiryId(Long inquiryId);
}
```

- [ ] **Step 4: UserRepository에 role 조회 추가** (기존 파일 수정 — 접수 알림의 ADMIN 전원 수신자용, 전례 없어 신규):

```java
    List<User> findAllByRole(UserRole role);
```

(import `com.duing.domain.user.entity.UserRole`, `java.util.List` — 기존 import 확인 후 추가)

- [ ] **Step 5:** `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL
- [ ] **Step 6:** Commit — `feat(backend): 총동연 문의 리포지토리·도배 가드 쿼리 추가`

---

### Task 4: command/query DTO + 서비스 + 이벤트

**Files:** Create command 5종, query 2종, `NotificationType` 수정, event 3종, `service/FederationInquiryService.java`, `service/GeneralFederationInquiryService.java`

- [ ] **Step 1: command 5종** (`service/dto/command/`)

```java
package com.duing.domain.federation.service.dto.command;

public record CreateFederationInquiryCommand(Long authorId, String title, String content) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

public record UpdateFederationInquiryCommand(Long inquiryId, Long authorId, String title, String content) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

import com.duing.domain.federation.entity.FederationInquiryStatus;

public record ChangeInquiryStatusCommand(
        Long inquiryId, FederationInquiryStatus status, Long version, String closedReason
) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

public record AnswerFederationInquiryCommand(Long inquiryId, Long answeredBy, String content, Long version) {
}
```

```java
package com.duing.domain.federation.service.dto.command;

public record UpdateInquiryAnswerCommand(Long inquiryId, String content) {
}
```

- [ ] **Step 2: query 2종** (`service/dto/query/`)

```java
package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;

public record FederationInquiryDetailQuery(FederationInquiry inquiry, FederationInquiryAnswer answer) {
}
```

```java
package com.duing.domain.federation.service.dto.query;

import com.duing.domain.federation.entity.FederationInquiry;

public record AdminFederationInquiryRow(FederationInquiry inquiry, String authorName, String authorStudentId) {
}
```

- [ ] **Step 3: NotificationType에 3개 값 추가** (`notification/entity/NotificationType.java` 맨 끝에 — DB는 VARCHAR 저장이라 마이그레이션 불필요):

```java
    FEDERATION_INQUIRY_RECEIVED,
    FEDERATION_INQUIRY_ANSWERED,
    FEDERATION_INQUIRY_CLOSED
```

- [ ] **Step 4: 이벤트 record 3종** (`notification/event/` — RecruitmentOpenedEvent 전례):

```java
package com.duing.domain.notification.event;

public record FederationInquiryReceivedEvent(Long inquiryId, String inquiryTitle) {
}
```

```java
package com.duing.domain.notification.event;

public record FederationInquiryAnsweredEvent(Long inquiryId, Long authorId, String inquiryTitle, Long answerId) {
}
```

```java
package com.duing.domain.notification.event;

public record FederationInquiryClosedEvent(Long inquiryId, Long authorId, String inquiryTitle, String closedReason) {
}
```

- [ ] **Step 5: 서비스 인터페이스**

```java
package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryRow;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationInquiryService {

    Long create(CreateFederationInquiryCommand command);

    Page<FederationInquiry> listMine(Long authorId, FederationInquiryStatus status, Pageable pageable);

    FederationInquiryDetailQuery getMine(Long inquiryId, Long authorId);

    void update(UpdateFederationInquiryCommand command);

    void delete(Long inquiryId, Long authorId);

    Page<AdminFederationInquiryRow> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable);

    FederationInquiryDetailQuery getForAdmin(Long inquiryId);

    void changeStatus(ChangeInquiryStatusCommand command);

    Long answer(AnswerFederationInquiryCommand command);

    void updateAnswer(UpdateInquiryAnswerCommand command);
}
```

- [ ] **Step 6: General 구현** — 핵심 로직 전체:

```java
package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryAnswer;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.exception.FederationInquiryException;
import com.duing.domain.federation.repository.FederationInquiryAnswerRepository;
import com.duing.domain.federation.repository.FederationInquiryRepository;
import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryRow;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.domain.notification.event.FederationInquiryAnsweredEvent;
import com.duing.domain.notification.event.FederationInquiryClosedEvent;
import com.duing.domain.notification.event.FederationInquiryReceivedEvent;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.constant.AdminLabels;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFederationInquiryService implements FederationInquiryService {

    // 도배 가드 상한 — (a) 열린 RECEIVED, (b) 24시간 생성(삭제 포함, '삭제→재작성' 루프 차단)
    private static final int MAX_OPEN_INQUIRIES = 5;
    private static final int MAX_DAILY_CREATIONS = 10;

    private final FederationInquiryRepository inquiryRepository;
    private final FederationInquiryAnswerRepository answerRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public Long create(CreateFederationInquiryCommand command) {
        if (inquiryRepository.countByAuthorIdAndStatus(command.authorId(), FederationInquiryStatus.RECEIVED)
                >= MAX_OPEN_INQUIRIES
                || inquiryRepository.countRecentIncludingDeleted(command.authorId()) >= MAX_DAILY_CREATIONS) {
            throw new FederationInquiryException.TooManyOpenInquiriesException();
        }
        FederationInquiry inquiry = inquiryRepository.save(
                FederationInquiry.create(command.authorId(), command.title(), command.content()));
        eventPublisher.publishEvent(new FederationInquiryReceivedEvent(inquiry.getId(), inquiry.getTitle()));
        return inquiry.getId();
    }

    @Override
    public Page<FederationInquiry> listMine(Long authorId, FederationInquiryStatus status, Pageable pageable) {
        return inquiryRepository.searchMine(authorId, status, pageable);
    }

    @Override
    public FederationInquiryDetailQuery getMine(Long inquiryId, Long authorId) {
        FederationInquiry inquiry = getOwned(inquiryId, authorId);
        return new FederationInquiryDetailQuery(
                inquiry, answerRepository.findByInquiryId(inquiry.getId()).orElse(null));
    }

    @Override
    @Transactional
    public void update(UpdateFederationInquiryCommand command) {
        FederationInquiry inquiry = getOwned(command.inquiryId(), command.authorId());
        inquiry.updateContent(command.title(), command.content());
    }

    @Override
    @Transactional
    public void delete(Long inquiryId, Long authorId) {
        FederationInquiry inquiry = getOwned(inquiryId, authorId);
        // 전 상태 허용(스펙 §4 삭제 정책 — soft delete 라 감사 이력 보존). 동시 답변 커밋과의 레이스는
        // @SQLDelete 의 version 조건이 감지 → 전역 핸들러가 409 변환.
        inquiryRepository.delete(inquiry);
    }

    @Override
    public Page<AdminFederationInquiryRow> searchForAdmin(
            FederationInquiryAdminSearchCondition condition, Pageable pageable) {
        Page<FederationInquiry> page = inquiryRepository.searchForAdmin(condition, pageable);
        // 탈퇴 회원은 @SQLRestriction 으로 findAllById 결과에서 빠진다 → AdminLabels.DELETED 폴백
        // (leftJoin 대신 페이지 내 id 일괄 조회 — GeneralLeaderSuccessionService 관례).
        List<Long> authorIds = page.getContent().stream().map(FederationInquiry::getAuthorId).distinct().toList();
        Map<Long, User> authorById = userRepository.findAllById(authorIds).stream()
                .collect(Collectors.toMap(User::getId, user -> user));
        return page.map(inquiry -> {
            User author = authorById.get(inquiry.getAuthorId());
            return new AdminFederationInquiryRow(
                    inquiry,
                    author != null ? author.getName() : AdminLabels.DELETED,
                    author != null ? author.getStudentId() : AdminLabels.DELETED);
        });
    }

    @Override
    public FederationInquiryDetailQuery getForAdmin(Long inquiryId) {
        FederationInquiry inquiry = getInquiryForAdmin(inquiryId);
        return new FederationInquiryDetailQuery(
                inquiry, answerRepository.findByInquiryId(inquiry.getId()).orElse(null));
    }

    @Override
    @Transactional
    public void changeStatus(ChangeInquiryStatusCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        switch (command.status()) {
            case IN_PROGRESS -> startProgress(inquiry, command.version());
            case CLOSED -> close(inquiry, command.closedReason());
            // ANSWERED 는 답변 등록으로만 진입, RECEIVED 역전이는 미지원(스펙 §4)
            default -> throw new FederationInquiryException.InvalidInquiryStatusException(
                    "직접 지정할 수 없는 상태입니다: " + command.status());
        }
    }

    private void startProgress(FederationInquiry inquiry, Long version) {
        if (inquiry.getStatus() == FederationInquiryStatus.IN_PROGRESS) {
            return; // 다른 관리자가 이미 시작 — 멱등 no-op(쓰기 전 조기 반환이라 안전)
        }
        // version echo — 관리자 화면 렌더 후 학생이 수정한 stale-render 창을 노력 투입 전에 차단(스펙 §4).
        if (version == null || !version.equals(inquiry.getVersion())) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        inquiry.startProgress();
        // 동시 전이 경합은 flush 로 현재 트랜잭션 안에서 감지한다. rollback-only 특성상 204 수렴은
        // 불가능하므로 409 로 반환 — 패자의 재시도는 위 멱등 no-op 으로 수렴한다(계획 서문 참조).
        try {
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException concurrentTransition) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
    }

    private void close(FederationInquiry inquiry, String closedReason) {
        boolean hadAnswer = answerRepository.findByInquiryId(inquiry.getId()).isPresent();
        inquiry.close(closedReason);
        if (!hadAnswer) {
            // 무답변 종결만 알림 — 답변 후 종결은 이미 답변 알림을 받았다(스펙 §5 알림 표).
            eventPublisher.publishEvent(new FederationInquiryClosedEvent(
                    inquiry.getId(), inquiry.getAuthorId(), inquiry.getTitle(), closedReason));
        }
    }

    @Override
    @Transactional
    public Long answer(AnswerFederationInquiryCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        if (!inquiry.getStatus().canReceiveAnswer()) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        // RECEIVED 직행(전이 API 생략 fallback)은 작성 시간 전체가 stale-view 에 노출 — echo 필수.
        // IN_PROGRESS 경로는 전이 시점 잠금(학생 수정 차단)이 이미 보장하므로 echo 불요(스펙 §4).
        if (inquiry.getStatus() == FederationInquiryStatus.RECEIVED
                && (command.version() == null || !command.version().equals(inquiry.getVersion()))) {
            throw new FederationInquiryException.InquiryContentChangedException();
        }
        if (answerRepository.findByInquiryId(inquiry.getId()).isPresent()) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        FederationInquiryAnswer answer = answerRepository.save(
                FederationInquiryAnswer.create(inquiry.getId(), command.content(), command.answeredBy()));
        inquiry.markAnswered(); // dirty checking — version 증가(JPQL 벌크 금지)
        try {
            // 동시 답변(다른 관리자)·학생 수정/삭제와의 경합을 커밋 전에 감지.
            // DB partial unique(uq_federation_inquiry_answer)가 최종 백스톱.
            answerRepository.flush();
            inquiryRepository.flush();
        } catch (ObjectOptimisticLockingFailureException | org.springframework.dao.DataIntegrityViolationException race) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        eventPublisher.publishEvent(new FederationInquiryAnsweredEvent(
                inquiry.getId(), inquiry.getAuthorId(), inquiry.getTitle(), answer.getId()));
        return answer.getId();
    }

    @Override
    @Transactional
    public void updateAnswer(UpdateInquiryAnswerCommand command) {
        FederationInquiry inquiry = getInquiryForAdmin(command.inquiryId());
        if (inquiry.getStatus() != FederationInquiryStatus.ANSWERED) {
            // CLOSED 후 답변 수정 금지 — 종료된 문의가 소리 없이 바뀌는 것을 막는다(스펙 §4).
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "답변완료 상태에서만 답변을 수정할 수 있습니다: " + inquiry.getStatus());
        }
        FederationInquiryAnswer answer = answerRepository.findByInquiryId(inquiry.getId())
                .orElseThrow(FederationInquiryException.FederationInquiryNotFoundException::new);
        answer.updateContent(command.content()); // 재알림 없음 — dedupKey 에 answerId 포함(스펙 §5)
    }

    // 학생 경로 — 순수 작성자 전용, 비작성자·미존재 모두 404 로 존재 은닉(ADMIN 도 admin 경로만 사용).
    private FederationInquiry getOwned(Long inquiryId, Long authorId) {
        return inquiryRepository.findById(inquiryId)
                .filter(inquiry -> inquiry.isAuthor(authorId))
                .orElseThrow(FederationInquiryException.FederationInquiryNotFoundException::new);
    }

    // admin 경로 — 삭제 건은 410(작성자가 삭제한 문의), 원래 없던 건은 404 로 구분.
    private FederationInquiry getInquiryForAdmin(Long inquiryId) {
        return inquiryRepository.findById(inquiryId).orElseThrow(() ->
                inquiryRepository.existsDeletedById(inquiryId)
                        ? new FederationInquiryException.InquiryDeletedException()
                        : new FederationInquiryException.FederationInquiryNotFoundException());
    }
}
```

- [ ] **Step 7:** `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL
- [ ] **Step 8:** Commit — `feat(backend): 총동연 문의 서비스 — 상태머신·version echo·도배 가드`

---

### Task 5: 알림 리스너 3종

**Files:** Create `notification/listener/FederationInquiryReceivedListener.java`, `FederationInquiryAnsweredListener.java`, `FederationInquiryClosedListener.java` — RecruitmentOpenedListener 전례(AFTER_COMMIT + 수신자 loop + try/catch log.warn)

- [ ] **Step 1: 접수 리스너 (ADMIN 전원)**

```java
package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FederationInquiryReceivedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class FederationInquiryReceivedListener {

    private final UserRepository userRepository;
    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FederationInquiryReceivedEvent event) {
        String dedupKey = "federation-inquiry-received:" + event.inquiryId();
        String linkUrl = "/admin/inquiries/" + event.inquiryId();
        // 총동연(ADMIN)은 극소수 — createIfAbsent loop 로 충분(대량이면 broadcaster 방식).
        userRepository.findAllByRole(UserRole.ADMIN).forEach(admin -> {
            try {
                notificationService.createIfAbsent(new CreateNotificationCommand(
                        admin.getId(),
                        NotificationType.FEDERATION_INQUIRY_RECEIVED,
                        "새 1:1 문의가 접수됐어요",
                        event.inquiryTitle(),
                        linkUrl,
                        Map.of("inquiryId", event.inquiryId()),
                        dedupKey));
            } catch (Exception failure) {
                log.warn("FEDERATION_INQUIRY_RECEIVED 알림 실패: adminId={}, inquiryId={}",
                        admin.getId(), event.inquiryId(), failure);
            }
        });
    }
}
```

- [ ] **Step 2: 답변 리스너 (작성자)** — dedupKey 에 answerId 포함: 답변 수정 재알림 차단 + P3 스레드 확장 시 새 답변 알림 자동 동작(스펙 §5)

```java
package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FederationInquiryAnsweredEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class FederationInquiryAnsweredListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FederationInquiryAnsweredEvent event) {
        try {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    event.authorId(),
                    NotificationType.FEDERATION_INQUIRY_ANSWERED,
                    "총동연 문의에 답변이 등록됐어요",
                    event.inquiryTitle(),
                    "/me/inquiries/" + event.inquiryId(),
                    Map.of("inquiryId", event.inquiryId()),
                    "federation-inquiry-answered:" + event.inquiryId() + ":" + event.answerId()));
        } catch (Exception failure) {
            log.warn("FEDERATION_INQUIRY_ANSWERED 알림 실패: inquiryId={}", event.inquiryId(), failure);
        }
    }
}
```

- [ ] **Step 3: 무답변 종결 리스너 (작성자)**

```java
package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FederationInquiryClosedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
@Slf4j
public class FederationInquiryClosedListener {

    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(FederationInquiryClosedEvent event) {
        String body = StringUtils.hasText(event.closedReason())
                ? event.closedReason()
                : "답변 없이 종료된 문의입니다. 필요하면 새 문의를 작성해 주세요.";
        try {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    event.authorId(),
                    NotificationType.FEDERATION_INQUIRY_CLOSED,
                    "문의가 종료됐어요",
                    body,
                    "/me/inquiries/" + event.inquiryId(),
                    Map.of("inquiryId", event.inquiryId()),
                    "federation-inquiry-closed:" + event.inquiryId()));
        } catch (Exception failure) {
            log.warn("FEDERATION_INQUIRY_CLOSED 알림 실패: inquiryId={}", event.inquiryId(), failure);
        }
    }
}
```

- [ ] **Step 4:** `cd backend && ./gradlew compileJava` → BUILD SUCCESSFUL
- [ ] **Step 5:** Commit — `feat(backend): 총동연 문의 알림 리스너 3종 추가`

---

### Task 6: 인수 테스트 (RED)

**Files:** Create `backend/src/test/java/com/duing/domain/federation/FederationInquiryAcceptanceTest.java` / Modify `IntegrationTestBase.java` (TRUNCATE 목록에 `federation_inquiry_answer`, `federation_inquiry` 추가 — 자식→부모, 기존 federation_faq 라인 인근)

테스트 시나리오 14개 (구현자는 FederationFaqAdminAcceptanceTest 의 saveUser/토큰 패턴 재사용, 시딩은 리포지토리 직접 또는 API 경유 — 문의 생성은 POST API 사용 가능):

1. `studentCreatesAndListsOwnInquiries` — POST 201 → GET /me/federation-inquiries 에 상태 RECEIVED 로 노출
2. `anonymousBlockedOnCreate` — 익명 POST 401
3. `otherStudentCannotReadInquiry` — 타 학생 GET 상세 404 (존재 은닉)
4. `adminReceivesNotificationOnCreate` — 생성 후 NotificationRepository 에서 type=FEDERATION_INQUIRY_RECEIVED, ADMIN userId 행 확인
5. `authorUpdatesOnlyWhileReceived` — RECEIVED 수정 204 → admin 이 status PATCH(IN_PROGRESS, version echo) → 재수정 409
6. `statusTransitionRequiresVersionEcho` — 학생이 내용 수정(version 증가) 후 관리자가 옛 version 으로 PATCH → 409, 새 version 으로 → 204
7. `inProgressTransitionIsIdempotent` — IN_PROGRESS 로 두 번 PATCH → 두 번째도 204
8. `answerFlowMarksAnsweredAndNotifies` — IN_PROGRESS 에서 POST answer 201 → 학생 상세에 answer 노출·status ANSWERED → Notification(type=ANSWERED) 생성 확인
9. `directAnswerFromReceivedRequiresVersionEcho` — RECEIVED 직행 답변: 옛 version 409, 올바른 version 201
10. `secondAnswerRejected` — 이미 답변된 문의에 POST answer 409
11. `answerUpdateOnlyWhenAnswered` — 답변 수정 204 → CLOSED 전이 → 답변 수정 409
12. `closeWithoutAnswerNotifiesAuthor` — RECEIVED→CLOSED(사유 포함) 204 → Notification(type=CLOSED) 확인, 학생 상세에 closedReason 노출
13. `authorDeletesAnytimeAndAdminSees410` — ANSWERED 문의 학생 DELETE 204 → 학생 상세 404·admin 상세 **410** → admin 목록에서 제외
14. `openInquiryFloodGuard` — RECEIVED 5건 생성 후 6번째 POST 409
15. `studentBlockedOnAdminEndpoints` — STUDENT 가 admin 목록 GET 403

검증 보조: `@Autowired NotificationRepository`(존재 확인 — 없으면 notification 조회 API 로 대체), status PATCH body 는 `{"status":"IN_PROGRESS","version":N}` / `{"status":"CLOSED","closedReason":"..."}`. 학생 상세 응답에서 version 필드는 admin 상세에만 있음(테스트 6·9의 version 은 admin 상세 GET 으로 획득).

- [ ] **Step 1:** IntegrationTestBase TRUNCATE 목록에 2테이블 추가(자식 `federation_inquiry_answer` 먼저)
- [ ] **Step 2:** 위 15개 시나리오로 테스트 작성(컴파일 가능해야 함 — 엔티티·리포지토리는 존재, 컨트롤러 부재로 RED)
- [ ] **Step 3:** `cd backend && ./gradlew test --tests "*FederationInquiryAcceptanceTest*"` → 대부분 FAIL(404/401 계열 — 사유가 "엔드포인트 부재"인지 확인, 500 금지)
- [ ] **Step 4:** Commit — `test(backend): 총동연 문의 인수 테스트 추가(RED)`

---

### Task 7: Api + Controller + HTTP DTO (GREEN)

**Files:** Create request 5종·response 4종, `api/FederationInquiryApi.java`, `api/AdminFederationInquiryApi.java`, `controller/FederationInquiryController.java`, `controller/AdminFederationInquiryController.java`

- [ ] **Step 1: request DTO 5종** (`controller/dto/request/`, 한국어 메시지 필수)

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFederationInquiryRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
        String title,
        @NotBlank(message = "내용은 필수 입력값입니다.")
        @Size(max = 2000, message = "내용은 2000자 이하여야 합니다.")
        String content
) {
    public CreateFederationInquiryCommand toCommand(Long authorId) {
        return new CreateFederationInquiryCommand(authorId, title, content);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateFederationInquiryRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
        String title,
        @NotBlank(message = "내용은 필수 입력값입니다.")
        @Size(max = 2000, message = "내용은 2000자 이하여야 합니다.")
        String content
) {
    public UpdateFederationInquiryCommand toCommand(Long inquiryId, Long authorId) {
        return new UpdateFederationInquiryCommand(inquiryId, authorId, title, content);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateFederationInquiryStatusRequest(
        @NotNull(message = "변경할 상태는 필수 입력값입니다.")
        FederationInquiryStatus status,
        Long version,   // IN_PROGRESS 전이 시 필수(서비스 검증 — stale-render 방어)
        @Size(max = 200, message = "종료 사유는 200자 이하여야 합니다.")
        String closedReason
) {
    public ChangeInquiryStatusCommand toCommand(Long inquiryId) {
        return new ChangeInquiryStatusCommand(inquiryId, status, version, closedReason);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AnswerFederationInquiryRequest(
        @NotBlank(message = "답변 내용은 필수 입력값입니다.")
        @Size(max = 4000, message = "답변은 4000자 이하여야 합니다.")
        String content,
        Long version    // RECEIVED 직행 답변 시 필수(서비스 검증)
) {
    public AnswerFederationInquiryCommand toCommand(Long inquiryId, Long answeredBy) {
        return new AnswerFederationInquiryCommand(inquiryId, answeredBy, content, version);
    }
}
```

```java
package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateFederationInquiryAnswerRequest(
        @NotBlank(message = "답변 내용은 필수 입력값입니다.")
        @Size(max = 4000, message = "답변은 4000자 이하여야 합니다.")
        String content
) {
    public UpdateInquiryAnswerCommand toCommand(Long inquiryId) {
        return new UpdateInquiryAnswerCommand(inquiryId, content);
    }
}
```

- [ ] **Step 2: response DTO 4종** (`controller/dto/response/`)

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import java.time.LocalDateTime;

public record FederationInquirySummaryResponse(
        Long id, String title, FederationInquiryStatus status,
        LocalDateTime createdAt, LocalDateTime answeredAt
) {
    public static FederationInquirySummaryResponse from(FederationInquiry inquiry) {
        return new FederationInquirySummaryResponse(
                inquiry.getId(), inquiry.getTitle(), inquiry.getStatus(),
                inquiry.getCreatedAt(), inquiry.getAnsweredAt());
    }
}
```

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryAnswer;
import java.time.LocalDateTime;

// answeredBy(관리자 개인)는 학생·관리자 응답 모두 미노출 — 표기는 FE 에서 "총동아리연합회" 고정(스펙 §5).
public record FederationInquiryAnswerResponse(
        String content, LocalDateTime answeredAt, LocalDateTime updatedAt
) {
    public static FederationInquiryAnswerResponse from(FederationInquiryAnswer answer) {
        return answer == null ? null : new FederationInquiryAnswerResponse(
                answer.getContent(), answer.getCreatedAt(), answer.getUpdatedAt());
    }
}
```

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import java.time.LocalDateTime;

public record FederationInquiryDetailResponse(
        Long id, String title, String content, FederationInquiryStatus status,
        LocalDateTime createdAt, String closedReason, FederationInquiryAnswerResponse answer
) {
    public static FederationInquiryDetailResponse from(FederationInquiryDetailQuery detail) {
        return new FederationInquiryDetailResponse(
                detail.inquiry().getId(), detail.inquiry().getTitle(), detail.inquiry().getContent(),
                detail.inquiry().getStatus(), detail.inquiry().getCreatedAt(),
                detail.inquiry().getClosedReason(),
                FederationInquiryAnswerResponse.from(detail.answer()));
    }
}
```

```java
package com.duing.domain.federation.controller.dto.response;

import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryRow;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import java.time.LocalDateTime;

public record AdminFederationInquiryResponse(
        Long id, String title, String content, FederationInquiryStatus status,
        Long version,   // FE 가 status PATCH·직행 답변에 echo — admin 응답에만 노출
        String authorName, String authorStudentId,
        LocalDateTime createdAt, LocalDateTime answeredAt, String closedReason,
        FederationInquiryAnswerResponse answer
) {
    public static AdminFederationInquiryResponse fromRow(AdminFederationInquiryRow row) {
        return new AdminFederationInquiryResponse(
                row.inquiry().getId(), row.inquiry().getTitle(), null, row.inquiry().getStatus(),
                row.inquiry().getVersion(), row.authorName(), row.authorStudentId(),
                row.inquiry().getCreatedAt(), row.inquiry().getAnsweredAt(),
                row.inquiry().getClosedReason(), null);  // 목록은 content·answer 미포함(경량)
    }

    public static AdminFederationInquiryResponse fromDetail(
            FederationInquiryDetailQuery detail, String authorName, String authorStudentId) {
        return new AdminFederationInquiryResponse(
                detail.inquiry().getId(), detail.inquiry().getTitle(), detail.inquiry().getContent(),
                detail.inquiry().getStatus(), detail.inquiry().getVersion(),
                authorName, authorStudentId,
                detail.inquiry().getCreatedAt(), detail.inquiry().getAnsweredAt(),
                detail.inquiry().getClosedReason(),
                FederationInquiryAnswerResponse.from(detail.answer()));
    }
}
```

- [ ] **Step 3: 학생 Api + Controller** — 클래스 레벨 `@PreAuthorize("isAuthenticated()")`, NotificationController 의 currentUser 스코핑 전례

```java
package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.CreateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.response.FederationInquiryDetailResponse;
import com.duing.domain.federation.controller.dto.response.FederationInquirySummaryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "총동연 1:1 문의", description = "학생용 비밀문의 API — 작성자와 총동연만 열람")
@SecurityRequirement(name = "BearerAuth")
public interface FederationInquiryApi {

    @Operation(summary = "문의 작성", description = "열린 문의 5건·24시간 10건 초과 시 409.")
    @PostMapping("/federation/inquiries")
    ResponseEntity<ApiResponse<Long>> createInquiry(
            @Valid @RequestBody CreateFederationInquiryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 문의 목록")
    @GetMapping("/me/federation-inquiries")
    ResponseEntity<ApiResponse<PageResponse<FederationInquirySummaryResponse>>> listMine(
            @RequestParam(required = false) FederationInquiryStatus status,
            @Parameter(hidden = true) Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 상세", description = "작성자 전용 — 타인 접근은 404(존재 은닉).")
    @GetMapping("/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<FederationInquiryDetailResponse>> getInquiry(
            @PathVariable Long inquiryId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 수정", description = "접수(RECEIVED) 상태에서만 — 답변 작성 시작 후 409.")
    @PatchMapping("/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<Void>> updateInquiry(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 삭제", description = "전 상태 허용(soft delete).")
    @DeleteMapping("/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<Void>> deleteInquiry(
            @PathVariable Long inquiryId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

```java
package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.FederationInquiryApi;
import com.duing.domain.federation.controller.dto.request.CreateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.response.FederationInquiryDetailResponse;
import com.duing.domain.federation.controller.dto.response.FederationInquirySummaryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.FederationInquiryService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FederationInquiryController implements FederationInquiryApi {

    private final FederationInquiryService federationInquiryService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createInquiry(
            @Valid @RequestBody CreateFederationInquiryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Long inquiryId = federationInquiryService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(inquiryId));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FederationInquirySummaryResponse>>> listMine(
            @RequestParam(required = false) FederationInquiryStatus status,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Page<FederationInquirySummaryResponse> page = federationInquiryService
                .listMine(currentUser.id(), status, pageable)
                .map(FederationInquirySummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<FederationInquiryDetailResponse>> getInquiry(
            @PathVariable Long inquiryId, @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(FederationInquiryDetailResponse.from(
                federationInquiryService.getMine(inquiryId, currentUser.id()))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateInquiry(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        federationInquiryService.update(request.toCommand(inquiryId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteInquiry(
            @PathVariable Long inquiryId, @AuthenticationPrincipal UserPrincipal currentUser) {
        federationInquiryService.delete(inquiryId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 4: 관리자 Api + Controller** — 클래스 레벨 `hasRole('ADMIN')` (AdminFederationFaqController 전례)

```java
package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.AnswerFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryAnswerRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryStatusRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationInquiryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
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

@Tag(name = "총동연 1:1 문의(관리)", description = "총동연 전용 문의 처리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFederationInquiryApi {

    @Operation(summary = "문의 관리 목록", description = "status/keyword 필터. 탈퇴 작성자는 '(삭제됨)' 표기.")
    @GetMapping("/admin/federation/inquiries")
    ResponseEntity<ApiResponse<PageResponse<AdminFederationInquiryResponse>>> getInquiries(
            @RequestParam(required = false) FederationInquiryStatus status,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "문의 상세", description = "작성자가 삭제한 문의는 410.")
    @GetMapping("/admin/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<AdminFederationInquiryResponse>> getInquiry(@PathVariable Long inquiryId);

    @Operation(summary = "상태 변경", description = "IN_PROGRESS(답변 작성 CTA — version 필수) 또는 CLOSED(사유 선택).")
    @PatchMapping("/admin/federation/inquiries/{inquiryId}/status")
    ResponseEntity<ApiResponse<Void>> changeStatus(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryStatusRequest request
    );

    @Operation(summary = "답변 등록", description = "ANSWERED 자동 전이 + 작성자 알림. RECEIVED 직행은 version 필수.")
    @PostMapping("/admin/federation/inquiries/{inquiryId}/answer")
    ResponseEntity<ApiResponse<Long>> registerAnswer(
            @PathVariable Long inquiryId,
            @Valid @RequestBody AnswerFederationInquiryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "답변 수정", description = "ANSWERED 상태에서만. 재알림 없음.")
    @PatchMapping("/admin/federation/inquiries/{inquiryId}/answer")
    ResponseEntity<ApiResponse<Void>> updateAnswer(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryAnswerRequest request
    );
}
```

```java
package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.AdminFederationInquiryApi;
import com.duing.domain.federation.controller.dto.request.AnswerFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryAnswerRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryStatusRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationInquiryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.FederationInquiryService;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.constant.AdminLabels;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFederationInquiryController implements AdminFederationInquiryApi {

    private final FederationInquiryService federationInquiryService;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFederationInquiryResponse>>> getInquiries(
            @RequestParam(required = false) FederationInquiryStatus status,
            @RequestParam(required = false) String keyword,
            Pageable pageable) {
        Page<AdminFederationInquiryResponse> page = federationInquiryService
                .searchForAdmin(new FederationInquiryAdminSearchCondition(status, keyword), pageable)
                .map(AdminFederationInquiryResponse::fromRow);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFederationInquiryResponse>> getInquiry(@PathVariable Long inquiryId) {
        FederationInquiryDetailQuery detail = federationInquiryService.getForAdmin(inquiryId);
        // 탈퇴 회원은 @SQLRestriction 으로 조회에서 빠짐 → '(삭제됨)' 폴백
        User author = userRepository.findById(detail.inquiry().getAuthorId()).orElse(null);
        return ResponseEntity.ok(ApiResponse.success(AdminFederationInquiryResponse.fromDetail(
                detail,
                author != null ? author.getName() : AdminLabels.DELETED,
                author != null ? author.getStudentId() : AdminLabels.DELETED)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> changeStatus(
            @PathVariable Long inquiryId, @Valid @RequestBody UpdateFederationInquiryStatusRequest request) {
        federationInquiryService.changeStatus(request.toCommand(inquiryId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> registerAnswer(
            @PathVariable Long inquiryId,
            @Valid @RequestBody AnswerFederationInquiryRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        Long answerId = federationInquiryService.answer(request.toCommand(inquiryId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(answerId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateAnswer(
            @PathVariable Long inquiryId, @Valid @RequestBody UpdateFederationInquiryAnswerRequest request) {
        federationInquiryService.updateAnswer(request.toCommand(inquiryId));
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 5:** `cd backend && ./gradlew test --tests "*FederationInquiryAcceptanceTest*"` → **15/15 PASS**. 이어서 FAQ 회귀: `--tests "*FederationFaq*"` → 전부 PASS
- [ ] **Step 6:** Commit — `feat(backend): 총동연 문의 학생·관리자 API 구현`

---

### Task 8: 전체 테스트 + 최종 리뷰 게이트

- [ ] **Step 1:** `cd backend && ./gradlew test` → BUILD SUCCESSFUL
- [ ] **Step 2:** 최종 리뷰 — duing-code-reviewer(전체 diff) + **codex adversarial 필수**(권한/상태전이/동시성/데이터무결성 전부 해당): 공격 포인트 = 타인 문의 IDOR·존재 은닉 일관성, version echo 우회, 동시 답변/삭제 레이스, 도배 가드 우회, 알림 IDOR(linkUrl), native 쿼리 인젝션 여부
- [ ] **Step 3:** 지적 반영 후 PR 준비(푸시·생성은 사용자 지시 후). PR 본문에 수용 트레이드오프(낙관락 충돌 409+멱등 재시도 — 스펙의 204 수렴 대비 정밀화 사유) 기록

---

## Self-Review 결과

- 스펙 §5 문의 파트 전 행 매핑: 학생 5(작성/내 목록/상세/수정/삭제) + 관리자 5(목록/상세/status/answer POST/answer PATCH) + 알림 3종 + 도배 가드 + INQUIRY_DELETED(410) + version echo. 첨부·리마인더 잡·auto-revert 잡은 스펙상 P2라 의도적 제외.
- 시그니처 정합: command/query record ↔ 서비스 ↔ 컨트롤러 전 구간 대조 완료. `FederationInquiryDetailQuery(inquiry, answer)` — Task 4 정의·Task 7 사용 일치. `existsDeletedById`·`countRecentIncludingDeleted` native 쿼리 파라미터 바인딩(@Param) 확인.
- 의도적 편차 1건(낙관락 409 vs 스펙의 204 수렴)은 서문에 사유 문서화 — rollback-only 제약. FE 계획(PR5)에 전달 필요.
- 플레이스홀더 없음. Task 6 테스트는 시나리오 명세로 제공(구현자가 기존 테스트 패턴으로 전개) — 각 시나리오에 기대 상태코드 명시.
