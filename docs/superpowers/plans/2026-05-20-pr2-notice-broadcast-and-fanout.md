# P2 — 백엔드 Notice Fan-out + Broadcast + 알림 통합 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P1 의 Notice 도메인에 발행-시점 fan-out 동작을 추가한다. PUBLIC 공지는 `notice_broadcast` projection 으로, OFFICERS_ALL / CLUB_SCOPED 공지는 기존 `notification` 테이블 fan-out 으로 전달한다. `GET /me/notifications` 는 두 소스를 union 으로 반환하고, broadcast 읽음 처리는 별도 엔드포인트를 둔다. 2000명 상한 초과 시 발행 거부.

**Architecture:** 도메인 분리 원칙(요청에 따른) 유지 — Notice(콘텐츠) / Notification(개인 전달) / NoticeBroadcast(공지 전달용 projection) 세 도메인은 코드·테이블 모두 분리. Fan-out 책임은 신규 `NoticeBroadcaster` 컴포넌트가 가지고, `GeneralNoticeService.create` 가 트랜잭션 내 동기 호출한다. 알림 통합 응답은 `NotificationService` 가 개인 + broadcast 두 소스를 over-fetch 후 메모리에서 머지한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA + QueryDSL / Flyway / RestAssured + TestContainers

**Spec reference:** `docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md` (§ 2.3-2.4 broadcast 모델 · § 3 fan-out 전략 · § 4.2 알림 통합 API · § 4.3 발행 트랜잭션)

**Branch:** `feat/notice-broadcast-fanout`

