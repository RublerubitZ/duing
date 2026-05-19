# P1 — 백엔드 Notice 도메인 CRUD + Visibility 필터 구현 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 총동연(ADMIN) 이 공지(Notice) 를 작성·조회·수정·삭제할 수 있는 도메인을 백엔드에 신설한다. 본 PR 범위는 **CRUD + visibility 필터링 + soft delete** 까지이며 알림 fan-out(Broadcast/Notification 연동) 은 P2 로 분리한다.

**Architecture:** DDD 패키지 컨벤션 (`domain/notice/` 하위 api / controller / service / repository / entity / exception) 을 따르고, `Club` 도메인의 `AdminXxxApi + XxxApi` 분리 패턴을 차용한다. Visibility 필터는 QueryDSL 의 `BooleanExpression` 으로 동적 구성한다. Soft delete 는 기존 패턴(`@SQLDelete + @SQLRestriction`) 을 따른다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA + Hibernate / QueryDSL / Flyway / RestAssured + Fixture Monkey / TestContainers (Postgres)

**Spec reference:** `docs/superpowers/specs/2026-05-20-admin-notice-domain-design.md`

**Branch:** `feat/notice-admin-crud` (또는 이슈 생성 후 `feat/{n}-notice-admin-crud`)

**Out of Scope (이 PR 아님)**
- `notice_broadcasts`, `notice_broadcast_reads` 테이블 (P2)
- 발행 시 fan-out · `notifications` row 생성 (P2)
- `/me/notifications` union 응답 (P2)
- 프론트엔드 (P3, P4)
- 카테고리 enum → 테이블화 (D, 보류)
- 수신자 사전 카운트 API

---

## File Structure (이 PR 에서 생기는/만지는 파일)

```
backend/src/main/resources/db/migration/
  V24__create_notice.sql                              [신규]

backend/src/main/java/com/duing/domain/notice/
  entity/
    Notice.java                                       [신규]
    NoticeCategory.java                               [신규]
    NoticeVisibility.java                             [신규]
    NoticeClubScopeRole.java                          [신규]
    NoticeTargetClub.java                             [신규]
  exception/
    NoticeException.java                              [신규]
  repository/
    NoticeRepository.java                             [신규]
    NoticeRepositoryCustom.java                       [신규]
    NoticeRepositoryImpl.java                         [신규]
  service/
    NoticeService.java                                [신규]
    GeneralNoticeService.java                         [신규]
    dto/
      command/
        CreateNoticeCommand.java                      [신규]
        UpdateNoticeCommand.java                      [신규]
      query/
        NoticeSearchCondition.java                    [신규]
        NoticeAdminSearchCondition.java               [신규]
        ViewerScope.java                              [신규]  ← 가시성 필터링 파라미터
  api/
    AdminNoticeApi.java                               [신규]
    NoticeApi.java                                    [신규]
  controller/
    AdminNoticeController.java                        [신규]
    NoticeController.java                             [신규]
    dto/
      request/
        CreateNoticeRequest.java                      [신규]
        UpdateNoticeRequest.java                      [신규]
      response/
        NoticeCardResponse.java                       [신규]
        NoticeDetailResponse.java                     [신규]
        AdminNoticeSummaryResponse.java               [신규]

backend/src/test/java/com/duing/domain/notice/
  NoticeAdminAcceptanceTest.java                      [신규] (RestAssured E2E)
  NoticePublicAcceptanceTest.java                     [신규] (RestAssured E2E)
  service/GeneralNoticeServiceTest.java               [신규] (서비스 단위)
  repository/NoticeRepositoryImplTest.java            [신규] (QueryDSL 통합)
```

(테스트 fixture 가 `common/fixture/` 에 이미 있으면 재사용하고, Notice 용 fixture 가 필요하면 `common/fixture/NoticeFixtures.java` 신규.)

---

## Task 1 — Flyway 마이그레이션 `V24__create_notice.sql`

**Files:**
- Create: `backend/src/main/resources/db/migration/V24__create_notice.sql`

- [ ] **Step 1: SQL 파일 작성**

```sql
-- notices: 총동연 공지 콘텐츠
CREATE TABLE notices (
    id                 BIGSERIAL    PRIMARY KEY,
    title              VARCHAR(120) NOT NULL,
    summary            VARCHAR(300) NOT NULL,
    content            TEXT         NOT NULL,
    cover_image_url    TEXT         NOT NULL,
    link_url           TEXT,
    category           VARCHAR(30)  NOT NULL,
    tags               TEXT[]       NOT NULL DEFAULT '{}',
    visibility         VARCHAR(30)  NOT NULL,
    club_scope_role    VARCHAR(30),
    is_pinned          BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at         TIMESTAMPTZ,
    notify_on_publish  BOOLEAN      NOT NULL DEFAULT FALSE,
    author_id          BIGINT       NOT NULL REFERENCES users(id),
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notice_visibility CHECK (visibility IN ('PUBLIC','OFFICERS_ALL','CLUB_SCOPED')),
    CONSTRAINT chk_notice_category   CHECK (category   IN ('FESTIVAL','FAIR','FUNDING','CONTEST','GENERAL')),
    CONSTRAINT chk_notice_club_scope_role CHECK (
        club_scope_role IS NULL OR club_scope_role IN ('OFFICERS_ONLY','ALL_MEMBERS')
    ),
    CONSTRAINT chk_notice_scope_role_pair CHECK (
        (visibility = 'CLUB_SCOPED' AND club_scope_role IS NOT NULL) OR
        (visibility <> 'CLUB_SCOPED' AND club_scope_role IS NULL)
    )
);

CREATE INDEX idx_notice_feed
    ON notices (visibility, is_pinned DESC, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_notice_category ON notices (category);
CREATE INDEX idx_notice_tags     ON notices USING GIN (tags);

-- notice_target_clubs: CLUB_SCOPED 공지의 대상 클럽 join
CREATE TABLE notice_target_clubs (
    notice_id  BIGINT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    club_id    BIGINT NOT NULL REFERENCES club(id),
    PRIMARY KEY (notice_id, club_id)
);

CREATE INDEX idx_notice_target_club_lookup
    ON notice_target_clubs (club_id, notice_id);
```

- [ ] **Step 2: 부트업 검증**

Run: `./gradlew bootRun --args='--spring.profiles.active=local'` 또는 `./gradlew test --tests "com.duing.DuingApplicationTests" -i`

Expected: Flyway 가 V24 적용. 콘솔에 `Successfully applied 1 migration to schema "public"` 또는 기존 hash 와 함께 V24 패치 로그.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V24__create_notice.sql
git commit -m "feat(backend): notice 테이블 + notice_target_clubs join 마이그레이션 추가"
```

---

## Task 2 — Enum 3종 (Category / Visibility / ClubScopeRole)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/entity/NoticeCategory.java`
- Create: `backend/src/main/java/com/duing/domain/notice/entity/NoticeVisibility.java`
- Create: `backend/src/main/java/com/duing/domain/notice/entity/NoticeClubScopeRole.java`

- [ ] **Step 1: NoticeCategory**

```java
package com.duing.domain.notice.entity;

public enum NoticeCategory {
    FESTIVAL, FAIR, FUNDING, CONTEST, GENERAL
}
```

- [ ] **Step 2: NoticeVisibility**

```java
package com.duing.domain.notice.entity;

public enum NoticeVisibility {
    PUBLIC, OFFICERS_ALL, CLUB_SCOPED
}
```

- [ ] **Step 3: NoticeClubScopeRole**

```java
package com.duing.domain.notice.entity;

public enum NoticeClubScopeRole {
    OFFICERS_ONLY, ALL_MEMBERS
}
```

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/entity/
git commit -m "feat(backend): notice 도메인 enum (category/visibility/clubScopeRole) 추가"
```

---

## Task 3 — `NoticeException`

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/exception/NoticeException.java`

- [ ] **Step 1: 예외 계층 작성**

