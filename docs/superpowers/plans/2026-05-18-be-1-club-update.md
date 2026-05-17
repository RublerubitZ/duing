# BE-1: PATCH /api/v1/clubs/{clubId} 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER 가 자기 동아리의 기본 정보(이름·카테고리·분류·소개·로고·커버·태그·SNS·FAQ)를 부분 수정할 수 있는 PATCH API 를 추가한다.

**Architecture:** `ClubApi` 인터페이스에 `PATCH /api/v1/clubs/{clubId}` 추가 → `ClubController.updateClub()` 위임 → `ClubService.update(UpdateClubCommand)` → `Club` 엔티티의 신규 `update(...)` 메서드가 null-skip 부분 갱신. 권한은 기존 `ClubAuthService.requireLeader(userId, clubId)` 재사용. name unique 충돌은 기존 `ClubException.DuplicateClubNameException` 재사용.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA(Hibernate 6) / PostgreSQL(TestContainers) / RestAssured / Bean Validation

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.1, §5

---

## File Map

**Create**
- `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java` — Bean Validation 적용된 PATCH 요청 record + `toCommand(Long clubId, Long requesterId)`.
- `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java` — 서비스 계층 입력 record. 모든 필드 nullable (부분 갱신용).
- `backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java` — name 중복·부분 갱신·없는 club 검증.
- `backend/src/test/java/com/duing/domain/club/controller/ClubUpdateControllerTest.java` — LEADER 200, OFFICER/MEMBER/익명 403/401, name 충돌 409, 검증 실패 400.

**Modify**
- `backend/src/main/java/com/duing/domain/club/entity/Club.java` — `update(...)` 부분 갱신 메서드 추가.
- `backend/src/main/java/com/duing/domain/club/api/ClubApi.java` — `updateClub(...)` 시그니처 추가.
- `backend/src/main/java/com/duing/domain/club/controller/ClubController.java` — `updateClub(...)` 구현.
- `backend/src/main/java/com/duing/domain/club/service/ClubService.java` — `update(UpdateClubCommand)` 인터페이스 메서드 추가.
- `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` — `update(...)` 구현 (권한 검증 + 엔티티 위임).

**없음**
- 신규 마이그레이션 (V8 에서 컬럼 모두 존재).
- 신규 예외 (`DuplicateClubNameException`, `ClubNotFoundException`, `AccessDeniedException` 모두 재사용).

---

## Task 1: 브랜치 생성

- [ ] **Step 1: 최신 develop 동기화**

```bash
git checkout develop
git pull origin develop
```

- [ ] **Step 2: 작업 브랜치 분기**

```bash
git checkout -b feat/be-1-club-update
```

(이슈 번호는 분기 후 GitHub 이슈 등록되면 브랜치명 `feat/{번호}-be-club-update` 로 rename. 단독 작업이면 위 이름 유지.)

---

## Task 2: Club 엔티티에 update() 메서드 추가 (entity 단위 테스트 우선)

**Files:**
- Test: `backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java` (NEW):

```java
package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubUpdateTest {

    @Test
    @DisplayName("update 는 null 이 아닌 필드만 부분 갱신한다")
    void updatesOnlyNonNullFields() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "원본 설명", "https://logo");

        club.update(
                "두잉 NEW",
                null,
                null,
                null,
                null,
                "https://cover",
                List.of("코딩", "스터디"),
                List.of(new ClubSnsLink("INSTAGRAM", "https://insta")),
                List.of(new ClubFaq("Q1", "A1", 0))
        );

        assertThat(club.getName()).isEqualTo("두잉 NEW");
        assertThat(club.getCategory()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(club.getDivision()).isEqualTo("중앙");
        assertThat(club.getDescription()).isEqualTo("원본 설명");
        assertThat(club.getLogoUrl()).isEqualTo("https://logo");
        assertThat(club.getCoverUrl()).isEqualTo("https://cover");
        assertThat(club.getTags()).containsExactly("코딩", "스터디");
        assertThat(club.getSnsLinks()).hasSize(1);
        assertThat(club.getFaqs()).hasSize(1);
    }

    @Test
    @DisplayName("update 는 모든 인자가 null 이면 기존 값을 유지한다")
    void keepsExistingValuesWhenAllArgsNull() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "설명", "https://logo");

        club.update(null, null, null, null, null, null, null, null, null);

        assertThat(club.getName()).isEqualTo("두잉");
        assertThat(club.getCategory()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(club.getTags()).isEmpty();
        assertThat(club.getSnsLinks()).isEmpty();
        assertThat(club.getFaqs()).isEmpty();
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.club.entity.ClubUpdateTest"
```

Expected: 컴파일 실패 (`Club.update` 미정의).

- [ ] **Step 3: Club#update 구현**

