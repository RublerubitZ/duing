# Phase 3 — 학생 사용자 흐름 보강 (찜·임시저장·알림) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 사용자가 (1) 동아리를 찜하고 모아볼 수 있고, (2) 자체 폼 지원서를 입력 도중 잃지 않도록 서버에 자동 임시저장되며, (3) 찜한 동아리의 모집 시작·마감 임박과 본인 면접 일정을 인-앱 알림 센터로 받는 한 사이클을 닫는다.

**Architecture:** Spring REST + Postgres + Spring `@Scheduled` 잡 (단계적 활성화) + Spring 도메인 이벤트(`@TransactionalEventListener(AFTER_COMMIT)`). Frontend 는 Next.js App Router + React Query 로 패키지 레이어(`types → api → hooks → app/_components`) 순차 추가. 3개 신규 도메인은 서로 단방향 호출만 허용한다(Notification → Favorite/Recruitment/Application 조회 OK, 역방향은 도메인 이벤트로만).

**Tech Stack:** Backend — Spring Boot 3.4 / Java 21 / JPA + QueryDSL / Flyway / JUnit5 + RestAssured + Fixture Monkey + TestContainers. Frontend — Next.js 15 / React 19 / TypeScript / TanStack Query / Zustand / Tailwind / ky.

**관련 spec:** [`docs/superpowers/specs/2026-05-17-phase-3-favorites-drafts-notifications-design.md`](../specs/2026-05-17-phase-3-favorites-drafts-notifications-design.md)

---

## File Structure

### Backend — Flyway (V14~V17)

```
backend/src/main/resources/db/migration/
  V14__create_club_favorite.sql                                       NEW
  V15__create_application_draft.sql                                   NEW
  V16__create_notification.sql                                        NEW
  V17__index_notification_lookup.sql                                  NEW
```

### Backend — 신규 / 수정

```
backend/src/main/java/com/duing/
  domain/favorite/                                                    NEW pkg
    entity/ClubFavorite.java                                          NEW
    repository/ClubFavoriteRepository.java                            NEW
    repository/ClubFavoriteRepositoryCustom.java                      NEW
    repository/ClubFavoriteRepositoryImpl.java                        NEW (QueryDSL)
    service/ClubFavoriteService.java                                  NEW (interface)
    service/GeneralClubFavoriteService.java                           NEW
    service/dto/query/FavoriteClubQuery.java                          NEW
    api/FavoriteApi.java                                              NEW
    controller/FavoriteController.java                                NEW
    controller/dto/response/FavoriteClubResponse.java                 NEW
    controller/dto/response/FavoriteIdsResponse.java                  NEW
    exception/FavoriteException.java                                  NEW

  domain/draft/                                                       NEW pkg
    entity/ApplicationDraft.java                                      NEW
    repository/ApplicationDraftRepository.java                        NEW
    service/ApplicationDraftService.java                              NEW (interface)
    service/GeneralApplicationDraftService.java                       NEW
    service/dto/command/UpsertDraftCommand.java                       NEW
    service/dto/query/ApplicationDraftQuery.java                      NEW
    api/ApplicationDraftApi.java                                      NEW
    controller/ApplicationDraftController.java                        NEW
    controller/dto/request/UpsertDraftRequest.java                    NEW
    controller/dto/response/DraftResponse.java                        NEW
    exception/DraftException.java                                     NEW

  domain/notification/                                                NEW pkg
    entity/Notification.java                                          NEW
    entity/NotificationType.java                                      NEW (enum)
    repository/NotificationRepository.java                            NEW
    repository/NotificationRepositoryCustom.java                      NEW
    repository/NotificationRepositoryImpl.java                        NEW (QueryDSL)
    service/NotificationService.java                                  NEW (interface)
    service/GeneralNotificationService.java                           NEW
    service/dto/command/CreateNotificationCommand.java                NEW
    service/dto/query/NotificationQuery.java                          NEW
    api/NotificationApi.java                                          NEW
    controller/NotificationController.java                            NEW
    controller/dto/response/NotificationResponse.java                 NEW
    controller/dto/response/UnreadCountResponse.java                  NEW
    event/RecruitmentOpenedEvent.java                                 NEW (record)
    event/InterviewScheduledEvent.java                                NEW (record)
    listener/RecruitmentOpenedListener.java                           NEW
    listener/InterviewScheduledListener.java                          NEW
    job/DeadlineNotificationJob.java                                  NEW
    job/InterviewReminderJob.java                                     NEW
    config/NotificationJobConfig.java                                 NEW (@EnableScheduling + ConditionalOnProperty)

  domain/recruitment/
    service/GeneralRecruitmentService.java                            MOD (create 끝에 ApplicationEventPublisher 로 RecruitmentOpenedEvent 발행)

  domain/application/
    service/GeneralApplicationService.java                            MOD (submit 트랜잭션 내 draftService.discard 호출)
    service/GeneralLeaderApplicationService.java                      MOD (updateInterview 후 InterviewScheduledEvent 발행)

  global/
    config/AsyncConfig.java                                           CHECK (이미 존재. 없으면 새로 — @TransactionalEventListener async 옵션은 사용 안 함, AFTER_COMMIT 동기로 충분)
```

### Backend — 테스트

```
backend/src/test/java/com/duing/
  domain/favorite/
    service/ClubFavoriteServiceTest.java                              NEW
    controller/FavoriteControllerTest.java                            NEW (RestAssured)
  domain/draft/
    service/ApplicationDraftServiceTest.java                          NEW
    controller/ApplicationDraftControllerTest.java                    NEW (RestAssured)
    integration/SubmitDiscardsDraftTest.java                          NEW
  domain/notification/
    service/NotificationServiceTest.java                              NEW (멱등 createIfAbsent, markRead, unreadCount)
    controller/NotificationControllerTest.java                        NEW (RestAssured)
    event/RecruitmentOpenedEventTest.java                             NEW
    event/InterviewScheduledEventTest.java                            NEW
    job/DeadlineNotificationJobTest.java                              NEW
    job/InterviewReminderJobTest.java                                 NEW
```

### Frontend — 신규 / 수정

```
frontend/packages/types/src/
  favorite.ts                                                         NEW (FavoriteClub, FavoriteIds)
  draft.ts                                                            NEW (ApplicationDraft, UpsertDraftPayload)
  notification.ts                                                     NEW (Notification, NotificationType)
  index.ts                                                            MOD (re-export)

frontend/packages/api/src/client.ts                                   MOD (favorites/drafts/notifications namespaces)

frontend/packages/hooks/src/
  favorites.ts                                                        NEW (Query/Mutation 훅 묶음)
  drafts.ts                                                           NEW
  notifications.ts                                                    NEW
  queryKeys.ts                                                        MOD (favorites/drafts/notifications 키 도메인 추가)
  index.ts                                                            MOD

frontend/apps/web/app/
  _components/NotificationBell.tsx                                    NEW
  _components/FavoriteToggleButton.tsx                                NEW
  layout.tsx                                                          MOD (헤더에 NotificationBell 마운트)
  clubs/page.tsx                                                      MOD (카드에 FavoriteToggleButton)
  clubs/[clubId]/page.tsx                                             MOD (헤더에 FavoriteToggleButton)
  clubs/[clubId]/recruitments/[recruitmentId]/apply/page.tsx          MOD (draft 자동저장 연결)
  me/favorites/page.tsx                                               NEW
  me/favorites/_components/FavoriteClubCard.tsx                       NEW
  notifications/page.tsx                                              NEW
  notifications/_components/NotificationItem.tsx                      NEW
```

### Frontend — 테스트

```
frontend/apps/web/test/
  favorites/FavoriteToggleButton.test.tsx                             NEW
  drafts/useApplicationDraft.test.tsx                                 NEW (debounce + prefill)
  notifications/NotificationBell.test.tsx                             NEW
  notifications/notifications-page.test.tsx                           NEW
```

---

## Important Context Notes