```java
package com.duing.domain.notice.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class NoticeException extends ApplicationException {

    protected NoticeException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class NoticeNotFoundException extends NoticeException {
        private static final String MESSAGE = "공지를 찾을 수 없습니다.";
        public NoticeNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class NoticeAccessDeniedException extends NoticeException {
        private static final String MESSAGE = "공지에 접근할 권한이 없습니다.";
        public NoticeAccessDeniedException() { super(MESSAGE, HttpStatus.FORBIDDEN); }
    }

    public static class InvalidNoticeScopeException extends NoticeException {
        public InvalidNoticeScopeException(String reason) {
            super("공지 노출 범위 설정이 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidCoverImageUrlException extends NoticeException {
        private static final String MESSAGE = "허용되지 않는 대표 이미지 URL 입니다.";
        public InvalidCoverImageUrlException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/exception/
git commit -m "feat(backend): NoticeException 계층 정의"
```

---

## Task 4 — `NoticeTargetClub` 엔티티 (join row)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/entity/NoticeTargetClub.java`

- [ ] **Step 1: 엔티티 작성**

```java
package com.duing.domain.notice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "notice_target_club")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NoticeTargetClub {

    @EmbeddedId
    private NoticeTargetClubId id;

    public NoticeTargetClub(Long noticeId, Long clubId) {
        this.id = new NoticeTargetClubId(noticeId, clubId);
    }

    public Long getNoticeId() { return id.getNoticeId(); }
    public Long getClubId() { return id.getClubId(); }

    @Embeddable
    @Getter
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    public static class NoticeTargetClubId implements Serializable {
        @Column(name = "notice_id") private Long noticeId;
        @Column(name = "club_id")   private Long clubId;

        public NoticeTargetClubId(Long noticeId, Long clubId) {
            this.noticeId = noticeId; this.clubId = clubId;
        }

        @Override public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof NoticeTargetClubId other)) return false;
            return Objects.equals(noticeId, other.noticeId) && Objects.equals(clubId, other.clubId);
        }
        @Override public int hashCode() { return Objects.hash(noticeId, clubId); }
    }
}
```

- [ ] **Step 2: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/entity/NoticeTargetClub.java
git commit -m "feat(backend): NoticeTargetClub join 엔티티 추가"
```

---

## Task 5 — `Notice` 엔티티

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/entity/Notice.java`

- [ ] **Step 1: 엔티티 작성**

```java
package com.duing.domain.notice.entity;

import com.duing.domain.notice.exception.NoticeException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "notice")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE notice SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Notice extends BaseEntity {

    @Column(nullable = false, length = 120) private String title;
    @Column(nullable = false, length = 300) private String summary;
    @Column(nullable = false, columnDefinition = "TEXT") private String content;
    @Column(name = "cover_image_url", nullable = false, columnDefinition = "TEXT") private String coverImageUrl;
    @Column(name = "link_url", columnDefinition = "TEXT") private String linkUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30) private NoticeCategory category;

    @Column(name = "tags", columnDefinition = "_text", nullable = false)
    private String[] tags = new String[0];

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30) private NoticeVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "club_scope_role", length = 30) private NoticeClubScopeRole clubScopeRole;

    @Column(name = "is_pinned", nullable = false) private boolean pinned;
    @Column(name = "expires_at") private LocalDateTime expiresAt;
    @Column(name = "notify_on_publish", nullable = false) private boolean notifyOnPublish;
    @Column(name = "author_id", nullable = false) private Long authorId;

    public List<String> getTags() {
        return tags == null ? Collections.emptyList() : Collections.unmodifiableList(Arrays.asList(tags));
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Notice(String title, String summary, String content, String coverImageUrl, String linkUrl,
                   NoticeCategory category, String[] tags, NoticeVisibility visibility,
                   NoticeClubScopeRole clubScopeRole, boolean pinned, LocalDateTime expiresAt,
                   boolean notifyOnPublish, Long authorId) {
        this.title = title;
        this.summary = summary;
        this.content = content;
        this.coverImageUrl = coverImageUrl;
        this.linkUrl = linkUrl;
        this.category = category;
        this.tags = tags == null ? new String[0] : tags;
        this.visibility = visibility;
        this.clubScopeRole = clubScopeRole;
        this.pinned = pinned;
        this.expiresAt = expiresAt;
        this.notifyOnPublish = notifyOnPublish;
        this.authorId = authorId;
    }

    public static Notice create(String title, String summary, String content, String coverImageUrl,
                                String linkUrl, NoticeCategory category, List<String> tags,
                                NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
                                boolean pinned, LocalDateTime expiresAt, boolean notifyOnPublish,
                                Long authorId) {
        validateScope(visibility, clubScopeRole);
        boolean normalizedNotify = (visibility == NoticeVisibility.PUBLIC) ? notifyOnPublish : true;
        String[] tagArray = tags == null
                ? new String[0]
                : tags.stream().distinct().toArray(String[]::new);
        return Notice.builder()
                .title(title).summary(summary).content(content)
                .coverImageUrl(coverImageUrl).linkUrl(linkUrl)
                .category(category).tags(tagArray)
                .visibility(visibility).clubScopeRole(clubScopeRole)
                .pinned(pinned).expiresAt(expiresAt)
                .notifyOnPublish(normalizedNotify).authorId(authorId)
                .build();
    }

    public record UpdatePayload(
            String title, String summary, String content, String coverImageUrl, String linkUrl,
            NoticeCategory category, List<String> tags,
            NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
            Boolean pinned, LocalDateTime expiresAt, Boolean clearExpiresAt,
            Boolean notifyOnPublish
    ) {}

    public void update(UpdatePayload payload) {
        NoticeVisibility nextVisibility = payload.visibility() != null ? payload.visibility() : this.visibility;
        NoticeClubScopeRole nextRole = payload.visibility() != null ? payload.clubScopeRole() : this.clubScopeRole;
        validateScope(nextVisibility, nextRole);

        if (payload.title() != null) this.title = payload.title();
        if (payload.summary() != null) this.summary = payload.summary();
        if (payload.content() != null) this.content = payload.content();
        if (payload.coverImageUrl() != null) this.coverImageUrl = payload.coverImageUrl();
        if (payload.linkUrl() != null) this.linkUrl = payload.linkUrl();
        if (payload.category() != null) this.category = payload.category();
        if (payload.tags() != null) this.tags = payload.tags().stream().distinct().toArray(String[]::new);
        if (payload.visibility() != null) {
            this.visibility = nextVisibility;
            this.clubScopeRole = nextRole;
            if (nextVisibility != NoticeVisibility.PUBLIC) this.notifyOnPublish = true;
        }
        if (payload.pinned() != null) this.pinned = payload.pinned();
        if (Boolean.TRUE.equals(payload.clearExpiresAt())) this.expiresAt = null;
        else if (payload.expiresAt() != null) this.expiresAt = payload.expiresAt();
        if (payload.notifyOnPublish() != null && this.visibility == NoticeVisibility.PUBLIC) {
            this.notifyOnPublish = payload.notifyOnPublish();
        }
    }

    private static void validateScope(NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole) {
        if (visibility == NoticeVisibility.CLUB_SCOPED && clubScopeRole == null) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 공지는 club_scope_role 이 필요합니다.");
        }
        if (visibility != NoticeVisibility.CLUB_SCOPED && clubScopeRole != null) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 가 아닌 공지에는 club_scope_role 을 둘 수 없습니다.");
        }
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew compileJava`

Expected: BUILD SUCCESSFUL. QueryDSL Q-class (`QNotice`, `QNoticeTargetClub`) 생성 로그 확인.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/entity/Notice.java
git commit -m "feat(backend): Notice 엔티티 정의 (CRUD + scope 검증)"
```

---

## Task 6 — Command / Query DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/command/CreateNoticeCommand.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/command/UpdateNoticeCommand.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/query/NoticeSearchCondition.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/query/NoticeAdminSearchCondition.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/query/ViewerScope.java`

