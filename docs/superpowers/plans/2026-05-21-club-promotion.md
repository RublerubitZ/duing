# 동아리 홍보(Promotion) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리(LEADER/OFFICER) 의 홍보 요청 제출 + ADMIN 큐레이션형 Promotion 배너 CRUD + 공개 캐러셀 노출(8개 API) 을 신규 `promotion` 도메인으로 추가한다.

**Architecture:** 두 엔티티 (`PromotionRequest`, `Promotion`) 완전 분리 — ACCEPTED 가 Promotion 자동 생성으로 이어지지 않음. 이미지 업로드는 기존 `FileStorageService` 흐름(프론트 업로드 → URL 필드 전달)을 그대로 사용. 공개 GET 한 곳만 비로그인 허용(SecurityConfig 1줄).

**Tech Stack:** Spring Boot 3.4, Java 21, JPA + QueryDSL, Flyway (Postgres), TestContainers + RestAssured.

**Spec:** `docs/superpowers/specs/2026-05-21-club-promotion-design.md`

**Branch:** `feat/club-promotion` (이미 체크아웃됨, spec 커밋 포함)

---

## File Structure

신규 (`backend/src/main/java/com/duing/domain/promotion/`):

```
promotion/
├── api/
│   ├── LeaderPromotionApi.java               # POST /clubs/{clubId}/promotion-requests
│   ├── AdminPromotionRequestApi.java         # /admin/promotion-requests (PR-2~4)
│   ├── AdminPromotionApi.java                # /admin/promotions (PM-1~4)
│   └── PromotionApi.java                     # GET /promotions (PM-5, permitAll)
├── controller/
│   ├── LeaderPromotionController.java
│   ├── AdminPromotionRequestController.java
│   ├── AdminPromotionController.java
│   └── PromotionController.java
├── controller/dto/
│   ├── request/
│   │   ├── CreatePromotionRequestRequest.java
│   │   ├── ProcessPromotionRequestRequest.java
│   │   ├── CreatePromotionRequest.java
│   │   └── UpdatePromotionRequest.java
│   └── response/
│       ├── PromotionRequestSummaryResponse.java
│       ├── PromotionRequestDetailResponse.java
│       ├── AdminPromotionResponse.java
│       └── PromotionCardResponse.java
├── entity/
│   ├── Promotion.java
│   ├── PromotionRequest.java
│   └── PromotionRequestStatus.java           # PENDING, ACCEPTED, REJECTED
├── exception/
│   └── PromotionException.java
├── repository/
│   ├── PromotionRepository.java
│   ├── PromotionRepositoryCustom.java
│   ├── PromotionRepositoryImpl.java          # QueryDSL admin 검색 + 공개 정렬
│   ├── PromotionRequestRepository.java
│   ├── PromotionRequestRepositoryCustom.java
│   └── PromotionRequestRepositoryImpl.java
└── service/
    ├── PromotionRequestService.java          # interface
    ├── GeneralPromotionRequestService.java
    ├── PromotionService.java                 # interface
    ├── GeneralPromotionService.java
    └── dto/
        ├── command/
        │   ├── CreatePromotionRequestCommand.java
        │   ├── ProcessPromotionRequestCommand.java
        │   ├── CreatePromotionCommand.java
        │   └── UpdatePromotionCommand.java
        └── query/
            ├── PromotionRequestAdminSearchCondition.java
            └── PromotionAdminSearchCondition.java
```

수정:
- `backend/src/main/java/com/duing/global/config/SecurityConfig.java` — `GET /api/v1/promotions` permitAll 추가

Flyway:
- `backend/src/main/resources/db/migration/V30__create_promotion_request_and_promotion.sql`

테스트:
- `backend/src/test/java/com/duing/domain/promotion/entity/PromotionRequestTest.java`
- `backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java`
- `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionRequestServiceTest.java`
- `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java`
- `backend/src/test/java/com/duing/domain/promotion/PromotionAcceptanceTest.java`

---

## Task 1: Flyway V30

**Files:**
- Create: `backend/src/main/resources/db/migration/V30__create_promotion_request_and_promotion.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- promotion_request: 동아리(LEADER/OFFICER) → ADMIN 홍보 요청
CREATE TABLE promotion_request (
    id                          BIGSERIAL    PRIMARY KEY,
    club_id                     BIGINT       NOT NULL REFERENCES club(id),
    requester_user_id           BIGINT       NOT NULL REFERENCES users(id),
    title                       VARCHAR(80)  NOT NULL,
    description                 TEXT         NOT NULL,
    suggested_banner_image_url  VARCHAR(500),
    suggested_link_url          TEXT,
    status                      VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note                 TEXT,
    handled_by                  BIGINT       REFERENCES users(id),
    handled_at                  TIMESTAMP,
    deleted_at                  TIMESTAMP,
    created_at                  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pr_status            CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
    CONSTRAINT chk_pr_description_len   CHECK (char_length(description) <= 2000),
    CONSTRAINT chk_pr_link_len          CHECK (suggested_link_url IS NULL OR char_length(suggested_link_url) <= 2000),
    CONSTRAINT chk_pr_action_note_len   CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_pr_handled_pair      CHECK (
        (status = 'PENDING' AND handled_by IS NULL     AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_pr_active_pending
    ON promotion_request (club_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_pr_admin_feed
    ON promotion_request (status, created_at DESC)
    WHERE deleted_at IS NULL;

-- promotion: ADMIN 큐레이션 배너
CREATE TABLE promotion (
    id                BIGSERIAL    PRIMARY KEY,
    club_id           BIGINT       REFERENCES club(id),
    title             VARCHAR(120) NOT NULL,
    banner_image_url  VARCHAR(500) NOT NULL,
    link_url          TEXT,
    active            BOOLEAN      NOT NULL DEFAULT FALSE,
    display_order     INT          NOT NULL DEFAULT 0,
    created_by        BIGINT       NOT NULL REFERENCES users(id),
    deleted_at        TIMESTAMP,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_promo_link_len CHECK (link_url IS NULL OR char_length(link_url) <= 2000)
);

CREATE INDEX idx_promo_public_feed
    ON promotion (active, display_order ASC, created_at DESC)
    WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 컴파일 검증**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/resources/db/migration/V30__create_promotion_request_and_promotion.sql
git commit -m "feat(backend): promotion_request + promotion 마이그레이션 (V30)"
```

---

## Task 2: Enum + Exception

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/entity/PromotionRequestStatus.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/exception/PromotionException.java`

- [ ] **Step 1: Enum**

```java
package com.duing.domain.promotion.entity;

public enum PromotionRequestStatus {
    PENDING, ACCEPTED, REJECTED;