**컨벤션 (backend/CLAUDE.md)**
- DDD 패키지: `api/controller/service/entity/repository/exception` + dto 는 `command`(쓰기)·`query`(읽기) 분리.
- DTO 는 모두 Java `record`. 매핑: `Request#toCommand()` / `Response.from(Query)`.
- Service: `@Transactional(readOnly = true)` 클래스 기본 + 쓰기 메서드만 `@Transactional` 오버라이드.
- HTTP 상태: POST 201 / GET 200 / PATCH·DELETE 204.
- 변수명 풀네임 (`favorite`, `draft`, `notification` — `f`, `d`, `n` 금지).
- Bean Validation 메시지는 한국어.
- 권한: Global role 은 `@PreAuthorize("isAuthenticated()")`, Club-scoped 는 service 가드. Phase 3 의 모든 신규 endpoint 는 로그인만 요구 (`isAuthenticated`).
- 모든 신규 도메인은 본인 데이터만 접근 — 컨트롤러 첫 줄에서 `@AuthenticationPrincipal` 로 `userId` 추출 후 서비스에 전달. 다른 유저의 favorite/draft/notification 접근은 service 가 본인 검증 후 차단.

**도메인 이벤트 패턴**
- Spring `ApplicationEventPublisher` 주입. `publisher.publishEvent(new XxxEvent(...))`.
- 리스너: `@TransactionalEventListener(phase = AFTER_COMMIT)` — 발행 트랜잭션 롤백 시 알림 미생성. async 옵션 미사용(동기 처리, 같은 요청에서 createIfAbsent 가 끝나야 응답).
- 리스너는 자체 트랜잭션 필요 → `@Transactional(propagation = Propagation.REQUIRES_NEW)` 권장.

**Notification 멱등 보장**
- `notification.dedup_key` 에 UNIQUE 제약. 서비스 `createIfAbsent(...)` 는 try-catch + DataIntegrityViolationException 흡수 또는 `INSERT ... ON CONFLICT DO NOTHING` (네이티브). 본 plan 은 JPA persist 후 `DataIntegrityViolationException` 흡수 방식 채택.

**잡 (스케줄러) 활성화 전략**
- `NotificationJobConfig` 에 `@EnableScheduling` 과 `@ConditionalOnProperty(prefix = "duing.notification.jobs", name = "enabled", havingValue = "true")`.
- 로컬·CI 기본값 `false`. 통합 테스트는 직접 잡 빈을 주입해 메서드를 호출(스케줄러 비활성 상태에서도 가능).
- 운영 활성화는 Task 12 의 환경변수 변경으로.

**브랜치 전략 (backend/CLAUDE.md "1 단위 = 1 브랜치 = 1 PR")**
- 각 Task = 단일 PR. 모두 `develop` 에서 분기, `develop` 으로 PR.
- 브랜치명 예: `feat/{n}-phase3-favorite-domain`, `feat/{n}-phase3-draft-autosave`, `feat/{n}-phase3-notification-core`, …
- 의존 순서: Task 0 → 1 / 2 → 3 / 4 → 5 → 6 → 7 (BE 끝), 그리고 8 → 9 / 10 / 11 / 12 (FE + 활성화).
- FE 패키지(Task 8) 머지 전에는 페이지 작업(9·10·11) 시작 금지.

---

## Task 0 — V14 Flyway: club_favorite

**Branch:** `feat/{n}-phase3-favorite-migration`

**Files:**
- Create: `backend/src/main/resources/db/migration/V14__create_club_favorite.sql`

- [ ] **Step 1:** 파일 생성.

```sql
-- V14__create_club_favorite.sql
CREATE TABLE club_favorite (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id    BIGINT       NOT NULL REFERENCES club(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_club_favorite UNIQUE (user_id, club_id)
);

CREATE INDEX idx_club_favorite_user_created ON club_favorite (user_id, created_at DESC);
CREATE INDEX idx_club_favorite_club         ON club_favorite (club_id);
```

- [ ] **Step 2:** 마이그레이션 적용 확인.

```bash
./gradlew :backend:flywayMigrate -i
```

Expected: `Migrating schema "public" to version "14"` 로그.

- [ ] **Step 3:** 커밋 & PR.

```bash
git add backend/src/main/resources/db/migration/V14__create_club_favorite.sql
git commit -m "[#?] V14 club_favorite 테이블 추가"
```

---

## Task 1 — Favorite 도메인 (entity + repo + service + controller + 테스트)

**Branch:** `feat/{n}-phase3-favorite-domain`

**Files (생성):**
```
backend/src/main/java/com/duing/domain/favorite/
  entity/ClubFavorite.java
  repository/ClubFavoriteRepository.java
  repository/ClubFavoriteRepositoryCustom.java
  repository/ClubFavoriteRepositoryImpl.java
  service/ClubFavoriteService.java
  service/GeneralClubFavoriteService.java
  service/dto/query/FavoriteClubQuery.java
  api/FavoriteApi.java
  controller/FavoriteController.java
  controller/dto/response/FavoriteClubResponse.java
  controller/dto/response/FavoriteIdsResponse.java
  exception/FavoriteException.java
backend/src/test/java/com/duing/domain/favorite/
  service/ClubFavoriteServiceTest.java
  controller/FavoriteControllerTest.java
```

- [ ] **Step 1: Entity** — `ClubFavorite.java`

```java
package com.duing.domain.favorite.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Getter
@Entity
@Table(name = "club_favorite",
       uniqueConstraints = @UniqueConstraint(name = "uq_club_favorite", columnNames = {"user_id", "club_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ClubFavorite {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    private ClubFavorite(User user, Club club) {
        this.user = user;
        this.club = club;
        this.createdAt = OffsetDateTime.now();
    }

    public static ClubFavorite create(User user, Club club) {
        return new ClubFavorite(user, club);
    }
}
```

> `BaseEntity` 미상속(소프트 삭제 없음). 토글 시 hard delete.

- [ ] **Step 2: Repository**

```java
// ClubFavoriteRepository.java
package com.duing.domain.favorite.repository;

import com.duing.domain.favorite.entity.ClubFavorite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ClubFavoriteRepository
        extends JpaRepository<ClubFavorite, Long>, ClubFavoriteRepositoryCustom {

    boolean existsByUserIdAndClubId(Long userId, Long clubId);

    Optional<ClubFavorite> findByUserIdAndClubId(Long userId, Long clubId);

    List<ClubFavorite> findAllByUserIdOrderByCreatedAtDesc(Long userId);
}
```

```java
// ClubFavoriteRepositoryCustom.java
package com.duing.domain.favorite.repository;

import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubFavoriteRepositoryCustom {
    Page<FavoriteClubQuery> findFavoriteClubPage(Long userId, Pageable pageable);
}
```

```java
// ClubFavoriteRepositoryImpl.java — QueryDSL 로 club join + openRecruitmentCount 계산
package com.duing.domain.favorite.repository;

import com.duing.domain.club.entity.QClub;
import com.duing.domain.favorite.entity.QClubFavorite;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.recruitment.entity.QRecruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class ClubFavoriteRepositoryImpl implements ClubFavoriteRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FavoriteClubQuery> findFavoriteClubPage(Long userId, Pageable pageable) {
        QClubFavorite favorite = QClubFavorite.clubFavorite;
        QClub club = QClub.club;
        QRecruitment recruitment = QRecruitment.recruitment;

        List<FavoriteClubQuery> content = queryFactory
                .select(Projections.constructor(
                        FavoriteClubQuery.class,
                        club.id, club.name, club.logoUrl, club.category, club.division,
                        favorite.createdAt,
                        JPAExpressions.select(recruitment.count().intValue())
                                .from(recruitment)
                                .where(recruitment.club.id.eq(club.id),
                                       recruitment.status.eq(RecruitmentStatus.OPEN),
                                       recruitment.endDate.goe(LocalDate.now()),
                                       recruitment.deletedAt.isNull())))
                .from(favorite)
                .join(favorite.club, club)
                .where(favorite.user.id.eq(userId))
                .orderBy(favorite.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        long total = queryFactory.select(favorite.count())
                .from(favorite).where(favorite.user.id.eq(userId)).fetchOne();

        return new PageImpl<>(content, pageable, total);
    }
}
```