- [ ] **Step 1: CreateNoticeCommand**

```java
package com.duing.domain.notice.service.dto.command;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record CreateNoticeCommand(
        String title,
        String summary,
        String content,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        boolean pinned,
        LocalDateTime expiresAt,
        boolean notifyOnPublish,
        Long authorId
) {}
```

- [ ] **Step 2: UpdateNoticeCommand**

```java
package com.duing.domain.notice.service.dto.command;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record UpdateNoticeCommand(
        Long noticeId,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        Boolean pinned,
        LocalDateTime expiresAt,
        Boolean clearExpiresAt,
        Boolean notifyOnPublish
) {}
```

- [ ] **Step 3: ViewerScope** (가시성 필터링 파라미터)

```java
package com.duing.domain.notice.service.dto.query;

import com.duing.domain.user.entity.UserRole;
import java.util.List;
import java.util.Set;

/**
 * 공지 가시성 필터링에 필요한 시청자 컨텍스트.
 * - 비로그인 → role = null, memberClubIds/officerClubIds 빈 집합
 * - STUDENT → memberClubIds = 본인이 멤버인 클럽 id 들
 * - OFFICER/LEADER → officerClubIds = 본인이 OFFICER/LEADER 인 클럽 id 들
 * - ADMIN → role = ADMIN (필터 전부 통과)
 */
public record ViewerScope(
        UserRole role,
        Long userId,
        Set<Long> memberClubIds,
        Set<Long> officerClubIds
) {
    public static ViewerScope anonymous() {
        return new ViewerScope(null, null, Set.of(), Set.of());
    }
    public boolean isAdmin() { return role == UserRole.ADMIN; }
    public boolean isAnonymous() { return role == null; }
}
```

- [ ] **Step 4: NoticeSearchCondition**

```java
package com.duing.domain.notice.service.dto.query;

import com.duing.domain.notice.entity.NoticeCategory;
import java.util.List;

public record NoticeSearchCondition(
        NoticeCategory category,
        List<String> tags,
        String keyword
) {}
```

- [ ] **Step 5: NoticeAdminSearchCondition**

```java
package com.duing.domain.notice.service.dto.query;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;

public record NoticeAdminSearchCondition(
        NoticeCategory category,
        NoticeVisibility visibility,
        String keyword,
        boolean includeExpired
) {}
```

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/service/dto/
git commit -m "feat(backend): notice 도메인 command/query DTO 추가"
```

---

## Task 7 — Repository (JPA + Custom 인터페이스)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/repository/NoticeRepository.java`
- Create: `backend/src/main/java/com/duing/domain/notice/repository/NoticeTargetClubRepository.java`
- Create: `backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryCustom.java`

- [ ] **Step 1: NoticeRepository**

```java
package com.duing.domain.notice.repository;

import com.duing.domain.notice.entity.Notice;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NoticeRepository extends JpaRepository<Notice, Long>, NoticeRepositoryCustom {
}
```

- [ ] **Step 2: NoticeTargetClubRepository**

```java
package com.duing.domain.notice.repository;

import com.duing.domain.notice.entity.NoticeTargetClub;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NoticeTargetClubRepository
        extends JpaRepository<NoticeTargetClub, NoticeTargetClub.NoticeTargetClubId> {

    List<NoticeTargetClub> findAllByIdNoticeId(Long noticeId);

    @Modifying
    @Query("DELETE FROM NoticeTargetClub t WHERE t.id.noticeId = :noticeId")
    void deleteAllByNoticeId(@Param("noticeId") Long noticeId);
}
```

- [ ] **Step 3: NoticeRepositoryCustom**

```java
package com.duing.domain.notice.repository;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NoticeRepositoryCustom {

    Page<Notice> findFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable);

    Optional<Notice> findVisibleById(Long noticeId, ViewerScope viewer);

    Page<Notice> findAdminList(NoticeAdminSearchCondition condition, Pageable pageable);
}
```

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/repository/
git commit -m "feat(backend): notice repository 인터페이스 추가"
```

---

## Task 8 — `NoticeRepositoryImpl` (QueryDSL visibility 필터)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryImpl.java`

- [ ] **Step 1: 구현체 작성**

```java
package com.duing.domain.notice.repository;

import static com.duing.domain.notice.entity.QNotice.notice;
import static com.duing.domain.notice.entity.QNoticeTargetClub.noticeTargetClub;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class NoticeRepositoryImpl implements NoticeRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Notice> findFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable) {
        BooleanExpression[] predicates = {
                notExpired(),
                visibilityForViewer(viewer),
                categoryEq(condition.category()),
                keywordContains(condition.keyword()),
                tagsOverlap(condition.tags())
        };

        List<Notice> content = queryFactory
                .selectFrom(notice)
                .where(predicates)
                .orderBy(notice.pinned.desc(), notice.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(notice.count())
                .from(notice)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public Optional<Notice> findVisibleById(Long noticeId, ViewerScope viewer) {
        Notice found = queryFactory
                .selectFrom(notice)
                .where(notice.id.eq(noticeId), visibilityForViewer(viewer))
                .fetchOne();
        return Optional.ofNullable(found);
    }

    @Override
    public Page<Notice> findAdminList(NoticeAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                condition.includeExpired() ? null : notExpired(),
                categoryEq(condition.category()),
                visibilityEq(condition.visibility()),
                keywordContains(condition.keyword())
        };

        List<Notice> content = queryFactory
                .selectFrom(notice)
                .where(predicates)
                .orderBy(notice.pinned.desc(), notice.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(notice.count())
                .from(notice)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    // ---- predicates ----

    private BooleanExpression notExpired() {
        return notice.expiresAt.isNull().or(notice.expiresAt.gt(LocalDateTime.now()));
    }

    private BooleanExpression categoryEq(NoticeCategory category) {
        return category == null ? null : notice.category.eq(category);
    }

    private BooleanExpression visibilityEq(NoticeVisibility visibility) {
        return visibility == null ? null : notice.visibility.eq(visibility);
    }

    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) return null;
        return notice.title.containsIgnoreCase(keyword).or(notice.summary.containsIgnoreCase(keyword));
    }

    private BooleanExpression tagsOverlap(List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        // PG array && operator via template
        String tagsLiteral = "{" + String.join(",",
                tags.stream().map(t -> "\"" + t.replace("\"", "\\\"") + "\"").toList()) + "}";
        return Expressions.booleanTemplate("({0} && ARRAY[{1}]::text[])",
                notice.tags, tagsLiteral);
    }

    /**
     * Viewer 별 visibility 가시 범위:
     * - anonymous → PUBLIC 만
     * - admin → 전부
     * - 일반/운영진 → PUBLIC, (OFFICERS_ALL & 운영진), (CLUB_SCOPED & 대상 매칭 + role 매칭)
     */
    private BooleanExpression visibilityForViewer(ViewerScope viewer) {
        if (viewer.isAdmin()) return null;

        BooleanExpression publicOnly = notice.visibility.eq(NoticeVisibility.PUBLIC);
        if (viewer.isAnonymous()) return publicOnly;

        Set<Long> memberClubIds = viewer.memberClubIds();
        Set<Long> officerClubIds = viewer.officerClubIds();

        BooleanExpression officersAll = officerClubIds.isEmpty()
                ? Expressions.FALSE
                : notice.visibility.eq(NoticeVisibility.OFFICERS_ALL);

        BooleanExpression scopedOfficers = officerClubIds.isEmpty() ? Expressions.FALSE
                : notice.visibility.eq(NoticeVisibility.CLUB_SCOPED)
                    .and(notice.clubScopeRole.in(NoticeClubScopeRole.OFFICERS_ONLY, NoticeClubScopeRole.ALL_MEMBERS))
                    .and(JPAExpressions.selectOne().from(noticeTargetClub)
                            .where(noticeTargetClub.id.noticeId.eq(notice.id),
                                   noticeTargetClub.id.clubId.in(officerClubIds))
                            .exists());

        BooleanExpression scopedMembers = memberClubIds.isEmpty() ? Expressions.FALSE
                : notice.visibility.eq(NoticeVisibility.CLUB_SCOPED)
                    .and(notice.clubScopeRole.eq(NoticeClubScopeRole.ALL_MEMBERS))
                    .and(JPAExpressions.selectOne().from(noticeTargetClub)
                            .where(noticeTargetClub.id.noticeId.eq(notice.id),
                                   noticeTargetClub.id.clubId.in(memberClubIds))
                            .exists());

        return publicOnly.or(officersAll).or(scopedOfficers).or(scopedMembers);
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `./gradlew compileJava`

Expected: BUILD SUCCESSFUL. (`QNotice`/`QNoticeTargetClub` 가 Task 5 이후 생성됨)

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryImpl.java
git commit -m "feat(backend): NoticeRepositoryImpl QueryDSL 구현 (visibility 필터)"
```

