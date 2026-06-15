# 회원 전용 동아리 페이지 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 가입한 동아리의 공지·일정을 한 화면에서 확인하고, 운영진은 같은 화면에서 작성·수정·삭제할 수 있는 회원 전용 페이지(`/clubs/[clubId]/member`)를 구축한다.

**Architecture:** 백엔드는 (1) `GET /clubs/{clubId}/membership` 멤버십 판정 + permissions 응답, (2) 기존 Notice 도메인 재사용 + LEADER/OFFICER 작성용 컨트롤러 신설, (3) ClubEvent 도메인 풀 스택 신설. 프론트는 회원 자격 가드(`MemberAccessGuard`) 가 layout 에서 분기, 공지/일정 탭이 같은 패키지 레이어(`@duing/types`, `@duing/schemas`, `@duing/api`, `@duing/hooks`)를 통해 인라인 작성 모달과 함께 렌더한다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / QueryDSL / RestAssured + TestContainers + Fixture Monkey (backend); Next.js 15 + React 19 / TanStack Query / react-hook-form + zod / ky / Tailwind (frontend).

**Branch / PR 전략 (4 PR 로 분리):**

| PR | 브랜치 | 범위 | Tasks |
|---|---|---|---|
| PR 1 (백엔드) | `feat/be-club-membership-and-notice` | 멤버십 판정 API + LeaderClubNotice CRUD | A1–A9 |
| PR 2 (백엔드) | `feat/be-club-event` | ClubEvent 도메인 풀 스택 | B1–B9 |
| PR 3 (프론트) | `feat/fe-club-member-notice` | 회원 페이지 라우트 + 공지 탭 + 작성 모달 | C1–C10 |
| PR 4 (프론트) | `feat/fe-club-member-event` | 일정 탭 + 작성 모달 | D1–D9 |

각 PR 끝에서 빌드/테스트 그린 + spec PR 체크리스트(`feedback_spec_pr_checklist`) 확인. spec 문서는 `docs/member-only-club-page-spec` 브랜치에 커밋되어 있어 본 plan 의 PR 1 브랜치를 그곳에서 분기한다.

---

## Phase A — PR 1 (백엔드: 멤버십 + LeaderClubNotice)

### Task A1: ClubMembership 응답 DTO 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MyClubMembershipResponse.java`