- [ ] **Step 3: Query DTO**

```java
// FavoriteClubQuery.java
package com.duing.domain.favorite.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import java.time.OffsetDateTime;

public record FavoriteClubQuery(
        Long clubId,
        String name,
        String logoUrl,
        ClubCategory category,
        String division,
        OffsetDateTime favoritedAt,
        int openRecruitmentCount
) {}
```

- [ ] **Step 4: Exception**

```java
// FavoriteException.java
package com.duing.domain.favorite.exception;

import com.duing.global.exception.BusinessException;
import com.duing.global.exception.ErrorCode;

public class FavoriteException extends BusinessException {
    protected FavoriteException(ErrorCode errorCode) { super(errorCode); }

    public static final class AlreadyFavoritedException extends FavoriteException {
        public AlreadyFavoritedException() { super(ErrorCode.FAVORITE_ALREADY_EXISTS); }
    }
}
```

> `ErrorCode` 에 `FAVORITE_ALREADY_EXISTS(409, "이미 찜한 동아리입니다.")` 추가. 동아리 404 는 기존 `ClubException.NotFoundException` 재사용.

- [ ] **Step 5: Service interface + impl**

```java
// ClubFavoriteService.java
package com.duing.domain.favorite.service;

import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.List;

public interface ClubFavoriteService {
    Long add(Long userId, Long clubId);
    void remove(Long userId, Long clubId);            // 멱등 — 없어도 예외 X
    Page<FavoriteClubQuery> getMyFavorites(Long userId, Pageable pageable);
    List<Long> getMyFavoriteClubIds(Long userId);
}
```

```java
// GeneralClubFavoriteService.java
package com.duing.domain.favorite.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.exception.FavoriteException;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubFavoriteService implements ClubFavoriteService {

    private final ClubFavoriteRepository favoriteRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public Long add(Long userId, Long clubId) {
        if (favoriteRepository.existsByUserIdAndClubId(userId, clubId)) {
            throw new FavoriteException.AlreadyFavoritedException();
        }
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.NotFoundException::new);
        User user = userRepository.getReferenceById(userId);
        return favoriteRepository.save(ClubFavorite.create(user, club)).getId();
    }

    @Override
    @Transactional
    public void remove(Long userId, Long clubId) {
        favoriteRepository.findByUserIdAndClubId(userId, clubId)
                .ifPresent(favoriteRepository::delete);
    }

    @Override
    public Page<FavoriteClubQuery> getMyFavorites(Long userId, Pageable pageable) {
        return favoriteRepository.findFavoriteClubPage(userId, pageable);
    }

    @Override
    public List<Long> getMyFavoriteClubIds(Long userId) {
        return favoriteRepository.findAllByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(favorite -> favorite.getClub().getId())
                .toList();
    }
}
```

- [ ] **Step 6: API interface + Controller**

```java
// FavoriteApi.java — Swagger interface (기존 ClubApi 와 동일 스타일)
package com.duing.domain.favorite.api;

import com.duing.domain.favorite.controller.dto.response.FavoriteClubResponse;
import com.duing.domain.favorite.controller.dto.response.FavoriteIdsResponse;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;

@Tag(name = "Favorite", description = "동아리 찜")
public interface FavoriteApi {
    @Operation(summary = "찜 추가")
    ApiResponse<Long> add(Long clubId);

    @Operation(summary = "찜 해제 (멱등)")
    void remove(Long clubId);

    @Operation(summary = "내 찜한 동아리 목록")
    ApiResponse<PageResponse<FavoriteClubResponse>> getMine(Pageable pageable);

    @Operation(summary = "내 찜한 동아리 ID 목록 (목록 페이지 하트 채우기용)")
    ApiResponse<FavoriteIdsResponse> getMyIds();
}
```

```java
// FavoriteController.java
package com.duing.domain.favorite.controller;

import com.duing.domain.favorite.api.FavoriteApi;
import com.duing.domain.favorite.controller.dto.response.FavoriteClubResponse;
import com.duing.domain.favorite.controller.dto.response.FavoriteIdsResponse;
import com.duing.domain.favorite.service.ClubFavoriteService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import com.duing.global.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/favorites")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FavoriteController implements FavoriteApi {

    private final ClubFavoriteService favoriteService;

    @PostMapping("/{clubId}")
    @ResponseStatus(HttpStatus.CREATED)
    @Override
    public ApiResponse<Long> add(@PathVariable Long clubId,
                                 @AuthenticationPrincipal AuthUser authUser) {
        return ApiResponse.success(favoriteService.add(authUser.id(), clubId));
    }

    @DeleteMapping("/{clubId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Override
    public void remove(@PathVariable Long clubId,
                       @AuthenticationPrincipal AuthUser authUser) {
        favoriteService.remove(authUser.id(), clubId);
    }

    @GetMapping
    @Override
    public ApiResponse<PageResponse<FavoriteClubResponse>> getMine(
            Pageable pageable,
            @AuthenticationPrincipal AuthUser authUser) {
        return ApiResponse.success(PageResponse.of(
                favoriteService.getMyFavorites(authUser.id(), pageable)
                               .map(FavoriteClubResponse::from)));
    }

    @GetMapping("/ids")
    @Override
    public ApiResponse<FavoriteIdsResponse> getMyIds(
            @AuthenticationPrincipal AuthUser authUser) {
        return ApiResponse.success(
                new FavoriteIdsResponse(favoriteService.getMyFavoriteClubIds(authUser.id())));
    }
}
```

- [ ] **Step 7: Response DTOs**

```java
// FavoriteClubResponse.java
package com.duing.domain.favorite.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import java.time.OffsetDateTime;

public record FavoriteClubResponse(
        Long clubId, String name, String logoUrl,
        ClubCategory category, String division,
        OffsetDateTime favoritedAt, int openRecruitmentCount
) {
    public static FavoriteClubResponse from(FavoriteClubQuery query) {
        return new FavoriteClubResponse(query.clubId(), query.name(), query.logoUrl(),
                query.category(), query.division(), query.favoritedAt(),
                query.openRecruitmentCount());
    }
}

// FavoriteIdsResponse.java
package com.duing.domain.favorite.controller.dto.response;
import java.util.List;
public record FavoriteIdsResponse(List<Long> clubIds) {}
```

- [ ] **Step 8: Service unit test** — `ClubFavoriteServiceTest.java`

```java
@SpringBootTest
class ClubFavoriteServiceTest {
    @Autowired ClubFavoriteService favoriteService;
    @Autowired ClubFavoriteRepository favoriteRepository;
    // … 시드 픽스처

    @Test
    @DisplayName("같은 동아리를 두 번 찜하면 AlreadyFavoritedException 이 발생한다")
    void duplicateFavorite() { /* … */ }

    @Test
    @DisplayName("찜하지 않은 동아리를 해제해도 예외 없이 멱등하게 끝난다")
    void idempotentRemove() { /* … */ }

    @Test
    @DisplayName("내 찜한 동아리 페이지 조회는 진행 중 모집 수를 함께 반환한다")
    void favoriteListWithOpenCount() { /* … */ }
}
```

- [ ] **Step 9: Controller integration test (RestAssured)**

```java
@DisplayName("POST /api/v1/me/favorites/{clubId} 는 201 과 favoriteId 를 반환한다")
// + 중복 찜 409, 비존재 동아리 404, 찜 해제 두 번 모두 204, 비로그인 401
```

- [ ] **Step 10:** `./gradlew test --tests "*Favorite*"` 그린 확인 후 커밋·PR.

---

## Task 2 — V15 Flyway: application_draft

**Branch:** `feat/{n}-phase3-draft-migration`

- [ ] **Step 1:** `V15__create_application_draft.sql`

```sql
CREATE TABLE application_draft (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        BIGINT       NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  recruitment_id BIGINT       NOT NULL REFERENCES recruitment(id) ON DELETE CASCADE,
  answers        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_application_draft UNIQUE (user_id, recruitment_id)
);
CREATE INDEX idx_application_draft_recruitment ON application_draft (recruitment_id);
```

