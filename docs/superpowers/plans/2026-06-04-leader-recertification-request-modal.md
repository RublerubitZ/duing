# LEADER 측 중앙동아리 재인증 신청 모달 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회장 콘솔(`/manage/clubs/[clubId]`)에서 중앙동아리 재인증 신청을 사전 컨텍스트 안내와 함께 제출할 수 있는 모달을 구현한다.

**Architecture:** 백엔드는 LEADER 전용 컨텍스트 조회 GET 1개를 추가해 신청 가능 여부·OPEN 라운드·PENDING 여부를 한 번에 반환한다. 프론트는 그 응답으로 모달 상태를 4분기(가능/중앙X/라운드없음/PENDING있음)로 렌더링하고, 가능 분기에서만 폼을 노출해 기존 `POST /clubs/{clubId}/recertification-requests` 를 호출한다. 패키지(`@duing/types`, `@duing/schemas`, `@duing/api`, `@duing/hooks`) 레이어를 먼저 보강한 뒤 UI 를 조립한다.

**Tech Stack:**
- Backend: Spring Boot 3.4, Java 21, JPA, RestAssured, TestContainers, Fixture Monkey
- Frontend: Next.js 15 + React 19, TanStack Query, react-hook-form + zod, ky, Tailwind

**Branch / PR 전략:** 두 PR 로 분리한다.
- PR A (브랜치 `feat/be-leader-recertification-context`): 백엔드 GET context + 통합 테스트 — Tasks 1~7.
- PR B (브랜치 `feat/fe-leader-recertification-modal`, base = PR A 머지 후 develop): 프론트 모달 + 패키지 레이어 — Tasks 8~14.

각 PR 끝에서 빌드/테스트 그린 + spec PR 체크리스트 확인 후 커밋·푸시. spec 문서는 이미 `docs/leader-recertification-spec` 에 커밋돼 있으니 본 plan 구현 브랜치에서는 spec 파일을 다시 건드리지 않는다.

---

## Phase A — 백엔드

### Task 1: 응답 DTO `RecertificationContextResponse` 작성

**Files:**
- Create: `backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationContextResponse.java`

- [ ] **Step 1: DTO record 작성**

```java
package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationRound;
import java.time.LocalDateTime;

public record RecertificationContextResponse(
        boolean centralClub,
        Integer lastVerifiedYear,
        OpenRoundView openRound,
        PendingRequestView pendingRequest
) {
    public record OpenRoundView(Long id, int year, String label) {
        public static OpenRoundView from(RecertificationRound round) {
            return new OpenRoundView(round.getId(), round.getYear(), round.getLabel());
        }
    }

    public record PendingRequestView(
            Long id,
            int operatingYear,
            String contactEmail,
            String contactPhone,
            LocalDateTime createdAt
    ) {
        public static PendingRequestView from(RecertificationRequest request) {
            return new PendingRequestView(
                    request.getId(),
                    request.getOperatingYear(),
                    request.getContactEmail(),
                    request.getContactPhone(),
                    request.getCreatedAt()
            );
        }
    }

    public static RecertificationContextResponse of(
            Club club,
            RecertificationRound openRound,
            RecertificationRequest pendingRequest
    ) {
        return new RecertificationContextResponse(
                club.isCentralClub(),
                club.getLastVerifiedYear(),
                openRound == null ? null : OpenRoundView.from(openRound),
                pendingRequest == null ? null : PendingRequestView.from(pendingRequest)
        );
    }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/controller/dto/response/RecertificationContextResponse.java
git commit -m "feat(backend): 재인증 컨텍스트 응답 DTO 추가"
```

---

### Task 2: 서비스 인터페이스 + 구현에 `getLeaderContext` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/service/RecertificationRequestService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRequestService.java`

- [ ] **Step 1: 서비스 인터페이스에 메서드 추가**

`RecertificationRequestService.java` 의 마지막 `}` 위에 추가:

```java
    /** LEADER 모달용 컨텍스트 — 중앙동아리 여부·OPEN 라운드·PENDING 신청 1건을 한 번에 반환. */
    RecertificationContextResponse getLeaderContext(Long clubId);
```

import 추가:
```java
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
```

- [ ] **Step 2: 구현체에 메서드 추가**

`GeneralRecertificationRequestService.java` 의 마지막 `}` 위에 추가:

```java
    @Override
    public RecertificationContextResponse getLeaderContext(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        RecertificationRound openRound = roundRepository.findByStatus(RoundStatus.OPEN).orElse(null);
        RecertificationRequest pending = null;
        if (openRound != null) {
            pending = requestRepository
                    .findByRoundIdAndClubIdAndStatus(openRound.getId(), club.getId(),
                            RecertificationStatus.PENDING)
                    .orElse(null);
        }
        return RecertificationContextResponse.of(club, openRound, pending);
    }
```

import 추가:
```java
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
```

- [ ] **Step 3: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/club/service/RecertificationRequestService.java \
        backend/src/main/java/com/duing/domain/club/service/GeneralRecertificationRequestService.java
git commit -m "feat(backend): LEADER 재인증 컨텍스트 조회 서비스 메서드 추가"
```

---

### Task 3: API 인터페이스에 `getContext` 시그니처 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/api/LeaderRecertificationApi.java`

- [ ] **Step 1: 인터페이스 갱신**

`LeaderRecertificationApi.java` 전체를 아래로 교체:

```java
package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.CreateRecertificationRequestRequest;
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "재인증 제출", description = "LEADER 의 중앙동아리 재인증 제출 API")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderRecertificationApi {

    @Operation(summary = "재인증 신청 컨텍스트 조회 (LEADER)",
            description = "현재 OPEN 라운드·중앙동아리 여부·이미 제출한 PENDING 신청을 한 번에 반환한다.")
    @GetMapping("/clubs/{clubId}/recertification-context")
    ResponseEntity<ApiResponse<RecertificationContextResponse>> getContext(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

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

- [ ] **Step 2: 컴파일 확인 (컨트롤러는 아직 구현 안 했으므로 컴파일 에러 예상)**

Run: `cd backend && ./gradlew compileJava`
Expected: `LeaderRecertificationController` 가 `getContext` 미구현이라 에러. 정상.

- [ ] **Step 3: 커밋 보류 (Task 4 까지 한 번에 커밋)**

---

### Task 4: 컨트롤러 `getContext` 구현

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/club/controller/LeaderRecertificationController.java`

- [ ] **Step 1: 컨트롤러 갱신**

`LeaderRecertificationController.java` 전체를 아래로 교체:

```java
package com.duing.domain.club.controller;

import com.duing.domain.club.api.LeaderRecertificationApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRequestRequest;
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
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
    public ResponseEntity<ApiResponse<RecertificationContextResponse>> getContext(
            Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireLeader(currentUser.id(), clubId);
        RecertificationContextResponse context = requestService.getLeaderContext(clubId);
        return ResponseEntity.ok(ApiResponse.success(context));
    }

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

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 커밋 (Task 3+4 묶음)**

```bash
git add backend/src/main/java/com/duing/domain/club/api/LeaderRecertificationApi.java \
        backend/src/main/java/com/duing/domain/club/controller/LeaderRecertificationController.java
git commit -m "feat(backend): LEADER 재인증 컨텍스트 조회 API 추가"
```

---

### Task 5: 통합 테스트 — 가능/라운드없음/PENDING있음 시나리오

**Files:**
- Create: `backend/src/test/java/com/duing/domain/club/LeaderRecertificationContextAcceptanceTest.java`

테스트 시 setup 은 기존 `CentralClubRecertificationAcceptanceTest` 를 그대로 참고한다. ADMIN 토큰으로 라운드를 열고 LEADER 토큰으로 GET 호출한다.

- [ ] **Step 1: 테스트 스켈레톤 + 3개 핵심 케이스 작성**

```java
package com.duing.domain.club;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

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
class LeaderRecertificationContextAcceptanceTest {

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
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private void openRound(int year, String label) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("year", year, "label", label))
                .when().post("/api/v1/admin/recertification-rounds")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("LEADER 가 중앙동아리에서 OPEN 라운드 존재 시 신청 가능 컨텍스트를 반환한다")
    void contextWithOpenRoundAndNoPending() {
        openRound(2026, "2026 정기 재인증");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.centralClub", equalTo(true))
                .body("data.openRound.year", equalTo(2026))
                .body("data.openRound.label", equalTo("2026 정기 재인증"))
                .body("data.openRound.id", notNullValue())
                .body("data.pendingRequest", nullValue());
    }

    @Test
    @DisplayName("OPEN 라운드가 없으면 openRound 와 pendingRequest 가 모두 null 이다")
    void contextWithoutOpenRound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.centralClub", equalTo(true))
                .body("data.openRound", nullValue())
                .body("data.pendingRequest", nullValue());
    }

    @Test
    @DisplayName("이미 PENDING 신청이 있으면 pendingRequest 필드가 채워진다")
    void contextWithPendingRequest() {
        openRound(2026, "2026 정기 재인증");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "contactEmail", "leader@example.com",
                        "contactPhone", "010-1234-5678",
                        "operatingYear", 2026,
                        "notes", "메모"))
                .when().post("/api/v1/clubs/" + centralClubId + "/recertification-requests")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.pendingRequest", notNullValue())
                .body("data.pendingRequest.operatingYear", equalTo(2026))
                .body("data.pendingRequest.contactEmail", equalTo("leader@example.com"))
                .body("data.pendingRequest.contactPhone", equalTo("010-1234-5678"));
    }
}
```

- [ ] **Step 2: 테스트 실행**

Run: `cd backend && ./gradlew test --tests com.duing.domain.club.LeaderRecertificationContextAcceptanceTest`
Expected: 3 tests, all PASS

- [ ] **Step 3: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/club/LeaderRecertificationContextAcceptanceTest.java
git commit -m "test(backend): LEADER 재인증 컨텍스트 핵심 시나리오 통합 테스트"
```