**Depends on:** P1 merged (`feat/notice-admin-crud` → `develop` PR #121, squash 머지됨).

**Out of Scope (이 PR 아님)**
- 비동기 큐 fan-out (2000명 초과 시 동기 발행 거부로 처리)
- 알림 cursor 페이지네이션 (offset 유지)
- 알림 푸시(웹푸시·이메일)
- 프론트엔드 (P3, P4)
- 수신자 사전 카운트 API
- 공지 수정 시 알림/broadcast 재발송 (의도된 스냅샷 고정)

---

## File Structure

```
backend/src/main/resources/db/migration/
  V25__create_notice_broadcast.sql                  [신규]

backend/src/main/java/com/duing/domain/notification/
  entity/NotificationType.java                      [수정] NOTICE_TARGETED 값 추가
  controller/dto/response/NotificationResponse.java [수정] source 디스크리미네이터 추가
  service/NotificationService.java                  [수정] 인터페이스 확장 (broadcast read)
  service/GeneralNotificationService.java           [수정] list/unread-count union, broadcast read
  api/NotificationApi.java                          [수정] broadcasts/{id}/read 엔드포인트
  controller/NotificationController.java            [수정] broadcasts/{id}/read 구현

backend/src/main/java/com/duing/domain/notice/broadcast/
  entity/NoticeBroadcast.java                       [신규] 가상 알림 projection
  entity/NoticeBroadcastRead.java                   [신규] composite key (broadcast_id + user_id)
  exception/NoticeBroadcastException.java           [신규]
  repository/NoticeBroadcastRepository.java         [신규]
  repository/NoticeBroadcastReadRepository.java     [신규]
  repository/NoticeBroadcastRepositoryCustom.java   [신규] (페이지 union 헬퍼 쿼리)
  repository/NoticeBroadcastRepositoryImpl.java     [신규]
  service/NoticeBroadcaster.java                    [신규] fan-out 컴포넌트 (인터페이스)
  service/GeneralNoticeBroadcaster.java             [신규] 구현체

backend/src/main/java/com/duing/domain/notice/
  service/GeneralNoticeService.java                 [수정] create() 마지막에 broadcaster 호출
  exception/NoticeException.java                    [수정] RecipientLimitExceededException 추가

backend/src/main/java/com/duing/domain/clubmember/repository/
  ClubMemberRepository.java                         [수정] 운영진/멤버 user id 조회 메서드 2종 추가

backend/src/test/java/com/duing/domain/notice/broadcast/
  service/NoticeBroadcasterTest.java                [신규]
  repository/NoticeBroadcastRepositoryImplTest.java [신규]
backend/src/test/java/com/duing/domain/notification/
  NotificationUnionAcceptanceTest.java              [신규]
```

---

## Task 1 — Flyway 마이그레이션 `V25__create_notice_broadcast.sql`

**Files:**
- Create: `backend/src/main/resources/db/migration/V25__create_notice_broadcast.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- notice_broadcast: PUBLIC 공지 + notify_on_publish=true 전용 가상 알림 projection
CREATE TABLE notice_broadcast (
    id          BIGSERIAL    PRIMARY KEY,
    notice_id   BIGINT       NOT NULL UNIQUE REFERENCES notice(id) ON DELETE CASCADE,
    title       VARCHAR(120) NOT NULL,
    body        VARCHAR(300) NOT NULL,
    link_url    VARCHAR(300),
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notice_broadcast_created
    ON notice_broadcast (created_at DESC)
    WHERE deleted_at IS NULL;

-- notice_broadcast_read: 사용자별 broadcast 읽음 마킹
CREATE TABLE notice_broadcast_read (
    broadcast_id BIGINT    NOT NULL REFERENCES notice_broadcast(id) ON DELETE CASCADE,
    user_id      BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (broadcast_id, user_id)
);

CREATE INDEX idx_notice_broadcast_read_user
    ON notice_broadcast_read (user_id, broadcast_id);
```

- [ ] **Step 2: 컴파일 + Flyway 검증**

Run: `cd backend && ./gradlew compileJava` — BUILD SUCCESSFUL.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V25__create_notice_broadcast.sql
git commit -m "feat(backend): notice_broadcast + notice_broadcast_read 마이그레이션 추가"
```

---

## Task 2 — `NotificationType` enum 에 `NOTICE_TARGETED` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java`

OFFICERS_ALL / CLUB_SCOPED fan-out 시 생성되는 개인 알림에 사용한다. 기존 값은 그대로.

- [ ] **Step 1: 기존 파일 읽기**

`backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java` 를 읽고 현재 enum 값 목록을 파악한다.

- [ ] **Step 2: `NOTICE_TARGETED` 값 추가**

Enum 마지막 값으로 추가:

```java
NOTICE_TARGETED,
```

(기존 값 순서 유지, 새 값만 마지막에 추가)

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java
git commit -m "feat(backend): NotificationType 에 NOTICE_TARGETED 값 추가"
```

---

## Task 3 — `RecipientLimitExceededException` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notice/exception/NoticeException.java`

- [ ] **Step 1: inner class 추가**

기존 `NoticeException` 의 마지막 inner class 뒤에 추가:

```java
public static class RecipientLimitExceededException extends NoticeException {
    public RecipientLimitExceededException(int count, int limit) {
        super("알림 발송 대상이 너무 많습니다 (요청 " + count + "명, 상한 " + limit + "명).",
              HttpStatus.BAD_REQUEST);
    }
}
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/exception/NoticeException.java
git commit -m "feat(backend): RecipientLimitExceededException 추가"
```

---

## Task 4 — `NoticeBroadcast` 엔티티

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/entity/NoticeBroadcast.java`

- [ ] **Step 1: 엔티티 작성**

```java
package com.duing.domain.notice.broadcast.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "notice_broadcast")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE notice_broadcast SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class NoticeBroadcast {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "notice_id", nullable = false, unique = true)
    private Long noticeId;

    @Column(nullable = false, length = 120) private String title;
    @Column(nullable = false, length = 300) private String body;
    @Column(name = "link_url", length = 300) private String linkUrl;
    @Column(name = "deleted_at") private LocalDateTime deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public static NoticeBroadcast snapshot(Long noticeId, String title, String body, String linkUrl) {
        NoticeBroadcast broadcast = new NoticeBroadcast();
        broadcast.noticeId = noticeId;
        broadcast.title = title;
        broadcast.body = body;
        broadcast.linkUrl = linkUrl;
        broadcast.createdAt = LocalDateTime.now();
        return broadcast;
    }
}
```

- [ ] **Step 2: 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/broadcast/entity/NoticeBroadcast.java
git commit -m "feat(backend): NoticeBroadcast 엔티티 추가"
```

---

## Task 5 — `NoticeBroadcastRead` 엔티티 (composite key)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/entity/NoticeBroadcastRead.java`

- [ ] **Step 1: 엔티티 작성**

```java
package com.duing.domain.notice.broadcast.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "notice_broadcast_read")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NoticeBroadcastRead {

    @EmbeddedId
    private NoticeBroadcastReadId id;

    @Column(name = "read_at", nullable = false)
    private LocalDateTime readAt;

    public NoticeBroadcastRead(Long broadcastId, Long userId) {
        this.id = new NoticeBroadcastReadId(broadcastId, userId);
        this.readAt = LocalDateTime.now();
    }

    public Long getBroadcastId() { return id.getBroadcastId(); }
    public Long getUserId() { return id.getUserId(); }

    @Embeddable
    @Getter
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    public static class NoticeBroadcastReadId implements Serializable {
        @Column(name = "broadcast_id") private Long broadcastId;
        @Column(name = "user_id") private Long userId;

        public NoticeBroadcastReadId(Long broadcastId, Long userId) {
            this.broadcastId = broadcastId; this.userId = userId;
        }

        @Override public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof NoticeBroadcastReadId other)) return false;
            return Objects.equals(broadcastId, other.broadcastId) && Objects.equals(userId, other.userId);
        }
        @Override public int hashCode() { return Objects.hash(broadcastId, userId); }
    }
}
```