---

## Task 9 — Service 인터페이스 + 구현체 (CRUD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/service/NoticeService.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java`

배경 확인:
- `ClubRepository` 의 `existsById` 또는 `findById` 로 target club 존재 검증
- 현재는 fan-out 을 호출하지 않는다 (P2 에서 `NoticeBroadcaster` 와 같은 컴포넌트를 service 에서 호출하도록 확장)

- [ ] **Step 1: NoticeService 인터페이스**

```java
package com.duing.domain.notice.service;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NoticeService {

    Long create(CreateNoticeCommand command);

    void update(UpdateNoticeCommand command);

    void delete(Long noticeId);

    Notice getVisible(Long noticeId, ViewerScope viewer);

    Page<Notice> searchFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable);

    Page<Notice> searchForAdmin(NoticeAdminSearchCondition condition, Pageable pageable);
}
```

- [ ] **Step 2: GeneralNoticeService**

```java
package com.duing.domain.notice.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralNoticeService implements NoticeService {

    private final NoticeRepository noticeRepository;
    private final NoticeTargetClubRepository targetClubRepository;
    private final ClubRepository clubRepository;

    @Value("${duing.notice.cover-image-url-prefix:}")
    private String coverImageUrlPrefix;

    @Override
    @Transactional
    public Long create(CreateNoticeCommand command) {
        validateCoverImageUrl(command.coverImageUrl());
        validateScopedTargets(command.visibility(), command.targetClubIds());

        Notice saved = noticeRepository.save(Notice.create(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.linkUrl(),
                command.category(), command.tags(),
                command.visibility(), command.clubScopeRole(),
                command.pinned(), command.expiresAt(),
                command.notifyOnPublish(), command.authorId()
        ));

        if (command.visibility() == NoticeVisibility.CLUB_SCOPED) {
            persistTargetClubs(saved.getId(), command.targetClubIds());
        }
        return saved.getId();
    }

    @Override
    @Transactional
    public void update(UpdateNoticeCommand command) {
        if (command.coverImageUrl() != null) validateCoverImageUrl(command.coverImageUrl());
        Notice found = noticeRepository.findById(command.noticeId())
                .orElseThrow(NoticeException.NoticeNotFoundException::new);

        NoticeVisibility nextVisibility = command.visibility() != null ? command.visibility() : found.getVisibility();
        if (nextVisibility == NoticeVisibility.CLUB_SCOPED) {
            List<Long> nextTargets = command.targetClubIds() != null
                    ? command.targetClubIds()
                    : targetClubRepository.findAllByIdNoticeId(found.getId()).stream().map(NoticeTargetClub::getClubId).toList();
            validateScopedTargets(NoticeVisibility.CLUB_SCOPED, nextTargets);
        }

        found.update(new Notice.UpdatePayload(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.linkUrl(),
                command.category(), command.tags(),
                command.visibility(), command.clubScopeRole(),
                command.pinned(), command.expiresAt(), command.clearExpiresAt(),
                command.notifyOnPublish()
        ));

        if (command.targetClubIds() != null) {
            targetClubRepository.deleteAllByNoticeId(found.getId());
            if (found.getVisibility() == NoticeVisibility.CLUB_SCOPED) {
                persistTargetClubs(found.getId(), command.targetClubIds());
            }
        } else if (command.visibility() != null && command.visibility() != NoticeVisibility.CLUB_SCOPED) {
            targetClubRepository.deleteAllByNoticeId(found.getId());
        }
    }

    @Override
    @Transactional
    public void delete(Long noticeId) {
        Notice found = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        noticeRepository.delete(found); // soft delete via @SQLDelete
    }

    @Override
    public Notice getVisible(Long noticeId, ViewerScope viewer) {
        Notice found = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        // 만료된 공지도 직접 진입은 허용 (spec 5.3). 단 가시 범위 밖이면 거부.
        return noticeRepository.findVisibleById(noticeId, viewer)
                .orElseGet(() -> {
                    if (viewer.isAdmin()) return found;
                    throw new NoticeException.NoticeAccessDeniedException();
                });
    }

    @Override
    public Page<Notice> searchFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable) {
        return noticeRepository.findFeed(condition, viewer, pageable);
    }

    @Override
    public Page<Notice> searchForAdmin(NoticeAdminSearchCondition condition, Pageable pageable) {
        return noticeRepository.findAdminList(condition, pageable);
    }

    // ---- private helpers ----

    private void validateCoverImageUrl(String url) {
        if (coverImageUrlPrefix == null || coverImageUrlPrefix.isBlank()) return;
        if (url == null || !url.startsWith(coverImageUrlPrefix)) {
            throw new NoticeException.InvalidCoverImageUrlException();
        }
    }

    private void validateScopedTargets(NoticeVisibility visibility, List<Long> targetClubIds) {
        if (visibility != NoticeVisibility.CLUB_SCOPED) return;
        if (targetClubIds == null || targetClubIds.isEmpty()) {
            throw new NoticeException.InvalidNoticeScopeException("CLUB_SCOPED 공지는 1개 이상의 대상 동아리가 필요합니다.");
        }
        List<Long> distinct = targetClubIds.stream().distinct().toList();
        long existing = clubRepository.findAllById(distinct).size();
        if (existing != distinct.size()) {
            throw new NoticeException.InvalidNoticeScopeException("존재하지 않는 동아리 ID 가 포함되어 있습니다.");
        }
    }

    private void persistTargetClubs(Long noticeId, List<Long> targetClubIds) {
        List<NoticeTargetClub> rows = targetClubIds.stream().distinct()
                .map(clubId -> new NoticeTargetClub(noticeId, clubId)).toList();
        targetClubRepository.saveAll(rows);
    }
}
```

- [ ] **Step 3: `application.yml` 에 cover-image 화이트리스트 prefix 추가**

`backend/src/main/resources/application.yml` 의 적절한 위치 (예: `duing:` 루트 아래) 에 추가:

```yaml
duing:
  notice:
    cover-image-url-prefix: ${NOTICE_COVER_IMAGE_URL_PREFIX:}
```

(`local`/`prod` 프로필 파일에 prefix 가 따로 잡혀 있다면 거기에도 키 노출. 값이 비어있으면 검증 스킵 — 테스트 편의.)

- [ ] **Step 4: 컴파일**

Run: `./gradlew compileJava`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/service/ backend/src/main/resources/application.yml
git commit -m "feat(backend): NoticeService CRUD 구현 + cover-image prefix 검증"
```

---

## Task 10 — Request / Response DTO (controller layer)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/request/CreateNoticeRequest.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/request/UpdateNoticeRequest.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/response/NoticeCardResponse.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/response/NoticeDetailResponse.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/response/AdminNoticeSummaryResponse.java`

- [ ] **Step 1: CreateNoticeRequest**