- [ ] **Step 2:** `./gradlew :backend:flywayMigrate -i` 확인 후 커밋.

---

## Task 3 — Draft 도메인 + 제출 트랜잭션 통합

**Branch:** `feat/{n}-phase3-draft-domain`

**Files:** `domain/draft/**` + `application/service/GeneralApplicationService.java` (submit() 끝에 draft delete).

- [ ] **Step 1: Entity** — `ApplicationDraft.java`

```java
@Entity
@Table(name = "application_draft",
       uniqueConstraints = @UniqueConstraint(name = "uq_application_draft", columnNames = {"user_id","recruitment_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationDraft {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @Type(JsonBinaryType.class)
    @Column(name = "answers", columnDefinition = "jsonb", nullable = false)
    private List<DraftAnswer> answers;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static ApplicationDraft create(Long userId, Long recruitmentId, List<DraftAnswer> answers) {
        ApplicationDraft draft = new ApplicationDraft();
        draft.userId = userId; draft.recruitmentId = recruitmentId; draft.answers = answers;
        draft.createdAt = OffsetDateTime.now(); draft.updatedAt = draft.createdAt;
        return draft;
    }

    public void replace(List<DraftAnswer> answers) {
        this.answers = answers;
        this.updatedAt = OffsetDateTime.now();
    }

    public record DraftAnswer(Long questionId, String value) {}
}
```

- [ ] **Step 2: Repository** — 단순 JPA.

```java
public interface ApplicationDraftRepository extends JpaRepository<ApplicationDraft, Long> {
    Optional<ApplicationDraft> findByUserIdAndRecruitmentId(Long userId, Long recruitmentId);
    void deleteByUserIdAndRecruitmentId(Long userId, Long recruitmentId);
    void deleteAllByRecruitmentId(Long recruitmentId);  // 모집 종료 시 일괄 정리용
}
```

- [ ] **Step 3: Service**

```java
public interface ApplicationDraftService {
    Optional<ApplicationDraftQuery> find(Long userId, Long recruitmentId);
    void upsert(UpsertDraftCommand command);
    void discard(Long userId, Long recruitmentId); // 멱등
}

@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class GeneralApplicationDraftService implements ApplicationDraftService {
    private final ApplicationDraftRepository draftRepository;
    private final RecruitmentRepository recruitmentRepository;

    @Override
    public Optional<ApplicationDraftQuery> find(Long userId, Long recruitmentId) {
        return draftRepository.findByUserIdAndRecruitmentId(userId, recruitmentId)
                .map(ApplicationDraftQuery::from);
    }

    @Override
    @Transactional
    public void upsert(UpsertDraftCommand command) {
        Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
                .orElseThrow(RecruitmentException.NotFoundException::new);
        if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
            throw new DraftException.RecruitmentClosedException();   // 410
        }
        draftRepository.findByUserIdAndRecruitmentId(command.userId(), command.recruitmentId())
                .ifPresentOrElse(
                        draft -> draft.replace(command.answers()),
                        () -> draftRepository.save(
                                ApplicationDraft.create(command.userId(),
                                                        command.recruitmentId(),
                                                        command.answers())));
    }

    @Override
    @Transactional
    public void discard(Long userId, Long recruitmentId) {
        draftRepository.deleteByUserIdAndRecruitmentId(userId, recruitmentId);
    }
}
```

> `DraftException.RecruitmentClosedException` → `ErrorCode.DRAFT_RECRUITMENT_CLOSED(410, "마감된 모집에는 임시저장할 수 없습니다.")` 신규.

- [ ] **Step 4: API + Controller**

```java
@RestController
@RequestMapping("/api/v1/recruitments/{recruitmentId}/draft")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ApplicationDraftController implements ApplicationDraftApi {

    private final ApplicationDraftService draftService;

    @GetMapping
    public ApiResponse<DraftResponse> get(@PathVariable Long recruitmentId,
                                          @AuthenticationPrincipal AuthUser authUser) {
        return ApiResponse.success(
                draftService.find(authUser.id(), recruitmentId)
                        .map(DraftResponse::existing)
                        .orElseGet(DraftResponse::empty));
    }

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void upsert(@PathVariable Long recruitmentId,
                       @RequestBody @Valid UpsertDraftRequest request,
                       @AuthenticationPrincipal AuthUser authUser) {
        draftService.upsert(request.toCommand(authUser.id(), recruitmentId));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long recruitmentId,
                       @AuthenticationPrincipal AuthUser authUser) {
        draftService.discard(authUser.id(), recruitmentId);
    }
}
```

DTO:

```java
public record UpsertDraftRequest(
        @NotNull(message = "answers 는 필수 입력값입니다.")
        List<DraftAnswerPayload> answers
) {
    public record DraftAnswerPayload(Long questionId, String value) {}

    public UpsertDraftCommand toCommand(Long userId, Long recruitmentId) {
        return new UpsertDraftCommand(userId, recruitmentId,
                answers.stream().map(a -> new ApplicationDraft.DraftAnswer(a.questionId(), a.value())).toList());
    }
}

public record DraftResponse(boolean exists, List<ApplicationDraft.DraftAnswer> answers, OffsetDateTime updatedAt) {
    public static DraftResponse empty() { return new DraftResponse(false, List.of(), null); }
    public static DraftResponse existing(ApplicationDraftQuery query) {
        return new DraftResponse(true, query.answers(), query.updatedAt());
    }
}
```

- [ ] **Step 5: 제출 트랜잭션에서 draft 정리** — `GeneralApplicationService.submit()` 마지막 줄에 호출.

```java
// inside submit(...)
Application saved = applicationRepository.save(application);
draftService.discard(userId, recruitmentId);   // ← 추가
return saved.getId();
```

- [ ] **Step 6: Tests**
  - `ApplicationDraftServiceTest` — `"PUT /draft 는 같은 (user, recruitment) 에 대해 멱등하게 동작한다"`, `"마감된 모집에 PUT /draft 호출 시 RecruitmentClosedException 이 발생한다"`.
  - `SubmitDiscardsDraftTest` — `"지원 제출이 성공하면 같은 모집의 draft 가 삭제된다"`, `"지원 제출이 검증 실패로 롤백되면 draft 는 그대로 유지된다"` (트랜잭션 검증).
  - `ApplicationDraftControllerTest` (RestAssured) — happy path + 410 + 401 매트릭스.

- [ ] **Step 7:** `./gradlew test --tests "*Draft*"` 그린 → 커밋·PR.

---

## Task 4 — V16/V17 Flyway: notification

**Branch:** `feat/{n}-phase3-notification-migration`

- [ ] **Step 1:** `V16__create_notification.sql`

```sql
CREATE TABLE notification (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(120) NOT NULL,
  body       VARCHAR(300) NOT NULL,
  link_url   VARCHAR(300),
  payload    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  dedup_key  VARCHAR(160) NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_dedup UNIQUE (user_id, dedup_key)
);
```

- [ ] **Step 2:** `V17__index_notification_lookup.sql`

```sql
CREATE INDEX idx_notification_user_created
  ON notification (user_id, created_at DESC);
CREATE INDEX idx_notification_user_unread
  ON notification (user_id) WHERE read_at IS NULL;
```

- [ ] **Step 3:** flywayMigrate 검증 후 커밋.

---

## Task 5 — Notification 도메인 코어 (entity + service + controller)

**Branch:** `feat/{n}-phase3-notification-core`

**범위:** 이벤트·잡 제외, 알림 row 를 만들고 읽고 카운트하는 기본 API 까지.

- [ ] **Step 1: Enum**

```java
public enum NotificationType {
    RECRUITMENT_OPENED,
    RECRUITMENT_DEADLINE,
    INTERVIEW_SCHEDULED,
    INTERVIEW_REMINDER
}
```

- [ ] **Step 2: Entity**