- [ ] **Step 2: 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/broadcast/entity/NoticeBroadcastRead.java
git commit -m "feat(backend): NoticeBroadcastRead 엔티티 추가"
```

---

## Task 6 — `NoticeBroadcastException` 계층

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/exception/NoticeBroadcastException.java`

- [ ] **Step 1: 작성**

```java
package com.duing.domain.notice.broadcast.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class NoticeBroadcastException extends ApplicationException {

    protected NoticeBroadcastException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class NoticeBroadcastNotFoundException extends NoticeBroadcastException {
        private static final String MESSAGE = "공지 broadcast 를 찾을 수 없습니다.";
        public NoticeBroadcastNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
}
```

- [ ] **Step 2: 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/broadcast/exception/NoticeBroadcastException.java
git commit -m "feat(backend): NoticeBroadcastException 추가"
```

---

## Task 7 — `ClubMemberRepository` 에 fan-out 수신자 조회 메서드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`

P1 에서 추가한 `findClubIdsByUserId` / `findOfficerClubIdsByUserId` 와 별개로, **반대 방향** (클럽 기준 사용자 id 조회) 이 필요하다.

- [ ] **Step 1: 기존 파일 읽기 + 메서드 추가**

기존 인터페이스에 두 쿼리 추가:

```java
@org.springframework.data.jpa.repository.Query(
        "SELECT DISTINCT cm.user.id FROM ClubMember cm WHERE cm.club.id IN :clubIds")
java.util.List<Long> findUserIdsByClubIdIn(@org.springframework.data.repository.query.Param("clubIds") java.util.Collection<Long> clubIds);

@org.springframework.data.jpa.repository.Query("""
        SELECT DISTINCT cm.user.id FROM ClubMember cm
        WHERE cm.club.id IN :clubIds AND cm.role IN ('LEADER','OFFICER')
        """)
java.util.List<Long> findOfficerUserIdsByClubIdIn(@org.springframework.data.repository.query.Param("clubIds") java.util.Collection<Long> clubIds);

@org.springframework.data.jpa.repository.Query("""
        SELECT DISTINCT cm.user.id FROM ClubMember cm
        WHERE cm.role IN ('LEADER','OFFICER')
        """)
java.util.List<Long> findAllOfficerUserIds();
```

(Imports already exist for `@Query`/`@Param` from P1 changes.)

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java
git commit -m "feat(backend): clubmember repo 에 fan-out 수신자 조회 메서드 추가"
```

---

## Task 8 — `NoticeBroadcastRepository` + `NoticeBroadcastReadRepository`

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/repository/NoticeBroadcastRepository.java`
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/repository/NoticeBroadcastReadRepository.java`
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/repository/NoticeBroadcastRepositoryCustom.java`
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/repository/NoticeBroadcastRepositoryImpl.java`

`NoticeBroadcastRepositoryCustom` 가 알림 union 에 쓸 핵심 쿼리:
- `findUnreadCountForUser(Long userId)` — 본인이 읽지 않은 broadcast 수
- `findVisibleSlice(Long userId, int limit)` — over-fetch 용 (broadcast + isRead 마커, `created_at DESC`)

- [ ] **Step 1: `NoticeBroadcastRepository`**

```java
package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeBroadcastRepository
        extends JpaRepository<NoticeBroadcast, Long>, NoticeBroadcastRepositoryCustom {
}
```

- [ ] **Step 2: `NoticeBroadcastReadRepository`**

```java
package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeBroadcastReadRepository
        extends JpaRepository<NoticeBroadcastRead, NoticeBroadcastRead.NoticeBroadcastReadId> {

    boolean existsByIdBroadcastIdAndIdUserId(Long broadcastId, Long userId);
}
```

- [ ] **Step 3: `NoticeBroadcastRepositoryCustom`**

```java
package com.duing.domain.notice.broadcast.repository;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import java.util.List;

public interface NoticeBroadcastRepositoryCustom {

    /**
     * 사용자 입장에서 isRead 여부와 함께 broadcast 를 N건 over-fetch.
     * 정렬은 created_at DESC. NotificationService 가 개인 알림과 메모리 머지.
     */
    List<BroadcastSlice> findSliceForUser(Long userId, int limit);

    long countUnreadForUser(Long userId);

    record BroadcastSlice(NoticeBroadcast broadcast, boolean isRead) {}
}
```

- [ ] **Step 4: `NoticeBroadcastRepositoryImpl` (QueryDSL)**

```java
package com.duing.domain.notice.broadcast.repository;