`backend/src/main/java/com/duing/domain/club/entity/Club.java` 의 `changeStatus(...)` 메서드 바로 아래에 추가:

```java
public void update(
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs
) {
    if (name != null) this.name = name;
    if (category != null) this.category = category;
    if (division != null) this.division = division;
    if (description != null) this.description = description;
    if (logoUrl != null) this.logoUrl = logoUrl;
    if (coverUrl != null) this.coverUrl = coverUrl;
    if (tags != null) this.tags = tags.toArray(new String[0]);
    if (snsLinks != null) this.snsLinks = new ArrayList<>(snsLinks);
    if (faqs != null) this.faqs = new ArrayList<>(faqs);
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.club.entity.ClubUpdateTest"
```

Expected: 2 tests, PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/entity/Club.java \
        backend/src/test/java/com/duing/domain/club/entity/ClubUpdateTest.java
git commit -m "[#BE-1] Club 엔티티 부분 갱신 update() 메서드 추가"
```

---

## Task 3: Command/Request DTO 추가

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`

- [ ] **Step 1: UpdateClubCommand 작성**

```java
package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import java.util.List;

public record UpdateClubCommand(
        Long clubId,
        Long requesterId,
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs
) {}
```

- [ ] **Step 2: UpdateClubRequest 작성 (Bean Validation 적용)**

```java
package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;

public record UpdateClubRequest(
        @Size(min = 1, max = 100, message = "동아리 이름은 1~100자여야 합니다.")
        String name,

        ClubCategory category,

        @Size(max = 50, message = "분류는 50자 이하여야 합니다.")
        String division,

        String description,

        @Size(max = 500, message = "로고 URL은 500자 이하여야 합니다.")
        String logoUrl,

        @Size(max = 500, message = "커버 URL은 500자 이하여야 합니다.")
        String coverUrl,

        @Size(max = 20, message = "태그는 최대 20개까지 가능합니다.")
        List<@Size(min = 1, max = 20, message = "각 태그는 1~20자여야 합니다.") String> tags,

        @Size(max = 10, message = "SNS 링크는 최대 10개까지 가능합니다.")
        List<@Valid ClubSnsLink> snsLinks,

        @Size(max = 20, message = "FAQ는 최대 20개까지 가능합니다.")
        List<@Valid ClubFaq> faqs
) {
    public UpdateClubCommand toCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(
                clubId, requesterId,
                name, category, division, description,
                logoUrl, coverUrl, tags, snsLinks, faqs
        );
    }
}
```

- [ ] **Step 3: 컴파일 확인**

```bash
./gradlew compileJava compileTestJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java \
        backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java
git commit -m "[#BE-1] 동아리 정보 수정 Command/Request DTO 추가"
```

---