    public boolean isTerminal() {
        return this == ACCEPTED || this == REJECTED;
    }
}
```

- [ ] **Step 2: Exception 계층**

```java
package com.duing.domain.promotion.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class PromotionException extends ApplicationException {

    protected PromotionException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class PromotionRequestNotFoundException extends PromotionException {
        private static final String MESSAGE = "홍보 요청을 찾을 수 없습니다.";
        public PromotionRequestNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class DuplicatePendingPromotionRequestException extends PromotionException {
        private static final String MESSAGE = "이미 처리 대기 중인 홍보 요청이 있습니다.";
        public DuplicatePendingPromotionRequestException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidPromotionRequestTransitionException extends PromotionException {
        public InvalidPromotionRequestTransitionException(String reason) {
            super("홍보 요청 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }

    public static class PromotionNotFoundException extends PromotionException {
        private static final String MESSAGE = "홍보 배너를 찾을 수 없습니다.";
        public PromotionNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/entity/PromotionRequestStatus.java \
        backend/src/main/java/com/duing/domain/promotion/exception/PromotionException.java
git commit -m "feat(backend): 홍보 도메인 enum + Exception 계층"
```

---

## Task 3: `PromotionRequest` 엔티티 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/entity/PromotionRequest.java`
- Test: `backend/src/test/java/com/duing/domain/promotion/entity/PromotionRequestTest.java`

- [ ] **Step 1: 단위 테스트**

```java
package com.duing.domain.promotion.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.promotion.exception.PromotionException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionRequestTest {

    private PromotionRequest sample() {
        return PromotionRequest.create(
                10L, 99L,
                "타이틀", "설명",
                "/files/banner.png", "https://example.com");
    }

    @Test
    @DisplayName("홍보 요청 생성 시 PENDING 이며 처리 정보가 비어 있다")
    void createInitializesPending() {
        PromotionRequest request = sample();
        assertThat(request.getStatus()).isEqualTo(PromotionRequestStatus.PENDING);
        assertThat(request.getHandledBy()).isNull();
        assertThat(request.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("ACCEPTED 처리 시 처리자/처리시각/메모가 저장된다")
    void processAccepted() {
        PromotionRequest request = sample();
        request.process(7L, PromotionRequestStatus.ACCEPTED, "확인");
        assertThat(request.getStatus()).isEqualTo(PromotionRequestStatus.ACCEPTED);
        assertThat(request.getHandledBy()).isEqualTo(7L);
        assertThat(request.getHandledAt()).isNotNull();
        assertThat(request.getActionNote()).isEqualTo("확인");
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        PromotionRequest request = sample();
        request.process(7L, PromotionRequestStatus.REJECTED, null);
        assertThatThrownBy(() -> request.process(7L, PromotionRequestStatus.ACCEPTED, null))
                .isInstanceOf(PromotionException.InvalidPromotionRequestTransitionException.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        PromotionRequest request = sample();
        assertThatThrownBy(() -> request.process(7L, PromotionRequestStatus.PENDING, null))
                .isInstanceOf(PromotionException.InvalidPromotionRequestTransitionException.class);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 실패 (PromotionRequest 없음).

- [ ] **Step 3: 엔티티 구현**

```java
package com.duing.domain.promotion.entity;

import com.duing.domain.promotion.exception.PromotionException;
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
@Table(name = "promotion_request")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE promotion_request SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class PromotionRequest extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(name = "requester_user_id", nullable = false) private Long requesterUserId;

    @Column(nullable = false, length = 80) private String title;
    @Column(nullable = false, columnDefinition = "TEXT") private String description;

    @Column(name = "suggested_banner_image_url", length = 500) private String suggestedBannerImageUrl;
    @Column(name = "suggested_link_url", columnDefinition = "TEXT") private String suggestedLinkUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20) private PromotionRequestStatus status;

    @Column(name = "action_note", columnDefinition = "TEXT") private String actionNote;
    @Column(name = "handled_by") private Long handledBy;
    @Column(name = "handled_at") private LocalDateTime handledAt;

    @Builder(access = AccessLevel.PRIVATE)
    private PromotionRequest(Long clubId, Long requesterUserId,
                             String title, String description,
                             String suggestedBannerImageUrl, String suggestedLinkUrl) {
        this.clubId = clubId;
        this.requesterUserId = requesterUserId;
        this.title = title;
        this.description = description;
        this.suggestedBannerImageUrl = suggestedBannerImageUrl;
        this.suggestedLinkUrl = suggestedLinkUrl;
        this.status = PromotionRequestStatus.PENDING;
    }

    public static PromotionRequest create(Long clubId, Long requesterUserId,
                                          String title, String description,
                                          String suggestedBannerImageUrl, String suggestedLinkUrl) {
        return PromotionRequest.builder()
                .clubId(clubId).requesterUserId(requesterUserId)
                .title(title).description(description)
                .suggestedBannerImageUrl(suggestedBannerImageUrl)
                .suggestedLinkUrl(suggestedLinkUrl)
                .build();
    }

    public void process(Long handlerUserId, PromotionRequestStatus nextStatus, String actionNote) {
        if (nextStatus == null || nextStatus == PromotionRequestStatus.PENDING) {
            throw new PromotionException.InvalidPromotionRequestTransitionException(
                    "처리 결과는 ACCEPTED 또는 REJECTED 여야 합니다.");
        }
        if (this.status.isTerminal()) {
            throw new PromotionException.InvalidPromotionRequestTransitionException("이미 종결된 요청입니다.");
        }
        this.status = nextStatus;
        this.handledBy = handlerUserId;
        this.handledAt = LocalDateTime.now();
        this.actionNote = actionNote;
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.entity.PromotionRequestTest"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/entity/PromotionRequest.java \
        backend/src/test/java/com/duing/domain/promotion/entity/PromotionRequestTest.java
git commit -m "feat(backend): PromotionRequest 엔티티 + 상태 전이 검증"
```

---

## Task 4: `Promotion` 엔티티 (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java`
- Test: `backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java`

- [ ] **Step 1: 단위 테스트**

```java
package com.duing.domain.promotion.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionTest {

    @Test
    @DisplayName("Promotion 생성 시 기본 active=false, displayOrder 가 그대로 저장된다")
    void createInitializesDefaults() {
        Promotion promotion = Promotion.create(
                42L, "행사 배너", "/files/banner.png", "https://example.com",
                false, 10, 99L);
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(10);
        assertThat(promotion.getCreatedBy()).isEqualTo(99L);
    }

    @Test
    @DisplayName("update 호출 시 명시된 필드만 갱신되고 나머지는 유지된다")
    void partialUpdate() {
        Promotion promotion = Promotion.create(
                42L, "원래 제목", "/files/old.png", "https://old", true, 1, 99L);

        promotion.update(new Promotion.UpdatePayload(
                "새 제목", null, null, null, false, null, null));

        assertThat(promotion.getTitle()).isEqualTo("새 제목");
        assertThat(promotion.getBannerImageUrl()).isEqualTo("/files/old.png");
        assertThat(promotion.getLinkUrl()).isEqualTo("https://old");
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("clearClubId=true 면 clubId 가 null 로 비워진다")
    void clearClubId() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L);
        promotion.update(new Promotion.UpdatePayload(null, null, null, null, null, null, true));
        assertThat(promotion.getClubId()).isNull();
    }

    @Test
    @DisplayName("clubId=새 값 으로 갱신되며 clearClubId 가 우선이다")
    void updateClubIdWithClearPrecedence() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L);
        promotion.update(new Promotion.UpdatePayload(null, null, null, 7L, null, null, true));
        assertThat(promotion.getClubId()).isNull();
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 실패 (Promotion 없음).

- [ ] **Step 3: 엔티티 구현**

```java
package com.duing.domain.promotion.entity;

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
@Table(name = "promotion")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE promotion SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Promotion extends BaseEntity {

    @Column(name = "club_id") private Long clubId;
    @Column(nullable = false, length = 120) private String title;
    @Column(name = "banner_image_url", nullable = false, length = 500) private String bannerImageUrl;
    @Column(name = "link_url", columnDefinition = "TEXT") private String linkUrl;
    @Column(nullable = false) private boolean active;
    @Column(name = "display_order", nullable = false) private int displayOrder;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    @Builder(access = AccessLevel.PRIVATE)
    private Promotion(Long clubId, String title, String bannerImageUrl, String linkUrl,
                      boolean active, int displayOrder, Long createdBy) {
        this.clubId = clubId;
        this.title = title;
        this.bannerImageUrl = bannerImageUrl;
        this.linkUrl = linkUrl;
        this.active = active;
        this.displayOrder = displayOrder;
        this.createdBy = createdBy;
    }

    public static Promotion create(Long clubId, String title, String bannerImageUrl, String linkUrl,
                                   boolean active, int displayOrder, Long createdBy) {
        return Promotion.builder()
                .clubId(clubId).title(title).bannerImageUrl(bannerImageUrl).linkUrl(linkUrl)
                .active(active).displayOrder(displayOrder).createdBy(createdBy)
                .build();
    }

    public record UpdatePayload(
            String title,
            String bannerImageUrl,
            String linkUrl,
            Long clubId,
            Boolean active,
            Integer displayOrder,
            Boolean clearClubId
    ) {}

    public void update(UpdatePayload payload) {
        if (payload.title() != null) this.title = payload.title();
        if (payload.bannerImageUrl() != null) this.bannerImageUrl = payload.bannerImageUrl();
        if (payload.linkUrl() != null) this.linkUrl = payload.linkUrl();
        if (Boolean.TRUE.equals(payload.clearClubId())) {
            this.clubId = null;
        } else if (payload.clubId() != null) {
            this.clubId = payload.clubId();
        }
        if (payload.active() != null) this.active = payload.active();
        if (payload.displayOrder() != null) this.displayOrder = payload.displayOrder();
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.entity.PromotionTest"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/entity/Promotion.java \
        backend/src/test/java/com/duing/domain/promotion/entity/PromotionTest.java
git commit -m "feat(backend): Promotion 엔티티 + partial update payload"
```

---

## Task 5: Command/Query DTOs

**Files:**
- Create: 4 command + 2 query records under `backend/src/main/java/com/duing/domain/promotion/service/dto/`

- [ ] **Step 1: 6개 record 작성**

```java
// CreatePromotionRequestCommand.java
package com.duing.domain.promotion.service.dto.command;

public record CreatePromotionRequestCommand(
        Long clubId,
        Long requesterUserId,
        String title,
        String description,
        String suggestedBannerImageUrl,
        String suggestedLinkUrl
) {}
```

```java
// ProcessPromotionRequestCommand.java
package com.duing.domain.promotion.service.dto.command;

import com.duing.domain.promotion.entity.PromotionRequestStatus;

public record ProcessPromotionRequestCommand(
        Long requestId,
        Long handlerAdminId,
        PromotionRequestStatus status,
        String actionNote
) {}
```

```java
// CreatePromotionCommand.java
package com.duing.domain.promotion.service.dto.command;

public record CreatePromotionCommand(
        Long clubId,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        Long createdBy
) {}
```

```java
// UpdatePromotionCommand.java
package com.duing.domain.promotion.service.dto.command;

public record UpdatePromotionCommand(
        Long promotionId,
        String title,
        String bannerImageUrl,
        String linkUrl,
        Long clubId,
        Boolean active,
        Integer displayOrder,
        Boolean clearClubId
) {}
```

```java
// PromotionRequestAdminSearchCondition.java
package com.duing.domain.promotion.service.dto.query;

import com.duing.domain.promotion.entity.PromotionRequestStatus;

public record PromotionRequestAdminSearchCondition(
        PromotionRequestStatus status,
        Long clubId
) {}
```

```java
// PromotionAdminSearchCondition.java
package com.duing.domain.promotion.service.dto.query;

public record PromotionAdminSearchCondition(
        Boolean active,
        Long clubId
) {}
```

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/service/dto/
git commit -m "feat(backend): 홍보 도메인 Command/Query DTO 정의"
```

---

## Task 6: Repositories + QueryDSL

**Files:**
- Create: `PromotionRequestRepository`, `PromotionRequestRepositoryCustom`, `PromotionRequestRepositoryImpl`
- Create: `PromotionRepository`, `PromotionRepositoryCustom`, `PromotionRepositoryImpl`

- [ ] **Step 1: `PromotionRequestRepository`**

```java
package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PromotionRequestRepository
        extends JpaRepository<PromotionRequest, Long>, PromotionRequestRepositoryCustom {

    Optional<PromotionRequest> findByClubIdAndStatus(Long clubId, PromotionRequestStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PromotionRequest r WHERE r.id = :id")
    Optional<PromotionRequest> findByIdForUpdate(@Param("id") Long id);
}
```

- [ ] **Step 2: PromotionRequest Custom + Impl**

```java
// PromotionRequestRepositoryCustom.java
package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRequestRepositoryCustom {
    Page<PromotionRequest> searchForAdmin(PromotionRequestAdminSearchCondition condition, Pageable pageable);
}
```

```java
// PromotionRequestRepositoryImpl.java
package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.QPromotionRequest;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
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
public class PromotionRequestRepositoryImpl implements PromotionRequestRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<PromotionRequest> searchForAdmin(
            PromotionRequestAdminSearchCondition condition, Pageable pageable
    ) {
        QPromotionRequest request = QPromotionRequest.promotionRequest;
        BooleanExpression statusEq = condition.status() == null ? null : request.status.eq(condition.status());
        BooleanExpression clubEq = condition.clubId() == null ? null : request.clubId.eq(condition.clubId());

        List<PromotionRequest> content = queryFactory.selectFrom(request)
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

- [ ] **Step 3: `PromotionRepository`**

```java
package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PromotionRepository
        extends JpaRepository<Promotion, Long>, PromotionRepositoryCustom {
}
```

- [ ] **Step 4: Promotion Custom + Impl**

```java
// PromotionRepositoryCustom.java
package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRepositoryCustom {
    Page<Promotion> searchForAdmin(PromotionAdminSearchCondition condition, Pageable pageable);
    Page<Promotion> findPublicActive(Pageable pageable);
}
```

```java
// PromotionRepositoryImpl.java
package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.entity.QPromotion;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
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
public class PromotionRepositoryImpl implements PromotionRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Promotion> searchForAdmin(PromotionAdminSearchCondition condition, Pageable pageable) {
        QPromotion promotion = QPromotion.promotion;
        BooleanExpression activeEq = condition.active() == null ? null : promotion.active.eq(condition.active());
        BooleanExpression clubEq = condition.clubId() == null ? null : promotion.clubId.eq(condition.clubId());

        List<Promotion> content = queryFactory.selectFrom(promotion)
                .where(activeEq, clubEq)
                .orderBy(promotion.displayOrder.asc(), promotion.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(promotion.count()).from(promotion).where(activeEq, clubEq);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }

    @Override
    public Page<Promotion> findPublicActive(Pageable pageable) {
        QPromotion promotion = QPromotion.promotion;
        BooleanExpression activeTrue = promotion.active.isTrue();

        List<Promotion> content = queryFactory.selectFrom(promotion)
                .where(activeTrue)
                .orderBy(promotion.displayOrder.asc(), promotion.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        var countQuery = queryFactory.select(promotion.count()).from(promotion).where(activeTrue);
        return PageableExecutionUtils.getPage(content, pageable, countQuery::fetchOne);
    }
}
```

- [ ] **Step 5: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/repository/
git commit -m "feat(backend): 홍보 요청·배너 리포지토리 + QueryDSL 동적 필터"
```

---

## Task 7: `PromotionRequestService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/service/PromotionRequestService.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionRequestService.java`
- Test: `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionRequestServiceTest.java`

- [ ] **Step 1: 통합 테스트**

```java
package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
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
class GeneralPromotionRequestServiceTest {

    @Autowired PromotionRequestService requestService;
    @Autowired PromotionRequestRepository requestRepository;
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

    private Club saveClub() {
        return clubRepository.save(Club.create("C" + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, null, "설명", null));
    }

    @Test
    @DisplayName("LEADER 가 홍보 요청을 제출하면 PENDING 으로 저장된다")
    void createSucceeds() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long id = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), leader.getId(),
                "타이틀", "설명", "/files/banner.png", "https://example.com"));

        PromotionRequest saved = requestRepository.findById(id).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(PromotionRequestStatus.PENDING);
        assertThat(saved.getRequesterUserId()).isEqualTo(leader.getId());
    }

    @Test
    @DisplayName("OFFICER 도 홍보 요청을 제출할 수 있다")
    void officerCanCreate() {
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        Long id = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), officer.getId(),
                "타이틀", "설명", null, null));
        assertThat(id).isPositive();
    }

    @Test
    @DisplayName("MEMBER 는 홍보 요청 제출이 거절된다")
    void memberCannotCreate() {
        User leader = saveUser(UserRole.STUDENT);
        User member = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        assertThatThrownBy(() -> requestService.create(new CreatePromotionRequestCommand(
                club.getId(), member.getId(),
                "타이틀", "설명", null, null)))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    @Test
    @DisplayName("동일 club PENDING 중복은 409")
    void duplicatePendingFails() {
        User leader = saveUser(UserRole.STUDENT);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        CreatePromotionRequestCommand command = new CreatePromotionRequestCommand(
                club.getId(), leader.getId(), "T", "D", null, null);
        requestService.create(command);

        assertThatThrownBy(() -> requestService.create(command))
                .isInstanceOf(PromotionException.DuplicatePendingPromotionRequestException.class);
    }

    @Test
    @DisplayName("ACCEPTED 처리 시 status 변경 + handledBy/At 세팅")
    void processAccepted() {
        User leader = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long requestId = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), leader.getId(), "T", "D", null, null));

        requestService.process(new ProcessPromotionRequestCommand(
                requestId, admin.getId(), PromotionRequestStatus.ACCEPTED, "확인"));

        PromotionRequest processed = requestRepository.findById(requestId).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(PromotionRequestStatus.ACCEPTED);
        assertThat(processed.getHandledBy()).isEqualTo(admin.getId());
        assertThat(processed.getHandledAt()).isNotNull();
    }

    @Test
    @DisplayName("종결된 요청 재PATCH 는 400")
    void processTerminalFails() {
        User leader = saveUser(UserRole.STUDENT);
        User admin = saveUser(UserRole.ADMIN);
        Club club = saveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long requestId = requestService.create(new CreatePromotionRequestCommand(
                club.getId(), leader.getId(), "T", "D", null, null));
        requestService.process(new ProcessPromotionRequestCommand(
                requestId, admin.getId(), PromotionRequestStatus.REJECTED, null));

        assertThatThrownBy(() -> requestService.process(new ProcessPromotionRequestCommand(
                requestId, admin.getId(), PromotionRequestStatus.ACCEPTED, null)))
                .isInstanceOf(PromotionException.InvalidPromotionRequestTransitionException.class);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 실패.

- [ ] **Step 3: 인터페이스 + 구현**

```java
// PromotionRequestService.java
package com.duing.domain.promotion.service;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionRequestService {
    Long create(CreatePromotionRequestCommand command);
    void process(ProcessPromotionRequestCommand command);
    PromotionRequest getById(Long requestId);
    Page<PromotionRequest> searchForAdmin(PromotionRequestAdminSearchCondition condition, Pageable pageable);
}
```

```java
// GeneralPromotionRequestService.java
package com.duing.domain.promotion.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRequestRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPromotionRequestService implements PromotionRequestService {

    private final PromotionRequestRepository requestRepository;
    private final ClubRepository clubRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public Long create(CreatePromotionRequestCommand command) {
        if (clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }
        clubAuthService.requireManager(command.requesterUserId(), command.clubId());

        requestRepository.findByClubIdAndStatus(command.clubId(), PromotionRequestStatus.PENDING)
                .ifPresent(existing -> {
                    throw new PromotionException.DuplicatePendingPromotionRequestException();
                });

        try {
            return requestRepository.save(PromotionRequest.create(
                    command.clubId(), command.requesterUserId(),
                    command.title(), command.description(),
                    command.suggestedBannerImageUrl(), command.suggestedLinkUrl()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new PromotionException.DuplicatePendingPromotionRequestException();
        }
    }

    @Override
    @Transactional
    public void process(ProcessPromotionRequestCommand command) {
        PromotionRequest request = requestRepository.findByIdForUpdate(command.requestId())
                .orElseThrow(PromotionException.PromotionRequestNotFoundException::new);
        request.process(command.handlerAdminId(), command.status(), command.actionNote());
    }

    @Override
    public PromotionRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(PromotionException.PromotionRequestNotFoundException::new);
    }

    @Override
    public Page<PromotionRequest> searchForAdmin(
            PromotionRequestAdminSearchCondition condition, Pageable pageable
    ) {
        return requestRepository.searchForAdmin(condition, pageable);
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionRequestServiceTest"`
Expected: PASS (6 tests). Docker 환경 이슈 시 DONE_WITH_CONCERNS — 코드 진행.

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/service/PromotionRequestService.java \
        backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionRequestService.java \
        backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionRequestServiceTest.java
git commit -m "feat(backend): PromotionRequestService — 요청 생성/처리 + 중복 차단"
```

---

## Task 8: `PromotionService` (TDD)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/service/PromotionService.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java`
- Test: `backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java`

- [ ] **Step 1: 통합 테스트**

```java
package com.duing.domain.promotion.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
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
class GeneralPromotionServiceTest {

    @Autowired PromotionService promotionService;
    @Autowired PromotionRepository promotionRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveAdmin() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "A" + seq,
                "a" + seq + "@duing.ac.kr", "h", UserRole.ADMIN,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    @Test
    @DisplayName("Promotion 생성 시 createdBy 가 저장된다")
    void createSucceeds() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", "https://x", true, 1, admin.getId()));
        Promotion saved = promotionRepository.findById(id).orElseThrow();
        assertThat(saved.getCreatedBy()).isEqualTo(admin.getId());
        assertThat(saved.isActive()).isTrue();
    }

    @Test
    @DisplayName("active 토글과 displayOrder 갱신이 partial update 로 동작한다")
    void partialUpdate() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", null, true, 1, admin.getId()));

        promotionService.update(new UpdatePromotionCommand(
                id, null, null, null, null, false, 5, null));

        Promotion updated = promotionRepository.findById(id).orElseThrow();
        assertThat(updated.isActive()).isFalse();
        assertThat(updated.getDisplayOrder()).isEqualTo(5);
        assertThat(updated.getTitle()).isEqualTo("배너");
    }

    @Test
    @DisplayName("clearClubId=true 면 clubId 가 null 로 비워진다")
    void clearClubId() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                42L, "배너", "/files/b.png", null, true, 0, admin.getId()));

        promotionService.update(new UpdatePromotionCommand(
                id, null, null, null, null, null, null, true));

        assertThat(promotionRepository.findById(id).orElseThrow().getClubId()).isNull();
    }

    @Test
    @DisplayName("soft delete 후 findById 는 비어 있고 공개 목록에도 안 나온다")
    void softDeleteHidesFromPublic() {
        User admin = saveAdmin();
        Long id = promotionService.create(new CreatePromotionCommand(
                null, "배너", "/files/b.png", null, true, 0, admin.getId()));
        promotionService.delete(id);

        assertThat(promotionRepository.findById(id)).isEmpty();
        assertThat(promotionService.findPublic(PageRequest.of(0, 10)).getContent())
                .noneMatch(p -> p.getId().equals(id));
    }

    @Test
    @DisplayName("findPublic 은 active=true 만 displayOrder ASC 정렬로 반환한다")
    void findPublicSortedByDisplayOrder() {
        User admin = saveAdmin();
        Long inactiveId = promotionService.create(new CreatePromotionCommand(
                null, "비활성", "/files/x.png", null, false, 0, admin.getId()));
        Long second = promotionService.create(new CreatePromotionCommand(
                null, "두번째", "/files/2.png", null, true, 20, admin.getId()));
        Long first = promotionService.create(new CreatePromotionCommand(
                null, "첫번째", "/files/1.png", null, true, 10, admin.getId()));

        var content = promotionService.findPublic(PageRequest.of(0, 10)).getContent();
        assertThat(content).extracting(Promotion::getId).containsExactly(first, second);
        assertThat(content).noneMatch(p -> p.getId().equals(inactiveId));
    }

    @Test
    @DisplayName("존재하지 않는 Promotion 갱신은 404")
    void updateMissingFails() {
        assertThatThrownBy(() -> promotionService.update(new UpdatePromotionCommand(
                999_999L, "X", null, null, null, null, null, null)))
                .isInstanceOf(PromotionException.PromotionNotFoundException.class);
    }
}
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd backend && ./gradlew compileTestJava`
Expected: 실패.

- [ ] **Step 3: 인터페이스 + 구현**

```java
// PromotionService.java
package com.duing.domain.promotion.service;

import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PromotionService {
    Long create(CreatePromotionCommand command);
    void update(UpdatePromotionCommand command);
    void delete(Long promotionId);
    Promotion getById(Long promotionId);
    Page<Promotion> searchForAdmin(PromotionAdminSearchCondition condition, Pageable pageable);
    Page<Promotion> findPublic(Pageable pageable);
}
```

```java
// GeneralPromotionService.java
package com.duing.domain.promotion.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.exception.PromotionException;
import com.duing.domain.promotion.repository.PromotionRepository;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPromotionService implements PromotionService {

    private final PromotionRepository promotionRepository;
    private final ClubRepository clubRepository;

    @Override
    @Transactional
    public Long create(CreatePromotionCommand command) {
        if (command.clubId() != null && clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }
        return promotionRepository.save(Promotion.create(
                command.clubId(), command.title(), command.bannerImageUrl(), command.linkUrl(),
                command.active(), command.displayOrder(), command.createdBy()
        )).getId();
    }

    @Override
    @Transactional
    public void update(UpdatePromotionCommand command) {
        Promotion promotion = promotionRepository.findById(command.promotionId())
                .orElseThrow(PromotionException.PromotionNotFoundException::new);

        if (command.clubId() != null
                && !Boolean.TRUE.equals(command.clearClubId())
                && clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubException.ClubNotFoundException();
        }

        promotion.update(new Promotion.UpdatePayload(
                command.title(), command.bannerImageUrl(), command.linkUrl(),
                command.clubId(), command.active(), command.displayOrder(), command.clearClubId()
        ));
    }

    @Override
    @Transactional
    public void delete(Long promotionId) {
        Promotion promotion = promotionRepository.findById(promotionId)
                .orElseThrow(PromotionException.PromotionNotFoundException::new);
        promotionRepository.delete(promotion);
    }

    @Override
    public Promotion getById(Long promotionId) {
        return promotionRepository.findById(promotionId)
                .orElseThrow(PromotionException.PromotionNotFoundException::new);
    }

    @Override
    public Page<Promotion> searchForAdmin(PromotionAdminSearchCondition condition, Pageable pageable) {
        return promotionRepository.searchForAdmin(condition, pageable);
    }

    @Override
    public Page<Promotion> findPublic(Pageable pageable) {
        return promotionRepository.findPublicActive(pageable);
    }
}
```

- [ ] **Step 4: 테스트 PASS 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.promotion.service.GeneralPromotionServiceTest"`
Expected: PASS (6 tests). Docker 이슈 시 DONE_WITH_CONCERNS.

- [ ] **Step 5: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/service/PromotionService.java \
        backend/src/main/java/com/duing/domain/promotion/service/GeneralPromotionService.java \
        backend/src/test/java/com/duing/domain/promotion/service/GeneralPromotionServiceTest.java
git commit -m "feat(backend): PromotionService — 배너 CRUD + 공개 정렬 조회"
```

---

## Task 9: Request / Response DTO

**Files:**
- Create: 4 Request + 4 Response records under `backend/src/main/java/com/duing/domain/promotion/controller/dto/`

- [ ] **Step 1: Request DTO 4종**

```java
// CreatePromotionRequestRequest.java
package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePromotionRequestRequest(
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 80, message = "제목은 80자 이하여야 합니다.") String title,
        @NotBlank(message = "설명은 필수입니다.")
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String suggestedBannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String suggestedLinkUrl
) {
    public CreatePromotionRequestCommand toCommand(Long clubId, Long requesterUserId) {
        return new CreatePromotionRequestCommand(
                clubId, requesterUserId, title, description, suggestedBannerImageUrl, suggestedLinkUrl);
    }
}
```

```java
// ProcessPromotionRequestRequest.java
package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.dto.command.ProcessPromotionRequestCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessPromotionRequestRequest(
        @NotNull(message = "처리 결과 상태는 필수입니다.") PromotionRequestStatus status,
        @Size(max = 1000, message = "처리 메모는 1000자 이하여야 합니다.") String actionNote
) {
    public ProcessPromotionRequestCommand toCommand(Long requestId, Long handlerAdminId) {
        return new ProcessPromotionRequestCommand(requestId, handlerAdminId, status, actionNote);
    }
}
```

```java
// CreatePromotionRequest.java
package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePromotionRequest(
        Long clubId,
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @NotBlank(message = "배너 이미지 URL은 필수입니다.")
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") int displayOrder
) {
    public CreatePromotionCommand toCommand(Long createdBy) {
        return new CreatePromotionCommand(
                clubId, title, bannerImageUrl, linkUrl, active, displayOrder, createdBy);
    }
}
```

```java
// UpdatePromotionRequest.java
package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record UpdatePromotionRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        Long clubId,
        Boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") Integer displayOrder,
        Boolean clearClubId
) {
    public UpdatePromotionCommand toCommand(Long promotionId) {
        return new UpdatePromotionCommand(
                promotionId, title, bannerImageUrl, linkUrl, clubId, active, displayOrder, clearClubId);
    }
}
```

- [ ] **Step 2: Response DTO 4종**

```java
// PromotionRequestSummaryResponse.java
package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import java.time.LocalDateTime;

public record PromotionRequestSummaryResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        String title,
        PromotionRequestStatus status,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static PromotionRequestSummaryResponse of(
            PromotionRequest request, ClubRef club, UserRef requester
    ) {
        return new PromotionRequestSummaryResponse(
                request.getId(), club, requester, request.getTitle(),
                request.getStatus(), request.getCreatedAt());
    }
}
```

```java
// PromotionRequestDetailResponse.java
package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import java.time.LocalDateTime;

public record PromotionRequestDetailResponse(
        Long id,
        ClubRef club,
        UserRef requester,
        String title,
        String description,
        String suggestedBannerImageUrl,
        String suggestedLinkUrl,
        PromotionRequestStatus status,
        String actionNote,
        UserRef handledBy,
        LocalDateTime handledAt,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static PromotionRequestDetailResponse of(
            PromotionRequest request, ClubRef club, UserRef requester, UserRef handler
    ) {
        return new PromotionRequestDetailResponse(
                request.getId(), club, requester,
                request.getTitle(), request.getDescription(),
                request.getSuggestedBannerImageUrl(), request.getSuggestedLinkUrl(),
                request.getStatus(), request.getActionNote(),
                handler, request.getHandledAt(), request.getCreatedAt());
    }
}
```

```java
// AdminPromotionResponse.java
package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import java.time.LocalDateTime;

public record AdminPromotionResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        boolean active,
        int displayOrder,
        UserRef createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record ClubRef(Long id, String name) {}
    public record UserRef(Long id, String name) {}

    public static AdminPromotionResponse of(
            Promotion promotion, ClubRef club, UserRef createdBy
    ) {
        return new AdminPromotionResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.isActive(), promotion.getDisplayOrder(),
                createdBy, promotion.getCreatedAt(), promotion.getUpdatedAt());
    }
}
```

```java
// PromotionCardResponse.java
package com.duing.domain.promotion.controller.dto.response;

import com.duing.domain.promotion.entity.Promotion;
import java.time.LocalDateTime;

public record PromotionCardResponse(
        Long id,
        ClubRef club,
        String title,
        String bannerImageUrl,
        String linkUrl,
        int displayOrder,
        LocalDateTime createdAt
) {
    public record ClubRef(Long id, String name) {}

    public static PromotionCardResponse of(Promotion promotion, ClubRef club) {
        return new PromotionCardResponse(
                promotion.getId(), club, promotion.getTitle(), promotion.getBannerImageUrl(),
                promotion.getLinkUrl(), promotion.getDisplayOrder(), promotion.getCreatedAt());
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/controller/dto/
git commit -m "feat(backend): 홍보 Request/Response DTO 정의"
```

---

## Task 10: LEADER 요청 제출 API + Controller (PR-1)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/api/LeaderPromotionApi.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/controller/LeaderPromotionController.java`

- [ ] **Step 1: API**

```java
package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
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

@Tag(name = "홍보 요청", description = "LEADER/OFFICER 의 홍보 요청 제출 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderPromotionApi {

    @Operation(summary = "홍보 요청 제출 (LEADER/OFFICER)",
            description = "본인이 운영진(LEADER/OFFICER)인 동아리에 한해 ADMIN 에게 홍보 요청을 제출한다.")
    @PostMapping("/clubs/{clubId}/promotion-requests")
    ResponseEntity<ApiResponse<Long>> createRequest(
            @PathVariable Long clubId,
            @Valid @RequestBody CreatePromotionRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.promotion.controller;

import com.duing.domain.promotion.api.LeaderPromotionApi;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
import com.duing.domain.promotion.service.PromotionRequestService;
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
public class LeaderPromotionController implements LeaderPromotionApi {

    private final PromotionRequestService requestService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createRequest(
            Long clubId,
            CreatePromotionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long requestId = requestService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(requestId));
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/api/LeaderPromotionApi.java \
        backend/src/main/java/com/duing/domain/promotion/controller/LeaderPromotionController.java
git commit -m "feat(backend): POST /clubs/{clubId}/promotion-requests — LEADER/OFFICER 홍보 요청"
```

---

## Task 11: ADMIN 요청 처리 API + Controller (PR-2~4)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/api/AdminPromotionRequestApi.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/controller/AdminPromotionRequestController.java`

- [ ] **Step 1: API**

```java
package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.ProcessPromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestDetailResponse;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestSummaryResponse;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
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

@Tag(name = "홍보 요청(총동연)", description = "총동연 전용 홍보 요청 검토/처리")
@SecurityRequirement(name = "BearerAuth")
public interface AdminPromotionRequestApi {

    @Operation(summary = "홍보 요청 목록")
    @GetMapping("/admin/promotion-requests")
    ResponseEntity<ApiResponse<PageResponse<PromotionRequestSummaryResponse>>> listRequests(
            @RequestParam(required = false) PromotionRequestStatus status,
            @RequestParam(required = false) Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "홍보 요청 상세")
    @GetMapping("/admin/promotion-requests/{requestId}")
    ResponseEntity<ApiResponse<PromotionRequestDetailResponse>> getRequest(@PathVariable Long requestId);

    @Operation(summary = "홍보 요청 처리")
    @PatchMapping("/admin/promotion-requests/{requestId}")
    ResponseEntity<ApiResponse<Void>> processRequest(
            @PathVariable Long requestId,
            @Valid @RequestBody ProcessPromotionRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.promotion.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.api.AdminPromotionRequestApi;
import com.duing.domain.promotion.controller.dto.request.ProcessPromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestDetailResponse;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestSummaryResponse;
import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.PromotionRequestService;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
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
public class AdminPromotionRequestController implements AdminPromotionRequestApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final PromotionRequestService requestService;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<PromotionRequestSummaryResponse>>> listRequests(
            PromotionRequestStatus status, Long clubId, Pageable pageable
    ) {
        Page<PromotionRequest> page = requestService.searchForAdmin(
                new PromotionRequestAdminSearchCondition(status, clubId), pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (PromotionRequest request : page.getContent()) {
            clubIds.add(request.getClubId());
            userIds.add(request.getRequesterUserId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Page<PromotionRequestSummaryResponse> mapped = page.map(request ->
                PromotionRequestSummaryResponse.of(
                        request,
                        summaryClubRef(request.getClubId(), clubMap.get(request.getClubId())),
                        summaryUserRef(request.getRequesterUserId(), userMap.get(request.getRequesterUserId()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    @Override
    public ResponseEntity<ApiResponse<PromotionRequestDetailResponse>> getRequest(Long requestId) {
        PromotionRequest request = requestService.getById(requestId);

        Set<Long> userIds = new HashSet<>();
        userIds.add(request.getRequesterUserId());
        if (request.getHandledBy() != null) userIds.add(request.getHandledBy());
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Club club = clubRepository.findById(request.getClubId()).orElse(null);
        PromotionRequestDetailResponse.ClubRef clubRef = club == null
                ? new PromotionRequestDetailResponse.ClubRef(request.getClubId(), DELETED_LABEL)
                : new PromotionRequestDetailResponse.ClubRef(club.getId(), club.getName());

        PromotionRequestDetailResponse.UserRef requesterRef = detailUserRef(
                request.getRequesterUserId(), userMap.get(request.getRequesterUserId()));
        PromotionRequestDetailResponse.UserRef handlerRef = request.getHandledBy() == null
                ? null
                : detailUserRef(request.getHandledBy(), userMap.get(request.getHandledBy()));

        return ResponseEntity.ok(ApiResponse.success(PromotionRequestDetailResponse.of(
                request, clubRef, requesterRef, handlerRef)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, ProcessPromotionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        requestService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    private PromotionRequestSummaryResponse.ClubRef summaryClubRef(Long clubId, Club club) {
        if (club == null) return new PromotionRequestSummaryResponse.ClubRef(clubId, DELETED_LABEL);
        return new PromotionRequestSummaryResponse.ClubRef(club.getId(), club.getName());
    }

    private PromotionRequestSummaryResponse.UserRef summaryUserRef(Long userId, User user) {
        if (user == null) return new PromotionRequestSummaryResponse.UserRef(userId, DELETED_LABEL);
        return new PromotionRequestSummaryResponse.UserRef(user.getId(), user.getName());
    }

    private PromotionRequestDetailResponse.UserRef detailUserRef(Long userId, User user) {
        if (user == null) return new PromotionRequestDetailResponse.UserRef(userId, DELETED_LABEL);
        return new PromotionRequestDetailResponse.UserRef(user.getId(), user.getName());
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/api/AdminPromotionRequestApi.java \
        backend/src/main/java/com/duing/domain/promotion/controller/AdminPromotionRequestController.java
git commit -m "feat(backend): /admin/promotion-requests (PR-2~4)"
```

---

## Task 12: ADMIN Promotion CRUD API + Controller (PM-1~4)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/api/AdminPromotionApi.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/controller/AdminPromotionController.java`

- [ ] **Step 1: API**

```java
package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.controller.dto.response.AdminPromotionResponse;
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

@Tag(name = "홍보 배너(총동연)", description = "총동연 전용 Promotion 배너 CRUD")
@SecurityRequirement(name = "BearerAuth")
public interface AdminPromotionApi {

    @Operation(summary = "배너 생성")
    @PostMapping("/admin/promotions")
    ResponseEntity<ApiResponse<Long>> createPromotion(
            @Valid @RequestBody CreatePromotionRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "배너 수정")
    @PatchMapping("/admin/promotions/{promotionId}")
    ResponseEntity<ApiResponse<Void>> updatePromotion(
            @PathVariable Long promotionId,
            @Valid @RequestBody UpdatePromotionRequest request
    );

    @Operation(summary = "배너 삭제")
    @DeleteMapping("/admin/promotions/{promotionId}")
    ResponseEntity<ApiResponse<Void>> deletePromotion(@PathVariable Long promotionId);

    @Operation(summary = "배너 관리 목록")
    @GetMapping("/admin/promotions")
    ResponseEntity<ApiResponse<PageResponse<AdminPromotionResponse>>> listPromotions(
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.promotion.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.api.AdminPromotionApi;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.controller.dto.response.AdminPromotionResponse;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
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
public class AdminPromotionController implements AdminPromotionApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final PromotionService promotionService;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Override
    public ResponseEntity<ApiResponse<Long>> createPromotion(
            CreatePromotionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long id = promotionService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updatePromotion(
            Long promotionId, UpdatePromotionRequest request
    ) {
        promotionService.update(request.toCommand(promotionId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deletePromotion(Long promotionId) {
        promotionService.delete(promotionId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminPromotionResponse>>> listPromotions(
            Boolean active, Long clubId, Pageable pageable
    ) {
        Page<Promotion> page = promotionService.searchForAdmin(
                new PromotionAdminSearchCondition(active, clubId), pageable);

        Set<Long> clubIds = new HashSet<>();
        Set<Long> userIds = new HashSet<>();
        for (Promotion promotion : page.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
            userIds.add(promotion.getCreatedBy());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));
        Map<Long, User> userMap = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Page<AdminPromotionResponse> mapped = page.map(promotion -> AdminPromotionResponse.of(
                promotion,
                clubRef(promotion.getClubId(), promotion.getClubId() == null ? null : clubMap.get(promotion.getClubId())),
                userRef(promotion.getCreatedBy(), userMap.get(promotion.getCreatedBy()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private AdminPromotionResponse.ClubRef clubRef(Long clubId, Club club) {
        if (clubId == null) return null;
        if (club == null) return new AdminPromotionResponse.ClubRef(clubId, DELETED_LABEL);
        return new AdminPromotionResponse.ClubRef(club.getId(), club.getName());
    }

    private AdminPromotionResponse.UserRef userRef(Long userId, User user) {
        if (user == null) return new AdminPromotionResponse.UserRef(userId, DELETED_LABEL);
        return new AdminPromotionResponse.UserRef(user.getId(), user.getName());
    }
}
```

- [ ] **Step 3: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/api/AdminPromotionApi.java \
        backend/src/main/java/com/duing/domain/promotion/controller/AdminPromotionController.java
git commit -m "feat(backend): /admin/promotions CRUD (PM-1~4)"
```

---

## Task 13: 공개 Promotion API + Controller + SecurityConfig (PM-5)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/promotion/api/PromotionApi.java`
- Create: `backend/src/main/java/com/duing/domain/promotion/controller/PromotionController.java`
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java`

- [ ] **Step 1: API**

```java
package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.response.PromotionCardResponse;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "홍보 배너", description = "공개 Promotion 배너 캐러셀 (비로그인 포함)")
public interface PromotionApi {

    @Operation(summary = "공개 활성 배너 목록 (비로그인)")
    @GetMapping("/promotions")
    ResponseEntity<ApiResponse<PageResponse<PromotionCardResponse>>> listPublic(
            @Parameter(hidden = true) Pageable pageable
    );
}
```

- [ ] **Step 2: Controller**

```java
package com.duing.domain.promotion.controller;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.promotion.api.PromotionApi;
import com.duing.domain.promotion.controller.dto.response.PromotionCardResponse;
import com.duing.domain.promotion.entity.Promotion;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PromotionController implements PromotionApi {

    private static final String DELETED_LABEL = "(삭제됨)";

    private final PromotionService promotionService;
    private final ClubRepository clubRepository;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<PromotionCardResponse>>> listPublic(Pageable pageable) {
        Page<Promotion> page = promotionService.findPublic(pageable);

        Set<Long> clubIds = new HashSet<>();
        for (Promotion promotion : page.getContent()) {
            if (promotion.getClubId() != null) clubIds.add(promotion.getClubId());
        }
        Map<Long, Club> clubMap = clubRepository.findAllById(clubIds).stream()
                .collect(Collectors.toMap(Club::getId, Function.identity()));

        Page<PromotionCardResponse> mapped = page.map(promotion -> PromotionCardResponse.of(
                promotion,
                clubRef(promotion.getClubId(),
                        promotion.getClubId() == null ? null : clubMap.get(promotion.getClubId()))));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(mapped)));
    }

    private PromotionCardResponse.ClubRef clubRef(Long clubId, Club club) {
        if (clubId == null) return null;
        if (club == null) return new PromotionCardResponse.ClubRef(clubId, DELETED_LABEL);
        return new PromotionCardResponse.ClubRef(club.getId(), club.getName());
    }
}
```

- [ ] **Step 3: SecurityConfig 변경**

`backend/src/main/java/com/duing/global/config/SecurityConfig.java` 의 `requestMatchers(HttpMethod.GET, "/api/v1/notices", "/api/v1/notices/**").permitAll()` 라인 바로 아래에 추가:

```java
                        .requestMatchers(HttpMethod.GET, "/api/v1/promotions").permitAll()
```

- [ ] **Step 4: Compile + Commit**

```bash
cd backend && ./gradlew compileJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/promotion/api/PromotionApi.java \
        backend/src/main/java/com/duing/domain/promotion/controller/PromotionController.java \
        backend/src/main/java/com/duing/global/config/SecurityConfig.java
git commit -m "feat(backend): GET /promotions 공개 캐러셀 + SecurityConfig permitAll (PM-5)"
```

---

## Task 14: Acceptance Test

**Files:**
- Create: `backend/src/test/java/com/duing/domain/promotion/PromotionAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성**

```java
package com.duing.domain.promotion;

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
class PromotionAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String leaderToken;
    private String studentToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = saveUser(UserRole.ADMIN);
        User leader = saveUser(UserRole.STUDENT);
        User student = saveUser(UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());

        Club club = clubRepository.save(Club.create("동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubId = club.getId();
    }

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0", LocalDateTime.now()));
    }

    @Test
    @DisplayName("LEADER 가 홍보 요청을 제출하면 201")
    void createRequestSucceeds() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "행사 홍보",
                        "description", "내용"))
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("ok", equalTo(true))
                .body("data", notNullValue());
    }

    @Test
    @DisplayName("MEMBER(운영진 아님) 가 홍보 요청 시 403")
    void nonManagerForbidden() {
        // student 는 club 멤버 아님 → AccessDeniedException 으로 403
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "T", "description", "D"))
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("동일 club PENDING 중복은 409")
    void duplicatePendingConflict() {
        Map<String, Object> body = Map.of("title", "T", "description", "D");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/clubs/" + clubId + "/promotion-requests")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("STUDENT 가 /admin/promotion-requests 호출 시 403")
    void studentForbiddenFromAdmin() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/admin/promotion-requests")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("ADMIN 이 Promotion 을 생성하고 비로그인 GET /promotions 로 조회된다")
    void publicListShowsAdminCreatedActivePromotion() {
        Long promotionId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "배너",
                        "bannerImageUrl", "/files/b.png",
                        "active", true,
                        "displayOrder", 1))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .when().get("/api/v1/promotions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].id", equalTo(promotionId.intValue()))
                .body("data.content[0].title", equalTo("배너"));
    }

    @Test
    @DisplayName("active=false 인 Promotion 은 공개 목록에서 빠진다")
    void inactivePromotionHidden() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "title", "비활성 배너",
                        "bannerImageUrl", "/files/b.png",
                        "active", false,
                        "displayOrder", 1))
                .when().post("/api/v1/admin/promotions")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .when().get("/api/v1/promotions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(0));
    }
}
```

- [ ] **Step 2: Compile + Commit**

```bash
cd backend && ./gradlew compileTestJava
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/test/java/com/duing/domain/promotion/PromotionAcceptanceTest.java
git commit -m "test(backend): 홍보 도메인 인수 테스트 — 201/403/409 + 공개 GET"
```

---

## Task 15: REQUIREMENTS 갱신 + PR

**Files:**
- Modify: `REQUIREMENTS.md` (§2.8 신설)

- [ ] **Step 1: 전체 컴파일 확인**

```bash
cd backend && ./gradlew compileJava compileTestJava 2>&1 | tail -3
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: REQUIREMENTS 갱신**

`REQUIREMENTS.md` §2.7 (재인증) 다음에 §2.8 추가:

```markdown
### 2.8 Promotion (홍보 큐레이션 배너)

**엔티티 필드 (PromotionRequest)**: `id`, `clubId`, `requesterUserId`(LEADER/OFFICER), `title`(≤80), `description`(≤2000), `suggestedBannerImageUrl?`, `suggestedLinkUrl?`, `status`(PENDING/ACCEPTED/REJECTED), `actionNote`, `handledBy`, `handledAt`.
**엔티티 필드 (Promotion)**: `id`, `clubId?`, `title`(≤120), `bannerImageUrl`, `linkUrl?`, `active`, `displayOrder`, `createdBy`.

| ID | 기능 | 입력 | 출력 | 예외 |
|---|---|---|---|---|
| PR-1 | 홍보 요청 제출 (LEADER/OFFICER) | `clubId`, `title`, `description`, `suggestedBannerImageUrl?`, `suggestedLinkUrl?` | `requestId` (201) | 401 / 403 운영진 아님 / 404 club / 409 PENDING 중복 |
| PR-2 | 홍보 요청 목록 (ADMIN) | `status?`, `clubId?`, Pageable | `PageResponse<PromotionRequestSummaryResponse>` (200) | 401 / 403 |
| PR-3 | 홍보 요청 상세 (ADMIN) | `requestId` | `PromotionRequestDetailResponse` (200) | 401 / 403 / 404 |
| PR-4 | 홍보 요청 처리 (ADMIN) | `requestId`, `status`(ACCEPTED/REJECTED), `actionNote?` | 204 | 400 잘못된 전이 / 401 / 403 / 404 |
| PM-1 | 배너 생성 (ADMIN) | `clubId?`, `title`, `bannerImageUrl`, `linkUrl?`, `active`, `displayOrder` | `promotionId` (201) | 400 / 401 / 403 / 404 |
| PM-2 | 배너 수정 (ADMIN) | partial fields + `clearClubId?` | 204 | 400 / 401 / 403 / 404 |
| PM-3 | 배너 삭제 (ADMIN) | `promotionId` | 204 | 401 / 403 / 404 |
| PM-4 | 배너 관리 목록 (ADMIN) | `active?`, `clubId?`, Pageable | `PageResponse<AdminPromotionResponse>` (200) | 401 / 403 |
| PM-5 | 공개 배너 목록 (비로그인 포함) | Pageable | `PageResponse<PromotionCardResponse>` (200) | — |

**비기능 요구사항**
- 조건부 unique: `(club_id) WHERE status='PENDING'` — 동아리당 PENDING 1건.
- Promotion 은 ADMIN 큐레이션. PromotionRequest 의 ACCEPTED 는 Promotion 자동 생성으로 이어지지 않음(완전 분리).
- 공개 GET `/promotions` 는 `active=true AND deleted_at IS NULL` 만 반환, `displayOrder ASC, createdAt DESC` 정렬.
- 이미지 업로드는 기존 `FileStorageService` 흐름으로 진행하고, 응답 URL 을 `suggestedBannerImageUrl` / `bannerImageUrl` 필드에 전달한다.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add REQUIREMENTS.md
git commit -m "docs: REQUIREMENTS 에 홍보(PR/PM) 도메인 추가"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/club-promotion
gh pr create --base develop --title "feat: 동아리 홍보 — 요청 + 큐레이션 배너 + 공개 캐러셀" --body "$(cat <<'EOF'
## 🚀 작업 내용

- 신규 `promotion` 도메인 추가. 동아리(LEADER/OFFICER) 의 홍보 요청(PR-1~4) + ADMIN 큐레이션 배너 CRUD(PM-1~4) + 비로그인 포함 공개 캐러셀(PM-5) 총 8개 API.
- 두 엔티티 (`PromotionRequest`, `Promotion`) 는 의도적으로 완전 분리 — ACCEPTED 가 Promotion 자동 생성으로 이어지지 않는다.
- 이미지 업로드는 기존 `FileStorageService` 흐름 그대로 — URL 필드에 전달.
- `/api/v1/promotions` GET 만 SecurityConfig permitAll 1줄 추가.

## 🤔 고민했던 내용

- 요청과 배너를 자동 연결할지: ACCEPTED → 자동 Promotion 생성안 검토 후 폐기. ADMIN 큐레이션 일관성을 위해 분리 유지.
- displayOrder 자동 vs 수동: 자동(예: 새 배너 맨 앞) 보다 ADMIN 수동 + active 토글 조합이 운영 통제 강함. 후자 채택.
- 동아리당 PENDING 1건 제약: Report/Succession/Recertification 과 동일 패턴 — 조건부 unique 인덱스 + DataIntegrityViolation 캐치.

## 💬 리뷰 중점사항

- `LeaderPromotionController` 가 `requireManager` 로 LEADER/OFFICER 만 통과시키는지 (서비스단 검증으로 위임).
- `Promotion.UpdatePayload.clearClubId` 가 `clubId` 새 값보다 우선되는지 (의도적 동작).
- 공개 GET `/promotions` 응답에 `active`, `createdBy`, `updatedAt` 미노출 확인.
- 로컬 Testcontainers 환경 이슈로 통합 테스트는 CI 의존.
EOF
)"
```

---

## Self-Review Notes

스펙 매핑:
- §2 In Scope (PR-1~4, PM-1~5, PENDING 1건 제약, active+displayOrder) → Task 1·3·4·5·6·7·8·10·11·12·13 모두 커버.
- §2 Out of Scope (알림/조회수/스케줄/카드뉴스/자동생성/자기 요청 조회) → 본 plan 미포함.
- §3.1 PromotionRequest 엔티티 → Task 1 + Task 3.
- §3.2 Promotion 엔티티 → Task 1 + Task 4.
- §3.3 Flyway V30 → Task 1.
- §4 API 9개 — 8 ADMIN+LEADER + 1 공개:
  - PR-1 → Task 10
  - PR-2,3,4 → Task 11
  - PM-1,2,3,4 → Task 12
  - PM-5 → Task 13
- §5 권한·검증 → Task 7 (`requireManager`), Task 11/12 (`hasRole('ADMIN')`), Task 13 (SecurityConfig permitAll).
- §6 노출 정책 (공개 응답에 ADMIN 필드 미포함) → Task 9 `PromotionCardResponse` 필드 한정 + Task 13 controller 매핑.
- §7 테스트 → Task 3, 4 (엔티티), 7, 8 (서비스), 14 (인수).
- §8 마이그레이션 → Task 1.

Placeholder scan: 없음.

Type 일관성:
- `PromotionRequestStatus` (PENDING/ACCEPTED/REJECTED) — V30 CHECK + Java enum + DTOs + 서비스 일관.
- `PromotionRequest#process(Long, PromotionRequestStatus, String)` — Task 3 정의, Task 7 호출.
- `Promotion#update(UpdatePayload)` 시그니처와 7개 nullable 필드 — Task 4 + Task 8 + Task 9 DTOs 일관 (특히 `clearClubId` 처리).
- `findPublicActive` 와 `searchForAdmin` — Task 6 repository + Task 8 service + Task 12/13 controller 일관.