```java
package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record CreateNoticeRequest(
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 300) String summary,
        @NotBlank @Size(max = 20000) String content,
        @NotBlank String coverImageUrl,
        String linkUrl,
        @NotNull NoticeCategory category,
        @Size(max = 8) List<@Size(max = 20) String> tags,
        @NotNull NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        boolean pinned,
        LocalDateTime expiresAt,
        boolean notifyOnPublish
) {
    public CreateNoticeCommand toCommand(Long authorId) {
        return new CreateNoticeCommand(
                title, summary, content, coverImageUrl, linkUrl,
                category, tags == null ? List.of() : tags,
                visibility, clubScopeRole,
                targetClubIds == null ? List.of() : targetClubIds,
                pinned, expiresAt, notifyOnPublish, authorId
        );
    }
}
```

- [ ] **Step 2: UpdateNoticeRequest**

```java
package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record UpdateNoticeRequest(
        @Size(max = 120) String title,
        @Size(max = 300) String summary,
        @Size(max = 20000) String content,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        @Size(max = 8) List<@Size(max = 20) String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        Boolean pinned,
        LocalDateTime expiresAt,
        Boolean clearExpiresAt,
        Boolean notifyOnPublish
) {
    public UpdateNoticeCommand toCommand(Long noticeId) {
        return new UpdateNoticeCommand(
                noticeId, title, summary, content, coverImageUrl, linkUrl,
                category, tags, visibility, clubScopeRole, targetClubIds,
                pinned, expiresAt, clearExpiresAt, notifyOnPublish
        );
    }
}
```

- [ ] **Step 3: NoticeCardResponse**

```java
package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import java.time.LocalDateTime;
import java.util.List;

public record NoticeCardResponse(
        Long id,
        String title,
        String summary,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        boolean pinned,
        LocalDateTime expiresAt,
        LocalDateTime createdAt
) {
    public static NoticeCardResponse from(Notice notice) {
        return new NoticeCardResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(),
                notice.getCoverImageUrl(), notice.getLinkUrl(),
                notice.getCategory(), notice.getTags(),
                notice.isPinned(), notice.getExpiresAt(), notice.getCreatedAt()
        );
    }
}
```

- [ ] **Step 4: NoticeDetailResponse**

```java
package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;
import java.util.List;

public record NoticeDetailResponse(
        Long id,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        String linkUrl,
        NoticeCategory category,
        List<String> tags,
        NoticeVisibility visibility,
        NoticeClubScopeRole clubScopeRole,
        List<Long> targetClubIds,
        boolean pinned,
        LocalDateTime expiresAt,
        boolean notifyOnPublish,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static NoticeDetailResponse from(Notice notice, List<Long> targetClubIds, boolean exposeAdminFields) {
        return new NoticeDetailResponse(
                notice.getId(), notice.getTitle(), notice.getSummary(), notice.getContent(),
                notice.getCoverImageUrl(), notice.getLinkUrl(),
                notice.getCategory(), notice.getTags(),
                exposeAdminFields ? notice.getVisibility() : null,
                exposeAdminFields ? notice.getClubScopeRole() : null,
                exposeAdminFields ? targetClubIds : null,
                notice.isPinned(), notice.getExpiresAt(),
                exposeAdminFields && notice.isNotifyOnPublish(),
                notice.getCreatedAt(), notice.getUpdatedAt()
        );
    }
}
```

- [ ] **Step 5: AdminNoticeSummaryResponse**

```java
package com.duing.domain.notice.controller.dto.response;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import java.time.LocalDateTime;

public record AdminNoticeSummaryResponse(
        Long id,
        String title,
        NoticeCategory category,
        NoticeVisibility visibility,
        boolean pinned,
        boolean notifyOnPublish,
        LocalDateTime expiresAt,
        LocalDateTime createdAt
) {
    public static AdminNoticeSummaryResponse from(Notice notice) {
        return new AdminNoticeSummaryResponse(
                notice.getId(), notice.getTitle(), notice.getCategory(), notice.getVisibility(),
                notice.isPinned(), notice.isNotifyOnPublish(), notice.getExpiresAt(), notice.getCreatedAt()
        );
    }
}
```

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/controller/dto/
git commit -m "feat(backend): notice request/response DTO 추가"
```

---

## Task 11 — `AdminNoticeApi` + `AdminNoticeController`

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/api/AdminNoticeApi.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/AdminNoticeController.java`

- [ ] **Step 1: AdminNoticeApi (Swagger 인터페이스)**

```java
package com.duing.domain.notice.api;

import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import com.duing.domain.notice.controller.dto.response.AdminNoticeSummaryResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import com.duing.global.security.UserPrincipal;
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

@Tag(name = "공지(총동연)", description = "총동연 전용 공지 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminNoticeApi {

    @Operation(summary = "공지 생성", description = "ADMIN 이 공지를 작성한다. visibility/clubScope 검증 수행. (알림 fan-out 은 P2 에서 연결)")
    @PostMapping("/admin/notices")
    ResponseEntity<ApiResponse<Long>> createNotice(
            @Valid @RequestBody CreateNoticeRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "공지 수정")
    @PatchMapping("/admin/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> updateNotice(
            @PathVariable Long noticeId,
            @Valid @RequestBody UpdateNoticeRequest request
    );

    @Operation(summary = "공지 소프트 삭제")
    @DeleteMapping("/admin/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> deleteNotice(@PathVariable Long noticeId);

    @Operation(summary = "공지 관리 목록")
    @GetMapping("/admin/notices")
    ResponseEntity<ApiResponse<PageResponse<AdminNoticeSummaryResponse>>> getAdminNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) NoticeVisibility visibility,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "공지 상세 (관리)")
    @GetMapping("/admin/notices/{noticeId}")
    ResponseEntity<ApiResponse<NoticeDetailResponse>> getAdminNoticeDetail(@PathVariable Long noticeId);
}
```

- [ ] **Step 2: AdminNoticeController**

```java
package com.duing.domain.notice.controller;

import com.duing.domain.notice.api.AdminNoticeApi;
import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import com.duing.domain.notice.controller.dto.response.AdminNoticeSummaryResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.NoticeService;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import com.duing.global.security.UserPrincipal;
import java.util.List;
import java.util.Set;
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
public class AdminNoticeController implements AdminNoticeApi {

    private final NoticeService noticeService;
    private final NoticeTargetClubRepository targetClubRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> createNotice(
            CreateNoticeRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long noticeId = noticeService.create(request.toCommand(currentUser.getUserId()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(noticeId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateNotice(@PathVariable Long noticeId, @RequestBody UpdateNoticeRequest request) {
        noticeService.update(request.toCommand(noticeId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteNotice(@PathVariable Long noticeId) {
        noticeService.delete(noticeId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminNoticeSummaryResponse>>> getAdminNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) NoticeVisibility visibility,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "false") boolean includeExpired,
            Pageable pageable
    ) {
        NoticeAdminSearchCondition condition = new NoticeAdminSearchCondition(category, visibility, keyword, includeExpired);
        Page<AdminNoticeSummaryResponse> page = noticeService.searchForAdmin(condition, pageable)
                .map(AdminNoticeSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<NoticeDetailResponse>> getAdminNoticeDetail(@PathVariable Long noticeId) {
        ViewerScope adminScope = new ViewerScope(UserRole.ADMIN, null, Set.of(), Set.of());
        Notice notice = noticeService.getVisible(noticeId, adminScope);
        List<Long> targetClubIds = targetClubRepository.findAllByIdNoticeId(notice.getId())
                .stream().map(NoticeTargetClub::getClubId).toList();
        return ResponseEntity.ok(ApiResponse.success(NoticeDetailResponse.from(notice, targetClubIds, true)));
    }
}
```

(NOTE: `UserPrincipal#getUserId()` 의 정확한 메서드명은 기존 코드 기준으로 확인. 만약 `getId()` 라면 그것 사용 — `ClubController` 의 호출 사이트 참조.)

- [ ] **Step 3: 컴파일**