- [ ] **Step 1: DTO record 작성**

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record MyClubMembershipResponse(
        ClubMemberRole role,
        LocalDateTime joinedAt,
        ClubActionPermissions permissions
) {
    public record ClubActionPermissions(
            boolean canPostNotice,
            boolean canEditNotice,
            boolean canDeleteNotice,
            boolean canPostEvent,
            boolean canEditEvent,
            boolean canDeleteEvent
    ) {
        public static ClubActionPermissions from(ClubMemberRole role) {
            boolean isManager = role == ClubMemberRole.LEADER || role == ClubMemberRole.OFFICER;
            boolean isLeader  = role == ClubMemberRole.LEADER;
            return new ClubActionPermissions(
                    isManager, isManager, isLeader,
                    isManager, isManager, isLeader
            );
        }
    }

    public static MyClubMembershipResponse from(ClubMember member) {
        return new MyClubMembershipResponse(
                member.getRole(),
                member.getCreatedAt(),
                ClubActionPermissions.from(member.getRole())
        );
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/MyClubMembershipResponse.java
git commit -m "feat(backend): 멤버십 판정 응답 DTO 추가"
```

---

### Task A2: ClubAuthService 에 `resolveMembership` 추가 + 컨트롤러·API 작성

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/api/ClubMembershipApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMembershipController.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/exception/ClubMemberException.java` (확인 — 이미 `NotAMember` 존재하는지)

- [ ] **Step 1: `ClubAuthService.resolveMembership` 메서드 추가**

`ClubAuthService.java` 의 `requireMember` 메서드 바로 아래에 추가:

```java
    /** 멤버십 판정 — 클럽 미존재/비-멤버는 NotAMember 로 통일 (가드 응답 일관성). */
    public ClubMember resolveMembership(Long userId, Long clubId) {
        return clubMemberRepository.findByClubIdAndUserId(clubId, userId)
                .orElseThrow(ClubMemberException.NotAMember::new);
    }
```

(기존 `findMembershipOrThrow` 와 시그니처는 같지만 public 노출 + 메서드명만 다름. 컨트롤러에서 직접 호출용.)

- [ ] **Step 2: API 인터페이스 작성**

```java
package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.MyClubMembershipResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 멤버십", description = "본 사용자의 동아리 멤버십·권한 판정 API")
@SecurityRequirement(name = "BearerAuth")
public interface ClubMembershipApi {

    @Operation(summary = "내 동아리 멤버십 조회",
            description = "본 사용자가 해당 동아리의 활성 멤버인지 판정하고, 역할·가입일·도메인별 권한 매트릭스를 반환한다.")
    @GetMapping("/clubs/{clubId}/membership")
    ResponseEntity<ApiResponse<MyClubMembershipResponse>> getMyMembership(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 3: 컨트롤러 작성**

```java
package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.ClubMembershipApi;
import com.duing.domain.clubmember.controller.dto.response.MyClubMembershipResponse;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubMembershipController implements ClubMembershipApi {

    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<MyClubMembershipResponse>> getMyMembership(
            Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ClubMember member = clubAuthService.resolveMembership(currentUser.id(), clubId);
        return ResponseEntity.ok(ApiResponse.success(MyClubMembershipResponse.from(member)));
    }
}
```

- [ ] **Step 4: 컴파일**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/clubmember/api/ClubMembershipApi.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/ClubMembershipController.java \
        backend/src/main/java/com/duing/domain/clubmember/service/ClubAuthService.java
git commit -m "feat(backend): 동아리 멤버십 판정 API 추가"
```

---

### Task A3: ClubMembership 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubmember/ClubMembershipControllerTest.java`

- [ ] **Step 1: 테스트 클래스 작성**

```java
package com.duing.domain.clubmember;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
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
class ClubMembershipControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("테스트동아리",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private void saveMembership(User user, ClubMemberRole role) {
        Club club = clubRepository.findById(clubId).orElseThrow();
        ClubMember member = role == ClubMemberRole.LEADER
                ? ClubMember.asLeader(club, user)
                : ClubMember.of(club, user, role);
        clubMemberRepository.save(member);
    }

    @Test
    @DisplayName("LEADER 가 호출하면 모든 권한이 true 로 응답된다")
    void leader() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.LEADER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.role", equalTo("LEADER"))
                .body("data.permissions.canPostNotice", equalTo(true))
                .body("data.permissions.canEditNotice", equalTo(true))
                .body("data.permissions.canDeleteNotice", equalTo(true))
                .body("data.permissions.canPostEvent", equalTo(true))
                .body("data.permissions.canEditEvent", equalTo(true))
                .body("data.permissions.canDeleteEvent", equalTo(true));
    }

    @Test
    @DisplayName("OFFICER 는 작성·수정 가능, 삭제는 false 로 응답된다")
    void officer() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.OFFICER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.role", equalTo("OFFICER"))
                .body("data.permissions.canPostNotice", equalTo(true))
                .body("data.permissions.canEditNotice", equalTo(true))
                .body("data.permissions.canDeleteNotice", equalTo(false))
                .body("data.permissions.canDeleteEvent", equalTo(false));
    }

    @Test
    @DisplayName("MEMBER 는 모든 작성·수정·삭제가 false 로 응답된다")
    void member() {
        User user = saveUser();
        saveMembership(user, ClubMemberRole.MEMBER);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.role", equalTo("MEMBER"))
                .body("data.permissions.canPostNotice", equalTo(false))
                .body("data.permissions.canEditNotice", equalTo(false))
                .body("data.permissions.canDeleteNotice", equalTo(false));
    }

    @Test
    @DisplayName("비-멤버가 호출하면 404 를 반환한다")
    void nonMember() {
        User outsider = saveUser();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(outsider))
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("미인증 호출은 401 또는 403 (SecurityConfig 정책)")
    void unauthenticated() {
        int actual = RestAssured.given()
                .when().get("/api/v1/clubs/" + clubId + "/membership")
                .then().extract().statusCode();
        assert actual == HttpStatus.UNAUTHORIZED.value() || actual == HttpStatus.FORBIDDEN.value()
                : "expected 401 or 403, got " + actual;
    }
}
```

- [ ] **Step 2: 테스트 실행**

Run: `cd backend && ./gradlew test --tests com.duing.domain.clubmember.ClubMembershipControllerTest`
Expected: 5 PASS

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/clubmember/ClubMembershipControllerTest.java
git commit -m "test(backend): 멤버십 판정 API 통합 테스트"
```

---

### Task A4: LeaderClubNotice Request / Command DTO

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/request/CreateClubNoticeRequest.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/dto/request/UpdateClubNoticeRequest.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/command/CreateClubNoticeCommand.java`
- Create: `backend/src/main/java/com/duing/domain/notice/service/dto/command/UpdateClubNoticeCommand.java`

- [ ] **Step 1: CreateClubNoticeRequest 작성**

```java
package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateClubNoticeRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "요약은 500자 이하여야 합니다.") String summary,
        @NotBlank(message = "본문은 필수 입력값입니다.")
        @Size(max = 20000, message = "본문은 20000자 이하여야 합니다.") String content,
        @Size(max = 500, message = "표지 이미지 URL 은 500자 이하여야 합니다.") String coverImageUrl,
        Boolean pinned,
        LocalDateTime expiresAt
) {
    public CreateClubNoticeCommand toCommand(Long clubId, Long authorId) {
        return new CreateClubNoticeCommand(clubId, authorId, title, summary, content,
                coverImageUrl, pinned != null && pinned, expiresAt);
    }
}
```

- [ ] **Step 2: UpdateClubNoticeRequest 작성**

```java
package com.duing.domain.notice.controller.dto.request;

import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateClubNoticeRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "요약은 500자 이하여야 합니다.") String summary,
        @Size(max = 20000, message = "본문은 20000자 이하여야 합니다.") String content,
        @Size(max = 500, message = "표지 이미지 URL 은 500자 이하여야 합니다.") String coverImageUrl,
        Boolean pinned,
        LocalDateTime expiresAt
) {
    public UpdateClubNoticeCommand toCommand(Long clubId, Long noticeId) {
        return new UpdateClubNoticeCommand(clubId, noticeId, title, summary, content,
                coverImageUrl, pinned, expiresAt);
    }
}
```

- [ ] **Step 3: CreateClubNoticeCommand 작성**

```java
package com.duing.domain.notice.service.dto.command;

import java.time.LocalDateTime;

public record CreateClubNoticeCommand(
        Long clubId,
        Long authorId,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        boolean pinned,
        LocalDateTime expiresAt
) {}
```

- [ ] **Step 4: UpdateClubNoticeCommand 작성**

```java
package com.duing.domain.notice.service.dto.command;

import java.time.LocalDateTime;

public record UpdateClubNoticeCommand(
        Long clubId,
        Long noticeId,
        String title,
        String summary,
        String content,
        String coverImageUrl,
        Boolean pinned,
        LocalDateTime expiresAt
) {}
```

- [ ] **Step 5: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
```

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/notice/controller/dto/request/CreateClubNoticeRequest.java \
        backend/src/main/java/com/duing/domain/notice/controller/dto/request/UpdateClubNoticeRequest.java \
        backend/src/main/java/com/duing/domain/notice/service/dto/command/CreateClubNoticeCommand.java \
        backend/src/main/java/com/duing/domain/notice/service/dto/command/UpdateClubNoticeCommand.java
git commit -m "feat(backend): 클럽 공지 Request/Command DTO 추가"
```

---

### Task A5: NoticeRepositoryCustom 에 `findClubScopedForMember` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryCustom.java`
- Modify: `backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryImpl.java`

- [ ] **Step 1: 인터페이스 메서드 추가**

`NoticeRepositoryCustom.java` 의 마지막 `}` 위에 추가:

```java
    /** 회원 페이지용 — 본 클럽의 CLUB_SCOPED+ALL_MEMBERS 활성 공지를 pinned·createdAt 순으로 페이지 반환. */
    Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable);
```

(필요 시 `import org.springframework.data.domain.Page;` 와 `Pageable` import 도 추가.)

- [ ] **Step 2: 구현체 메서드 추가**

`NoticeRepositoryImpl.java` 의 마지막 `}` 위에 추가:

```java
    @Override
    public Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable) {
        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        BooleanExpression where = notice.visibility.eq(NoticeVisibility.CLUB_SCOPED)
                .and(notice.clubScopeRole.eq(NoticeClubScopeRole.ALL_MEMBERS))
                .and(notice.expiresAt.isNull().or(notice.expiresAt.gt(now)))
                .and(notice.id.in(
                        com.querydsl.jpa.JPAExpressions.select(noticeTargetClub.id.noticeId)
                                .from(noticeTargetClub)
                                .where(noticeTargetClub.id.clubId.eq(clubId))
                ));

        List<Notice> content = queryFactory.selectFrom(notice)
                .where(where)
                .orderBy(notice.pinned.desc(), notice.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory.select(notice.count()).from(notice).where(where).fetchOne();
        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }
```

(필요 import: `org.springframework.data.domain.Page`, `org.springframework.data.domain.Pageable`, `org.springframework.data.domain.PageImpl`, `com.querydsl.core.types.dsl.BooleanExpression`, `com.duing.domain.notice.entity.NoticeClubScopeRole` 등. 이미 import 되어있을 가능성 높음.)

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
```

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryCustom.java \
        backend/src/main/java/com/duing/domain/notice/repository/NoticeRepositoryImpl.java
git commit -m "feat(backend): 클럽 공지 회원 피드 쿼리 추가 (pinned·createdAt 정렬)"
```

---

### Task A6: NoticeService 에 클럽 공지 CRUD + 조회 메서드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/notice/service/NoticeService.java`
- Modify: `backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java`

- [ ] **Step 1: 인터페이스에 4개 메서드 추가**

`NoticeService.java` 의 마지막 `}` 위에 추가:

```java
    /** LEADER/OFFICER 가 본인 클럽 CLUB_SCOPED+ALL_MEMBERS 공지를 생성. */
    Long createForClub(CreateClubNoticeCommand command);

    /** LEADER/OFFICER 가 본인 클럽 공지를 수정. */
    void updateForClub(UpdateClubNoticeCommand command);

    /** LEADER 가 본인 클럽 공지를 삭제 (soft). */
    void deleteForClub(Long clubId, Long noticeId);

    /** 회원이 본 클럽 공지 페이지 조회 (서버 강제 정렬). */
    Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable);
```

Imports 추가:
```java
import com.duing.domain.notice.service.dto.command.CreateClubNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateClubNoticeCommand;
```

- [ ] **Step 2: 구현체에 4개 메서드 추가**

`GeneralNoticeService.java` 마지막 `}` 위에 추가:

```java
    @Override
    @Transactional
    public Long createForClub(CreateClubNoticeCommand command) {
        Notice saved = noticeRepository.save(Notice.create(
                command.title(), command.summary(), command.content(),
                null /* coverImageUrl */, null /* linkUrl */,
                NoticeCategory.GENERAL,
                java.util.List.of() /* tags */,
                NoticeVisibility.CLUB_SCOPED,
                NoticeClubScopeRole.ALL_MEMBERS,
                command.pinned(), command.expiresAt(),
                false /* notifyOnPublish (CLUB_SCOPED → 자동 OFF 유지) */,
                command.authorId()
        ));
        if (command.coverImageUrl() != null && !command.coverImageUrl().isBlank()) {
            validateCoverImageUrl(command.coverImageUrl());
            saved.replaceCoverImageUrl(command.coverImageUrl());
        }
        persistTargetClubs(saved.getId(), java.util.List.of(command.clubId()));
        broadcaster.publish(saved, java.util.List.of(command.clubId()));
        return saved.getId();
    }

    @Override
    @Transactional
    public void updateForClub(UpdateClubNoticeCommand command) {
        Notice found = noticeRepository.findById(command.noticeId())
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        boolean belongsToClub = targetClubRepository.findAllByIdNoticeId(found.getId())
                .stream().anyMatch(t -> t.getClubId().equals(command.clubId()));
        if (!belongsToClub) {
            throw new NoticeException.NoticeAccessDeniedException();
        }
        found.applyClubScopedUpdate(
                command.title(), command.summary(), command.content(),
                command.coverImageUrl(), command.pinned(), command.expiresAt()
        );
    }

    @Override
    @Transactional
    public void deleteForClub(Long clubId, Long noticeId) {
        Notice found = noticeRepository.findById(noticeId)
                .orElseThrow(NoticeException.NoticeNotFoundException::new);
        boolean belongsToClub = targetClubRepository.findAllByIdNoticeId(found.getId())
                .stream().anyMatch(t -> t.getClubId().equals(clubId));
        if (!belongsToClub) {
            throw new NoticeException.NoticeAccessDeniedException();
        }
        noticeRepository.delete(found);
    }

    @Override
    public Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable) {
        return noticeRepository.findClubScopedForMember(clubId, pageable);
    }
```

> **참고:** 위에서 호출한 `Notice.applyClubScopedUpdate(...)` 는 다음 step 에서 엔티티에 추가한다. `validateCoverImageUrl`, `persistTargetClubs`, `broadcaster` 는 기존 `GeneralNoticeService` 의 private 헬퍼/필드(코드 검색으로 확인). `replaceCoverImageUrl` 도 엔티티에 있는지 확인 — 없으면 생성자에서 직접 전달하는 형태로 작성한다 (아래 step 3 참조).

- [ ] **Step 3: Notice 엔티티에 `applyClubScopedUpdate` 헬퍼 추가**

`Notice.java` 의 마지막 `}` 위에 추가:

```java
    /** LEADER/OFFICER 의 CLUB_SCOPED 공지 부분 수정 — null 필드는 건너뛴다. */
    public void applyClubScopedUpdate(String title, String summary, String content,
                                      String coverImageUrl, Boolean pinned,
                                      java.time.LocalDateTime expiresAt) {
        if (title != null) this.title = title;
        if (summary != null) this.summary = summary;
        if (content != null) this.content = content;
        if (coverImageUrl != null) this.coverImageUrl = coverImageUrl;
        if (pinned != null) this.pinned = pinned;
        if (expiresAt != null) this.expiresAt = expiresAt;
    }
```

> 만약 `Notice.create(...)` 의 시그니처가 위 코드와 다르거나 `coverImageUrl` 을 생성자에서 직접 받는다면, `createForClub` 의 `Notice.create(...)` 호출 시 `coverImageUrl` 인수를 직접 전달하고 별도 `replaceCoverImageUrl` 호출을 제거한다. 작업자는 실제 `Notice.create` 시그니처를 읽고 일치시킨다.

- [ ] **Step 4: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
```

(컴파일 에러가 나면 `Notice.create` 시그니처를 확인하고 호출부 조정.)

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/notice/service/NoticeService.java \
        backend/src/main/java/com/duing/domain/notice/service/GeneralNoticeService.java \
        backend/src/main/java/com/duing/domain/notice/entity/Notice.java
git commit -m "feat(backend): NoticeService 클럽 공지 CRUD·조회 메서드 추가"
```

---

### Task A7: LeaderClubNotice API + Controller

**Files:**
- Create: `backend/src/main/java/com/duing/domain/notice/api/LeaderClubNoticeApi.java`
- Create: `backend/src/main/java/com/duing/domain/notice/controller/LeaderClubNoticeController.java`

- [ ] **Step 1: API 인터페이스**

```java
package com.duing.domain.notice.api;

import com.duing.domain.notice.controller.dto.request.CreateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 공지 (회원 페이지)", description = "회원 조회 + LEADER/OFFICER CRUD")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderClubNoticeApi {

    @Operation(summary = "동아리 공지 목록 (회원)")
    @GetMapping("/clubs/{clubId}/notices")
    ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> listForMember(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 생성 (LEADER/OFFICER)")
    @PostMapping("/clubs/{clubId}/notices")
    ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubNoticeRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 수정 (LEADER/OFFICER)")
    @PatchMapping("/clubs/{clubId}/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long noticeId,
            @Valid @RequestBody UpdateClubNoticeRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 공지 삭제 (LEADER 만)")
    @DeleteMapping("/clubs/{clubId}/notices/{noticeId}")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long noticeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: 컨트롤러**

```java
package com.duing.domain.notice.controller;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.notice.api.LeaderClubNoticeApi;
import com.duing.domain.notice.controller.dto.request.CreateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateClubNoticeRequest;
import com.duing.domain.notice.controller.dto.response.NoticeCardResponse;
import com.duing.domain.notice.service.NoticeService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
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
public class LeaderClubNoticeController implements LeaderClubNoticeApi {

    private final NoticeService noticeService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<NoticeCardResponse>>> listForMember(
            Long clubId, int page, int size,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireMember(currentUser.id(), clubId);
        var result = noticeService.findClubScopedForMember(clubId, PageRequest.of(page, size))
                .map(NoticeCardResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(result)));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            Long clubId, CreateClubNoticeRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        Long noticeId = noticeService.createForClub(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(noticeId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            Long clubId, Long noticeId, UpdateClubNoticeRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        noticeService.updateForClub(request.toCommand(clubId, noticeId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            Long clubId, Long noticeId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireLeader(currentUser.id(), clubId);
        noticeService.deleteForClub(clubId, noticeId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
```

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/notice/api/LeaderClubNoticeApi.java \
        backend/src/main/java/com/duing/domain/notice/controller/LeaderClubNoticeController.java
git commit -m "feat(backend): LEADER/OFFICER 클럽 공지 CRUD API 추가"
```

---

### Task A8: LeaderClubNotice 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/LeaderClubNoticeControllerTest.java`

- [ ] **Step 1: 테스트 클래스 작성** — 다음 케이스 포함:

```java
package com.duing.domain.notice;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
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
class LeaderClubNoticeControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("동아리A",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();

        User leader = saveUser();
        User officer = saveUser();
        User member = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Long createNoticeAs(String token, String title) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("title", title, "content", "본문"))
                .when().post("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    @Test
    @DisplayName("LEADER 가 공지를 생성하면 회원 피드에 노출된다")
    void createAndList() {
        Long noticeId = createNoticeAs(leaderToken, "첫 공지");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", greaterThan(0))
                .body("data.content[0].id", equalTo(noticeId.intValue()))
                .body("data.content[0].title", equalTo("첫 공지"));
    }

    @Test
    @DisplayName("OFFICER 가 공지를 수정할 수 있다")
    void officerCanUpdate() {
        Long noticeId = createNoticeAs(leaderToken, "원본");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "수정됨"))
                .when().patch("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("OFFICER 의 삭제 시도는 403 을 반환한다")
    void officerCannotDelete() {
        Long noticeId = createNoticeAs(leaderToken, "삭제 후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().delete("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("LEADER 가 삭제하면 회원 피드에서 사라진다 (soft delete)")
    void leaderCanDelete() {
        Long noticeId = createNoticeAs(leaderToken, "삭제 대상");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(0));
    }

    @Test
    @DisplayName("MEMBER 가 작성 시도하면 403 을 반환한다")
    void memberCannotCreate() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "회원이 작성", "content", "본문"))
                .when().post("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("pinned 공지가 최상단에 나오고 그 다음 createdAt DESC 정렬")
    void pinnedFirstThenCreatedAtDesc() {
        // 1) 평범한 공지 2개
        createNoticeAs(leaderToken, "오래된 공지");
        createNoticeAs(leaderToken, "최신 공지");
        // 2) pinned 공지
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "고정 공지", "content", "본문", "pinned", true))
                .when().post("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].title", equalTo("고정 공지"))
                .body("data.content[1].title", equalTo("최신 공지"))
                .body("data.content[2].title", equalTo("오래된 공지"));
    }
}
```

- [ ] **Step 2: 실행 + 커밋**

```bash
cd backend && ./gradlew test --tests com.duing.domain.notice.LeaderClubNoticeControllerTest
```
Expected: 6 PASS

```bash
git add backend/src/test/java/com/duing/domain/notice/LeaderClubNoticeControllerTest.java
git commit -m "test(backend): LEADER 클럽 공지 CRUD 통합 테스트"
```

---

### Task A9: CLUB_SCOPED 상세 조회 회귀 보호 테스트 + PR A 푸시

**Files:**
- Create: `backend/src/test/java/com/duing/domain/notice/ClubScopedNoticeAccessTest.java`

- [ ] **Step 1: 회귀 테스트 작성**

```java
package com.duing.domain.notice;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
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
class ClubScopedNoticeAccessTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long clubAId;
    private Long clubBId;
    private String clubAMemberToken;
    private String clubBMemberToken;
    private Long noticeOfClubA;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club a = clubRepository.save(Club.create("동아리A", ClubCategory.ACADEMIC, null, "A", null));
        Club b = clubRepository.save(Club.create("동아리B", ClubCategory.ACADEMIC, null, "B", null));
        clubAId = a.getId();
        clubBId = b.getId();

        User leaderA = saveUser();
        User memberA = saveUser();
        User memberB = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(a, leaderA));
        clubMemberRepository.save(ClubMember.of(a, memberA, ClubMemberRole.MEMBER));
        clubMemberRepository.save(ClubMember.of(b, memberB, ClubMemberRole.MEMBER));

        String leaderAToken = jwtTokenProvider.createToken(leaderA.getId(), leaderA.getRole().name());
        clubAMemberToken = jwtTokenProvider.createToken(memberA.getId(), memberA.getRole().name());
        clubBMemberToken = jwtTokenProvider.createToken(memberB.getId(), memberB.getRole().name());

        noticeOfClubA = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderAToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "A 회원만", "content", "본문"))
                .when().post("/api/v1/clubs/" + clubAId + "/notices")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    @Test
    @DisplayName("B동아리 회원이 A동아리 CLUB_SCOPED 공지 상세를 호출하면 403 을 반환한다")
    void crossClubBlocked() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + clubBMemberToken)
                .when().get("/api/v1/notices/" + noticeOfClubA)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("A동아리 회원이 본인 동아리 CLUB_SCOPED 공지 상세를 호출하면 200 을 반환한다")
    void ownClubAllowed() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + clubAMemberToken)
                .when().get("/api/v1/notices/" + noticeOfClubA)
                .then().statusCode(HttpStatus.OK.value());
    }
}
```

- [ ] **Step 2: 전체 테스트**

```bash
cd backend && ./gradlew clean test
```
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋 + 푸시 + PR**

```bash
git add backend/src/test/java/com/duing/domain/notice/ClubScopedNoticeAccessTest.java
git commit -m "test(backend): CLUB_SCOPED 공지 타동아리 접근 차단 회귀 테스트"
git push -u origin feat/be-club-membership-and-notice
```

```bash
gh pr create --base develop --title "feat(backend): 동아리 멤버십 판정 + 회원 공지 CRUD" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원 전용 동아리 페이지의 백엔드 절반: 멤버십 판정 API(`GET /clubs/{clubId}/membership`)와 LEADER/OFFICER 가 본인 동아리에서 작성·수정·삭제할 수 있는 클럽 공지 CRUD(`/clubs/{clubId}/notices`)를 추가했다. 회원 조회 피드는 pinned·createdAt 서버 강제 정렬을 사용한다.

설계·구현 계획 문서도 함께 포함: `docs/superpowers/specs/2026-06-04-member-only-club-page-design.md`, `docs/superpowers/plans/2026-06-04-member-only-club-page.md`.

## 🤔 고민했던 내용
공지를 ClubNotice 신규 도메인으로 분리할지 검토했지만, 기존 Notice 가 이미 CLUB_SCOPED + ALL_MEMBERS 분기를 가지고 있어 컨트롤러와 회원 피드 쿼리만 더하는 쪽으로 결정했다. 권한 정책은 작성/수정 = 운영진(LEADER+OFFICER), 삭제 = 회장(LEADER) 전용으로 분리해 파괴적 행위는 회장 한정으로 묶었다.

멤버십 판정의 404 는 "클럽 없음" 과 "비-멤버" 두 의미를 공유한다. 프론트 가드 입장에서 동일 처리가 되므로 status 를 통일했다.

## 💬 리뷰 중점사항
- `MyClubMembershipResponse.ClubActionPermissions.from(role)` 의 정책 매핑이 의도와 일치하는지 (LEADER → 전부 true, OFFICER → delete false, MEMBER → 전부 false).
- `findClubScopedForMember` 가 pinned DESC, createdAt DESC 를 서버 강제하고 Pageable.sort 를 무시하는지.
- 타 동아리 공지 우회 시도 차단 (`belongsToClub` 검사).
EOF
)"
```

---

## Phase B — PR 2 (백엔드: ClubEvent 도메인)

> 시작 전 PR 1 머지 확인. `git checkout develop && git pull && git checkout -b feat/be-club-event`.

### Task B1: Flyway 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V34__create_club_event.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- club_event: 동아리 일정
CREATE TABLE club_event (
    id           BIGSERIAL    PRIMARY KEY,
    club_id      BIGINT       NOT NULL REFERENCES club(id),
    title        VARCHAR(120) NOT NULL,
    description  TEXT,
    start_at     TIMESTAMP    NOT NULL,
    end_at       TIMESTAMP    NOT NULL,
    location     VARCHAR(200),
    created_by   BIGINT       NOT NULL REFERENCES users(id),
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_club_event_period CHECK (end_at >= start_at)
);

CREATE INDEX idx_club_event_club_start
    ON club_event (club_id, start_at)
    WHERE deleted_at IS NULL;
```

- [ ] **Step 2: 마이그레이션 검증 (애플리케이션 시동)**

```bash
cd backend && ./gradlew compileJava
```
(Flyway 는 다음 테스트 실행 시 자동 적용. 별도 명령 없음.)

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/resources/db/migration/V34__create_club_event.sql
git commit -m "feat(backend): club_event 테이블 마이그레이션 추가"
```

---

### Task B2: ClubEvent 엔티티 + Exception

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubevent/entity/ClubEvent.java`
- Create: `backend/src/main/java/com/duing/domain/clubevent/exception/ClubEventException.java`

- [ ] **Step 1: ClubEvent 엔티티**

```java
package com.duing.domain.clubevent.entity;

import com.duing.domain.clubevent.exception.ClubEventException;
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
@Table(name = "club_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_event SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubEvent extends BaseEntity {

    @Column(name = "club_id", nullable = false) private Long clubId;
    @Column(nullable = false, length = 120)     private String title;
    @Column(columnDefinition = "TEXT")          private String description;
    @Column(name = "start_at", nullable = false) private LocalDateTime startAt;
    @Column(name = "end_at",   nullable = false) private LocalDateTime endAt;
    @Column(length = 200)                       private String location;
    @Column(name = "created_by", nullable = false) private Long createdBy;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubEvent(Long clubId, String title, String description,
                      LocalDateTime startAt, LocalDateTime endAt,
                      String location, Long createdBy) {
        validatePeriod(startAt, endAt);
        validateTitle(title);
        this.clubId = clubId;
        this.title = title.trim();
        this.description = description;
        this.startAt = startAt;
        this.endAt = endAt;
        this.location = location;
        this.createdBy = createdBy;
    }

    public static ClubEvent create(Long clubId, String title, String description,
                                   LocalDateTime startAt, LocalDateTime endAt,
                                   String location, Long createdBy) {
        return ClubEvent.builder()
                .clubId(clubId).title(title).description(description)
                .startAt(startAt).endAt(endAt).location(location).createdBy(createdBy)
                .build();
    }

    public void update(String title, String description,
                       LocalDateTime startAt, LocalDateTime endAt, String location) {
        LocalDateTime nextStart = startAt != null ? startAt : this.startAt;
        LocalDateTime nextEnd   = endAt   != null ? endAt   : this.endAt;
        validatePeriod(nextStart, nextEnd);
        if (title != null) {
            validateTitle(title);
            this.title = title.trim();
        }
        if (description != null) this.description = description;
        if (startAt != null) this.startAt = startAt;
        if (endAt != null) this.endAt = endAt;
        if (location != null) this.location = location;
    }

    private static void validatePeriod(LocalDateTime start, LocalDateTime end) {
        if (start == null || end == null) {
            throw new ClubEventException.InvalidPeriodException();
        }
        if (end.isBefore(start)) {
            throw new ClubEventException.InvalidPeriodException();
        }
    }

    private static void validateTitle(String title) {
        if (title == null || title.trim().isEmpty()) {
            throw new ClubEventException.InvalidTitleException();
        }
    }
}
```

- [ ] **Step 2: Exception 클래스**

```java
package com.duing.domain.clubevent.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubEventException extends ApplicationException {

    protected ClubEventException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ClubEventNotFoundException extends ClubEventException {
        public ClubEventNotFoundException() {
            super("일정을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidPeriodException extends ClubEventException {
        public InvalidPeriodException() {
            super("종료 시각은 시작 시각 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidTitleException extends ClubEventException {
        public InvalidTitleException() {
            super("제목은 공백일 수 없습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidWindowException extends ClubEventException {
        public InvalidWindowException() {
            super("조회 기간은 400일 이내여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class CrossClubAccessException extends ClubEventException {
        public CrossClubAccessException() {
            super("다른 동아리의 일정에 접근할 수 없습니다.", HttpStatus.FORBIDDEN);
        }
    }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
```

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git add backend/src/main/java/com/duing/domain/clubevent/entity/ClubEvent.java \
        backend/src/main/java/com/duing/domain/clubevent/exception/ClubEventException.java
git commit -m "feat(backend): ClubEvent 엔티티 + 예외 정의"
```

---

### Task B3: DTO 묶음 (Request/Response/Command/Query)

**Files:** (모두 신규)
- `backend/src/main/java/com/duing/domain/clubevent/controller/dto/request/CreateClubEventRequest.java`
- `backend/src/main/java/com/duing/domain/clubevent/controller/dto/request/UpdateClubEventRequest.java`
- `backend/src/main/java/com/duing/domain/clubevent/controller/dto/response/ClubEventCardResponse.java`
- `backend/src/main/java/com/duing/domain/clubevent/controller/dto/response/ClubEventDetailResponse.java`
- `backend/src/main/java/com/duing/domain/clubevent/service/dto/command/CreateClubEventCommand.java`
- `backend/src/main/java/com/duing/domain/clubevent/service/dto/command/UpdateClubEventCommand.java`

- [ ] **Step 1: CreateClubEventRequest**

```java
package com.duing.domain.clubevent.controller.dto.request;

import com.duing.domain.clubevent.service.dto.command.CreateClubEventCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateClubEventRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        @NotNull(message = "시작 시각은 필수 입력값입니다.") LocalDateTime startAt,
        @NotNull(message = "종료 시각은 필수 입력값입니다.") LocalDateTime endAt,
        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location
) {
    public CreateClubEventCommand toCommand(Long clubId, Long createdBy) {
        return new CreateClubEventCommand(clubId, createdBy, title, description,
                startAt, endAt, location);
    }
}
```

- [ ] **Step 2: UpdateClubEventRequest**

```java
package com.duing.domain.clubevent.controller.dto.request;

import com.duing.domain.clubevent.service.dto.command.UpdateClubEventCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateClubEventRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location
) {
    public UpdateClubEventCommand toCommand(Long clubId, Long eventId) {
        return new UpdateClubEventCommand(clubId, eventId, title, description,
                startAt, endAt, location);
    }
}
```

- [ ] **Step 3: Response DTOs**

```java
// ClubEventCardResponse.java
package com.duing.domain.clubevent.controller.dto.response;

import com.duing.domain.clubevent.entity.ClubEvent;
import java.time.LocalDateTime;

public record ClubEventCardResponse(
        Long id, String title, LocalDateTime startAt, LocalDateTime endAt, String location
) {
    public static ClubEventCardResponse from(ClubEvent event) {
        return new ClubEventCardResponse(event.getId(), event.getTitle(),
                event.getStartAt(), event.getEndAt(), event.getLocation());
    }
}
```

```java
// ClubEventDetailResponse.java
package com.duing.domain.clubevent.controller.dto.response;

import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;

public record ClubEventDetailResponse(
        Long id, Long clubId, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location,
        CreatorRef createdBy, LocalDateTime createdAt, LocalDateTime updatedAt
) {
    public record CreatorRef(Long id, String name) {}

    public static ClubEventDetailResponse from(ClubEvent event, User creator) {
        return new ClubEventDetailResponse(
                event.getId(), event.getClubId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(), event.getLocation(),
                new CreatorRef(creator.getId(), creator.getName()),
                event.getCreatedAt(), event.getUpdatedAt()
        );
    }
}
```

- [ ] **Step 4: Command DTOs**

```java
// CreateClubEventCommand.java
package com.duing.domain.clubevent.service.dto.command;
import java.time.LocalDateTime;
public record CreateClubEventCommand(
        Long clubId, Long createdBy, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location
) {}
```

```java
// UpdateClubEventCommand.java
package com.duing.domain.clubevent.service.dto.command;
import java.time.LocalDateTime;
public record UpdateClubEventCommand(
        Long clubId, Long eventId, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location
) {}
```

- [ ] **Step 5: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubevent/controller/dto/ \
        backend/src/main/java/com/duing/domain/clubevent/service/dto/
git commit -m "feat(backend): ClubEvent Request/Response/Command DTO 추가"
```

---

### Task B4: ClubEventRepository

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubevent/repository/ClubEventRepository.java`

- [ ] **Step 1: 리포지토리 작성**

```java
package com.duing.domain.clubevent.repository;

import com.duing.domain.clubevent.entity.ClubEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubEventRepository extends JpaRepository<ClubEvent, Long> {

    @Query("""
        SELECT e FROM ClubEvent e
        WHERE e.clubId = :clubId
          AND e.startAt >= :from
          AND e.startAt <= :to
        ORDER BY e.startAt ASC
    """)
    List<ClubEvent> findWindow(@Param("clubId") Long clubId,
                                @Param("from") LocalDateTime from,
                                @Param("to") LocalDateTime to);
}
```

- [ ] **Step 2: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubevent/repository/ClubEventRepository.java
git commit -m "feat(backend): ClubEventRepository 추가"
```

---

### Task B5: ClubEventService

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubevent/service/ClubEventService.java`
- Create: `backend/src/main/java/com/duing/domain/clubevent/service/GeneralClubEventService.java`

- [ ] **Step 1: 인터페이스**

```java
package com.duing.domain.clubevent.service;

import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.domain.clubevent.service.dto.command.CreateClubEventCommand;
import com.duing.domain.clubevent.service.dto.command.UpdateClubEventCommand;
import java.time.LocalDate;
import java.util.List;

public interface ClubEventService {
    Long create(CreateClubEventCommand command);
    void update(UpdateClubEventCommand command);
    void delete(Long clubId, Long eventId);
    List<ClubEventCardResponse> listWindow(Long clubId, LocalDate from, LocalDate to);
    ClubEventDetailResponse getDetail(Long clubId, Long eventId);
}
```

- [ ] **Step 2: 구현체**

```java
package com.duing.domain.clubevent.service;

import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.clubevent.exception.ClubEventException;
import com.duing.domain.clubevent.repository.ClubEventRepository;
import com.duing.domain.clubevent.service.dto.command.CreateClubEventCommand;
import com.duing.domain.clubevent.service.dto.command.UpdateClubEventCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubEventService implements ClubEventService {

    private static final int DEFAULT_PAST_DAYS = 30;
    private static final int DEFAULT_FUTURE_DAYS = 180;
    private static final int MAX_WINDOW_DAYS = 400;

    private final ClubEventRepository eventRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public Long create(CreateClubEventCommand command) {
        ClubEvent event = ClubEvent.create(
                command.clubId(), command.title(), command.description(),
                command.startAt(), command.endAt(), command.location(),
                command.createdBy()
        );
        return eventRepository.save(event).getId();
    }

    @Override
    @Transactional
    public void update(UpdateClubEventCommand command) {
        ClubEvent event = eventRepository.findById(command.eventId())
                .orElseThrow(ClubEventException.ClubEventNotFoundException::new);
        if (!event.getClubId().equals(command.clubId())) {
            throw new ClubEventException.CrossClubAccessException();
        }
        event.update(command.title(), command.description(),
                command.startAt(), command.endAt(), command.location());
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long eventId) {
        ClubEvent event = eventRepository.findById(eventId)
                .orElseThrow(ClubEventException.ClubEventNotFoundException::new);
        if (!event.getClubId().equals(clubId)) {
            throw new ClubEventException.CrossClubAccessException();
        }
        eventRepository.delete(event);
    }

    @Override
    public List<ClubEventCardResponse> listWindow(Long clubId, LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate fromDate = from != null ? from : today.minusDays(DEFAULT_PAST_DAYS);
        LocalDate toDate   = to   != null ? to   : today.plusDays(DEFAULT_FUTURE_DAYS);
        if (toDate.isBefore(fromDate)) {
            throw new ClubEventException.InvalidWindowException();
        }
        if (fromDate.until(toDate).getDays() > MAX_WINDOW_DAYS) {
            throw new ClubEventException.InvalidWindowException();
        }
        LocalDateTime fromTs = fromDate.atStartOfDay();
        LocalDateTime toTs   = toDate.atTime(LocalTime.MAX);
        return eventRepository.findWindow(clubId, fromTs, toTs).stream()
                .map(ClubEventCardResponse::from)
                .toList();
    }

    @Override
    public ClubEventDetailResponse getDetail(Long clubId, Long eventId) {
        ClubEvent event = eventRepository.findById(eventId)
                .orElseThrow(ClubEventException.ClubEventNotFoundException::new);
        if (!event.getClubId().equals(clubId)) {
            throw new ClubEventException.CrossClubAccessException();
        }
        User creator = userRepository.findById(event.getCreatedBy())
                .orElseThrow(() -> new IllegalStateException("event creator missing: " + event.getCreatedBy()));
        return ClubEventDetailResponse.from(event, creator);
    }
}
```

> **윈도우 캡 계산:** `Period.between(from, to).getDays()` 보다 `from.until(to, ChronoUnit.DAYS)` 가 정확. 위 코드를 다음으로 교체:
> ```java
> if (java.time.temporal.ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
>     throw new ClubEventException.InvalidWindowException();
> }
> ```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubevent/service/
git commit -m "feat(backend): ClubEventService 구현 (윈도우 기본값·캡 포함)"
```

---

### Task B6: ClubEvent Read API + Controller (CE-1, CE-2)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubevent/api/ClubEventReadApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubevent/controller/ClubEventReadController.java`

- [ ] **Step 1: API 인터페이스**

```java
package com.duing.domain.clubevent.api;

import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "동아리 일정 (조회)")
@SecurityRequirement(name = "BearerAuth")
public interface ClubEventReadApi {

    @Operation(summary = "동아리 일정 윈도우 조회 (MEMBER+)")
    @GetMapping("/clubs/{clubId}/events")
    ResponseEntity<ApiResponse<List<ClubEventCardResponse>>> listWindow(
            @PathVariable Long clubId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 일정 상세 (MEMBER+)")
    @GetMapping("/clubs/{clubId}/events/{eventId}")
    ResponseEntity<ApiResponse<ClubEventDetailResponse>> getDetail(
            @PathVariable Long clubId,
            @PathVariable Long eventId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: 컨트롤러**

```java
package com.duing.domain.clubevent.controller;

import com.duing.domain.clubevent.api.ClubEventReadApi;
import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.domain.clubevent.service.ClubEventService;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubEventReadController implements ClubEventReadApi {

    private final ClubEventService eventService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<List<ClubEventCardResponse>>> listWindow(
            Long clubId, LocalDate from, LocalDate to,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireMember(currentUser.id(), clubId);
        return ResponseEntity.ok(ApiResponse.success(eventService.listWindow(clubId, from, to)));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubEventDetailResponse>> getDetail(
            Long clubId, Long eventId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireMember(currentUser.id(), clubId);
        return ResponseEntity.ok(ApiResponse.success(eventService.getDetail(clubId, eventId)));
    }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubevent/api/ClubEventReadApi.java \
        backend/src/main/java/com/duing/domain/clubevent/controller/ClubEventReadController.java
git commit -m "feat(backend): ClubEvent 조회 API 추가"
```

---

### Task B7: ClubEvent Write API + Controller (CE-3, CE-4, CE-5)

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubevent/api/ClubEventWriteApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubevent/controller/ClubEventWriteController.java`

- [ ] **Step 1: API 인터페이스**

```java
package com.duing.domain.clubevent.api;

import com.duing.domain.clubevent.controller.dto.request.CreateClubEventRequest;
import com.duing.domain.clubevent.controller.dto.request.UpdateClubEventRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "동아리 일정 (작성/관리)")
@SecurityRequirement(name = "BearerAuth")
public interface ClubEventWriteApi {

    @Operation(summary = "동아리 일정 생성 (LEADER/OFFICER)")
    @PostMapping("/clubs/{clubId}/events")
    ResponseEntity<ApiResponse<Long>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateClubEventRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 일정 수정 (LEADER/OFFICER)")
    @PatchMapping("/clubs/{clubId}/events/{eventId}")
    ResponseEntity<ApiResponse<Void>> update(
            @PathVariable Long clubId,
            @PathVariable Long eventId,
            @Valid @RequestBody UpdateClubEventRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 일정 삭제 (LEADER 만)")
    @DeleteMapping("/clubs/{clubId}/events/{eventId}")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @PathVariable Long eventId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 2: 컨트롤러**

```java
package com.duing.domain.clubevent.controller;

import com.duing.domain.clubevent.api.ClubEventWriteApi;
import com.duing.domain.clubevent.controller.dto.request.CreateClubEventRequest;
import com.duing.domain.clubevent.controller.dto.request.UpdateClubEventRequest;
import com.duing.domain.clubevent.service.ClubEventService;
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
public class ClubEventWriteController implements ClubEventWriteApi {

    private final ClubEventService eventService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<Long>> create(
            Long clubId, CreateClubEventRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        Long eventId = eventService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(eventId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> update(
            Long clubId, Long eventId, UpdateClubEventRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireManager(currentUser.id(), clubId);
        eventService.update(request.toCommand(clubId, eventId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            Long clubId, Long eventId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireLeader(currentUser.id(), clubId);
        eventService.delete(clubId, eventId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubevent/api/ClubEventWriteApi.java \
        backend/src/main/java/com/duing/domain/clubevent/controller/ClubEventWriteController.java
git commit -m "feat(backend): ClubEvent 작성/수정/삭제 API 추가"
```

---

### Task B8: ClubEvent 통합 테스트

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubevent/ClubEventAcceptanceTest.java`

- [ ] **Step 1: 테스트 작성** — 풀 플로우 + 권한 + 윈도우 캡:

```java
package com.duing.domain.clubevent;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
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
class ClubEventAcceptanceTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("동아리E",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();

        User leader = saveUser();
        User officer = saveUser();
        User member = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Long createEventAs(String token, LocalDateTime start, LocalDateTime end) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "정기 모임", "startAt", start.toString(),
                        "endAt", end.toString(), "location", "동아리방"))
                .when().post("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    @Test
    @DisplayName("LEADER 가 일정을 생성하고 회원이 조회한다")
    void createAndList() {
        LocalDateTime start = LocalDateTime.now().plusDays(3).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(2));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].id", equalTo(eventId.intValue()));
    }

    @Test
    @DisplayName("OFFICER 의 삭제 시도는 403 을 반환한다")
    void officerCannotDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().delete("/api/v1/clubs/" + clubId + "/events/" + eventId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("endAt < startAt 이면 400 을 반환한다")
    void invalidPeriod() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "이상한 일정",
                        "startAt", start.toString(),
                        "endAt", start.minusHours(1).toString()))
                .when().post("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("윈도우가 400 일 초과면 400 을 반환한다")
    void windowCap() {
        LocalDate from = LocalDate.now().minusDays(1);
        LocalDate to = LocalDate.now().plusDays(500);
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events?from=" + from + "&to=" + to)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비-멤버가 조회하면 403 을 반환한다")
    void nonMemberForbidden() {
        User outsider = saveUser();
        String outsiderToken = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + outsiderToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("LEADER 가 삭제하면 회원 조회 결과에서 사라진다 (soft delete)")
    void leaderDelete() {
        LocalDateTime start = LocalDateTime.now().plusDays(1).withNano(0);
        Long eventId = createEventAs(leaderToken, start, start.plusHours(1));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/clubs/" + clubId + "/events/" + eventId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/events")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(0));
    }
}
```

- [ ] **Step 2: 실행 + 커밋**

```bash
cd backend && ./gradlew test --tests com.duing.domain.clubevent.ClubEventAcceptanceTest
```
Expected: 6 PASS

```bash
git add backend/src/test/java/com/duing/domain/clubevent/ClubEventAcceptanceTest.java
git commit -m "test(backend): ClubEvent 풀 플로우 통합 테스트"
```

---

### Task B9: 전체 테스트 + PR B 푸시

- [ ] **Step 1: 전체 테스트**

```bash
cd backend && ./gradlew clean test
```
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: 푸시 + PR**

```bash
git push -u origin feat/be-club-event
gh pr create --base develop --title "feat(backend): ClubEvent 도메인 (회원 일정)" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원 전용 동아리 페이지의 일정 탭에 대응하는 ClubEvent 도메인을 풀 스택으로 추가했다. 단일 일정만 지원하며 작성/수정은 운영진, 삭제는 회장만 가능하다. 조회 윈도우는 기본 `today-30d ~ today+180d`, 캡 400일.

## 🤔 고민했던 내용
정기모임을 RRULE 로 표현할지 검토했으나 MVP 단계에서는 단일 일정만 두고 향후 캘린더 통합 단계에서 시리즈 도메인을 도입하기로 했다. `allDay` 플래그도 단순화를 위해 `00:00 ~ 23:59` 로 표현.

윈도우 캡은 1 학기(약 4개월) × 3 의 여유를 둔 400일. 그 이상은 의도된 사용처가 없어 차단.

## 💬 리뷰 중점사항
- `ClubEvent.update` 의 partial 갱신이 `endAt >= startAt` 검증을 새 값 + 기존 값 조합으로 정확히 수행하는지.
- `listWindow` 의 윈도우 기본값/캡 계산 (`ChronoUnit.DAYS.between`).
- 다른 클럽의 이벤트를 path 의 `clubId` 만 바꿔 접근하려는 시도 차단 (`CrossClubAccessException`).
EOF
)"
```

---

## Phase C — PR 3 (프론트: 공지)

> 시작 전 PR 1, 2 머지 확인.  
> `git checkout develop && git pull && git checkout -b feat/fe-club-member-notice`.

### Task C1: 타입 추가 (clubMembership.ts + clubNotice.ts)

**Files:**
- Create: `frontend/packages/types/src/clubMembership.ts`
- Create: `frontend/packages/types/src/clubNotice.ts`
- Modify: `frontend/packages/types/src/index.ts`

- [ ] **Step 1: `clubMembership.ts`**

```ts
export type ClubMembershipRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type ClubActionPermissions = {
  canPostNotice: boolean;
  canEditNotice: boolean;
  canDeleteNotice: boolean;
  canPostEvent: boolean;
  canEditEvent: boolean;
  canDeleteEvent: boolean;
};

export type MyClubMembership = {
  role: ClubMembershipRole;
  joinedAt: string;
  permissions: ClubActionPermissions;
};
```

- [ ] **Step 2: `clubNotice.ts`**

```ts
export type CreateClubNoticePayload = {
  title: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  pinned?: boolean;
  expiresAt?: string;
};

export type UpdateClubNoticePayload = Partial<CreateClubNoticePayload>;
```

- [ ] **Step 3: `index.ts` 에 re-export 추가**

`frontend/packages/types/src/index.ts` 의 마지막에 두 줄 추가:

```ts
export * from './clubMembership';
export * from './clubNotice';
```

- [ ] **Step 4: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/types typecheck
```

```bash
git add frontend/packages/types/src/clubMembership.ts \
        frontend/packages/types/src/clubNotice.ts \
        frontend/packages/types/src/index.ts
git commit -m "feat(frontend): 멤버십·클럽공지 타입 추가"
```

---

### Task C2: zod 스키마 추가

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: 기존 `submitRecertificationRequestSchema` 정의 블록 아래에 추가**

```ts
export const createClubNoticeSchema = z.object({
  title: z
    .string()
    .min(1, '제목은 필수 입력값입니다.')
    .max(120, '제목은 120자 이하여야 합니다.')
    .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
  summary: z.string().max(500, '요약은 500자 이하여야 합니다.').optional().or(z.literal('')),
  content: z
    .string()
    .min(1, '본문은 필수 입력값입니다.')
    .max(20000, '본문은 20000자 이하여야 합니다.'),
  coverImageUrl: z.string().max(500, '이미지 URL 은 500자 이하여야 합니다.').optional().or(z.literal('')),
  pinned: z.boolean().optional(),
  expiresAt: z.string().optional().or(z.literal('')),
});

export type CreateClubNoticeInput = z.infer<typeof createClubNoticeSchema>;

export const updateClubNoticeSchema = createClubNoticeSchema.partial();
export type UpdateClubNoticeInput = z.infer<typeof updateClubNoticeSchema>;
```

- [ ] **Step 2: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/schemas typecheck
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): 클럽 공지 zod 스키마 추가"
```

---

### Task C3: API 클라이언트 메서드 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 타입 import 추가**

`@duing/types` import 블록에 추가:

```ts
  MyClubMembership,
  CreateClubNoticePayload,
  UpdateClubNoticePayload,
```

- [ ] **Step 2: `DuingApiClient` 타입의 top-level 영역(예: `recertificationRequests` 블록 다음)에 추가**

```ts
  clubMembership: {
    get(clubId: number): Promise<MyClubMembership>;
  };
  clubNotices: {
    listForClub(clubId: number, params: { page?: number; size?: number }): Promise<PageResponse<NoticeCardResponse>>;
    create(clubId: number, payload: CreateClubNoticePayload): Promise<number>;
    update(clubId: number, noticeId: number, payload: UpdateClubNoticePayload): Promise<void>;
    remove(clubId: number, noticeId: number): Promise<void>;
  };
```

(필요 시 `PageResponse`, `NoticeCardResponse` 가 이미 import 되어있는지 확인 — 없으면 추가.)

- [ ] **Step 3: `createApiClient` 구현부에 추가**

```ts
    clubMembership: {
      get: (clubId) =>
        jsonOk<MyClubMembership>(http.get(`clubs/${clubId}/membership`)),
    },
    clubNotices: {
      listForClub: (clubId, params) =>
        jsonOk<PageResponse<NoticeCardResponse>>(
          http.get(`clubs/${clubId}/notices`, { searchParams: cleanParams(params) }),
        ),
      create: (clubId, payload) =>
        jsonOk<number>(http.post(`clubs/${clubId}/notices`, { json: payload })),
      update: (clubId, noticeId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/notices/${noticeId}`, { json: payload })),
      remove: (clubId, noticeId) =>
        jsonVoid(http.delete(`clubs/${clubId}/notices/${noticeId}`)),
    },
```

- [ ] **Step 4: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/api typecheck
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): 멤버십·클럽공지 API 클라이언트 메서드 추가"
```

---

### Task C4: 훅 추가 (clubMembership + clubNotices)

**Files:**
- Create: `frontend/packages/hooks/src/clubMembership.ts`
- Create: `frontend/packages/hooks/src/clubNotices.ts`
- Create: `frontend/packages/hooks/src/clubMembershipQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: queryKeys**

```ts
// clubMembershipQueryKeys.ts
export const clubMembershipKeys = {
  all: ['club', 'membership'] as const,
  byClub: (clubId: number) => [...clubMembershipKeys.all, clubId] as const,
};

export const clubNoticeKeys = {
  all: ['club', 'notices'] as const,
  byClub: (clubId: number) => [...clubNoticeKeys.all, clubId] as const,
  list: (clubId: number, page: number, size: number) =>
    [...clubNoticeKeys.byClub(clubId), 'list', { page, size }] as const,
};
```

- [ ] **Step 2: `clubMembership.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { MyClubMembership } from '@duing/types';
import { useApiClient } from './api-context';
import { clubMembershipKeys } from './clubMembershipQueryKeys';

export function useClubMembershipQuery(clubId: number | null) {
  const client = useApiClient();
  const enabled = clubId !== null && Number.isFinite(clubId);
  return useQuery<MyClubMembership>({
    queryKey: clubId === null
      ? clubMembershipKeys.all
      : clubMembershipKeys.byClub(clubId),
    queryFn: () => {
      if (clubId === null) throw new Error('clubId is null but query is enabled');
      return client.clubMembership.get(clubId);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return false;
      return failureCount < 2;
    },
  });
}
```

- [ ] **Step 3: `clubNotices.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateClubNoticePayload, UpdateClubNoticePayload } from '@duing/types';
import { useApiClient } from './api-context';
import { clubNoticeKeys } from './clubMembershipQueryKeys';

export function useClubNoticeListQuery(clubId: number, page = 0, size = 20) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubNoticeKeys.list(clubId, page, size),
    queryFn: () => client.clubNotices.listForClub(clubId, { page, size }),
    staleTime: 30 * 1000,
  });
}

export function useCreateClubNoticeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubNoticePayload) => client.clubNotices.create(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubNoticeKeys.byClub(clubId) });
    },
  });
}

export function useUpdateClubNoticeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noticeId, payload }: { noticeId: number; payload: UpdateClubNoticePayload }) =>
      client.clubNotices.update(clubId, noticeId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubNoticeKeys.byClub(clubId) });
    },
  });
}

export function useRemoveClubNoticeMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: number) => client.clubNotices.remove(clubId, noticeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubNoticeKeys.byClub(clubId) });
    },
  });
}
```

- [ ] **Step 4: `index.ts` 갱신**

기존 re-export 블록들 아래에 추가:

```ts
export { useClubMembershipQuery } from './clubMembership';
export {
  useClubNoticeListQuery,
  useCreateClubNoticeMutation,
  useUpdateClubNoticeMutation,
  useRemoveClubNoticeMutation,
} from './clubNotices';
export { clubMembershipKeys, clubNoticeKeys } from './clubMembershipQueryKeys';
```

- [ ] **Step 5: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/hooks typecheck
git add frontend/packages/hooks/src/clubMembership.ts \
        frontend/packages/hooks/src/clubNotices.ts \
        frontend/packages/hooks/src/clubMembershipQueryKeys.ts \
        frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): 멤버십·클럽공지 훅 추가"
```