```java
@Entity
@Table(name = "notification",
       uniqueConstraints = @UniqueConstraint(name = "uq_notification_dedup", columnNames = {"user_id","dedup_key"}))
@Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 40) private NotificationType type;
    @Column(nullable = false, length = 120) private String title;
    @Column(nullable = false, length = 300) private String body;
    @Column(name = "link_url", length = 300) private String linkUrl;
    @Type(JsonBinaryType.class) @Column(columnDefinition = "jsonb", nullable = false) private Map<String,Object> payload;
    @Column(name = "dedup_key", nullable = false, length = 160) private String dedupKey;
    @Column(name = "read_at") private OffsetDateTime readAt;
    @Column(name = "created_at", nullable = false, updatable = false) private OffsetDateTime createdAt;

    public static Notification create(Long userId, NotificationType type, String title, String body,
                                      String linkUrl, Map<String,Object> payload, String dedupKey) {
        Notification notification = new Notification();
        notification.userId = userId; notification.type = type; notification.title = title;
        notification.body = body; notification.linkUrl = linkUrl;
        notification.payload = payload == null ? Map.of() : payload;
        notification.dedupKey = dedupKey;
        notification.createdAt = OffsetDateTime.now();
        return notification;
    }

    public boolean isUnread() { return readAt == null; }
    public void markRead() { if (readAt == null) this.readAt = OffsetDateTime.now(); }
}
```

- [ ] **Step 3: Repository**

```java
public interface NotificationRepository
        extends JpaRepository<Notification, Long>, NotificationRepositoryCustom {
    long countByUserIdAndReadAtIsNull(Long userId);
    Optional<Notification> findByIdAndUserId(Long id, Long userId);
}

public interface NotificationRepositoryCustom {
    Page<Notification> findMine(Long userId, boolean unreadOnly, Pageable pageable);
    int markAllRead(Long userId);
}

// Impl 은 QueryDSL — 생략 패턴은 Task 1 참고.
```

- [ ] **Step 4: Service**

```java
public interface NotificationService {
    /** dedup_key 충돌 시 조용히 무시. 새로 생성됐을 때만 true. */
    boolean createIfAbsent(CreateNotificationCommand command);
    Page<NotificationQuery> listMine(Long userId, boolean unreadOnly, Pageable pageable);
    long unreadCount(Long userId);
    void markRead(Long userId, Long notificationId);
    void markAllRead(Long userId);
}

@Service @RequiredArgsConstructor @Transactional(readOnly = true)
public class GeneralNotificationService implements NotificationService {
    private final NotificationRepository notificationRepository;

    @Override
    @Transactional
    public boolean createIfAbsent(CreateNotificationCommand command) {
        Notification notification = Notification.create(
                command.userId(), command.type(), command.title(), command.body(),
                command.linkUrl(), command.payload(), command.dedupKey());
        try {
            notificationRepository.saveAndFlush(notification);
            return true;
        } catch (DataIntegrityViolationException duplicate) {
            return false; // 멱등
        }
    }

    @Override public Page<NotificationQuery> listMine(Long userId, boolean unreadOnly, Pageable pageable) {
        return notificationRepository.findMine(userId, unreadOnly, pageable).map(NotificationQuery::from);
    }
    @Override public long unreadCount(Long userId) { return notificationRepository.countByUserIdAndReadAtIsNull(userId); }
    @Override @Transactional public void markRead(Long userId, Long notificationId) {
        notificationRepository.findByIdAndUserId(notificationId, userId)
                .ifPresent(Notification::markRead);   // 없으면 멱등 — 404 정책 원하면 throw
    }
    @Override @Transactional public void markAllRead(Long userId) { notificationRepository.markAllRead(userId); }
}
```

> 정책: 본인 알림 아님(`findByIdAndUserId` 가 다른 유저 row 를 잘못 잡지 못함) → 404 도, 403 도 아닌 204 멱등. spec 의 "403/404" 는 row 존재 여부와 소유자 매트릭스를 컨트롤러 레벨에서 처리하지 않고 service 가 본인 row 만 보도록 일관 적용. **컨트롤러 테스트 케이스명도 이 정책에 맞춘다.**

- [ ] **Step 5: Controller + API**

```java
@RestController
@RequestMapping("/api/v1/me/notifications")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class NotificationController implements NotificationApi {
    private final NotificationService notificationService;

    @GetMapping
    public ApiResponse<PageResponse<NotificationResponse>> list(
            @RequestParam(defaultValue = "false") boolean unreadOnly,
            Pageable pageable,
            @AuthenticationPrincipal AuthUser authUser) {
        return ApiResponse.success(PageResponse.of(
                notificationService.listMine(authUser.id(), unreadOnly, pageable).map(NotificationResponse::from)));
    }

    @GetMapping("/unread-count")
    public ApiResponse<UnreadCountResponse> unreadCount(@AuthenticationPrincipal AuthUser authUser) {
        return ApiResponse.success(new UnreadCountResponse(notificationService.unreadCount(authUser.id())));
    }

    @PatchMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void read(@PathVariable Long id, @AuthenticationPrincipal AuthUser authUser) {
        notificationService.markRead(authUser.id(), id);
    }

    @PatchMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void readAll(@AuthenticationPrincipal AuthUser authUser) {
        notificationService.markAllRead(authUser.id());
    }
}
```

- [ ] **Step 6: 테스트** — `NotificationServiceTest`
  - `"동일 dedup_key 로 createIfAbsent 를 두 번 호출해도 row 는 1개만 생성된다"`
  - `"unreadCount 는 readAt 이 null 인 행만 센다"`
  - `"markAllRead 는 본인 알림만 일괄 읽음으로 표시한다"`
  - `"다른 유저의 notificationId 로 markRead 를 호출해도 변화가 없다(본인 row 만 처리)"`

`NotificationControllerTest` — happy path + 비로그인 401.

- [ ] **Step 7:** `./gradlew test --tests "*Notification*"` 그린 → 커밋·PR.

---

## Task 6 — Notification 도메인 이벤트 (RecruitmentOpened, InterviewScheduled)

**Branch:** `feat/{n}-phase3-notification-events`

**Files:**
- `domain/notification/event/RecruitmentOpenedEvent.java`
- `domain/notification/event/InterviewScheduledEvent.java`
- `domain/notification/listener/RecruitmentOpenedListener.java`
- `domain/notification/listener/InterviewScheduledListener.java`
- `domain/recruitment/service/GeneralRecruitmentService.java` (MOD)
- `domain/application/service/GeneralLeaderApplicationService.java` (MOD)

- [ ] **Step 1: Event records**

```java
public record RecruitmentOpenedEvent(Long recruitmentId, Long clubId,
                                     String clubName, String recruitmentTitle,
                                     LocalDate endDate) {}
public record InterviewScheduledEvent(Long applicationId, Long userId, String clubName,
                                      OffsetDateTime interviewAt, String interviewLocation) {}
```

- [ ] **Step 2: Listeners**

```java
@Component @RequiredArgsConstructor
public class RecruitmentOpenedListener {
    private final ClubFavoriteRepository favoriteRepository;
    private final NotificationService notificationService;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(RecruitmentOpenedEvent event) {
        String dedupKey = "RECRUITMENT_OPENED:r=" + event.recruitmentId();
        String linkUrl = "/clubs/" + event.clubId() + "/recruitments/" + event.recruitmentId();
        favoriteRepository.findUserIdsByClubId(event.clubId()).forEach(userId ->
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    userId,
                    NotificationType.RECRUITMENT_OPENED,
                    "찜한 " + event.clubName() + "의 새 모집이 시작됐어요",
                    event.recruitmentTitle() + " · 마감 " + event.endDate(),
                    linkUrl,
                    Map.of("recruitmentId", event.recruitmentId(), "clubId", event.clubId()),
                    dedupKey
            )));
    }
}
```

> `ClubFavoriteRepository` 에 `findUserIdsByClubId(Long clubId)` 메서드 추가 (Task 1 의 repo 에 보강 — `@Query("select cf.user.id from ClubFavorite cf where cf.club.id = :clubId")`).