Run: `./gradlew compileJava`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/api/AdminNoticeApi.java \
       backend/src/main/java/com/duing/domain/notice/controller/AdminNoticeController.java
git commit -m "feat(backend): AdminNoticeApi + Controller 추가"
```

---

## Task 12 — `NoticeApi` + `NoticeController` (공개 피드)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/api/NoticeApi.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/NoticeController.java`

ViewerScope 헬퍼: `ClubMemberRepository` 에 `findAllByUserId` 같은 메서드가 없다면 `Task 12-pre` 로 짧은 쿼리 추가가 필요할 수 있다. 우선은 기존 API 를 활용하고 부족하면 보강:

- [ ] **Step 1: `ClubMemberRepository` 에 viewer scope 조회용 메서드 추가**

`backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java` 에 아래 두 쿼리 추가 (이미 있으면 스킵):

```java
@Query("SELECT cm.club.id FROM ClubMember cm WHERE cm.user.id = :userId")
List<Long> findClubIdsByUserId(@Param("userId") Long userId);

@Query("""
        SELECT cm.club.id FROM ClubMember cm
        WHERE cm.user.id = :userId AND cm.role IN ('LEADER','OFFICER')
        """)
List<Long> findOfficerClubIdsByUserId(@Param("userId") Long userId);
```

- [ ] **Step 2: NoticeApi (공개)**

```java
package com.duing.domain.notice.api;

import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import com.duing.global.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "공지", description = "공지 조회 API (공개 + 로그인 가시성)")
public interface NoticeApi {

    @Operation(summary = "공지 피드", description = "viewer 가시 범위 + (만료 제외) 필터링한 목록")
    @GetMapping("/notices")
    ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> getNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "공지 상세")
    @GetMapping("/notices/{noticeId}")
    ResponseEntity<ApiResponse<NoticeDetailResponse>> getNoticeDetail(
            @PathVariable Long noticeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 3: NoticeController**

```java
package com.duing.domain.notice.controller;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.api.NoticeApi;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.controller.dto.response.NoticeDetailResponse;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.NoticeService;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import com.duing.global.security.UserPrincipal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class NoticeController implements NoticeApi {

    private final NoticeService noticeService;
    private final NoticeTargetClubRepository targetClubRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> getNotices(
            @RequestParam(required = false) NoticeCategory category,
            @RequestParam(required = false) List<String> tags,
            @RequestParam(required = false) String keyword,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ViewerScope viewer = buildViewerScope(currentUser);
        NoticeSearchCondition condition = new NoticeSearchCondition(category, tags, keyword);
        Page<NoticeCardResponse> page = noticeService.searchFeed(condition, viewer, pageable)
                .map(NoticeCardResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<NoticeDetailResponse>> getNoticeDetail(
            @PathVariable Long noticeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ViewerScope viewer = buildViewerScope(currentUser);
        Notice notice = noticeService.getVisible(noticeId, viewer);
        List<Long> targetClubIds = targetClubRepository.findAllByIdNoticeId(notice.getId())
                .stream().map(NoticeTargetClub::getClubId).toList();
        boolean exposeAdmin = viewer.isAdmin();
        return ResponseEntity.ok(ApiResponse.success(NoticeDetailResponse.from(notice, targetClubIds, exposeAdmin)));
    }

    private ViewerScope buildViewerScope(UserPrincipal currentUser) {
        if (currentUser == null) return ViewerScope.anonymous();
        UserRole role = currentUser.getRole();
        Long userId = currentUser.getUserId();
        if (role == UserRole.ADMIN) {
            return new ViewerScope(UserRole.ADMIN, userId, Set.of(), Set.of());
        }
        Set<Long> memberClubIds = new HashSet<>(clubMemberRepository.findClubIdsByUserId(userId));
        Set<Long> officerClubIds = new HashSet<>(clubMemberRepository.findOfficerClubIdsByUserId(userId));
        return new ViewerScope(role, userId, memberClubIds, officerClubIds);
    }
}
```

- [ ] **Step 4: SecurityConfig 가 `/api/v1/notices/**` 를 익명 허용하도록 확인**

`backend/src/main/java/com/duing/global/security/SecurityConfig.java` (또는 동급 파일) 에서 `permitAll()` 또는 `anyRequest().permitAll()` 패턴에 `/api/v1/notices/**` 가 포함되는지 확인. 없으면 추가:

```java
.requestMatchers("/api/v1/notices", "/api/v1/notices/*").permitAll()
```

(`AdminNoticeController` 는 `@PreAuthorize("hasRole('ADMIN')")` 로 별도 보호되므로 안전.)

- [ ] **Step 5: 컴파일 + 부트업**

Run: `./gradlew bootRun --args='--spring.profiles.active=local'` 또는 `compileJava` 만으로 OK.

Expected: 정상 기동, Swagger `/swagger-ui/index.html` 에 "공지" / "공지(총동연)" 태그 표시.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/notice/api/NoticeApi.java \
       backend/src/main/java/com/duing/domain/notice/controller/NoticeController.java \
       backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java \
       backend/src/main/java/com/duing/global/security/SecurityConfig.java
git commit -m "feat(backend): NoticeApi + Controller (공개 피드/상세) 및 viewer scope 조회 추가"
```

---

## Task 13 — Repository 통합 테스트 (TestContainers + QueryDSL)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/repository/NoticeRepositoryImplTest.java`

이 테스트는 visibility 필터링 정확성을 검증한다. 기존 `@DataJpaTest` + TestContainers 설정을 따른다 (예: `ClubRepositoryImplTest` 가 있으면 그 슬라이스 어노테이션·설정을 차용).

- [ ] **Step 1: 테스트 클래스 골격**

```java
package com.duing.domain.notice.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.fixture.NoticeFixtures; // 없으면 인라인 헬퍼 사용
import com.duing.config.QueryDslTestConfig; // 기존 프로젝트의 QueryDSL 테스트 설정 클래스명을 따른다
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.UserRole;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(QueryDslTestConfig.class)
class NoticeRepositoryImplTest {

    @Autowired NoticeRepository noticeRepository;
    @Autowired NoticeTargetClubRepository targetClubRepository;

    @Test
    @DisplayName("비로그인 사용자는 PUBLIC 공지만 피드에서 볼 수 있다")
    void anonymousSeesOnlyPublic() { /* see Step 2 */ }

    @Test
    @DisplayName("OFFICERS_ALL 공지는 운영진(LEADER/OFFICER) 사용자에게만 노출된다")
    void officerSeesOfficersAllNotices() { /* see Step 3 */ }

    @Test
    @DisplayName("CLUB_SCOPED + ALL_MEMBERS 공지는 대상 클럽 멤버에게 노출된다")
    void memberSeesClubScopedAllMembersNotices() { /* see Step 4 */ }

    @Test
    @DisplayName("만료된 공지는 피드에서 제외되지만 findVisibleById 로는 조회된다 (admin 기준)")
    void expiredNoticeIsHiddenFromFeed() { /* see Step 5 */ }
}
```

- [ ] **Step 2: 비로그인 PUBLIC-only 테스트 본문**

```java
@Test
@DisplayName("비로그인 사용자는 PUBLIC 공지만 피드에서 볼 수 있다")
void anonymousSeesOnlyPublic() {
    Notice publicNotice = noticeRepository.save(Notice.create(
            "전체 공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, java.util.List.of(),
            NoticeVisibility.PUBLIC, null, false, null, false, 1L));
    Notice officersNotice = noticeRepository.save(Notice.create(
            "운영진 공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, java.util.List.of(),
            NoticeVisibility.OFFICERS_ALL, null, false, null, true, 1L));

    Page<Notice> result = noticeRepository.findFeed(
            new NoticeSearchCondition(null, null, null),
            ViewerScope.anonymous(),
            PageRequest.of(0, 10));

    assertThat(result.getContent()).extracting(Notice::getId).containsExactly(publicNotice.getId());
    assertThat(result.getContent()).noneMatch(n -> n.getId().equals(officersNotice.getId()));
}
```

- [ ] **Step 3: OFFICERS_ALL 가시성 테스트 본문**

```java
@Test
@DisplayName("OFFICERS_ALL 공지는 운영진(LEADER/OFFICER) 사용자에게만 노출된다")
void officerSeesOfficersAllNotices() {
    noticeRepository.save(Notice.create(
            "운영진 공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, java.util.List.of(),
            NoticeVisibility.OFFICERS_ALL, null, false, null, true, 1L));

    ViewerScope student = new ViewerScope(UserRole.STUDENT, 2L, Set.of(10L), Set.of());
    ViewerScope officer = new ViewerScope(UserRole.STUDENT, 3L, Set.of(10L), Set.of(10L));

    Page<Notice> studentFeed = noticeRepository.findFeed(
            new NoticeSearchCondition(null, null, null), student, PageRequest.of(0, 10));
    Page<Notice> officerFeed = noticeRepository.findFeed(
            new NoticeSearchCondition(null, null, null), officer, PageRequest.of(0, 10));

    assertThat(studentFeed.getContent()).isEmpty();
    assertThat(officerFeed.getContent()).hasSize(1);
}
```

- [ ] **Step 4: CLUB_SCOPED+ALL_MEMBERS 테스트 본문**

```java
@Test
@DisplayName("CLUB_SCOPED + ALL_MEMBERS 공지는 대상 클럽 멤버에게 노출된다")
void memberSeesClubScopedAllMembersNotices() {
    Long targetClubId = 42L;
    Notice scoped = noticeRepository.save(Notice.create(
            "클럽 멤버 공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, java.util.List.of(),
            NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.ALL_MEMBERS,
            false, null, true, 1L));
    targetClubRepository.save(new com.duing.domain.notice.entity.NoticeTargetClub(scoped.getId(), targetClubId));

    ViewerScope memberOfTarget = new ViewerScope(UserRole.STUDENT, 7L, Set.of(targetClubId), Set.of());
    ViewerScope memberOfOther  = new ViewerScope(UserRole.STUDENT, 8L, Set.of(999L), Set.of());

    assertThat(noticeRepository.findFeed(new NoticeSearchCondition(null, null, null), memberOfTarget, PageRequest.of(0, 10)).getContent())
            .extracting(Notice::getId).containsExactly(scoped.getId());
    assertThat(noticeRepository.findFeed(new NoticeSearchCondition(null, null, null), memberOfOther, PageRequest.of(0, 10)).getContent())
            .isEmpty();
}
```

- [ ] **Step 5: 만료 공지 테스트 본문**

```java
@Test
@DisplayName("만료된 공지는 피드에서 제외되지만 admin 으로 직접 조회는 가능하다")
void expiredNoticeIsHiddenFromFeed() {
    Notice expired = noticeRepository.save(Notice.create(
            "만료 공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, java.util.List.of(),
            NoticeVisibility.PUBLIC, null, false,
            java.time.LocalDateTime.now().minusDays(1), false, 1L));

    Page<Notice> anonFeed = noticeRepository.findFeed(
            new NoticeSearchCondition(null, null, null), ViewerScope.anonymous(), PageRequest.of(0, 10));
    assertThat(anonFeed.getContent()).isEmpty();

    ViewerScope adminScope = new ViewerScope(UserRole.ADMIN, 99L, Set.of(), Set.of());
    assertThat(noticeRepository.findVisibleById(expired.getId(), adminScope)).isPresent();
}
```

- [ ] **Step 6: 테스트 실행**

Run: `./gradlew test --tests "com.duing.domain.notice.repository.NoticeRepositoryImplTest"`

Expected: 4건 PASS. Docker (TestContainers Postgres) 가 켜져 있어야 함.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/notice/repository/NoticeRepositoryImplTest.java
git commit -m "test(backend): NoticeRepositoryImpl visibility 필터 통합 테스트"
```