---

### Task C5: MemberAccessGuard + MemberPageHeader + layout.tsx

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/MemberAccessGuard.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/MemberPageHeader.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/MembershipContext.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/layout.tsx`

- [ ] **Step 1: MembershipContext**

```tsx
'use client';

import { createContext, useContext } from 'react';
import type { MyClubMembership } from '@duing/types';

const MembershipContext = createContext<MyClubMembership | null>(null);

export function MembershipProvider({
  membership, children,
}: { membership: MyClubMembership; children: React.ReactNode }) {
  return (
    <MembershipContext.Provider value={membership}>{children}</MembershipContext.Provider>
  );
}

export function useMembership(): MyClubMembership {
  const value = useContext(MembershipContext);
  if (!value) throw new Error('useMembership must be used within MembershipProvider');
  return value;
}
```

- [ ] **Step 2: MemberAccessGuard**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClubMembershipQuery } from '@duing/hooks';
import { MembershipProvider } from './MembershipContext';

type Props = { clubId: number; children: React.ReactNode };

export function MemberAccessGuard({ clubId, children }: Props) {
  const router = useRouter();
  const { data, isLoading, isError, error } = useClubMembershipQuery(clubId);

  useEffect(() => {
    if (!isError) return;
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      alert('회원 전용 페이지입니다. 동아리 소개 페이지로 이동합니다.');
      router.replace(`/clubs/${clubId}`);
    }
  }, [isError, error, router, clubId]);

  if (isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }
  if (!data) return null;

  return <MembershipProvider membership={data}>{children}</MembershipProvider>;
}
```