```java
@Component @RequiredArgsConstructor
public class InterviewScheduledListener {
    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(InterviewScheduledEvent event) {
        String iso = event.interviewAt().toString();
        notificationService.createIfAbsent(new CreateNotificationCommand(
                event.userId(),
                NotificationType.INTERVIEW_SCHEDULED,
                event.clubName() + " 면접 일정이 잡혔어요",
                event.interviewAt().format(DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm"))
                        + (event.interviewLocation() == null ? "" : " · " + event.interviewLocation()),
                "/applications/" + event.applicationId(),
                Map.of("applicationId", event.applicationId(), "interviewAt", iso),
                "INTERVIEW_SCHEDULED:a=" + event.applicationId() + ":t=" + iso));
    }
}
```

- [ ] **Step 3: 발행처 — `GeneralRecruitmentService.create()`**

```java
// 기존 create(...) 의 saved 반환 직전:
Recruitment saved = recruitmentRepository.save(recruitment);
if (saved.getStatus() == RecruitmentStatus.OPEN
        && !saved.getStartDate().isAfter(LocalDate.now())) {
    eventPublisher.publishEvent(new RecruitmentOpenedEvent(
            saved.getId(), club.getId(), club.getName(),
            saved.getTitle(), saved.getEndDate()));
}
return saved.getId();
```

- [ ] **Step 4: 발행처 — `GeneralLeaderApplicationService.updateInterview()`**

```java
application.updateInterview(command.interviewAt(), command.interviewLocation());
eventPublisher.publishEvent(new InterviewScheduledEvent(
        application.getId(), application.getUser().getId(),
        application.getRecruitment().getClub().getName(),
        application.getInterviewAt(), application.getInterviewLocation()));
```

> 기존 Phase 2 의 `InterviewNotificationService` Noop 호출은 그대로 유지(다른 채널과 분리). 본 이벤트는 인-앱 notification 전용.

- [ ] **Step 5: Tests**
  - `RecruitmentOpenedEventTest` — `"시작일이 오늘 이전인 OPEN 모집을 생성하면 찜한 모든 유저에게 RECRUITMENT_OPENED 알림이 1개씩 생성된다"`, `"같은 모집에 대해 두 번 이벤트가 발행돼도 알림은 1개만 유지된다(멱등)"`.
  - `InterviewScheduledEventTest` — `"interviewAt 을 PATCH 하면 지원자에게 INTERVIEW_SCHEDULED 알림이 1건 생성된다"`, `"interviewAt 을 변경하면 새 dedup_key 로 새 알림이 생성되고 이전 알림은 그대로 남는다"`.

- [ ] **Step 6:** 그린 → 커밋·PR.

---

## Task 7 — Notification 스케줄러 잡 (Deadline + Reminder)

**Branch:** `feat/{n}-phase3-notification-jobs`

**Files:**
- `domain/notification/job/DeadlineNotificationJob.java`
- `domain/notification/job/InterviewReminderJob.java`
- `domain/notification/config/NotificationJobConfig.java`
- `backend/src/main/resources/application.yml` (MOD — 키 추가, 기본값 false)

- [ ] **Step 1: Config**

```java
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.notification.jobs", name = "enabled", havingValue = "true")
public class NotificationJobConfig {}
```

- [ ] **Step 2: DeadlineNotificationJob**

```java
@Component @RequiredArgsConstructor @Slf4j
public class DeadlineNotificationJob {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubFavoriteRepository favoriteRepository;
    private final NotificationService notificationService;

    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        List<DeadlineRow> rows = recruitmentRepository.findDeadlineNotificationCandidates(today);
        log.info("DeadlineNotificationJob start: candidates={}", rows.size());

        int created = 0;
        for (DeadlineRow row : rows) {
            List<Long> userIds = favoriteRepository.findUserIdsByClubId(row.clubId());
            for (Long userId : userIds) {
                if (row.kind() == DeadlineKind.OPENED) {
                    created += notificationService.createIfAbsent(buildOpenedCommand(userId, row)) ? 1 : 0;
                } else {
                    created += notificationService.createIfAbsent(buildDeadlineCommand(userId, row)) ? 1 : 0;
                }
            }
        }
        log.info("DeadlineNotificationJob done: created={}", created);
    }
    // build* 헬퍼는 dedup_key / title / body 만 다름 — spec §5.3 카피 가이드 참고
}
```

`RecruitmentRepository` 에 메서드 추가:

```java
@Query(value = """
    SELECT r.id AS recruitmentId, r.club_id AS clubId, c.name AS clubName, r.title AS title, r.end_date AS endDate,
           CASE
             WHEN r.start_date = :today              THEN 'OPENED'
             WHEN (r.end_date - :today) IN (3,1,0)   THEN 'DEADLINE'
           END AS kind,
           (r.end_date - :today) AS daysToEnd
      FROM recruitment r JOIN club c ON c.id = r.club_id
     WHERE r.status='OPEN' AND r.deleted_at IS NULL
       AND ( r.start_date = :today OR (r.end_date - :today) IN (3,1,0) )
    """, nativeQuery = true)
List<DeadlineRow> findDeadlineNotificationCandidates(@Param("today") LocalDate today);
```

`DeadlineRow` 는 Spring Data projection interface 또는 record + `@SqlResultSetMapping`. 간단히 interface projection 채택.

- [ ] **Step 3: InterviewReminderJob**

```java
@Component @RequiredArgsConstructor @Slf4j
public class InterviewReminderJob {
    private final ApplicationRepository applicationRepository;
    private final NotificationService notificationService;

    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime windowStart = now.plusHours(23);
        OffsetDateTime windowEnd   = now.plusHours(25);
        var targets = applicationRepository.findInterviewBetween(windowStart, windowEnd);
        int created = 0;
        for (var t : targets) {
            String iso = t.getInterviewAt().toString();
            boolean inserted = notificationService.createIfAbsent(new CreateNotificationCommand(
                    t.getUserId(),
                    NotificationType.INTERVIEW_REMINDER,
                    t.getClubName() + " 면접 하루 전",
                    t.getInterviewAt().format(DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm"))
                            + (t.getInterviewLocation() == null ? "" : " · " + t.getInterviewLocation()),
                    "/applications/" + t.getApplicationId(),
                    Map.of("applicationId", t.getApplicationId(), "interviewAt", iso),
                    "INTERVIEW_REMINDER:a=" + t.getApplicationId() + ":t=" + iso));
            if (inserted) created++;
        }
        log.info("InterviewReminderJob done: created={}", created);
    }
}
```

`ApplicationRepository.findInterviewBetween(...)` 신규 — `interviewAt BETWEEN :start AND :end AND status='INTERVIEW_PENDING' AND deleted_at IS NULL`.

- [ ] **Step 4: application.yml 키 추가**

```yaml
duing:
  notification:
    jobs:
      enabled: ${DUING_NOTIFICATION_JOBS_ENABLED:false}
```

- [ ] **Step 5: 통합 테스트**

```java
@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
class DeadlineNotificationJobTest {
    @Autowired DeadlineNotificationJob job;
    // Fixture Monkey: 찜 2명 × 모집 (D-3 / D-1 / D-0 / 오늘 시작 / 무관) 시드

    @Test @DisplayName("D-3/D-1/D-0 모집을 찜한 유저들에게 RECRUITMENT_DEADLINE 알림이 멱등 생성된다")
    void deadlineFanout() { job.run(); job.run(); /* 두 번 실행해도 row 수 동일 */ }

    @Test @DisplayName("오늘부터 시작하는 OPEN 모집은 RECRUITMENT_OPENED 로 분류된다")
    void openedKind() { /* … */ }
}

@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
class InterviewReminderJobTest {
    @Test @DisplayName("interviewAt 이 23h~25h 윈도 안인 지원에만 INTERVIEW_REMINDER 가 생성된다")
    // + 22h 직전·26h 직후는 제외, 멱등 검증
}
```

- [ ] **Step 6:** `./gradlew test --tests "*Job*"` 그린 → 커밋·PR.

---

## Task 8 — FE 패키지 추가 (types · api · hooks · queryKeys)

