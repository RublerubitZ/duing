# BE-3: GET /api/v1/clubs/{clubId}/members 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LEADER/OFFICER 가 자기 동아리의 멤버 전체를 역할별 그룹으로 조회할 수 있는 읽기 전용 엔드포인트를 추가한다.

**Architecture:** 신규 `ClubMemberApi` 인터페이스 + `ClubMemberController` 를 `domain/clubmember/` 에 추가한다. 기존 `LeaderClubApi` ("내가 운영하는 동아리 목록") 와 책임을 분리한다. `ClubMemberQueryService` 신설 — `ClubAuthService.requireManager(userId, clubId)` 가드 후 페이지네이션 없이 전체 멤버를 반환한다. 정렬은 `LEADER → OFFICER → MEMBER` 그룹 순, 그룹 내 `joinedAt(=ClubMember.createdAt) ASC`. JPQL `ORDER BY CASE` 로 한 번에 정렬된 행을 받고 N+1 회피를 위해 `JOIN FETCH cm.user` 적용. 페이지네이션 없음 (스펙 §3.3).

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA / PostgreSQL(TestContainers) / RestAssured

**Spec:** `docs/superpowers/specs/2026-05-18-phase-3-club-info-photos-members-design.md` §3.3, §4 권한 매트릭스

---

## File Map

**Create**
- `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java` — `GET /api/v1/clubs/{clubId}/members` Swagger 시그니처
- `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java` — 핸들러
- `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberResponse.java` — `{memberId, userId, name, studentId, role, joinedAt}` record + `from(ClubMemberQuery)` 정적 변환
- `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java` — 조회 서비스 (단일 클래스. 인터페이스/General 분리 안 함 — 본 도메인이 신규이고 단일 메서드라 컨벤션상 명확히 분리 비용보다 단순함 우선. `ClubAuthService` 와 동일 패턴.)
- `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberQuery.java` — `{memberId, userId, name, studentId, role, joinedAt}` record + `from(ClubMember)` 정적 변환
- `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberQueryServiceTest.java` — 정렬·권한 검증 (통합)
- `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberControllerTest.java` — RestAssured (LEADER/OFFICER 200, MEMBER 403, 익명 4xx, 응답 정렬 확인)

**Modify**
- `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryCustom.java` — `findAllByClubIdOrderedByRoleAndJoinedAt(Long clubId)` 메서드 추가
- `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepositoryImpl.java` — QueryDSL/JPQL 구현. (QueryDSL 의 `CaseBuilder` 또는 `@Query` JPQL 둘 중 선택. 본 PR 은 **JPQL `@Query`** 사용 — 단일 정렬·고정 조건이라 QueryDSL 의 동적 조립 가치가 없음. 단, `RepositoryImpl` 은 QueryDSL 전용 클래스이므로 `@Query` 는 인터페이스에 두는 게 정석. → 결정: `ClubMemberRepository` 인터페이스에 `@Query` 어노테이션 메서드로 직접 추가하고 `Custom` 은 손대지 않는다.)

**없음**
- 신규 마이그레이션 (V7 의 `club_member` 그대로 사용)
- 신규 권한 예외 (`ClubAuthService.requireManager` 가 던지는 기존 예외 재사용)

**File Map 정정:**
- `ClubMemberRepositoryCustom` / `Impl` 은 건드리지 않는다.
- `ClubMemberRepository` 인터페이스에 `@Query` 메서드 추가만.

---

## Task 1: 브랜치 생성

- [ ] **Step 1: develop 동기화 + 분기**

```bash
git checkout develop
git pull origin develop
git checkout -b feat/be-3-club-members-read
```

---