import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcast.noticeBroadcast;
import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcastRead.noticeBroadcastRead;

import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class NoticeBroadcastRepositoryImpl implements NoticeBroadcastRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<BroadcastSlice> findSliceForUser(Long userId, int limit) {
        BooleanExpression readJoin = noticeBroadcastRead.id.broadcastId.eq(noticeBroadcast.id)
                .and(noticeBroadcastRead.id.userId.eq(userId));

        List<Tuple> rows = queryFactory
                .select(noticeBroadcast, noticeBroadcastRead.readAt)
                .from(noticeBroadcast)
                .leftJoin(noticeBroadcastRead).on(readJoin)
                .orderBy(noticeBroadcast.createdAt.desc())
                .limit(limit)
                .fetch();

        return rows.stream()
                .map(row -> new BroadcastSlice(
                        row.get(noticeBroadcast),
                        row.get(noticeBroadcastRead.readAt) != null))
                .toList();
    }

    @Override
    public long countUnreadForUser(Long userId) {
        BooleanExpression readJoin = noticeBroadcastRead.id.broadcastId.eq(noticeBroadcast.id)
                .and(noticeBroadcastRead.id.userId.eq(userId));

        Long count = queryFactory
                .select(noticeBroadcast.count())
                .from(noticeBroadcast)
                .leftJoin(noticeBroadcastRead).on(readJoin)
                .where(noticeBroadcastRead.id.userId.isNull())
                .fetchOne();
        return count == null ? 0L : count;
    }
}
```

- [ ] **Step 5: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/broadcast/repository/
git commit -m "feat(backend): NoticeBroadcastRepository + ReadRepository + QueryDSL 구현"
```

---

## Task 9 — `NoticeBroadcaster` 인터페이스 + `GeneralNoticeBroadcaster` 구현

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/service/NoticeBroadcaster.java`
- Create: `backend/src/main/java/com/duing/domain/notice/broadcast/service/GeneralNoticeBroadcaster.java`

Fan-out 책임은 이 컴포넌트가 단독으로 가진다. `NoticeService` 는 발행 결과(저장된 `Notice` 엔티티 + targetClubIds) 를 넘긴다.

- [ ] **Step 1: 인터페이스**

```java
package com.duing.domain.notice.broadcast.service;

import com.duing.domain.notice.entity.Notice;
import java.util.List;

public interface NoticeBroadcaster {