**Branch:** `feat/{n}-phase3-fe-packages`

> 페이지 작업(Task 9~11) 의 공통 의존. 가장 먼저 머지.

- [ ] **Step 1: `packages/types/src/favorite.ts`**

```ts
import type { ClubCategory } from './club';

export type FavoriteClub = {
  clubId: number;
  name: string;
  logoUrl: string | null;
  category: ClubCategory;
  division: string | null;
  favoritedAt: string;        // ISO
  openRecruitmentCount: number;
};

export type FavoriteIds = { clubIds: number[] };
```

- [ ] **Step 2: `packages/types/src/draft.ts`**

```ts
export type DraftAnswer = { questionId: number; value: string };

export type ApplicationDraft = {
  exists: boolean;
  answers: DraftAnswer[];
  updatedAt: string | null;
};

export type UpsertDraftPayload = { answers: DraftAnswer[] };
```

- [ ] **Step 3: `packages/types/src/notification.ts`**

```ts
export type NotificationType =
  | 'RECRUITMENT_OPENED'
  | 'RECRUITMENT_DEADLINE'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_REMINDER';

export type Notification = {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};
```

`index.ts` 에서 re-export.

- [ ] **Step 4: `packages/api/src/client.ts`** — 새 메서드 묶음 추가.

```ts
favorites: {
  list: (params: { page?: number; size?: number }) =>
    api.get('me/favorites', { searchParams: params }).json<ApiResponse<PageResponse<FavoriteClub>>>(),
  ids: () => api.get('me/favorites/ids').json<ApiResponse<FavoriteIds>>(),
  add: (clubId: number) => api.post(`me/favorites/${clubId}`).json<ApiResponse<number>>(),
  remove: (clubId: number) => api.delete(`me/favorites/${clubId}`).then(() => undefined),
},
drafts: {
  get:   (recruitmentId: number) => api.get(`recruitments/${recruitmentId}/draft`).json<ApiResponse<ApplicationDraft>>(),
  upsert:(recruitmentId: number, body: UpsertDraftPayload) =>
    api.put(`recruitments/${recruitmentId}/draft`, { json: body }).then(() => undefined),
  remove:(recruitmentId: number) => api.delete(`recruitments/${recruitmentId}/draft`).then(() => undefined),
},
notifications: {
  list: (params: { page?: number; size?: number; unreadOnly?: boolean }) =>
    api.get('me/notifications', { searchParams: params }).json<ApiResponse<PageResponse<Notification>>>(),
  unreadCount: () => api.get('me/notifications/unread-count').json<ApiResponse<{ count: number }>>(),
  read:        (id: number) => api.patch(`me/notifications/${id}/read`).then(() => undefined),
  readAll:     () => api.patch('me/notifications/read-all').then(() => undefined),
},
```

- [ ] **Step 5: `packages/hooks/src/queryKeys.ts`** — 도메인 키 추가.

```ts
export const queryKeys = {
  // ...기존
  favorites: {
    all:  ['favorites'] as const,
    list: (page: number, size: number) => ['favorites', 'list', page, size] as const,
    ids:  ['favorites', 'ids'] as const,
  },
  drafts: {
    one: (recruitmentId: number) => ['drafts', recruitmentId] as const,
  },
  notifications: {
    all:        ['notifications'] as const,
    list:       (unreadOnly: boolean) => ['notifications', 'list', unreadOnly] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
};
```

- [ ] **Step 6: 훅 파일 3개** (`favorites.ts`, `drafts.ts`, `notifications.ts`)

```ts
// favorites.ts
export const useFavoriteListQuery = (page = 0, size = 20) =>
  useQuery({ queryKey: queryKeys.favorites.list(page, size),
             queryFn: () => apiClient.favorites.list({ page, size }).then(r => r.data) });

export const useFavoriteIdsQuery = () =>
  useQuery({ queryKey: queryKeys.favorites.ids,
             queryFn: () => apiClient.favorites.ids().then(r => r.data.clubIds) });

export const useFavoriteToggleMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clubId, currentlyFavorited }: { clubId: number; currentlyFavorited: boolean }) =>
      currentlyFavorited ? apiClient.favorites.remove(clubId) : apiClient.favorites.add(clubId),
    onMutate: async ({ clubId, currentlyFavorited }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.ids });
      const previous = queryClient.getQueryData<number[]>(queryKeys.favorites.ids) ?? [];
      const next = currentlyFavorited ? previous.filter(id => id !== clubId) : [...previous, clubId];
      queryClient.setQueryData(queryKeys.favorites.ids, next);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.favorites.ids, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.all });
    },
  });
};
```

```ts
// drafts.ts
export const useApplicationDraftQuery = (recruitmentId: number) =>
  useQuery({ queryKey: queryKeys.drafts.one(recruitmentId),
             queryFn: () => apiClient.drafts.get(recruitmentId).then(r => r.data) });

export const useApplicationDraftMutation = (recruitmentId: number) =>
  useMutation({
    mutationFn: (payload: UpsertDraftPayload) => apiClient.drafts.upsert(recruitmentId, payload),
  });
```

```ts
// notifications.ts
export const useUnreadCountQuery = (enabled = true) =>
  useQuery({ queryKey: queryKeys.notifications.unreadCount, enabled,
             queryFn: () => apiClient.notifications.unreadCount().then(r => r.data.count),
             staleTime: 30_000, refetchOnWindowFocus: true });

export const useNotificationListQuery = (unreadOnly: boolean) =>
  useInfiniteQuery({
    queryKey: queryKeys.notifications.list(unreadOnly),
    queryFn: ({ pageParam = 0 }) => apiClient.notifications.list({ page: pageParam, size: 20, unreadOnly }).then(r => r.data),
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.page + 1 : undefined,
    initialPageParam: 0,
  });

export const useNotificationReadMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.notifications.read(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
};
export const useNotificationReadAllMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.notifications.readAll(),
    onSettled: () => { qc.invalidateQueries({ queryKey: queryKeys.notifications.all }); },
  });
};
```

- [ ] **Step 7:** lint·typecheck·test 그린 확인 후 커밋·PR.

```bash
pnpm -F @duing/types build && pnpm -F @duing/api build && pnpm -F @duing/hooks build && pnpm -F web typecheck
```

---

## Task 9 — FE: 찜 토글 + /me/favorites + /clubs 목록 하트

**Branch:** `feat/{n}-phase3-favorites-ui`

- [ ] **Step 1: `_components/FavoriteToggleButton.tsx`**

```tsx
'use client';
import { useFavoriteIdsQuery, useFavoriteToggleMutation } from '@duing/hooks';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/_lib/auth';

export function FavoriteToggleButton({ clubId, size = 'md' }: { clubId: number; size?: 'sm' | 'md' }) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const idsQuery = useFavoriteIdsQuery();
  const toggle = useFavoriteToggleMutation();
  const currentlyFavorited = idsQuery.data?.includes(clubId) ?? false;

  const onClick = (event: React.MouseEvent) => {
    event.preventDefault(); event.stopPropagation();
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    toggle.mutate({ clubId, currentlyFavorited });
  };

  // sm: w-8 h-8, md: w-10 h-10 … (Tailwind 클래스)
  return (
    <button onClick={onClick} aria-pressed={currentlyFavorited}
            className={size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'}>
      <HeartIcon filled={currentlyFavorited} />
    </button>
  );
}
```

- [ ] **Step 2: `/clubs/page.tsx`** — 카드 우상단에 토글 마운트.
- [ ] **Step 3: `/clubs/[clubId]/page.tsx`** — 헤더(이름 옆)에 `<FavoriteToggleButton size="md" clubId={clubId} />`.
- [ ] **Step 4: `/me/favorites/page.tsx`** + `_components/FavoriteClubCard.tsx`