## Task 2: ClubMemberQuery 정의 + Repository 메서드 추가

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`

- [ ] **Step 1: ClubMemberQuery record 작성**

```java
package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record ClubMemberQuery(
        Long memberId,
        Long userId,
        String name,
        String studentId,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberQuery from(ClubMember clubMember) {
        return new ClubMemberQuery(
                clubMember.getId(),
                clubMember.getUser().getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getRole(),
                clubMember.getCreatedAt()
        );
    }
}
```

- [ ] **Step 2: Repository 에 정렬 조회 메서드 추가**

기존 `ClubMemberRepository.java` 에 import + 메서드 추가:

```java
package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubMemberRepository extends JpaRepository<ClubMember, Long>, ClubMemberRepositoryCustom {

    Optional<ClubMember> findByClubIdAndUserId(Long clubId, Long userId);

    Optional<ClubMember> findFirstByClubIdAndRole(Long clubId, ClubMemberRole role);

    boolean existsByClubIdAndUserId(Long clubId, Long userId);

    /**
     * 동아리 멤버 전체 조회. LEADER → OFFICER → MEMBER 순, 그룹 내 createdAt(joinedAt) 오름차순.
     * User 를 JOIN FETCH 해 N+1 을 회피한다.
     */
    @Query("""
            SELECT cm FROM ClubMember cm
            JOIN FETCH cm.user u
            WHERE cm.club.id = :clubId
            ORDER BY
                CASE cm.role WHEN 'LEADER' THEN 0 WHEN 'OFFICER' THEN 1 ELSE 2 END ASC,
                cm.createdAt ASC
            """)
    List<ClubMember> findAllByClubIdOrderedByRoleAndJoinedAt(@Param("clubId") Long clubId);
}
```

- [ ] **Step 3: 컴파일 확인 + 커밋**

```bash
cd backend && ./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/service/dto/query/ClubMemberQuery.java \
        backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java
git commit -m "feat(backend): 동아리 멤버 정렬 조회 Repository/Query 추가"
```

---

## Task 3: ClubMemberQueryService 작성 + 통합 테스트

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java`
- Create: `backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberQueryServiceTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
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
class ClubMemberQueryServiceTest {

    @Autowired ClubMemberQueryService clubMemberQueryService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("LEADER 가 호출하면 LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순으로 반환된다")
    void leaderGetsOrderedList() throws Exception {
        User leader = saveUser("리더1");
        User officerA = saveUser("운영A");
        User officerB = saveUser("운영B");
        User memberA = saveUser("일반A");
        User memberB = saveUser("일반B");
        Club club = saveActiveClub("두잉멤버1");
        // 저장 순서대로 createdAt 이 오름차순으로 부여된다 (BaseEntity @CreatedDate)
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officerA, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, officerB, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberA));
        clubMemberRepository.save(ClubMember.asMember(club, memberB));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).extracting(ClubMemberQuery::name)
                .containsExactly("리더1", "운영A", "운영B", "일반A", "일반B");
        assertThat(result).extracting(ClubMemberQuery::role)
                .containsExactly(
                        ClubMemberRole.LEADER,
                        ClubMemberRole.OFFICER, ClubMemberRole.OFFICER,
                        ClubMemberRole.MEMBER, ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("OFFICER 도 멤버 목록을 조회할 수 있다")
    void officerCanGetList() throws Exception {
        User leader = saveUser("리더2");
        User officer = saveUser("운영2");
        Club club = saveActiveClub("두잉멤버2");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), officer.getId());

        assertThat(result).hasSize(2);
    }

    @Test
    @DisplayName("MEMBER 가 호출하면 AccessDenied 가 발생한다")
    void memberIsRejected() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉멤버3");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubMemberQueryService.getMembers(club.getId(), memberUser.getId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("비멤버가 호출하면 NotAMember 가 발생한다")
    void nonMemberIsRejected() throws Exception {
        User stranger = saveUser("외부인");
        Club club = saveActiveClub("두잉멤버4");

        assertThatThrownBy(() -> clubMemberQueryService.getMembers(club.getId(), stranger.getId()))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("soft-delete 된 멤버는 결과에 포함되지 않는다")
    void softDeletedExcluded() throws Exception {
        User leader = saveUser("리더5");
        User leftMember = saveUser("탈퇴자");
        Club club = saveActiveClub("두잉멤버5");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember leftMembership = clubMemberRepository.save(ClubMember.asMember(club, leftMember));

        clubMemberRepository.delete(leftMembership);

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).extracting(ClubMemberQuery::name).containsExactly("리더5");
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
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 실패 확인**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.ClubMemberQueryServiceTest"
```