---

## Task 14 — Service 단위/스프링 컨텍스트 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/service/GeneralNoticeServiceTest.java`

`@SpringBootTest` 슬라이스 또는 기존 프로젝트의 service 테스트 패턴 (예: `GeneralClubServiceTest`) 을 따른다.

- [ ] **Step 1: 테스트 클래스 골격**

```java
package com.duing.domain.notice.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class GeneralNoticeServiceTest {

    @Autowired NoticeService noticeService;
    @Autowired NoticeRepository noticeRepository;
    @Autowired NoticeTargetClubRepository targetClubRepository;

    // 테스트 사용자/동아리 fixture 는 common/fixture/* 또는 직접 save 로 준비한다
}
```

- [ ] **Step 2: PUBLIC 공지 생성 성공 케이스**

```java
@Test
@DisplayName("PUBLIC 공지는 club_scope_role 없이 생성되며 target_clubs 가 비어 있다")
void createsPublicNotice() {
    Long authorId = persistAdminUserAndReturnId();
    Long noticeId = noticeService.create(new CreateNoticeCommand(
            "축제", "축제 요약", "본문", "https://x/cover.png", null,
            NoticeCategory.FESTIVAL, List.of("축제"),
            NoticeVisibility.PUBLIC, null, List.of(),
            false, null, false, authorId));

    assertThat(noticeRepository.findById(noticeId)).isPresent();
    assertThat(targetClubRepository.findAllByIdNoticeId(noticeId)).isEmpty();
}
```

- [ ] **Step 3: CLUB_SCOPED 검증 실패 케이스**

```java
@Test
@DisplayName("CLUB_SCOPED 공지인데 targetClubIds 가 비어 있으면 InvalidNoticeScopeException 이 발생한다")
void clubScopedRequiresTargets() {
    Long authorId = persistAdminUserAndReturnId();
    assertThatThrownBy(() -> noticeService.create(new CreateNoticeCommand(
            "지원사업", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.FUNDING, List.of(),
            NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.OFFICERS_ONLY,
            List.of(), false, null, true, authorId)))
        .isInstanceOf(NoticeException.InvalidNoticeScopeException.class);
}
```

- [ ] **Step 4: visibility 변경 + targetClubIds 재설정 update 케이스**

```java
@Test
@DisplayName("CLUB_SCOPED → PUBLIC 으로 visibility 변경 시 기존 target_clubs 가 정리된다")
void clearTargetsWhenVisibilityChangesToPublic() {
    Long authorId = persistAdminUserAndReturnId();
    Long targetClubId = persistClubAndReturnId();
    Long noticeId = noticeService.create(new CreateNoticeCommand(
            "공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, List.of(),
            NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.ALL_MEMBERS,
            List.of(targetClubId), false, null, true, authorId));

    noticeService.update(new UpdateNoticeCommand(
            noticeId, null, null, null, null, null, null, null,
            NoticeVisibility.PUBLIC, null, null,
            null, null, null, null));

    assertThat(targetClubRepository.findAllByIdNoticeId(noticeId)).isEmpty();
    assertThat(noticeRepository.findById(noticeId).orElseThrow().getVisibility())
            .isEqualTo(NoticeVisibility.PUBLIC);
}
```

- [ ] **Step 5: soft delete 케이스**

```java
@Test
@DisplayName("delete 호출 후에는 일반 조회에서 공지가 더 이상 보이지 않는다")
void softDeleteRemovesFromFindAll() {
    Long authorId = persistAdminUserAndReturnId();
    Long noticeId = noticeService.create(new CreateNoticeCommand(
            "공지", "요약", "본문", "https://x/cover.png", null,
            NoticeCategory.GENERAL, List.of(),
            NoticeVisibility.PUBLIC, null, List.of(),
            false, null, false, authorId));

    noticeService.delete(noticeId);

    assertThat(noticeRepository.findById(noticeId)).isEmpty();
}
```

- [ ] **Step 6: fixture 헬퍼**