---

### Task 6: 통합 테스트 — 권한·중앙동아리X·존재X 시나리오 추가

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/club/LeaderRecertificationContextAcceptanceTest.java`

- [ ] **Step 1: 비-중앙동아리 + OFFICER + 비-멤버 + 미인증 + 존재X 케이스 추가**

마지막 `}` 위에 다음 테스트 추가:

```java
    @Test
    @DisplayName("비-중앙동아리이면 centralClub=false 로 응답한다")
    void contextWithNonCentralClub() {
        Club nonCentral = clubRepository.save(Club.create("일반동아리",
                ClubCategory.HOBBY, null, "설명", null));
        User leader2 = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.asLeader(nonCentral, leader2));
        String token = jwtTokenProvider.createToken(leader2.getId(), leader2.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/clubs/" + nonCentral.getId() + "/recertification-context")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.centralClub", equalTo(false));
    }

    @Test
    @DisplayName("OFFICER 가 호출하면 403 을 반환한다")
    void contextWithOfficerForbidden() {
        User officer = saveUser(UserRole.STUDENT);
        Club club = clubRepository.findById(centralClubId).orElseThrow();
        clubMemberRepository.save(ClubMember.asOfficer(club, officer));
        String token = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("비-멤버가 호출하면 403 을 반환한다")
    void contextWithNonMemberForbidden() {
        User outsider = saveUser(UserRole.STUDENT);
        String token = jwtTokenProvider.createToken(outsider.getId(), outsider.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("미인증 사용자가 호출하면 401 을 반환한다")
    void contextWithoutAuth() {
        RestAssured.given()
                .when().get("/api/v1/clubs/" + centralClubId + "/recertification-context")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
```

> 참고: `ClubMember.asOfficer` 가 없으면 fixture 위치를 확인하고 적절한 정적 팩토리/빌더로 대체한다. 비-멤버 케이스에서 `NotAMember` 예외가 401 로 매핑돼 있으면 401 로 기대값을 바꾼다 (`GlobalExceptionHandler` 확인).

- [ ] **Step 2: 테스트 실행**

Run: `cd backend && ./gradlew test --tests com.duing.domain.club.LeaderRecertificationContextAcceptanceTest`
Expected: 7 tests, all PASS

- [ ] **Step 3: 권한/예외 매핑 불일치 시 조정**

기대 상태코드가 다르면 `GlobalExceptionHandler` 의 `AccessDeniedException` / `ClubMemberException.NotAMember` 매핑을 확인하고 테스트 기대값을 실제 정책에 맞춘다 (코드는 수정하지 않는다).

- [ ] **Step 4: 커밋**

```bash
git add backend/src/test/java/com/duing/domain/club/LeaderRecertificationContextAcceptanceTest.java
git commit -m "test(backend): LEADER 재인증 컨텍스트 권한·중앙동아리 케이스 추가"
```

---

### Task 7: 전체 빌드 그린 확인 후 푸시 + PR 준비

- [ ] **Step 1: 전체 테스트 실행**

Run: `cd backend && ./gradlew clean test`
Expected: BUILD SUCCESSFUL, 모든 테스트 PASS

- [ ] **Step 2: spec PR 체크리스트 (메모리 `feedback_spec_pr_checklist` 기준)**

자체 확인:
1. 컴파일/빌드/테스트 SUCCESS — Step 1 결과.
2. 변경 범위 vs spec 일치 — 본 phase 의 `백엔드` 섹션만 다뤘는지.
3. 다른 측면 영향 — 프론트(다음 phase)·모바일 없음 명시.
4. 모든 task review 완료 (subagent-driven 사용 시).
5. Plan self-review 박스 — 실행 후 재검증.
6. 메모리 규칙: Co-Authored-By/🤖 라인 없음, Conventional Commits 사용.
7. 신규 파일 EOF newline 종료.

- [ ] **Step 3: 푸시 + PR 생성**

```bash
git push -u origin feat/be-leader-recertification-context
gh pr create --title "feat(backend): LEADER 재인증 컨텍스트 조회 API" --body "$(cat <<'EOF'
## 🚀 작업 내용
중앙동아리 회장이 재인증 신청 모달을 열 때 자격 여부를 사전 안내할 수 있도록 OPEN 라운드·중앙동아리 여부·이미 제출한 PENDING 신청을 한 번에 반환하는 GET /api/v1/clubs/{clubId}/recertification-context 엔드포인트를 추가했다.

## 🤔 고민했던 내용
프론트 모달 안에서 분기 처리하려면 어떤 정보가 어떤 형태로 필요한지가 핵심이라 응답 DTO 를 nested record 로 분리해 의미 단위로 묶었다. 권한 정책은 RC-1 과 동일하게 LEADER 전용 유지(OFFICER 도 차단)했다.

## 💬 리뷰 중점사항
- 비-멤버/OFFICER 의 403 매핑이 의도대로 동작하는지 (`ClubAuthService.requireLeader` 와 GlobalExceptionHandler 매핑).
- OPEN 라운드가 없는 동아리에서도 200 으로 폴백되어 프론트 UX 가 명확하게 분기되는지.
EOF
)"
```

---

## Phase B — 프론트엔드

> 시작 전 PR A 가 develop 에 머지되어 있어야 한다. 머지 후 `git checkout develop && git pull && git checkout -b feat/fe-leader-recertification-modal` 로 시작.

### Task 8: 타입 추가 — `LeaderRecertificationContext`, payload

**Files:**
- Create: `frontend/packages/types/src/recertification.ts`
- Modify: `frontend/packages/types/src/index.ts`

- [ ] **Step 1: 타입 파일 작성**

`recertification.ts`:

```ts
export type OpenRoundSummary = {
  id: number;
  year: number;
  label: string;
};

export type LeaderPendingRecertification = {
  id: number;
  operatingYear: number;
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
};

export type LeaderRecertificationContext = {
  centralClub: boolean;
  lastVerifiedYear: number | null;
  openRound: OpenRoundSummary | null;
  pendingRequest: LeaderPendingRecertification | null;
};

export type SubmitRecertificationRequestPayload = {
  contactEmail: string;
  contactPhone: string;
  operatingYear: number;
  notes?: string;
};
```

- [ ] **Step 2: `index.ts` 에 re-export 추가**

`frontend/packages/types/src/index.ts` 의 마지막 줄에 추가:

```ts
export * from './recertification';
```

- [ ] **Step 3: 타입 빌드 확인**

Run: `cd frontend && pnpm --filter @duing/types build`
Expected: 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add frontend/packages/types/src/recertification.ts \
        frontend/packages/types/src/index.ts
git commit -m "feat(frontend): LEADER 재인증 컨텍스트 타입 추가"
```

---

### Task 9: zod 스키마 추가

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: 기존 `submitPromotionRequestSchema` 정의 블록 바로 아래에 추가**

```ts
export const submitRecertificationRequestSchema = z.object({
  contactEmail: z
    .string()
    .min(1, '이메일은 필수 입력값입니다.')
    .email('이메일 형식이 올바르지 않습니다.')
    .max(255, '이메일은 255자 이하여야 합니다.'),
  contactPhone: z
    .string()
    .min(1, '연락처는 필수 입력값입니다.')
    .max(40, '연락처는 40자 이하여야 합니다.'),
  operatingYear: z
    .number()
    .int()
    .min(2000, '운영 연도는 2000 이상이어야 합니다.')
    .max(2100, '운영 연도는 2100 이하여야 합니다.'),
  notes: z
    .string()
    .max(2000, '메모는 2000자 이하여야 합니다.')
    .optional()
    .or(z.literal('')),
});

export type SubmitRecertificationRequestInput = z.infer<typeof submitRecertificationRequestSchema>;
```

- [ ] **Step 2: 빌드 확인**

Run: `cd frontend && pnpm --filter @duing/schemas build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): 재인증 신청 zod 스키마 추가"
```

---

### Task 10: API 클라이언트에 `recertificationRequests.{context,submit}` 추가

**Files:**
- Modify: `frontend/packages/api/src/client.ts`

- [ ] **Step 1: 타입 import 갱신**

`client.ts` 상단의 `@duing/types` import 블록에 다음 항목을 추가:

```ts
  LeaderRecertificationContext,
  SubmitRecertificationRequestPayload,
```

- [ ] **Step 2: `DuingApiClient` 타입의 top-level `promotionRequests` 블록 바로 아래에 추가**

```ts
  recertificationRequests: {
    context(clubId: number): Promise<LeaderRecertificationContext>;
    submit(clubId: number, payload: SubmitRecertificationRequestPayload): Promise<number>;
  };
```

- [ ] **Step 3: `createApiClient` 구현부의 top-level `promotionRequests` 블록 바로 아래에 추가**

```ts
    recertificationRequests: {
      context: (clubId) =>
        jsonOk<LeaderRecertificationContext>(
          http.get(`clubs/${clubId}/recertification-context`),
        ),
      submit: (clubId, payload) =>
        jsonOk<number>(
          http.post(`clubs/${clubId}/recertification-requests`, { json: payload }),
        ),
    },
```

- [ ] **Step 4: 빌드 확인**

Run: `cd frontend && pnpm --filter @duing/api build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/api/src/client.ts
git commit -m "feat(frontend): LEADER 재인증 컨텍스트·제출 API 클라이언트 메서드 추가"
```

---

### Task 11: 훅 + queryKeys 추가

**Files:**
- Create: `frontend/packages/hooks/src/leaderRecertification.ts`
- Create: `frontend/packages/hooks/src/leaderRecertificationQueryKeys.ts`
- Modify: `frontend/packages/hooks/src/index.ts`

- [ ] **Step 1: queryKeys 파일 작성**

`leaderRecertificationQueryKeys.ts`:

```ts
export const leaderRecertificationKeys = {
  all: ['leader', 'recertification'] as const,
  context: (clubId: number) =>
    [...leaderRecertificationKeys.all, 'context', clubId] as const,
};
```

- [ ] **Step 2: 훅 파일 작성**

`leaderRecertification.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LeaderRecertificationContext,
  SubmitRecertificationRequestPayload,
} from '@duing/types';
import { useApiClient } from './api-context';
import { leaderRecertificationKeys } from './leaderRecertificationQueryKeys';

export function useRecertificationContextQuery(
  clubId: number | null,
  options?: { enabled?: boolean },
) {
  const client = useApiClient();
  const enabled = (options?.enabled ?? true) && clubId !== null && Number.isFinite(clubId);
  return useQuery<LeaderRecertificationContext>({
    queryKey: clubId === null
      ? leaderRecertificationKeys.all
      : leaderRecertificationKeys.context(clubId),
    queryFn: () => {
      if (clubId === null) throw new Error('clubId is null but query is enabled');
      return client.recertificationRequests.context(clubId);
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSubmitRecertificationRequestMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SubmitRecertificationRequestPayload) =>
      client.recertificationRequests.submit(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: leaderRecertificationKeys.context(clubId),
      });
    },
  });
}
```

- [ ] **Step 3: `index.ts` 에 re-export 추가**

`frontend/packages/hooks/src/index.ts` 의 promotionRequests export 블록 바로 아래에 추가:

```ts
export {
  useRecertificationContextQuery,
  useSubmitRecertificationRequestMutation,
} from './leaderRecertification';
export { leaderRecertificationKeys } from './leaderRecertificationQueryKeys';
```

- [ ] **Step 4: 빌드 확인**

Run: `cd frontend && pnpm --filter @duing/hooks build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add frontend/packages/hooks/src/leaderRecertification.ts \
        frontend/packages/hooks/src/leaderRecertificationQueryKeys.ts \
        frontend/packages/hooks/src/index.ts
git commit -m "feat(frontend): LEADER 재인증 컨텍스트·제출 훅 추가"
```

---

### Task 12: `RecertificationRequestModal` 컴포넌트 작성

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/_components/RecertificationRequestModal.tsx`

- [ ] **Step 1: 모달 파일 작성**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useRecertificationContextQuery,
  useSubmitRecertificationRequestMutation,
  useMeQuery,
} from '@duing/hooks';
import { submitRecertificationRequestSchema } from '@duing/schemas';
import type { SubmitRecertificationRequestInput } from '@duing/schemas';
import type { LeaderRecertificationContext } from '@duing/types';
import { cn } from '@/app/_lib/cn';

type Props = {
  clubId: number;
  clubName: string;
  onClose: () => void;
};

export function RecertificationRequestModal({ clubId, clubName, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { data: context, isLoading, isError, refetch } = useRecertificationContextQuery(clubId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="재인증 신청"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">재인증 신청</h2>
            <p className="mt-0.5 text-xs text-charcoal-3">{clubName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 hover:bg-graysoft hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}

        {isError && (
          <div className="space-y-3">
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-coral">
              정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-xl border border-line px-4 py-2 text-sm text-charcoal-2 hover:bg-graysoft"
            >
              다시 시도
            </button>
          </div>
        )}

        {context && (
          <ContextBody clubId={clubId} context={context} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function ContextBody({
  clubId,
  context,
  onClose,
}: {
  clubId: number;
  context: LeaderRecertificationContext;
  onClose: () => void;
}) {
  if (!context.centralClub) {
    return (
      <InfoNotice message="중앙동아리만 신청할 수 있습니다." onClose={onClose} />
    );
  }
  if (context.openRound === null) {
    return (
      <InfoNotice
        message="현재 진행 중인 재인증 라운드가 없습니다. 총동연이 라운드를 열면 다시 시도해주세요."
        onClose={onClose}
      />
    );
  }
  if (context.pendingRequest !== null) {
    return (
      <PendingNotice
        pending={context.pendingRequest}
        roundLabel={context.openRound.label}
        onClose={onClose}
      />
    );
  }
  return (
    <RecertificationForm
      clubId={clubId}
      openRoundYear={context.openRound.year}
      openRoundLabel={context.openRound.label}
      onClose={onClose}
    />
  );
}

function InfoNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-charcoal-2">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
      >
        닫기
      </button>
    </div>
  );
}

function PendingNotice({
  pending,
  roundLabel,
  onClose,
}: {
  pending: NonNullable<LeaderRecertificationContext['pendingRequest']>;
  roundLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-charcoal-2">
        <p className="font-semibold text-ink">이미 신청하신 건이 있습니다.</p>
        <dl className="mt-2 space-y-1 text-xs">
          <Row label="라운드">{roundLabel}</Row>
          <Row label="운영 연도">{pending.operatingYear}</Row>
          <Row label="대표 이메일">{pending.contactEmail}</Row>
          <Row label="대표 연락처">{pending.contactPhone}</Row>
          <Row label="제출 일시">{new Date(pending.createdAt).toLocaleString('ko-KR')}</Row>
        </dl>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
      >
        닫기
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-charcoal-3">{label}</dt>
      <dd className="text-charcoal-2">{children}</dd>
    </div>
  );
}

function RecertificationForm({
  clubId,
  openRoundYear,
  openRoundLabel,
  onClose,
}: {
  clubId: number;
  openRoundYear: number;
  openRoundLabel: string;
  onClose: () => void;
}) {
  const { data: me } = useMeQuery();
  const submitRequest = useSubmitRecertificationRequestMutation(clubId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitRecertificationRequestInput>({
    resolver: zodResolver(submitRecertificationRequestSchema),
    defaultValues: {
      contactEmail: me?.email ?? '',
      contactPhone: '',
      operatingYear: openRoundYear,
      notes: '',
    },
  });

  const notesValue = watch('notes') ?? '';

  const onSubmit = (formData: SubmitRecertificationRequestInput) => {
    submitRequest.mutate(
      {
        contactEmail: formData.contactEmail.trim(),
        contactPhone: formData.contactPhone.trim(),
        operatingYear: openRoundYear,
        notes: formData.notes?.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          alert('재인증 신청이 접수되었습니다. 총동연 검토 후 처리됩니다.');
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="rounded-xl border border-line bg-sage-tint px-4 py-3 text-sm text-ink">
        <p className="font-semibold">{openRoundLabel}</p>
        <p className="mt-0.5 text-xs text-charcoal-2">운영 연도 {openRoundYear}</p>
      </div>

      <Field
        id="recert-email"
        label="대표 이메일"
        required
        error={errors.contactEmail?.message}
      >
        <input
          id="recert-email"
          type="email"
          placeholder="leader@daegu.ac.kr"
          {...register('contactEmail')}
          className={inputClass(!!errors.contactEmail)}
        />
      </Field>

      <Field
        id="recert-phone"
        label="대표 연락처"
        required
        error={errors.contactPhone?.message}
      >
        <input
          id="recert-phone"
          type="tel"
          placeholder="010-1234-5678"
          {...register('contactPhone')}
          className={inputClass(!!errors.contactPhone)}
        />
      </Field>

      <Field
        id="recert-notes"
        label="보충 메모"
        hint="(선택, 최대 2000자)"
        error={errors.notes?.message}
      >
        <textarea
          id="recert-notes"
          rows={4}
          placeholder="총동연이 참고할 추가 정보가 있다면 작성해주세요."
          {...register('notes')}
          className={cn(inputClass(!!errors.notes), 'resize-none')}
        />
        <div className="mt-1 flex justify-end">
          <span className="text-xs text-charcoal-3">{notesValue.length} / 2000</span>
        </div>
      </Field>

      {submitRequest.isError && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-coral">
          {submitRequest.error instanceof Error
            ? submitRequest.error.message
            : '신청 처리 중 오류가 발생했습니다.'}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting || submitRequest.isPending}
          className={cn(
            'flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors',
            'bg-ink hover:bg-ink/90',
            (isSubmitting || submitRequest.isPending) && 'cursor-not-allowed opacity-60',
          )}
        >
          {submitRequest.isPending ? '신청 중…' : '재인증 신청 제출'}
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-coral">*</span>}
        {hint && <span className="ml-1 text-xs font-normal text-charcoal-3">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
    'border-line placeholder:text-charcoal-3',
    'focus:border-ink focus:ring-1 focus:ring-ink',
    hasError && 'border-coral focus:border-coral focus:ring-coral',
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
```

- [ ] **Step 2: typecheck 통과 확인**

Run: `cd frontend && pnpm --filter @duing/web typecheck`
Expected: 에러 0건

- [ ] **Step 3: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/_components/RecertificationRequestModal.tsx
git commit -m "feat(frontend): LEADER 재인증 신청 모달 컴포넌트 추가"
```

---

### Task 13: `page.tsx` 헤더에 "재인증 신청" 버튼 추가

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/page.tsx`

- [ ] **Step 1: import 추가**

기존 `import { PromotionRequestModal } from './_components/PromotionRequestModal';` 아래에 추가:

```tsx
import { RecertificationRequestModal } from './_components/RecertificationRequestModal';
```

- [ ] **Step 2: state 추가**

기존 `const [promotionOpen, setPromotionOpen] = useState(false);` 아래에 추가:

```tsx
  const [recertificationOpen, setRecertificationOpen] = useState(false);
```

- [ ] **Step 3: 헤더 버튼 추가**

`<header>` 내부의 `<div className="flex items-center gap-2">` 안에서 "홍보 요청" 버튼과 "신규 모집 작성" 링크 사이에 추가:

```tsx
          <button
            type="button"
            onClick={() => setRecertificationOpen(true)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-charcoal-2 hover:border-ink hover:text-ink"
          >
            재인증 신청
          </button>
```

- [ ] **Step 4: 모달 마운트 추가**

파일 마지막 `</div>` 직전의 PromotionRequestModal 마운트 블록 바로 아래에 추가:

```tsx
      {recertificationOpen && currentManagedClub && (
        <RecertificationRequestModal
          clubId={currentClubId}
          clubName={currentManagedClub.clubName}
          onClose={() => setRecertificationOpen(false)}
        />
      )}
```

- [ ] **Step 5: typecheck + lint**

Run: `cd frontend && pnpm --filter @duing/web typecheck && pnpm --filter @duing/web lint`
Expected: 에러 0건

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/\[clubId\]/page.tsx
git commit -m "feat(frontend): 동아리 콘솔 헤더에 재인증 신청 진입점 추가"
```

---

### Task 14: 전체 빌드 그린 확인 + 수동 동작 검증 + PR

- [ ] **Step 1: 전체 빌드**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm build`
Expected: 모두 성공

- [ ] **Step 2: 로컬 dev 서버에서 수동 검증**

Run: `cd frontend && pnpm --filter @duing/web dev`
브라우저에서 LEADER 계정으로 로그인 → `/manage/clubs/{centralClubId}` 진입 → "재인증 신청" 버튼 확인.

검증 시나리오 (백엔드 데이터 상태별):
- OPEN 라운드 없음 → "현재 진행 중인 재인증 라운드가 없습니다." 안내가 보인다.
- ADMIN 으로 라운드 열기 → 새로고침 후 모달 다시 열면 폼 표시, 이메일은 본인 이메일로 prefill.
- 폼 제출 → alert 노출 + 모달 닫힘.
- 다시 모달 열면 "이미 신청하신 건이 있습니다." 안내가 보인다.

- [ ] **Step 3: spec PR 체크리스트**

자체 확인 7개 항목 (Task 7 Step 2 동일 — feedback 메모리 기준).

- [ ] **Step 4: 푸시 + PR 생성**

```bash
git push -u origin feat/fe-leader-recertification-modal
gh pr create --title "feat(frontend): LEADER 재인증 신청 모달" --body "$(cat <<'EOF'
## 🚀 작업 내용
중앙동아리 회장이 운영 콘솔에서 재인증을 신청할 수 있도록 진입 버튼과 모달을 추가했다. 모달은 백엔드 컨텍스트 응답에 따라 라운드 부재·중앙동아리 아님·이미 PENDING 신청 존재·신청 가능 4가지 상태를 안내한다.

## 🤔 고민했던 내용
모달 진입 자체를 막을지(헤더에서 조건부 노출), 모달 안에서 안내할지가 핵심이었다. 페이지 단에서 자격 정보를 미리 fetch 하면 LEADER 가 콘솔을 열 때마다 비용이 발생하므로 버튼은 항상 표시하고 모달 내부에서 4분기 안내하는 방식을 택했다. 홍보 요청 모달과 일관성도 확보된다.

## 💬 리뷰 중점사항
- 폼 prefill (대표 이메일 ← 현재 사용자) 동작.
- 신청 성공 후 같은 모달 다시 열었을 때 "이미 신청하신 건이 있습니다" 상태로 분기되는지 (캐시 invalidate 동작).
- 라운드 없음 / 중앙동아리 아님 / 비-LEADER (모달 호출 자체가 차단되지만 백엔드 403 도 안전망).
EOF
)"
```

---

## Self-Review

**Spec 커버리지 확인:**
- §변경 범위 → 백엔드: Task 1~4 (DTO·서비스·API·컨트롤러). 프론트: Task 8~13 (types·schemas·api·hooks·modal·page).
- §에러 처리 매트릭스 → Task 12 의 `isError`/refetch 블록, mutation error 표시 블록, submit `onSuccess` alert. 백엔드 400/409 메시지는 서버에서 한국어로 내려오므로 그대로 표시.
- §테스트 전략 → 백엔드 Task 5~6 (7개 시나리오 중 핵심). 프론트는 Task 14 의 lint/typecheck/build + 수동 검증.
- §Out of Scope → 이력 조회, 알림, 수정/취소, 모바일 등은 어느 task 에도 포함되지 않음 (의도된 누락).
- §리스크 — OFFICER/비-멤버 권한 매핑 → Task 6 Step 3 에서 실제 매핑 확인 후 기대값 조정 단계 명시.
- §리스크 — race condition (라운드 닫힘) → Task 12 의 mutation error 분기 + Task 11 의 `staleTime:0`/`gcTime:0` + onSuccess invalidate.

**플레이스홀더 스캔:** 모든 step 에 실제 코드/명령어 포함. TBD/TODO/"적절히 처리" 없음.

**타입 일관성 확인:**
- 백엔드 응답 필드 ↔ 프론트 타입: `centralClub`/`lastVerifiedYear`/`openRound{id,year,label}`/`pendingRequest{id,operatingYear,contactEmail,contactPhone,createdAt}` 모두 일치.
- `SubmitRecertificationRequestPayload` 필드 ↔ 백엔드 `CreateRecertificationRequestRequest` 필드: `contactEmail`/`contactPhone`/`operatingYear`/`notes` 일치.
- 훅 시그니처: `useRecertificationContextQuery(clubId: number | null)` ↔ 모달의 `useRecertificationContextQuery(clubId)` 일관.
- queryKeys: `leaderRecertificationKeys.context(clubId)` 가 hook 의 queryKey 와 mutation 의 invalidate 양쪽에서 일치.