## Task 4: Service.update() 추가 + 통합 테스트

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/ClubService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`
- Create: `backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java` (NEW):

```java
package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubUpdateServiceTest {

    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    @Test
    @DisplayName("LEADER 가 호출하면 name 과 tags 만 부분 갱신된다")
    void leaderUpdatesPartialFields() throws Exception {
        User leader = saveUser("리더원");
        Club club = saveActiveClub("두잉업데이트1");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                "두잉업데이트1-NEW", null, null, null, null, null,
                List.of("코딩"), null, null
        ));

        Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo("두잉업데이트1-NEW");
        assertThat(reloaded.getTags()).containsExactly("코딩");
        assertThat(reloaded.getDivision()).isEqualTo("분과");
    }

    @Test
    @DisplayName("LEADER 가 아닌 사용자가 호출하면 AccessDenied 가 발생한다")
    void nonLeaderIsRejected() throws Exception {
        User stranger = saveUser("외부인");
        Club club = saveActiveClub("두잉업데이트2");

        assertThatThrownBy(() -> clubService.update(new UpdateClubCommand(
                club.getId(), stranger.getId(),
                "변경시도", null, null, null, null, null, null, null, null
        ))).isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("이미 존재하는 이름으로 변경하면 DuplicateClubNameException 이 발생한다")
    void duplicateNameThrows() throws Exception {
        User leader = saveUser("리더둘");
        Club club = saveActiveClub("두잉업데이트3");
        Club other = saveActiveClub("점유된이름");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        assertThatThrownBy(() -> clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                other.getName(), null, null, null, null, null, null, null, null
        ))).isInstanceOf(ClubException.DuplicateClubNameException.class);
    }

    @Test
    @DisplayName("자신의 현재 이름으로 갱신하는 것은 중복으로 보지 않는다")
    void sameNameUpdateIsAllowed() throws Exception {
        User leader = saveUser("리더셋");
        Club club = saveActiveClub("두잉업데이트4");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                club.getName(), null, null, null, null, null, null, null, null
        ));

        assertThat(clubRepository.findById(club.getId()).orElseThrow().getName())
                .isEqualTo(club.getName());
    }

    private User saveUser(String name) {
        long unique = System.nanoTime();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + System.nanoTime();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", "https://logo");
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.club.service.ClubUpdateServiceTest"
```

Expected: 컴파일 실패 (`ClubService.update` 미정의).

- [ ] **Step 3: ClubService 인터페이스에 메서드 추가**

`backend/src/main/java/com/duing/domain/club/service/ClubService.java` 에 import 추가 후 메서드 한 줄 추가:

```java
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
```

```java
void update(UpdateClubCommand updateClubCommand);
```

`updateStatus(...)` 위에 배치.

- [ ] **Step 4: GeneralClubService 에 구현 추가**

`backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java`:

import 추가:

```java
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.clubmember.service.ClubAuthService;
```

생성자 의존성 추가 (`@RequiredArgsConstructor` 라 필드만):

```java
    private final ClubAuthService clubAuthService;
```

(필드 그룹 마지막에 추가. `clubPhotoRepository` 아래.)

`update` 메서드를 `getById` 와 `updateStatus` 사이에 추가:

```java
    @Override
    @Transactional
    public void update(UpdateClubCommand updateClubCommand) {
        clubAuthService.requireLeader(updateClubCommand.requesterId(), updateClubCommand.clubId());

        Club club = clubRepository.findById(updateClubCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        String newName = updateClubCommand.name();
        if (newName != null && !newName.equals(club.getName())
                && clubRepository.existsByName(newName)) {
            throw new ClubException.DuplicateClubNameException();
        }

        club.update(
                newName,
                updateClubCommand.category(),
                updateClubCommand.division(),
                updateClubCommand.description(),
                updateClubCommand.logoUrl(),
                updateClubCommand.coverUrl(),
                updateClubCommand.tags(),
                updateClubCommand.snsLinks(),
                updateClubCommand.faqs()
        );
    }
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
./gradlew test --tests "com.duing.domain.club.service.ClubUpdateServiceTest"
```

Expected: 4 tests, PASS.

- [ ] **Step 6: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/ClubService.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java \
        backend/src/test/java/com/duing/domain/club/service/ClubUpdateServiceTest.java
git commit -m "[#BE-1] 동아리 정보 수정 Service 추가"
```

---

## Task 5: ClubApi 인터페이스 + Controller 핸들러 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/ClubApi.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/ClubController.java`

- [ ] **Step 1: ClubApi 에 PATCH 시그니처 추가**

import 추가:

```java
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.global.auth.UserPrincipal;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
```

`getClub(...)` 메서드 아래에 추가:

```java
    @Operation(summary = "동아리 정보 수정 (LEADER)",
            description = "본인이 LEADER 인 동아리의 기본 정보를 부분 수정한다. null/미포함 필드는 변경되지 않는다.")
    @SecurityRequirement(name = "bearerAuth")
    @PatchMapping("/clubs/{clubId}")
    ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```

- [ ] **Step 2: ClubController 에 구현 추가**

import 추가:

```java
import com.duing.domain.club.controller.dto.request.UpdateClubRequest;
import com.duing.global.auth.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
```

`getClub` 아래에 추가:

```java
    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubRequest updateClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubService.update(updateClubRequest.toCommand(clubId, currentUser.id()));
        ClubDetailResponse response = ClubDetailResponse.from(clubService.getById(clubId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
```

- [ ] **Step 3: 컴파일 확인**

```bash
./gradlew compileJava
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/api/ClubApi.java \
        backend/src/main/java/com/duing/domain/club/controller/ClubController.java
git commit -m "[#BE-1] PATCH /clubs/{clubId} API/Controller 추가"
```

---

## Task 6: Controller 통합 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/controller/ClubUpdateControllerTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.domain.club.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ClubUpdateControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User memberUser;
    private User strangerUser;
    private Club club;
    private String leaderToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("리더");
        memberUser = saveUser("일반");
        strangerUser = saveUser("외부인");
        club = saveActiveClub("두잉PATCH");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("LEADER 가 호출하면 200 과 변경된 동아리 상세를 반환한다")
    void leaderUpdatesSuccessfully() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", club.getName() + "-수정", "coverUrl", "https://cover"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.name", equalTo(club.getName() + "-수정"))
                    .body("data.coverUrl", equalTo("https://cover"));

        Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo(club.getName() + "-수정");
    }

    @Test
    @DisplayName("MEMBER 가 호출하면 403 을 반환한다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "시도"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버가 호출하면 403 을 반환한다 (NotAMember)")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "시도"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 호출하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", "시도"))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
    }

    @Test
    @DisplayName("이미 존재하는 이름으로 변경하면 409 를 반환한다")
    void duplicateNameReturns409() throws Exception {
        Club other = saveActiveClub("기존이름");
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", other.getName()))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.CONFLICT.value())
                    .body("ok", equalTo(false));
    }

    @Test
    @DisplayName("이름이 101자 이상이면 400 을 반환한다")
    void nameTooLongReturns400() {
        String tooLong = "a".repeat(101);
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("name", tooLong))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("tags 가 21개면 400 을 반환한다")
    void tooManyTagsReturns400() {
        String[] tooMany = new String[21];
        for (int i = 0; i < 21; i++) tooMany[i] = "t" + i;
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(Map.of("tags", tooMany))
                .when()
                    .patch("/api/v1/clubs/{clubId}", club.getId())
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", "https://logo");
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 테스트 실행 (모두 PASS 기대)**

```bash
./gradlew test --tests "com.duing.domain.club.controller.ClubUpdateControllerTest"
```

Expected: 7 tests, PASS.

만약 `name TooLong` / `tooManyTags` 가 400 이 아니라 다른 코드로 떨어지면 `@Valid` 가 인터페이스/구현 어디 한쪽에만 붙은 케이스 — Controller `updateClub` 메서드 파라미터의 `@Valid` 가 누락되지 않았는지 재확인. 인터페이스에만 붙여서는 일부 환경에서 검증이 안 도는 사례가 있어 **구현 메서드에도** `@Valid` 를 함께 둔다 (Task 5 Step 2 의 코드는 이미 그렇게 적혀 있음).

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/club/controller/ClubUpdateControllerTest.java
git commit -m "[#BE-1] PATCH /clubs/{clubId} 컨트롤러 통합 테스트 추가"
```

---

## Task 7: 전체 회귀 검증 + 푸시 + PR

- [ ] **Step 1: 전체 테스트 실행**

```bash
./gradlew test
```

Expected: BUILD SUCCESSFUL, 0 실패. 새 코드가 기존 `ClubDetailResponse.from` 등에 영향 없는지 함께 검증된다.

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/be-1-club-update
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "[BE-1] 동아리 정보 수정 API (PATCH /clubs/{clubId})" --body "$(cat <<'EOF'
## 🚀 작업 내용
LEADER 가 자기 동아리의 이름·카테고리·분류·소개·로고·커버·태그·SNS·FAQ 를 부분 수정할 수 있도록 `PATCH /api/v1/clubs/{clubId}` 를 추가했다. 요청 본문에서 null/미포함 필드는 변경되지 않으며, name 변경 시 다른 동아리와의 중복은 409 로 차단한다.

## 🤔 고민했던 내용
부분 갱신은 엔티티 메서드(`Club#update`) 에서 null-skip 으로 처리해 서비스 코드가 분기 없이 한 번에 위임하게 했다. 같은 이름으로 자기 자신을 갱신하는 케이스는 중복 검사에서 제외해, "내용은 그대로 두고 다른 필드만 바꾸는" 흔한 케이스에서 false-positive 충돌이 나지 않게 한다. 권한은 기존 `ClubAuthService.requireLeader` 를 그대로 재사용해 가드 일관성을 유지했다.

## 💬 리뷰 중점사항
- 부분 갱신 시 빈 배열(`[]`) 과 미포함(`null`) 을 의도대로 구분하는지 (빈 배열이면 컬렉션을 비움, null 이면 유지)
- 검증 메시지 한국어 문구
- name 중복 검사 타이밍 (동시성 한계는 unique index 가 최종 보증)
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] 스펙 §3.1 의 모든 필드(name/category/division/description/logoUrl/coverUrl/tags/snsLinks/faqs) 가 Request·Command·Entity 메서드에 모두 존재한다.
- [ ] 스펙 §3.1 의 검증 규칙(name 1~100, tags ≤ 20 / 각 1~20, snsLinks ≤ 10, faqs ≤ 20) 이 `UpdateClubRequest` 에 반영돼 있다.
- [ ] 스펙 §5 의 매핑 중 `CLUB_NAME_DUPLICATED` 가 기존 `DuplicateClubNameException` 으로 충족된다 (별도 클래스 신설 안 함). `InvalidClubFieldException` 은 본 PR 범위에서 Bean Validation 으로 대체되므로 생성하지 않는다.
- [ ] 권한 가드(LEADER 아님 → 403, 비멤버 → 403, 미인증 → 4xx) 테스트가 모두 있다.
- [ ] 새 마이그레이션 파일을 만들지 않았다 (V8 까지로 충분).
- [ ] 커밋 메시지에 Claude 어트리뷰션 라인이 없다.

---

## Out of Scope (본 PR 에서 다루지 않음)

- `InvalidClubFieldException` 신설 — 본 PR 의 검증은 Bean Validation 메시지로 충분. 향후 도메인 로직 기반 검증이 추가될 때 도입.
- 사진/멤버 관련 변경 — BE-2 / BE-3 / BE-4 PR.
- 프론트엔드 — FE-1 PR.