`persistAdminUserAndReturnId()`, `persistClubAndReturnId()` 는 클래스 하단의 private 헬퍼로 작성하거나, `common/fixture/` 에 기존 헬퍼가 있으면 재사용. 동일 파일 안에 짧게 두는 게 다른 테스트 영향 없이 가장 단순하다. (테스트 안에서 `userRepository.save(...)`, `clubRepository.save(Club.create(...))` 로 직접 만든다.)

- [ ] **Step 7: 실행**

Run: `./gradlew test --tests "com.duing.domain.notice.service.GeneralNoticeServiceTest"`

Expected: 4건 PASS.

- [ ] **Step 8: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/notice/service/GeneralNoticeServiceTest.java
git commit -m "test(backend): GeneralNoticeService CRUD/검증 단위 테스트"
```

---

## Task 15 — Admin / 공개 컨트롤러 인수 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/NoticeAdminAcceptanceTest.java`
- Create: `backend/src/test/java/com/duing/domain/notice/NoticePublicAcceptanceTest.java`

기존 `*AcceptanceTest` (e.g. `ClubAdminAcceptanceTest` 가 있다면 그것) 의 셋업 (포트, JWT 토큰 발급 헬퍼) 을 따른다. 헬퍼가 없다면 RestAssured 기본 init 부분만 가져온다.

- [ ] **Step 1: NoticeAdminAcceptanceTest — 생성 + 403 케이스**

```java
package com.duing.domain.notice;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.support.AcceptanceTestBase; // 기존 베이스 클래스가 있으면 사용
import io.restassured.http.ContentType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NoticeAdminAcceptanceTest extends AcceptanceTestBase {

    @Test
    @DisplayName("ADMIN 은 PUBLIC 공지를 작성하면 201 과 id 를 받는다")
    void adminCreatesPublicNotice() {
        String adminToken = issueAdminToken(); // 베이스 헬퍼

        given()
            .header("Authorization", "Bearer " + adminToken)
            .contentType(ContentType.JSON)
            .body("""
                {
                  "title": "축제",
                  "summary": "요약",
                  "content": "본문",
                  "coverImageUrl": "https://example.com/cover.png",
                  "category": "FESTIVAL",
                  "visibility": "PUBLIC",
                  "pinned": false,
                  "notifyOnPublish": false
                }
                """)
        .when()
            .post("/api/v1/admin/notices")
        .then()
            .statusCode(201)
            .body("data", notNullValue());
    }

    @Test
    @DisplayName("STUDENT 가 admin 공지 생성을 시도하면 403 을 받는다")
    void studentCannotCreateNotice() {
        String studentToken = issueStudentToken();

        given()
            .header("Authorization", "Bearer " + studentToken)
            .contentType(ContentType.JSON)
            .body("{ \"title\":\"x\", \"summary\":\"x\", \"content\":\"x\", \"coverImageUrl\":\"https://x\", \"category\":\"GENERAL\", \"visibility\":\"PUBLIC\" }")
        .when()
            .post("/api/v1/admin/notices")
        .then()
            .statusCode(403);
    }
}
```

- [ ] **Step 2: NoticePublicAcceptanceTest — 비로그인 피드 + 가시성 외 상세 403**

```java
package com.duing.domain.notice;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasSize;

import com.duing.support.AcceptanceTestBase;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NoticePublicAcceptanceTest extends AcceptanceTestBase {

    @Test
    @DisplayName("비로그인 사용자도 PUBLIC 공지 피드를 조회할 수 있다")
    void anonymousCanFetchPublicFeed() {
        seedPublicNotice("Public 1"); // 헬퍼: admin 토큰으로 사전 생성
        seedPublicNotice("Public 2");

        given()
        .when()
            .get("/api/v1/notices")
        .then()
            .statusCode(200)
            .body("data.items", hasSize(2));
    }

    @Test
    @DisplayName("OFFICERS_ALL 공지에 일반 STUDENT 가 직접 진입하면 403 을 받는다")
    void studentForbiddenOnOfficersOnlyDetail() {
        Long noticeId = seedOfficersAllNotice();
        String studentToken = issueStudentToken();

        given()
            .header("Authorization", "Bearer " + studentToken)
        .when()
            .get("/api/v1/notices/" + noticeId)
        .then()
            .statusCode(403);
    }
}
```

(`seedPublicNotice`, `seedOfficersAllNotice` 는 같은 클래스 하단에 admin 토큰으로 POST 하는 짧은 헬퍼.)

- [ ] **Step 3: 전체 테스트 실행**

Run: `./gradlew test`

Expected: BUILD SUCCESSFUL. 신규 + 기존 테스트 모두 PASS.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/notice/NoticeAdminAcceptanceTest.java \
       backend/src/test/java/com/duing/domain/notice/NoticePublicAcceptanceTest.java
git commit -m "test(backend): 공지 admin/public 인수 테스트 추가"
```

---

## Task 16 — 최종 검증 + PR 준비

- [ ] **Step 1: 전체 빌드/테스트**

Run: `./gradlew clean build`

Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: PR 작성 (`gh pr create`)**

브랜치 푸시 후 PR 본문:

```
## 🚀 작업 내용
총동연(ADMIN) 이 공지를 작성·관리할 수 있는 Notice 도메인을 신설한다.
이미지 중심 카드 피드를 위한 cover/summary, 카테고리·태그·고정·만료 필드,
세 단계 visibility(PUBLIC / OFFICERS_ALL / CLUB_SCOPED + ALL_MEMBERS·OFFICERS_ONLY)와
시청자 컨텍스트 기반 필터링을 포함한다. 알림 fan-out 은 P2 로 분리되어
이번 PR 에서는 콘텐츠 CRUD 와 조회 가시성까지만 다룬다.

## 🤔 고민했던 내용
- visibility 정합성 검증을 DB CHECK(같은 row 내 단순 페어) + 애플리케이션 (cross-table)
  으로 이원화. 코드만의 검증은 우회 가능성이 있어 단순 페어는 DB 에서 보장.
- target club id 화이트리스트(존재성) 검증은 application 단에서 N=1 쿼리로 수행.
  Bulk insert 와 함께 트랜잭션 안에서 동작.
- soft delete (`@SQLDelete` + `@SQLRestriction`) 채택. broadcast 와의 정합은 P2 에서 보강.

## 💬 리뷰 중점사항
- QueryDSL `visibilityForViewer` 의 EXISTS 절 가독성·인덱스 활용 (`idx_notice_target_club_lookup`)
- `Notice.update()` 의 visibility 전이 시 `clubScopeRole`/`notifyOnPublish` 정규화 로직
- `application.yml` 의 `duing.notice.cover-image-url-prefix` 가 비어있을 때의 동작
```

---

## Self-Review (작성자 체크리스트)

- [x] **Spec coverage**: 2.1~2.6 모델 ✓ / 4.1·4.4·4.5 API ✓ / 5 가시성 매트릭스 ✓ / 7 테스트 ✓ / 8 마이그레이션 ✓ / 9 soft delete & 결정사항 ✓.
- [x] **Out of Scope 명시**: fan-out / broadcast / 알림 통합 / 프론트 / 카테고리 테이블화 모두 본 PR 제외로 명시.
- [x] **Placeholder scan**: TBD/TODO 없음. `UserPrincipal#getUserId()` 의 정확한 메서드명은 Step 11-2 NOTE 로 명시.
- [x] **Type consistency**: `CreateNoticeCommand` / `UpdateNoticeCommand` 의 필드명·순서가 Task 6 정의와 Task 9 호출에서 일치. `ViewerScope` 의 4-arg 시그니처가 모든 사용처(Admin/Public Controller·Service·RepositoryImpl) 에서 일치.
- [ ] **유의**: 일부 헬퍼/베이스 클래스 (예: `AcceptanceTestBase`, `QueryDslTestConfig`, `common/fixture/*`) 는 기존 프로젝트 클래스명을 그대로 차용한다. 정확한 이름이 다르면 인접 테스트 클래스를 grep 해 동일 패턴으로 맞춘다.