```tsx
'use client';
import { useFavoriteListQuery } from '@duing/hooks';

export default function MyFavoritesPage() {
  const favoriteListQuery = useFavoriteListQuery();
  if (favoriteListQuery.isLoading) return <p className="p-6 text-sm">불러오는 중…</p>;
  const favorites = favoriteListQuery.data?.content ?? [];
  if (favorites.length === 0) return <EmptyState ctaHref="/clubs" />;
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-4 text-2xl font-bold">찜한 동아리</h1>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {favorites.map(favorite => <FavoriteClubCard key={favorite.clubId} favorite={favorite} />)}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Test** — `FavoriteToggleButton.test.tsx`
  - 비로그인 상태에서 클릭 시 `router.push('/login?next=...')` 호출.
  - 낙관적 토글: msw 가 500 반환하면 하트가 원상복구.

- [ ] **Step 6:** 로컬 dev 서버에서 수동 확인 (로그인 → /clubs 카드 하트 → /me/favorites 노출). 커밋·PR.

---

## Task 10 — FE: 지원서 자동 임시저장

**Branch:** `feat/{n}-phase3-draft-autosave`

- [ ] **Step 1: 디바운스 훅 분리** — `apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/apply/_hooks/useAutosaveDraft.ts`

```ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { useApplicationDraftMutation, useApplicationDraftQuery } from '@duing/hooks';
import type { DraftAnswer } from '@duing/types';

export function useAutosaveDraft(recruitmentId: number, answers: DraftAnswer[]) {
  const draftQuery = useApplicationDraftQuery(recruitmentId);
  const draftMutation = useApplicationDraftMutation(recruitmentId);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !draftQuery.data) return;
    initialized.current = true; // prefill 은 호출부에서 useEffect 로 폼 상태에 주입
  }, [draftQuery.data]);

  useEffect(() => {
    if (!initialized.current) return;
    const timer = setTimeout(() => {
      draftMutation.mutate({ answers }, { onSuccess: () => setLastSavedAt(new Date()) });
    }, 2000);
    return () => clearTimeout(timer);
  }, [answers, draftMutation]);

  return { prefill: draftQuery.data?.answers ?? null, lastSavedAt, isSaving: draftMutation.isPending };
}
```

- [ ] **Step 2: `apply/page.tsx`** 에서 마운트 시 prefill, 폼 상태 변경 시 hook 호출, 상단에 "마지막 저장 HH:mm:ss" / "저장 중…" 표시.

- [ ] **Step 3: 제출 핸들러** — `apiClient.applications.submit(...)` 성공 후 `queryClient.invalidateQueries(queryKeys.drafts.one(recruitmentId))`. 서버에서 이미 delete 됐으니 `exists:false` 로 갱신됨.

- [ ] **Step 4: 410 처리** — 변이 onError 에서 status 410 이면 토스트 + 폼 readonly 상태로.

- [ ] **Step 5: Test** — `useApplicationDraft.test.tsx`
  - vitest fake timers + msw 로 2초 디바운스 동작(타이핑 → 1.9s skip → 2s flush).
  - 마운트 시 GET 응답을 prefill 함수가 받았는지 확인.

- [ ] **Step 6:** 로컬에서 학생 계정으로 SELF 모집에 입력 → 새로고침 → 답변 유지 확인. 커밋·PR.

---

## Task 11 — FE: 알림 벨 + /notifications

**Branch:** `feat/{n}-phase3-notifications-ui`

- [ ] **Step 1: `_components/NotificationBell.tsx`**

```tsx
'use client';
import { useUnreadCountQuery, useNotificationListQuery, useNotificationReadMutation, useNotificationReadAllMutation } from '@duing/hooks';
import { useAuth } from '@/_lib/auth';
import { useRouter } from 'next/navigation';

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;
  const router = useRouter();
  const unreadCount = useUnreadCountQuery().data ?? 0;
  const list = useNotificationListQuery(false);
  const readMutation = useNotificationReadMutation();
  const readAllMutation = useNotificationReadAllMutation();
  // 드롭다운 토글 상태 + 첫 페이지 5건만 사용

  const onItemClick = (id: number, linkUrl: string | null) => {
    readMutation.mutate(id);
    if (linkUrl) router.push(linkUrl);
  };
  // 마크업 생략
}
```

- [ ] **Step 2: `app/layout.tsx` 헤더에 `<NotificationBell />` 마운트.**

- [ ] **Step 3: `/notifications/page.tsx`**
  - `useNotificationListQuery(unreadOnly)` 무한 스크롤(IntersectionObserver 로 `fetchNextPage`).
  - 시간 묶음(`오늘 / 이번 주 / 이전`).
  - 상단 토글: 전체 / 안 읽음만. "모두 읽음" 버튼.

- [ ] **Step 4: `_components/NotificationItem.tsx`**
  - readAt 이 null 이면 좌측에 점 표시.
  - 클릭 시 `markRead → router.push(linkUrl)`.

- [ ] **Step 5: Tests**
  - `NotificationBell.test.tsx` — 비로그인 시 null, 안 읽음 카운트 배지 렌더, 항목 클릭 시 read API 호출 후 라우팅.
  - `notifications-page.test.tsx` — "모두 읽음" 후 unreadCount 0 으로 동기화.

- [ ] **Step 6:** 로컬 dev 서버에서 시드 알림 한 건 만든 뒤(예: H2 콘솔 또는 테스트 endpoint) 벨 카운트·드롭다운·페이지 확인. 커밋·PR.

---

## Task 12 — 환경설정 / 잡 활성화 / 롤아웃 verification

**Branch:** `chore/{n}-phase3-rollout`

- [ ] **Step 1:** README / `backend/AGENTS.md` 환경변수 표에 추가.

```
DUING_NOTIFICATION_JOBS_ENABLED   기본 false. 운영 활성화 시 true.
```

- [ ] **Step 2:** `application-prod.yml`(또는 운영 설정 위치) 에서 `duing.notification.jobs.enabled: ${DUING_NOTIFICATION_JOBS_ENABLED:true}` 로 설정 — 운영 시크릿/환경변수에서 true 주입.

- [ ] **Step 3:** 운영 배포 후 첫 06:00 KST 잡 실행 로그 확인:
  - `DeadlineNotificationJob start: candidates=N`
  - `DeadlineNotificationJob done: created=M`

- [ ] **Step 4:** Smoke verify (운영 또는 staging)
  - `POST /api/v1/me/favorites/{clubId}` → 200.
  - `GET /api/v1/me/notifications/unread-count` → `{ count }` 반환.
  - 운영진 면접 PATCH → 지원자 계정 헤더 벨 카운트 1 증가.

- [ ] **Step 5:** 모니터링 항목 추가(있다면): notification 생성 카운트, 잡 실패 횟수.

- [ ] **Step 6:** 커밋·PR(문서/yml 만).

---

## Self-Review 결과

**Spec coverage 매핑**

| Spec 섹션 | 구현 Task |
|---|---|
| §2 도메인 구조 | Task 1, 3, 5, 6, 7 |
| §3 V14~V17 마이그레이션 | Task 0, 2, 4 |
| §4.1 Favorite API | Task 1 |
| §4.2 Draft API | Task 3 |
| §4.3 Notification API | Task 5 |
| §5.1 즉시 이벤트(`RECRUITMENT_OPENED`, `INTERVIEW_SCHEDULED`) | Task 6 |
| §5.2 스케줄러(Deadline + Reminder) | Task 7 |
| §5.3 카피 가이드 | Task 6, 7 (헬퍼 구현) |
| §6 프론트 라우트·UI | Task 8, 9, 10, 11 |
| §7 테스트 전략 | 각 Task Step 5/Test |
| §8 롤아웃 순서 | Task 12 + 의존 순서 |

빠진 요구사항 없음.

**Placeholder scan** — TBD/TODO 없음. 모든 step 에 실행 명령 또는 코드 블록 포함.

**Type consistency** — `FavoriteClubResponse`/`FavoriteClubQuery`/`FavoriteClub`(FE) 의 필드명 일치. `Notification.dedupKey` ↔ `dedup_key` 컬럼 매핑. `RecruitmentOpenedEvent` 의 `recruitmentTitle` 은 listener·잡 카피에서 동일 사용. `NotificationType` 4개 값 일치(BE/FE).