- [ ] **Step 3: MemberPageHeader**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/app/_lib/cn';

type Props = { clubId: number; clubName: string };

export function MemberPageHeader({ clubId, clubName }: Props) {
  const pathname = usePathname();
  const tabs = [
    { href: `/clubs/${clubId}/member/notices`, label: '공지' },
    { href: `/clubs/${clubId}/member/events`,  label: '일정' },
  ];

  return (
    <header className="mx-auto max-w-3xl px-6 pt-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{clubName} 회원 페이지</h1>
        <Link
          href={`/clubs/${clubId}`}
          className="text-sm text-charcoal-2 hover:text-ink"
        >
          ← 동아리 소개 보기
        </Link>
      </div>
      <nav className="flex gap-2 border-b border-line">
        {tabs.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'px-4 py-2 text-sm font-medium',
                active ? 'border-b-2 border-ink text-ink' : 'text-charcoal-3 hover:text-ink',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: layout.tsx**

```tsx
import { use } from 'react';
import type { ReactNode } from 'react';
import { MemberAccessGuard } from './_components/MemberAccessGuard';

export default function ClubMemberLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  if (!Number.isFinite(clubId)) return null;

  return <MemberAccessGuard clubId={clubId}>{children}</MemberAccessGuard>;
}
```

- [ ] **Step 5: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/
git commit -m "feat(frontend): 회원 페이지 가드 + 레이아웃 + 헤더"
```

---

### Task C6: 기본 진입 redirect (`page.tsx`)

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/page.tsx`

- [ ] **Step 1: Server Component redirect**

```tsx
import { redirect } from 'next/navigation';

export default async function MemberRootPage({
  params,
}: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  redirect(`/clubs/${clubId}/member/notices`);
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/page.tsx
git commit -m "feat(frontend): 회원 페이지 기본 진입 redirect"
```

---

### Task C7: 공지 목록 컴포넌트

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/ClubNoticeList.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/ClubNoticeCard.tsx`

- [ ] **Step 1: ClubNoticeCard**

```tsx
'use client';

import Link from 'next/link';
import type { NoticeCardResponse } from '@duing/types';

type Props = {
  clubId: number;
  notice: NoticeCardResponse;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function ClubNoticeCard({ clubId, notice, canEdit, canDelete, onEdit, onDelete }: Props) {
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/clubs/${clubId}/member/notices/${notice.id}`}
          className="flex-1 hover:text-ink"
        >
          <div className="flex items-center gap-2">
            {notice.pinned && (
              <span className="rounded-full bg-warm/20 px-2 py-0.5 text-xs font-semibold text-warm">고정</span>
            )}
            <h3 className="text-base font-semibold text-ink">{notice.title}</h3>
          </div>
          {notice.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-charcoal-2">{notice.summary}</p>
          )}
          <p className="mt-2 text-xs text-charcoal-3">
            {new Date(notice.createdAt).toLocaleString('ko-KR')}
          </p>
        </Link>
        {(canEdit || canDelete) && (
          <div className="flex gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md px-2 py-1 text-xs text-charcoal-3 hover:bg-graysoft"
              >
                수정
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md px-2 py-1 text-xs text-coral hover:bg-rose-50"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: ClubNoticeList**

```tsx
'use client';

import { useState } from 'react';
import { useClubNoticeListQuery, useRemoveClubNoticeMutation } from '@duing/hooks';
import type { NoticeCardResponse } from '@duing/types';
import { useMembership } from './MembershipContext';
import { ClubNoticeCard } from './ClubNoticeCard';
import { ClubNoticeFormModal } from './ClubNoticeFormModal';

type Props = { clubId: number };

export function ClubNoticeList({ clubId }: Props) {
  const { permissions } = useMembership();
  const [page, setPage] = useState(0);
  const { data, isLoading } = useClubNoticeListQuery(clubId, page);
  const removeMutation = useRemoveClubNoticeMutation(clubId);

  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<NoticeCardResponse | null>(null);

  if (isLoading) return <p className="px-6 py-4 text-sm text-charcoal-3">불러오는 중…</p>;

  const notices = data?.content ?? [];

  const onDelete = (noticeId: number) => {
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    removeMutation.mutate(noticeId);
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">공지</h2>
        {permissions.canPostNotice && (
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            공지 작성
          </button>
        )}
      </div>

      {notices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-charcoal-3">
          아직 등록된 공지가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <ClubNoticeCard
              key={notice.id}
              clubId={clubId}
              notice={notice}
              canEdit={permissions.canEditNotice}
              canDelete={permissions.canDeleteNotice}
              onEdit={() => setEditing(notice)}
              onDelete={() => onDelete(notice.id)}
            />
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-line px-3 py-1 text-sm disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-sm text-charcoal-2">
            {page + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            disabled={!data.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-line px-3 py-1 text-sm disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}

      {composeOpen && (
        <ClubNoticeFormModal
          mode="create"
          clubId={clubId}
          onClose={() => setComposeOpen(false)}
        />
      )}
      {editing && (
        <ClubNoticeFormModal
          mode="edit"
          clubId={clubId}
          noticeId={editing.id}
          defaultValues={{
            title: editing.title,
            content: '',
            summary: editing.summary ?? '',
            pinned: editing.pinned,
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
```

> **참고:** 수정 모달은 카드 응답에 `content` 가 없으므로 빈값으로 초기화한다. 실제 운영 정책으로는 상세 조회 후 prefill 하는 게 이상적이나 본 plan 단계에서는 단순화. Out of Scope 에 명시.

- [ ] **Step 3: 컴파일 + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/_components/ClubNoticeCard.tsx \
        frontend/apps/web/app/clubs/\[clubId\]/member/_components/ClubNoticeList.tsx
git commit -m "feat(frontend): 클럽 공지 목록·카드 컴포넌트"
```

---

### Task C8: 공지 작성/수정 모달

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/ClubNoticeFormModal.tsx`

- [ ] **Step 1: 모달 작성**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClubNoticeSchema } from '@duing/schemas';
import type { CreateClubNoticeInput } from '@duing/schemas';
import { useCreateClubNoticeMutation, useUpdateClubNoticeMutation } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';

type CommonProps = { clubId: number; onClose: () => void };

type Props =
  | (CommonProps & { mode: 'create' })
  | (CommonProps & {
      mode: 'edit';
      noticeId: number;
      defaultValues: Partial<CreateClubNoticeInput>;
    });

export function ClubNoticeFormModal(props: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const createMutation = useCreateClubNoticeMutation(props.clubId);
  const updateMutation = useUpdateClubNoticeMutation(props.clubId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateClubNoticeInput>({
    resolver: zodResolver(createClubNoticeSchema),
    defaultValues: props.mode === 'edit' ? props.defaultValues : undefined,
  });

  const titleValue = watch('title') ?? '';
  const contentValue = watch('content') ?? '';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [props]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) props.onClose();
  };

  const onSubmit = (formData: CreateClubNoticeInput) => {
    const payload = {
      title: formData.title.trim(),
      content: formData.content.trim(),
      summary: formData.summary?.trim() || undefined,
      coverImageUrl: formData.coverImageUrl?.trim() || undefined,
      pinned: formData.pinned ?? false,
      expiresAt: formData.expiresAt || undefined,
    };
    if (props.mode === 'create') {
      createMutation.mutate(payload, { onSuccess: () => props.onClose() });
    } else {
      updateMutation.mutate(
        { noticeId: props.noticeId, payload },
        { onSuccess: () => props.onClose() },
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={props.mode === 'create' ? '공지 작성' : '공지 수정'}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-ink">
          {props.mode === 'create' ? '공지 작성' : '공지 수정'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              제목 <span className="text-coral">*</span>
            </label>
            <input
              type="text"
              {...register('title')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none',
                'border-line focus:border-ink focus:ring-1 focus:ring-ink',
                errors.title && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.title ? (
                <p className="text-xs text-coral">{errors.title.message}</p>
              ) : <span />}
              <span className="text-xs text-charcoal-3">{titleValue.length} / 120</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              요약 <span className="text-xs font-normal text-charcoal-3">(선택, 500자)</span>
            </label>
            <input
              type="text"
              {...register('summary')}
              className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              본문 <span className="text-coral">*</span>
            </label>
            <textarea
              rows={8}
              {...register('content')}
              className={cn(
                'w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none',
                'border-line focus:border-ink focus:ring-1 focus:ring-ink',
                errors.content && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.content ? (
                <p className="text-xs text-coral">{errors.content.message}</p>
              ) : <span />}
              <span className="text-xs text-charcoal-3">{contentValue.length} / 20000</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="pinned" type="checkbox" {...register('pinned')} />
            <label htmlFor="pinned" className="text-sm text-charcoal-2">상단 고정</label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={props.onClose}
              className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold text-white',
                'bg-ink hover:bg-ink/90',
                (isSubmitting || isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {isPending ? '저장 중…' : (props.mode === 'create' ? '작성' : '수정')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/_components/ClubNoticeFormModal.tsx
git commit -m "feat(frontend): 클럽 공지 작성/수정 모달"
```

---

### Task C9: notices 탭 페이지 + 상세 페이지

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/notices/page.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/notices/[noticeId]/page.tsx`

- [ ] **Step 1: 목록 페이지**

```tsx
'use client';

import { use } from 'react';
import { useClubDetailQuery } from '@duing/hooks';
import { MemberPageHeader } from '../_components/MemberPageHeader';
import { ClubNoticeList } from '../_components/ClubNoticeList';

export default function ClubMemberNoticesPage({
  params,
}: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const { data: club } = useClubDetailQuery(clubId);

  return (
    <>
      <MemberPageHeader clubId={clubId} clubName={club?.name ?? '동아리'} />
      <ClubNoticeList clubId={clubId} />
    </>
  );
}
```

> `useClubDetailQuery` 가 없으면 기존 클럽 상세 훅(`useClubQuery`, `useClubDetail`) 의 실제 이름을 확인하고 교체. 작업자는 `frontend/packages/hooks/src/clubs.ts` 에서 정확한 이름을 찾는다.

- [ ] **Step 2: 상세 페이지 — 기존 NoticeDetail 재사용**

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useNoticeDetailQuery } from '@duing/hooks';

export default function MemberNoticeDetailPage({
  params,
}: { params: Promise<{ clubId: string; noticeId: string }> }) {
  const { clubId, noticeId: noticeIdParam } = use(params);
  const noticeId = Number(noticeIdParam);
  const { data: notice, isLoading, isError } = useNoticeDetailQuery(noticeId);

  if (isLoading) return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  if (isError || !notice) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-coral">공지를 불러오지 못했습니다.</p>
        <Link href={`/clubs/${clubId}/member/notices`} className="mt-4 inline-block text-sm text-ink">
          ← 목록으로
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/clubs/${clubId}/member/notices`} className="mb-4 inline-block text-sm text-charcoal-2 hover:text-ink">
        ← 목록으로
      </Link>
      <h1 className="text-xl font-bold text-ink">{notice.title}</h1>
      <p className="mt-2 text-xs text-charcoal-3">
        {new Date(notice.createdAt).toLocaleString('ko-KR')}
      </p>
      <div className="mt-6 whitespace-pre-wrap text-sm text-charcoal-2">{notice.content}</div>
    </article>
  );
}
```

> `useNoticeDetailQuery` 의 정확한 이름·시그니처는 `frontend/packages/hooks/src/notices.ts` 에서 확인. 없으면 추가하거나 `client.notices.getDetail(noticeId)` 직접 호출.

- [ ] **Step 3: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/notices/
git commit -m "feat(frontend): 회원 페이지 공지 목록·상세 라우트"
```

---

### Task C10: 전체 빌드 + PR C 푸시

- [ ] **Step 1: 전체 빌드**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm build
```
Expected: 모두 성공

- [ ] **Step 2: 수동 검증 (개발 서버 띄워서)**

```bash
cd frontend && pnpm --filter @duing/web dev
```

검증:
- LEADER 로그인 → `/clubs/{id}/member` 진입 → `/notices` 로 redirect → "공지 작성" 보임 → 작성·수정·삭제 정상.
- OFFICER → "공지 작성" 보임, 카드에 "수정" 만 (삭제 X).
- MEMBER → "공지 작성" 안 보임, 카드에 수정/삭제 모두 안 보임.
- 비-회원 직접 URL 입력 → 공개 페이지로 redirect.

- [ ] **Step 3: 푸시 + PR**

```bash
git push -u origin feat/fe-club-member-notice
gh pr create --base develop --title "feat(frontend): 회원 전용 동아리 페이지 (공지 탭)" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원 전용 동아리 페이지의 첫 절반: 라우트(`/clubs/[clubId]/member`)·가드·헤더·공지 탭을 추가했다. 운영진은 같은 화면에서 공지를 작성·수정할 수 있고, 회장만 삭제 가능하다. 일정 탭은 후속 PR.

## 🤔 고민했던 내용
회원 자격 가드를 Server Component 의 `redirect()` 로 처리할지 고민했지만, 멤버십 판정에 JWT(클라이언트 storage)가 필요해 클라이언트 가드(`MemberAccessGuard`)로 결정했다. 기존 `/manage/clubs/[clubId]/layout.tsx` 의 `ManageShell` 패턴과 일관.

권한 분기는 백엔드의 `permissions` 객체를 그대로 받아 UI 가 boolean 만 보고 분기하도록 했다. 정책 변경 시 백엔드만 손대면 됨.

## 💬 리뷰 중점사항
- 가드 진입 직후 멤버십 404 처리 (`useClubMembershipQuery` retry: false + redirect).
- pinned 정렬이 백엔드 강제이므로 프론트는 받은 순서를 그대로 렌더.
- 수정 모달의 본문 prefill — 카드 응답에 content 가 없어 빈값 시작 (Out of Scope 명시).
EOF
)"
```

---

## Phase D — PR 4 (프론트: 일정)

> 시작 전 PR 3 머지 확인.  
> `git checkout develop && git pull && git checkout -b feat/fe-club-member-event`.

### Task D1: 일정 타입 추가

**Files:**
- Create: `frontend/packages/types/src/clubEvent.ts`
- Modify: `frontend/packages/types/src/index.ts`

- [ ] **Step 1: 타입 작성**

```ts
export type ClubEventCard = {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
};

export type ClubEventCreator = { id: number; name: string };

export type ClubEventDetail = {
  id: number;
  clubId: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  createdBy: ClubEventCreator;
  createdAt: string;
  updatedAt: string;
};

export type CreateClubEventPayload = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
};

export type UpdateClubEventPayload = Partial<CreateClubEventPayload>;

export type ClubEventListParams = {
  from?: string;
  to?: string;
};
```

- [ ] **Step 2: index.ts re-export 추가**

```ts
export * from './clubEvent';
```

- [ ] **Step 3: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/types typecheck
git add frontend/packages/types/src/clubEvent.ts \
        frontend/packages/types/src/index.ts
git commit -m "feat(frontend): ClubEvent 타입 추가"
```

---

### Task D2: 일정 zod 스키마 추가

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: 스키마 추가** (기존 `updateClubNoticeSchema` 아래에)

```ts
export const createClubEventSchema = z.object({
  title: z
    .string()
    .min(1, '제목은 필수 입력값입니다.')
    .max(120, '제목은 120자 이하여야 합니다.')
    .refine((value) => value.trim().length > 0, '공백만으로 이루어진 제목은 입력할 수 없습니다.'),
  description: z.string().max(2000, '설명은 2000자 이하여야 합니다.').optional().or(z.literal('')),
  startAt: z.string().min(1, '시작 시각은 필수입니다.'),
  endAt: z.string().min(1, '종료 시각은 필수입니다.'),
  location: z.string().max(200, '장소는 200자 이하여야 합니다.').optional().or(z.literal('')),
}).refine((data) => new Date(data.endAt) >= new Date(data.startAt), {
  message: '종료 시각은 시작 시각 이후여야 합니다.',
  path: ['endAt'],
});

export type CreateClubEventInput = z.infer<typeof createClubEventSchema>;

export const updateClubEventSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  location: z.string().max(200).optional().or(z.literal('')),
});

export type UpdateClubEventInput = z.infer<typeof updateClubEventSchema>;
```

- [ ] **Step 2: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/schemas typecheck
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): ClubEvent zod 스키마 추가"
```

---

### Task D3: API 클라이언트에 clubEvents 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 타입 import 추가**

```ts
  ClubEventCard,
  ClubEventDetail,
  ClubEventListParams,
  CreateClubEventPayload,
  UpdateClubEventPayload,
```

- [ ] **Step 2: 타입 정의에 추가 (clubNotices 다음)**

```ts
  clubEvents: {
    list(clubId: number, params?: ClubEventListParams): Promise<ClubEventCard[]>;
    get(clubId: number, eventId: number): Promise<ClubEventDetail>;
    create(clubId: number, payload: CreateClubEventPayload): Promise<number>;
    update(clubId: number, eventId: number, payload: UpdateClubEventPayload): Promise<void>;
    remove(clubId: number, eventId: number): Promise<void>;
  };
```

- [ ] **Step 3: 구현부에 추가**

```ts
    clubEvents: {
      list: (clubId, params) =>
        jsonOk<ClubEventCard[]>(
          http.get(`clubs/${clubId}/events`, { searchParams: cleanParams(params ?? {}) }),
        ),
      get: (clubId, eventId) =>
        jsonOk<ClubEventDetail>(http.get(`clubs/${clubId}/events/${eventId}`)),
      create: (clubId, payload) =>
        jsonOk<number>(http.post(`clubs/${clubId}/events`, { json: payload })),
      update: (clubId, eventId, payload) =>
        jsonVoid(http.patch(`clubs/${clubId}/events/${eventId}`, { json: payload })),
      remove: (clubId, eventId) =>
        jsonVoid(http.delete(`clubs/${clubId}/events/${eventId}`)),
    },
```

- [ ] **Step 4: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/api typecheck
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): ClubEvent API 클라이언트 메서드 추가"
```

---

### Task D4: 일정 훅 + queryKeys

**Files:**
- Create: `frontend/packages/hooks/src/clubEvents.ts`
- Create: `frontend/packages/hooks/src/clubEventQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: queryKeys**

```ts
import type { ClubEventListParams } from '@duing/types';

export const clubEventKeys = {
  all: ['club', 'events'] as const,
  byClub: (clubId: number) => [...clubEventKeys.all, clubId] as const,
  list: (clubId: number, params: ClubEventListParams) =>
    [...clubEventKeys.byClub(clubId), 'list', params] as const,
  detail: (clubId: number, eventId: number) =>
    [...clubEventKeys.byClub(clubId), 'detail', eventId] as const,
};
```

- [ ] **Step 2: 훅**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClubEventListParams,
  CreateClubEventPayload,
  UpdateClubEventPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { clubEventKeys } from './clubEventQueryKeys';

export function useClubEventListQuery(clubId: number, params: ClubEventListParams = {}) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubEventKeys.list(clubId, params),
    queryFn: () => client.clubEvents.list(clubId, params),
    staleTime: 30 * 1000,
  });
}

export function useClubEventDetailQuery(clubId: number, eventId: number | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: clubEventKeys.detail(clubId, eventId ?? -1),
    queryFn: () => {
      if (eventId === null) throw new Error('eventId is null');
      return client.clubEvents.get(clubId, eventId);
    },
    enabled: eventId !== null,
  });
}

export function useCreateClubEventMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClubEventPayload) => client.clubEvents.create(clubId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clubEventKeys.byClub(clubId) }),
  });
}

export function useUpdateClubEventMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: number; payload: UpdateClubEventPayload }) =>
      client.clubEvents.update(clubId, eventId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clubEventKeys.byClub(clubId) }),
  });
}

export function useRemoveClubEventMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: number) => client.clubEvents.remove(clubId, eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clubEventKeys.byClub(clubId) }),
  });
}
```

- [ ] **Step 3: index.ts re-export**

```ts
export {
  useClubEventListQuery,
  useClubEventDetailQuery,
  useCreateClubEventMutation,
  useUpdateClubEventMutation,
  useRemoveClubEventMutation,
} from './clubEvents';
export { clubEventKeys } from './clubEventQueryKeys';
```

- [ ] **Step 4: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/hooks typecheck
git add frontend/packages/hooks/src/clubEvents.ts \
        frontend/packages/hooks/src/clubEventQueryKeys.ts \
        frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): ClubEvent 훅 추가"
```

---

### Task D5: ClubEventList + ClubEventCard

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/ClubEventCard.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/ClubEventList.tsx`

- [ ] **Step 1: ClubEventCard**

```tsx
'use client';

import Link from 'next/link';
import type { ClubEventCard as Event } from '@duing/types';

type Props = {
  clubId: number;
  event: Event;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function ClubEventCard({ clubId, event, canEdit, canDelete, onEdit, onDelete }: Props) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/clubs/${clubId}/member/events/${event.id}`} className="flex-1 hover:text-ink">
          <h3 className="text-base font-semibold text-ink">{event.title}</h3>
          <p className="mt-1 text-sm text-charcoal-2">
            {start.toLocaleString('ko-KR')} ~ {end.toLocaleString('ko-KR')}
          </p>
          {event.location && (
            <p className="mt-0.5 text-xs text-charcoal-3">📍 {event.location}</p>
          )}
        </Link>
        {(canEdit || canDelete) && (
          <div className="flex gap-1">
            {canEdit && (
              <button type="button" onClick={onEdit}
                className="rounded-md px-2 py-1 text-xs text-charcoal-3 hover:bg-graysoft">
                수정
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={onDelete}
                className="rounded-md px-2 py-1 text-xs text-coral hover:bg-rose-50">
                삭제
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: ClubEventList**

```tsx
'use client';

import { useState } from 'react';
import { useClubEventListQuery, useRemoveClubEventMutation } from '@duing/hooks';
import type { ClubEventCard as Event } from '@duing/types';
import { useMembership } from './MembershipContext';
import { ClubEventCard } from './ClubEventCard';
import { ClubEventFormModal } from './ClubEventFormModal';

type Props = { clubId: number };

export function ClubEventList({ clubId }: Props) {
  const { permissions } = useMembership();
  const { data: events = [], isLoading } = useClubEventListQuery(clubId);
  const removeMutation = useRemoveClubEventMutation(clubId);

  const [composeOpen, setComposeOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);

  if (isLoading) return <p className="px-6 py-4 text-sm text-charcoal-3">불러오는 중…</p>;

  const onDelete = (eventId: number) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    removeMutation.mutate(eventId);
  };

  return (
    <section className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">일정</h2>
        {permissions.canPostEvent && (
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90"
          >
            일정 추가
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-charcoal-3">
          등록된 일정이 없습니다.
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <ClubEventCard
              key={event.id}
              clubId={clubId}
              event={event}
              canEdit={permissions.canEditEvent}
              canDelete={permissions.canDeleteEvent}
              onEdit={() => setEditing(event)}
              onDelete={() => onDelete(event.id)}
            />
          ))}
        </ul>
      )}

      {composeOpen && (
        <ClubEventFormModal
          mode="create"
          clubId={clubId}
          onClose={() => setComposeOpen(false)}
        />
      )}
      {editing && (
        <ClubEventFormModal
          mode="edit"
          clubId={clubId}
          eventId={editing.id}
          defaultValues={{
            title: editing.title,
            startAt: editing.startAt.slice(0, 16),
            endAt: editing.endAt.slice(0, 16),
            location: editing.location ?? '',
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/_components/ClubEventCard.tsx \
        frontend/apps/web/app/clubs/\[clubId\]/member/_components/ClubEventList.tsx
git commit -m "feat(frontend): ClubEvent 목록·카드 컴포넌트"
```

---

### Task D6: ClubEventFormModal

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/_components/ClubEventFormModal.tsx`

- [ ] **Step 1: 모달 작성**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClubEventSchema } from '@duing/schemas';
import type { CreateClubEventInput } from '@duing/schemas';
import { useCreateClubEventMutation, useUpdateClubEventMutation } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';

type CommonProps = { clubId: number; onClose: () => void };

type Props =
  | (CommonProps & { mode: 'create' })
  | (CommonProps & {
      mode: 'edit';
      eventId: number;
      defaultValues: Partial<CreateClubEventInput>;
    });

export function ClubEventFormModal(props: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const createMutation = useCreateClubEventMutation(props.clubId);
  const updateMutation = useUpdateClubEventMutation(props.clubId);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateClubEventInput>({
    resolver: zodResolver(createClubEventSchema),
    defaultValues: props.mode === 'edit' ? props.defaultValues : undefined,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [props]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) props.onClose();
  };

  const onSubmit = (formData: CreateClubEventInput) => {
    const payload = {
      title: formData.title.trim(),
      description: formData.description?.trim() || undefined,
      startAt: new Date(formData.startAt).toISOString(),
      endAt: new Date(formData.endAt).toISOString(),
      location: formData.location?.trim() || undefined,
    };
    if (props.mode === 'create') {
      createMutation.mutate(payload, { onSuccess: () => props.onClose() });
    } else {
      updateMutation.mutate(
        { eventId: props.eventId, payload },
        { onSuccess: () => props.onClose() },
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={props.mode === 'create' ? '일정 추가' : '일정 수정'}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-ink">
          {props.mode === 'create' ? '일정 추가' : '일정 수정'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              제목 <span className="text-coral">*</span>
            </label>
            <input
              type="text"
              {...register('title')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none',
                'border-line focus:border-ink focus:ring-1 focus:ring-ink',
                errors.title && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            {errors.title && <p className="mt-1 text-xs text-coral">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                시작 <span className="text-coral">*</span>
              </label>
              <input
                type="datetime-local"
                {...register('startAt')}
                className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
              />
              {errors.startAt && <p className="mt-1 text-xs text-coral">{errors.startAt.message}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                종료 <span className="text-coral">*</span>
              </label>
              <input
                type="datetime-local"
                {...register('endAt')}
                className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
              />
              {errors.endAt && <p className="mt-1 text-xs text-coral">{errors.endAt.message}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              장소 <span className="text-xs font-normal text-charcoal-3">(선택)</span>
            </label>
            <input
              type="text"
              {...register('location')}
              className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              설명 <span className="text-xs font-normal text-charcoal-3">(선택)</span>
            </label>
            <textarea
              rows={4}
              {...register('description')}
              className="w-full resize-none rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={props.onClose}
              className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold text-white',
                'bg-ink hover:bg-ink/90',
                (isSubmitting || isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {isPending ? '저장 중…' : (props.mode === 'create' ? '추가' : '수정')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/_components/ClubEventFormModal.tsx
git commit -m "feat(frontend): ClubEvent 작성/수정 모달"
```

---

### Task D7: 일정 탭 페이지 + 상세 페이지

**Files:**
- Create: `frontend/apps/web/app/clubs/[clubId]/member/events/page.tsx`
- Create: `frontend/apps/web/app/clubs/[clubId]/member/events/[eventId]/page.tsx`

- [ ] **Step 1: 목록**

```tsx
'use client';

import { use } from 'react';
import { useClubDetailQuery } from '@duing/hooks';
import { MemberPageHeader } from '../_components/MemberPageHeader';
import { ClubEventList } from '../_components/ClubEventList';

export default function ClubMemberEventsPage({
  params,
}: { params: Promise<{ clubId: string }> }) {
  const { clubId: clubIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const { data: club } = useClubDetailQuery(clubId);

  return (
    <>
      <MemberPageHeader clubId={clubId} clubName={club?.name ?? '동아리'} />
      <ClubEventList clubId={clubId} />
    </>
  );
}
```

- [ ] **Step 2: 상세**

```tsx
'use client';

import { use } from 'react';
import Link from 'next/link';
import { useClubEventDetailQuery } from '@duing/hooks';

export default function ClubMemberEventDetailPage({
  params,
}: { params: Promise<{ clubId: string; eventId: string }> }) {
  const { clubId: clubIdParam, eventId: eventIdParam } = use(params);
  const clubId = Number(clubIdParam);
  const eventId = Number(eventIdParam);
  const { data, isLoading, isError } = useClubEventDetailQuery(clubId, eventId);

  if (isLoading) return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-coral">일정을 불러오지 못했습니다.</p>
        <Link href={`/clubs/${clubId}/member/events`} className="mt-4 inline-block text-sm text-ink">
          ← 목록으로
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/clubs/${clubId}/member/events`} className="mb-4 inline-block text-sm text-charcoal-2 hover:text-ink">
        ← 목록으로
      </Link>
      <h1 className="text-xl font-bold text-ink">{data.title}</h1>
      <p className="mt-2 text-sm text-charcoal-2">
        {new Date(data.startAt).toLocaleString('ko-KR')} ~ {new Date(data.endAt).toLocaleString('ko-KR')}
      </p>
      {data.location && <p className="mt-1 text-sm text-charcoal-3">📍 {data.location}</p>}
      {data.description && (
        <div className="mt-6 whitespace-pre-wrap text-sm text-charcoal-2">{data.description}</div>
      )}
      <p className="mt-8 text-xs text-charcoal-3">작성자 {data.createdBy.name}</p>
    </article>
  );
}
```

- [ ] **Step 3: typecheck + 커밋**

```bash
cd frontend && pnpm --filter @duing/web typecheck
git add frontend/apps/web/app/clubs/\[clubId\]/member/events/
git commit -m "feat(frontend): 회원 페이지 일정 목록·상세 라우트"
```

---

### Task D8: 전체 빌드 + PR D 푸시

- [ ] **Step 1: 전체 빌드**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm build
```
Expected: 모두 성공

- [ ] **Step 2: 수동 검증**

```bash
cd frontend && pnpm --filter @duing/web dev
```

검증:
- LEADER → `/clubs/{id}/member/events` → "일정 추가" 보임 → 작성·수정·삭제.
- OFFICER → 추가/수정 가능, 삭제 비노출.
- MEMBER → 추가 비노출.
- 윈도우 캡: 의도적으로 `?to=2030-12-31` 같은 URL 직접 호출 시 400.

- [ ] **Step 3: 푸시 + PR**

```bash
git push -u origin feat/fe-club-member-event
gh pr create --base develop --title "feat(frontend): 회원 전용 동아리 페이지 (일정 탭)" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원 페이지의 일정 탭을 추가했다. 운영진은 일정 작성/수정 가능, 회장만 삭제 가능. 기본 윈도우는 백엔드 default(`today-30d ~ today+180d`).

## 🤔 고민했던 내용
일정 폼은 `datetime-local` 입력을 사용해 사용자 시간대 그대로 입력받고, submit 시점에 `new Date(value).toISOString()` 으로 변환했다. 종료 < 시작 검증은 zod refine 으로 클라이언트에서 즉시 차단.

## 💬 리뷰 중점사항
- `datetime-local` ↔ ISO 변환 정확성 (사용자 로컬 시간 → UTC ISO).
- 윈도우 기본값에 의존하는 첫 진입 — 향후 "더 보기" 옵션 추가 시 윈도우 파라미터 통합 지점을 잘 잡아둠.
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- §1 멤버십 판정 API → A1·A2·A3
- §2 LeaderClubNotice + 회원 조회 → A4·A5·A6·A7·A8
- §2.4 CLUB_SCOPED 상세 회귀 → A9
- §3 ClubEvent 도메인 → B1~B8
- §4.1 라우트 구조 + 가드 → C5·C6·D7
- §4.2 패키지 레이어 → C1·C2·C3·C4·D1·D2·D3·D4
- §4.4 운영진 인라인 작성 → C8·D6
- §4.5 윈도우 정책 → B5·D5·D7
- §5 에러 처리 → 각 mutation/query 의 retry/onError + 모달 분기
- §6 테스트 전략 → A3·A8·A9·B8

빠진 spec 요구사항 없음.

**2. Placeholder scan:** "TBD"/"TODO"/"적절히 처리" 없음. 코드 블록 전체 제공. 한 곳에 명시적 책임 위임이 있음 (Task C7 의 수정 모달 본문 빈값 시작 — Out of Scope 명시되어 의도적).

**3. Type consistency:**
- 백엔드 `MyClubMembershipResponse` ↔ 프론트 `MyClubMembership` 필드 명세 일치.
- `ClubActionPermissions` 의 6개 boolean 키 — 백엔드·프론트·UI 모두 동일.
- `ClubEvent*` 응답 필드 ↔ `ClubEventCard`/`ClubEventDetail` 일치.
- `LeaderClubNoticeApi.listForMember` ↔ `client.clubNotices.listForClub` 시그니처 일치.
- queryKey 팩토리 이름 (`clubMembershipKeys`, `clubNoticeKeys`, `clubEventKeys`) 일관.

이상 없음. 작업자가 task 를 순서대로 실행하면 코드가 빌드되고 테스트가 통과한다.