Expected: 컴파일 실패 (`ClubMemberQueryService` 미정의).

- [ ] **Step 3: 서비스 구현**

```java
package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ClubMemberQueryService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;

    public List<ClubMemberQuery> getMembers(Long clubId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        return clubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(ClubMemberQuery::from)
                .toList();
    }
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

```bash
./gradlew test --tests "com.duing.domain.clubmember.service.ClubMemberQueryServiceTest"
git add backend/src/main/java/com/duing/domain/clubmember/service/ClubMemberQueryService.java \
        backend/src/test/java/com/duing/domain/clubmember/service/ClubMemberQueryServiceTest.java
git commit -m "feat(backend): 동아리 멤버 목록 조회 Service 추가"
```

---

## Task 4: ClubMemberResponse + API/Controller

**Files:**
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberResponse.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java`
- Create: `backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java`

- [ ] **Step 1: ClubMemberResponse**

```java
package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import java.time.LocalDateTime;

public record ClubMemberResponse(
        Long memberId,
        Long userId,
        String name,
        String studentId,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberResponse from(ClubMemberQuery query) {
        return new ClubMemberResponse(
                query.memberId(), query.userId(), query.name(),
                query.studentId(), query.role(), query.joinedAt()
        );
    }
}
```

- [ ] **Step 2: ClubMemberApi**

```java
package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "동아리 멤버", description = "동아리 멤버 관리 (운영진)")
public interface ClubMemberApi {

    @Operation(summary = "동아리 멤버 목록 (LEADER/OFFICER)",
            description = "LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순. 페이지네이션 없음.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/members")
    ResponseEntity<ApiResponse<List<ClubMemberResponse>>> listMembers(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
```

- [ ] **Step 3: ClubMemberController**

```java
package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.ClubMemberApi;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberResponse;
import com.duing.domain.clubmember.service.ClubMemberQueryService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubMemberController implements ClubMemberApi {

    private final ClubMemberQueryService clubMemberQueryService;

    @Override
    public ResponseEntity<ApiResponse<List<ClubMemberResponse>>> listMembers(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<ClubMemberResponse> members = clubMemberQueryService.getMembers(clubId, currentUser.id()).stream()
                .map(ClubMemberResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(members));
    }
}
```

- [ ] **Step 4: 컴파일 확인 + 커밋**

```bash
./gradlew compileJava
git add backend/src/main/java/com/duing/domain/clubmember/controller/dto/response/ClubMemberResponse.java \
        backend/src/main/java/com/duing/domain/clubmember/api/ClubMemberApi.java \
        backend/src/main/java/com/duing/domain/clubmember/controller/ClubMemberController.java
git commit -m "feat(backend): GET /clubs/{clubId}/members API/Controller 추가"
```

---

## Task 5: Controller 통합 테스트 (RestAssured)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberControllerTest.java`

- [ ] **Step 1: 작성**

```java
package com.duing.domain.clubmember.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
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
class ClubMemberControllerTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private User officerUser;
    private User memberUser;
    private User strangerUser;
    private Club club;
    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private String strangerToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        leaderUser = saveUser("운영진리더");
        officerUser = saveUser("운영진오피서");
        memberUser = saveUser("일반회원");
        strangerUser = saveUser("비멤버");
        club = saveActiveClub("두잉멤버컨트롤러");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.of(club, officerUser, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        leaderToken = jwtTokenProvider.createToken(leaderUser.getId(), leaderUser.getRole().name());
        officerToken = jwtTokenProvider.createToken(officerUser.getId(), officerUser.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
        strangerToken = jwtTokenProvider.createToken(strangerUser.getId(), strangerUser.getRole().name());
    }

    @Test
    @DisplayName("LEADER 가 호출하면 200 과 역할 정렬된 멤버 목록을 반환한다")
    void leaderGetsOrderedList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data", hasSize(3))
                    .body("data.role", contains("LEADER", "OFFICER", "MEMBER"))
                    .body("data.name", contains("운영진리더", "운영진오피서", "일반회원"));
    }

    @Test
    @DisplayName("OFFICER 도 200 을 받는다")
    void officerCanList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("MEMBER 는 403 을 받는다")
    void memberIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비멤버는 403 을 받는다")
    void strangerIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 호출하면 4xx 인증 오류를 반환한다")
    void anonymousIsRejected() {
        int status = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/members", club.getId())
                .then()
                    .extract().statusCode();
        assertThat(status).isIn(401, 403);
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
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
```