    /**
     * 발행된 공지에 대해 visibility 별 fan-out 을 수행한다.
     * 발행 트랜잭션 내에서 호출되어야 하며 2000명 상한 초과 시 예외로 트랜잭션을 롤백한다.
     *
     * @param notice 이미 save 된 Notice (id 부여 완료)
     * @param targetClubIds CLUB_SCOPED 일 때 대상 클럽 id 들. 그 외엔 빈 리스트.
     */
    void publish(Notice notice, List<Long> targetClubIds);
}
```

- [ ] **Step 2: 구현체 — fan-out 로직**

```java
package com.duing.domain.notice.broadcast.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GeneralNoticeBroadcaster implements NoticeBroadcaster {

    public static final int RECIPIENT_LIMIT = 2000;

    private final NoticeBroadcastRepository broadcastRepository;
    private final NotificationRepository notificationRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    public void publish(Notice notice, List<Long> targetClubIds) {
        switch (notice.getVisibility()) {
            case PUBLIC -> publishPublic(notice);
            case OFFICERS_ALL -> fanOutToOfficersAll(notice);
            case CLUB_SCOPED -> fanOutToClubScope(notice, targetClubIds);
        }
    }

    private void publishPublic(Notice notice) {
        if (!notice.isNotifyOnPublish()) return;
        broadcastRepository.save(NoticeBroadcast.snapshot(
                notice.getId(), notice.getTitle(), notice.getSummary(), buildLinkUrl(notice.getId())));
    }

    private void fanOutToOfficersAll(Notice notice) {
        List<Long> recipients = clubMemberRepository.findAllOfficerUserIds();
        guardLimit(recipients.size());
        bulkInsertNotifications(notice, recipients);
    }

    private void fanOutToClubScope(Notice notice, List<Long> targetClubIds) {
        List<Long> recipients = notice.getClubScopeRole() == NoticeClubScopeRole.OFFICERS_ONLY
                ? clubMemberRepository.findOfficerUserIdsByClubIdIn(targetClubIds)
                : clubMemberRepository.findUserIdsByClubIdIn(targetClubIds);
        guardLimit(recipients.size());
        bulkInsertNotifications(notice, recipients);
    }

    private void guardLimit(int count) {
        if (count > RECIPIENT_LIMIT) {
            throw new NoticeException.RecipientLimitExceededException(count, RECIPIENT_LIMIT);
        }
    }

    private void bulkInsertNotifications(Notice notice, List<Long> recipients) {
        if (recipients.isEmpty()) return;
        String dedupKey = "notice:" + notice.getId();
        String linkUrl = buildLinkUrl(notice.getId());
        Map<String, Object> payload = Map.of("noticeId", notice.getId(),
                "visibility", notice.getVisibility().name());
        List<Notification> rows = recipients.stream()
                .map(userId -> Notification.create(
                        userId, NotificationType.NOTICE_TARGETED,
                        notice.getTitle(), notice.getSummary(),
                        linkUrl, payload, dedupKey))
                .toList();
        notificationRepository.saveAll(rows);
    }

    private static String buildLinkUrl(Long noticeId) {
        return "/notices/" + noticeId;
    }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/broadcast/service/
git commit -m "feat(backend): NoticeBroadcaster fan-out 컴포넌트 추가 (2000명 상한)"
```

---

## Task 10 — `GeneralNoticeService.create()` 에 broadcaster 호출 연결

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java`

P1 의 `create()` 끝에 broadcaster 호출을 추가한다. fan-out 카운트 초과 예외는 `@Transactional` 롤백으로 notice/target_club row 도 함께 폐기.

- [ ] **Step 1: 의존성 주입 추가**

```java
private final NoticeBroadcaster broadcaster;
```

(import: `com.duing.domain.notice.broadcast.service.NoticeBroadcaster`)

- [ ] **Step 2: `create()` 마지막에 호출 추가**

기존 `create()` 의 끝:

```java
        if (command.visibility() == NoticeVisibility.CLUB_SCOPED) {
            persistTargetClubs(saved.getId(), command.targetClubIds());
        }
        return saved.getId();
```

위 블록 끝 `return` 직전에:

```java
        List<Long> targetClubIds = command.visibility() == NoticeVisibility.CLUB_SCOPED
                ? command.targetClubIds()
                : List.of();
        broadcaster.publish(saved, targetClubIds);
        return saved.getId();
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java
git commit -m "feat(backend): NoticeService create 에 broadcaster 호출 연결"
```

---

## Task 11 — `NotificationResponse` 에 `source` 디스크리미네이터 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notification/controller/dto/response/NotificationResponse.java`

스펙 § 4.2 의 응답 DTO:
```
{ source: "PERSONAL" | "BROADCAST", id, title, body, linkUrl, createdAt, isRead }
```

- [ ] **Step 1: 기존 파일 읽기 + 새 필드/팩토리 추가**

기존 `NotificationResponse` 가 record 라면 필드를 추가하고 `from(Notification)` 팩토리 기존 호출 호환을 유지하기 위해 `from(Notification)` 은 `source = "PERSONAL"` 로 채우도록 한다. 또한 `from(NoticeBroadcast broadcast, boolean isRead)` 정적 팩토리를 신규 추가한다.

원본 `NotificationResponse` 가 예: `(Long id, NotificationType type, String title, String body, String linkUrl, Map<String,Object> payload, boolean isRead, LocalDateTime createdAt)` 형태라면, 다음과 같이 확장:

```java
public record NotificationResponse(
        String source,           // "PERSONAL" or "BROADCAST"
        Long id,
        String title,
        String body,
        String linkUrl,
        boolean isRead,
        LocalDateTime createdAt
        // 기존 type/payload 필드는 유지 — 아래 from() 참조
) {
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
                "PERSONAL", notification.getId(),
                notification.getTitle(), notification.getBody(),
                notification.getLinkUrl(),
                !notification.isUnread(),
                notification.getCreatedAt());
    }

    public static NotificationResponse fromBroadcast(NoticeBroadcast broadcast, boolean isRead) {
        return new NotificationResponse(
                "BROADCAST", broadcast.getId(),
                broadcast.getTitle(), broadcast.getBody(),
                broadcast.getLinkUrl(),
                isRead,
                broadcast.getCreatedAt());
    }
}
```

**중요**: 기존 record 필드(예: `type`, `payload`) 가 다른 호출자에서 사용 중이면 함부로 제거하지 말고 nullable 로 유지. 파일을 먼저 읽고 기존 필드를 모두 보존하는 쪽으로 머지하세요. `source` 만 첫 필드로 추가하고 broadcast 경로에서는 type/payload 를 null/Map.of() 로 둡니다.

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notification/controller/dto/response/NotificationResponse.java
git commit -m "feat(backend): NotificationResponse 에 source 디스크리미네이터 + broadcast 팩토리 추가"
```

---

## Task 12 — `NotificationService` / `GeneralNotificationService` 확장: union 조회 + broadcast 읽음

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notification/service/NotificationService.java`
- Modify: `backend/src/main/java/com/duing/domain/notification/service/GeneralNotificationService.java`

### 12-1. 인터페이스 변경
기존 메서드 시그니처를 그대로 유지하면서 `list` / `unreadCount` 의 동작에 broadcast union 을 포함하도록 구현 변경. 새 메서드는 `markBroadcastRead(Long userId, Long broadcastId)` 추가.

- [ ] **Step 1: `NotificationService` 인터페이스에 메서드 추가**

```java
void markBroadcastRead(Long userId, Long broadcastId);
```

- [ ] **Step 2: 기존 `list` 응답 시그니처 확인**

`GeneralNotificationService.list` 가 반환하는 타입을 확인. 현재는 `Page<NotificationResponse>` 또는 `Page<Notification>` 일 것. **반환 타입이 `Page<Notification>` 이면 controller 가 매핑** — controller 의 매핑은 `NotificationResponse::from` 호출일 것이다. 이 매핑 위치에 broadcast 머지 로직을 두는 게 자연스럽다.

→ 정책: **service 가 매핑까지 책임지도록 변경**. `Page<NotificationResponse> list(...)` 로 시그니처 변경 (controller 단의 `.map(NotificationResponse::from)` 호출 제거).

### 12-2. 구현체 변경

- [ ] **Step 3: `list` 구현 — offset union**

```java
@Override
public Page<NotificationResponse> list(Long userId, boolean unreadOnly, Pageable pageable) {
    // 1) 개인 알림 N건 over-fetch
    int overFetch = (pageable.getPageNumber() + 1) * pageable.getPageSize();
    Page<Notification> personal = notificationRepository.findByUserIdSliceOrdered(
            userId, unreadOnly, PageRequest.of(0, overFetch, Sort.by(Sort.Direction.DESC, "createdAt")));

    // 2) broadcast over-fetch
    List<NoticeBroadcastRepositoryCustom.BroadcastSlice> broadcasts =
            broadcastRepository.findSliceForUser(userId, overFetch);

    // 3) 머지 + 정렬
    List<NotificationResponse> merged = new ArrayList<>(personal.getContent().size() + broadcasts.size());
    for (Notification n : personal.getContent()) {
        if (unreadOnly && !n.isUnread()) continue;
        merged.add(NotificationResponse.from(n));
    }
    for (NoticeBroadcastRepositoryCustom.BroadcastSlice b : broadcasts) {
        if (unreadOnly && b.isRead()) continue;
        merged.add(NotificationResponse.fromBroadcast(b.broadcast(), b.isRead()));
    }
    merged.sort(Comparator.comparing(NotificationResponse::createdAt).reversed());

    // 4) 페이지 슬라이스
    int start = (int) pageable.getOffset();
    int end = Math.min(start + pageable.getPageSize(), merged.size());
    List<NotificationResponse> pageContent = start >= merged.size() ? List.of() : merged.subList(start, end);
    return new PageImpl<>(pageContent, pageable, merged.size());
}
```

- [ ] **Step 4: `unreadCount` 구현 — 두 소스 합산**

```java
@Override
public long unreadCount(Long userId) {
    long personal = notificationRepository.countByUserIdAndReadAtIsNull(userId);
    long broadcast = broadcastRepository.countUnreadForUser(userId);
    return personal + broadcast;
}
```

(기존 `countByUserIdAndReadAtIsNull` 메서드명이 정확하지 않을 수 있음 — 기존 `unreadCount` 구현체를 먼저 읽고 동일한 호출 패턴 사용.)

- [ ] **Step 5: `markBroadcastRead` 구현**

```java
@Override
@Transactional
public void markBroadcastRead(Long userId, Long broadcastId) {
    NoticeBroadcast broadcast = broadcastRepository.findById(broadcastId)
            .orElseThrow(NoticeBroadcastException.NoticeBroadcastNotFoundException::new);
    if (readRepository.existsByIdBroadcastIdAndIdUserId(broadcastId, userId)) return; // 멱등
    readRepository.save(new NoticeBroadcastRead(broadcastId, userId));
}
```

- [ ] **Step 6: 의존성 주입 추가**

```java
private final NoticeBroadcastRepository broadcastRepository;
private final NoticeBroadcastReadRepository readRepository;
```

- [ ] **Step 7: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notification/service/
git commit -m "feat(backend): NotificationService list/unread-count union 통합 + broadcast read"
```

---

## Task 13 — Controller: `/me/notifications/broadcasts/{broadcastId}/read` 엔드포인트 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notification/api/NotificationApi.java`
- Modify: `backend/src/main/java/com/duing/domain/notification/controller/NotificationController.java`

- [ ] **Step 1: `NotificationApi` 에 메서드 추가**

```java
@Operation(summary = "Broadcast 알림 읽음 처리 (멱등)", description = "공지 broadcast 를 본인 기준으로 읽음 마킹.")
@PatchMapping("/broadcasts/{broadcastId}/read")
ResponseEntity<Void> readBroadcast(
        @PathVariable Long broadcastId,
        @AuthenticationPrincipal UserPrincipal currentUser
);
```

- [ ] **Step 2: `NotificationController` 에 구현**

```java
@Override
public ResponseEntity<Void> readBroadcast(@PathVariable Long broadcastId,
                                          @AuthenticationPrincipal UserPrincipal currentUser) {
    notificationService.markBroadcastRead(currentUser.id(), broadcastId);
    return ResponseEntity.noContent().build();
}
```

또한 기존 `list` 컨트롤러가 `NotificationResponse::from` 매핑을 들고 있다면 제거 (서비스가 이미 매핑) — 컨트롤러 시그니처가 `Page<NotificationResponse>` 를 받도록 단순화.

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/notification/api/NotificationApi.java \
       backend/src/main/java/com/duing/domain/notification/controller/NotificationController.java
git commit -m "feat(backend): broadcast 알림 읽음 처리 엔드포인트 추가"
```

---

## Task 14 — `NoticeBroadcaster` 단위 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/broadcast/service/NoticeBroadcasterTest.java`

P1 의 `GeneralNoticeServiceTest` 패턴 (`@SpringBootTest + @Import(TestcontainersConfiguration) + @Transactional + @DirtiesContext`) 그대로.

- [ ] **Step 1: 테스트 4건 작성**

각 `@DisplayName` 의 의도:
1. "PUBLIC + notifyOnPublish=true 발행 시 notice_broadcast 1건이 생성된다"
2. "PUBLIC + notifyOnPublish=false 발행 시 broadcast 도 notification 도 생성되지 않는다"
3. "OFFICERS_ALL 발행 시 모든 LEADER/OFFICER 사용자에게 notification 이 fan-out 된다"
4. "수신자 수가 2000명을 초과하면 RecipientLimitExceededException 이 발생하고 트랜잭션이 롤백된다"

각 테스트의 본문은 P1 패턴을 따라 직접 User/Club/ClubMember fixture 를 만들고, `NoticeBroadcaster#publish` 를 호출 후 repository 상태를 assert.

테스트 4의 fixture 는 2001 ClubMember(LEADER) 를 빠르게 saveAll 로 일괄 생성. 단, `User` 도 같은 수 필요 → fixture 헬퍼에서 saveAll 로 일괄 처리. 가능하면 사용자별 unique studentId/email 보장 (sequence 사용).

```java
@Test
@DisplayName("PUBLIC + notifyOnPublish=true 발행 시 notice_broadcast 1건이 생성된다")
void publicWithNotifyOn_createsBroadcast() {
    Long authorId = saveAdminId();
    Notice notice = noticeRepository.save(Notice.create(
            "공지", "요약", "본문", "https://example.com/cover.png", null,
            NoticeCategory.GENERAL, List.of(),
            NoticeVisibility.PUBLIC, null, false, null, true, authorId));

    broadcaster.publish(notice, List.of());

    assertThat(broadcastRepository.findAll())
            .extracting(NoticeBroadcast::getNoticeId)
            .contains(notice.getId());
}
```

- [ ] **Step 2: `./gradlew compileTestJava` 확인 + 커밋**

```bash
cd backend && ./gradlew compileTestJava
git add backend/src/test/java/com/duing/domain/notice/broadcast/service/NoticeBroadcasterTest.java
git commit -m "test(backend): NoticeBroadcaster fan-out 단위 테스트"
```

---

## Task 15 — `NoticeBroadcastRepositoryImpl` 단위 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/broadcast/repository/NoticeBroadcastRepositoryImplTest.java`

P1 의 `NoticeRepositoryImplTest` 패턴.

- [ ] **Step 1: 테스트 3건**

1. "findSliceForUser 는 created_at DESC 정렬로 broadcast 를 반환한다"
2. "broadcast_read 가 있는 항목은 isRead=true 로 표시된다"
3. "countUnreadForUser 는 broadcast_read 가 없는 항목 수를 정확히 반환한다"

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileTestJava
git add backend/src/test/java/com/duing/domain/notice/broadcast/repository/NoticeBroadcastRepositoryImplTest.java
git commit -m "test(backend): NoticeBroadcastRepository QueryDSL 테스트"
```

---

## Task 16 — Acceptance: 알림 union 응답 + broadcast 읽음 엔드포인트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notification/NotificationUnionAcceptanceTest.java`

P1 의 `NoticeAdminAcceptanceTest` 패턴 (`@SpringBootTest RANDOM_PORT + JwtTokenProvider`).

- [ ] **Step 1: 테스트 3건**

1. "ADMIN 이 PUBLIC + notifyOnPublish=true 공지를 발행하면 다른 사용자의 GET /me/notifications 응답에 source=BROADCAST 항목이 포함된다"
2. "PATCH /me/notifications/broadcasts/{id}/read 호출 후 같은 broadcast 는 isRead=true 로 응답된다"
3. "OFFICERS_ALL 공지 발행 시 운영진 사용자에게 source=PERSONAL 알림이 생성된다 (그 외 사용자에겐 안 보임)"

각 테스트는 RestAssured 로 `/api/v1/admin/notices` 에 POST 하고 `/api/v1/me/notifications` 에 GET 해서 검증.

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileTestJava
git add backend/src/test/java/com/duing/domain/notification/NotificationUnionAcceptanceTest.java
git commit -m "test(backend): 알림 union 응답 + broadcast 읽음 인수 테스트"
```

---

## Task 17 — 최종 빌드 + PR

- [ ] **Step 1: 전체 빌드/테스트**

Run: `cd backend && ./gradlew clean build`

Expected: BUILD SUCCESSFUL. (Docker 가 사용 가능한 환경에서) 모든 테스트 통과.

- [ ] **Step 2: PR 작성**

브랜치 `feat/notice-broadcast-fanout` → `develop` 으로 PR.

```
## 🚀 작업 내용
P1 의 Notice 도메인에 발행-시점 fan-out 을 연결한다. PUBLIC + notifyOnPublish=true 는
NoticeBroadcast projection 1건 으로, OFFICERS_ALL / CLUB_SCOPED 는 Notification 도메인
fan-out (수신자별 row) 로 처리한다. GET /me/notifications 는 두 소스를 offset 기반
union 으로 반환하며 broadcast 읽음은 별도 엔드포인트로 멱등 처리한다. 수신자 수가
2000명을 초과하면 RecipientLimitExceededException 으로 발행을 거부하고 트랜잭션을
롤백해 notice/target_club row 도 함께 폐기한다.

## 🤔 고민했던 내용
- 도메인 분리 유지: Notice / Notification / NoticeBroadcast 세 도메인을 코드·테이블 모두 분리.
- offset union: 두 소스에서 (page+1)*size 만큼 over-fetch 후 메모리에서 머지·정렬·자르기.
  대량 데이터 시 비효율이지만 MVP 단순화 우선. cursor 마이그레이션은 OOS.
- NotificationResponse 에 source 디스크리미네이터를 추가하되 기존 필드(type/payload)는
  하위 호환을 위해 보존.

## 💬 리뷰 중점사항
- spec: docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md
- plan: docs/superpowers/plans/2026-05-20-pr2-notice-broadcast-and-fanout.md
- GeneralNoticeBroadcaster.guardLimit 의 2000명 상한 검증 위치 + 트랜잭션 롤백 동작
- NotificationService.list 의 union 머지 / 페이지 슬라이스 정확성
- broadcast 읽음 멱등성 (이미 존재하면 noop)
```

---

## Self-Review

- [x] **Spec coverage**: § 2.3-2.4 broadcast 모델 / § 3 fan-out 전략 / § 4.2 알림 통합 / § 4.3 트랜잭션 모두 task 화.
- [x] **Out of Scope 명시**: 비동기 큐 / cursor 페이지네이션 / 푸시 / 프론트 / 수신자 사전 카운트 / 수정 시 재발송 — 모두 본 PR 제외.
- [x] **Placeholder scan**: 없음. 단, Task 11/12 는 기존 `NotificationResponse` / `GeneralNotificationService` 의 정확한 시그니처를 implementer 가 먼저 읽어 확인하라고 명시 (파일 본문이 P1 작업 후에도 그대로일 것이므로 검증 가능).
- [x] **Type consistency**: `NoticeBroadcaster#publish(Notice, List<Long>)` 호출/구현/스펙 시그니처 동일. `BroadcastSlice` 레코드 사용처 일관.
- [x] **Naming**: 테이블 단수(`notice_broadcast`, `notice_broadcast_read`) — P1 컨벤션과 일치.
- [ ] **유의**: Task 12 의 service 시그니처 변경 (반환 타입 `Page<Notification>` → `Page<NotificationResponse>`) 은 controller 도 함께 손대야 한다. Implementer 는 기존 controller 의 매핑 라인을 제거해야 함 — Task 13 Step 2 에서 함께 처리.