- [ ] **Step 2: 실행**

```bash
./gradlew test --tests "com.duing.domain.clubmember.controller.ClubMemberControllerTest"
```

Expected: 5 tests, PASS.

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/clubmember/controller/ClubMemberControllerTest.java
git commit -m "test(backend): GET /clubs/{clubId}/members 컨트롤러 통합 테스트 추가"
```

---

## Task 6: 전체 회귀 + 푸시 + PR

- [ ] **Step 1: 전체 테스트**

```bash
./gradlew test
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: 푸시**

```bash
git push -u origin feat/be-3-club-members-read
```

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(backend): 동아리 멤버 목록 조회 API (GET /clubs/{clubId}/members)" --body "$(cat <<'EOF'
## 🚀 작업 내용
LEADER/OFFICER 가 자기 동아리의 전체 멤버를 역할별 정렬로 조회할 수 있도록 `GET /api/v1/clubs/{clubId}/members` 를 추가했다. 정렬은 LEADER → OFFICER → MEMBER 순, 그룹 내 가입일(`createdAt`) 오름차순으로 단일 JPQL 에서 처리한다. `JOIN FETCH cm.user` 로 N+1 을 피하고, 페이지네이션 없이 전체를 반환한다 (스펙 §3.3).

권한·도메인 책임 분리를 위해 `ClubMemberApi` / `ClubMemberController` / `ClubMemberQueryService` 를 신설했다. 기존 `LeaderClubApi` ("내가 운영하는 동아리 목록") 와 분리해, 멤버 관리 도메인 후속 BE-4 (역할 변경·강퇴·인계) 가 자연스럽게 같은 위치에 들어올 수 있게 했다.

## 🤔 고민했던 내용
페이지네이션 없는 단건 응답으로 갈지 페이지로 갈지 스펙에서 합의한 대로 단건으로 갔다. 대구대 동아리 평균 수십~수백 명 규모에서는 한 번에 받아 클라이언트에서 검색·필터하는 UX 가 자연스럽고, 단순한 SQL 로 일관된 정렬을 보장하기 쉽다.

`@SQLRestriction` 이 JPQL 에 자동 적용되어 soft-delete 된 멤버는 결과에서 자연 제외된다 (테스트로 검증).

## 💬 리뷰 중점사항
- 정렬 SQL (`ORDER BY CASE WHEN ... END`) 의 가독성·인덱스 사용 여부
- `JOIN FETCH` 의 user 데이터 적재 — 응답 DTO 가 user.name/studentId 만 쓰므로 over-fetch 우려 없음
- 멤버 도메인 책임 분리 (`LeaderClubApi` 유지, `ClubMemberApi` 신설) 가 후속 BE-4 변경에 자연스럽게 확장 가능한지
EOF
)"
```

---

## 자체 점검 체크리스트 (PR 직전)

- [ ] 스펙 §3.3 의 정렬 (LEADER→OFFICER→MEMBER, 그룹 내 joinedAt ASC) 가 SQL 한 번에 처리된다.
- [ ] 응답 필드: memberId / userId / name / studentId / role / joinedAt 모두 포함.
- [ ] 권한: LEADER 200, OFFICER 200, MEMBER 403, 비멤버 403, 익명 401/403 — 모두 테스트.
- [ ] 페이지네이션 없음 (Pageable 파라미터 미사용).
- [ ] soft-delete 멤버 제외 검증 테스트.
- [ ] 신규 마이그레이션 없음.
- [ ] 커밋 메시지 `feat(backend)/test(backend)` 형식, Claude 어트리뷰션 없음.

---

## Out of Scope

- 멤버 검색·필터 (FE 클라이언트 사이드 처리).
- 역할 변경 / 강퇴 / 본인 탈퇴 / 회장 인계 (BE-4).
- 프론트엔드 (FE-3).
