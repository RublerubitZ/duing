# Refresh Token PR-3 — 세션 목록·개별/전체 로그아웃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 로그인된 기기(세션) 목록을 보고 개별·전체 로그아웃할 수 있는 API 3종과 마이페이지 설정 UI를 추가한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-18-refresh-token-session-auth-design.md` §8(PR-3 행)·§13. BE 는 기존 `AuthSessionService`(PR-1)에 목록·개별 폐기를 추가하고 `UserApi` 에 3 엔드포인트를 얹는다(전체 로그아웃은 기존 `revokeAll` + 범프 재사용). FE 는 types→client→hooks→설정 페이지 "계정 보안" 아래 새 카드 순서(레포 신기능 순서 규칙). 관리자 강제 로그아웃의 세션 연동은 PR-1 에서 이미 완료 — 이번 범위 아님.

**Tech Stack:** BE Spring Boot 3.4/Java 21(RestAssured+Testcontainers), FE Next.js 15/React 19(vitest+msw).

## Global Constraints

- 브랜치 `feat/auth-session-management` (develop 6be26547 에서 분기). **push·PR 생성 금지** — 로컬 커밋만.
- 커밋 한국어 Conventional Commits(`feat(backend):`/`feat(frontend):`). **Co-Authored-By/🤖 Generated 라인 절대 금지.**
- gradle 은 `cd .../backend`, pnpm 은 `cd .../frontend` 후 실행. BE 테스트 날짜 상대시간만.
- 스펙 계약(§8): `GET /users/me/sessions` 200 목록(현재 세션 `current: true` — access 의 sid 로 판정), `DELETE /users/me/sessions/{sessionId}` 204(본인 것만 — 타인 세션은 404, 현재 세션 지정 시 로그아웃과 동일), `DELETE /users/me/sessions` 204(전 세션 폐기 + tokenVersion 범프 + 웹이면 쿠키 3종 삭제).
- 세션 목록 표시(§13): 플랫폼·기기 라벨·마지막 사용·생성 시각·현재 여부. FE 사용자 문구는 한글.
- API 인터페이스 우선(UserApi 선언 → UserController implements). FE `as`/`any` 금지, 서버 상태는 React Query.

## File Structure

```
backend/.../domain/user/service/AuthSessionService.java          # listSessions·revokeOne 추가
backend/.../domain/user/service/GeneralAuthSessionService.java   # 구현
backend/.../domain/user/service/dto/query/SessionSummary.java    # 신규 record
backend/.../domain/user/api/UserApi.java + controller/UserController.java  # 3 엔드포인트
backend/.../domain/user/controller/dto/response/MySessionResponse.java    # 신규 record
backend/src/test/.../controller/UserSessionManagementTest.java  # 인수 테스트
frontend/packages/types/src/user.ts                              # MySession 타입
frontend/packages/api/src/client.ts                              # users.sessions/revokeSession/logoutAll
frontend/packages/hooks/src/auth.ts                              # 훅 3종
frontend/apps/web/app/me/settings/_components/SessionListCard.tsx  # 신규 카드
frontend/apps/web/app/me/settings/_pages/SettingsPage.tsx        # 카드 배치
frontend/apps/web/test/me/settings/session-list.test.tsx         # 컴포넌트 테스트
```

---

### Task 1 (BE): 세션 목록·개별 폐기 서비스

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/AuthSessionService.java`, `GeneralAuthSessionService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/query/SessionSummary.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/AuthSessionListRevokeTest.java`

**Interfaces:**
- Consumes: 기존 `AuthSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc`, `findByIdForUpdate`, `AuthRefreshTokenRepository.revokeBySessionIds`, `revokeCurrent`(로그아웃 의미)
- Produces:
  - `SessionSummary(Long sessionId, SessionPlatform platform, String deviceLabel, LocalDateTime lastUsedAt, LocalDateTime createdAt, boolean current)`
  - `List<SessionSummary> listSessions(Long userId, Long currentSessionIdOrNull)` — 활성 세션만, **최근 사용 내림차순**(현재 세션이 자연히 맨 위)
  - `boolean revokeOne(Long userId, Long sessionId)` — 본인 활성 세션이면 폐기(LOGOUT + 토큰 REVOKED + auth_event LOGOUT) 후 true, 타인·미존재·이미 폐기는 false(404 는 컨트롤러 몫)

- [ ] **Step 1: 실패하는 테스트 작성** — `AuthSessionListRevokeTest.java`

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.domain.user.service.dto.query.SessionSummary;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthSessionListRevokeTest extends IntegrationTestBase {

    @Autowired AuthSessionService authSessionService;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private IssuedSession issueFor(Long userId, SessionPlatform platform, String deviceLabel) {
        return authSessionService.issue(new IssueSessionCommand(
                userId, platform, deviceLabel, "Mozilla/5.0", "127.0.0.1", false));
    }

    @Test
    @DisplayName("세션 목록은 활성 세션만 최근 사용 순으로 반환하고 현재 세션을 표시한다")
    void listReturnsActiveSessionsMostRecentFirstMarkingCurrent() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession olderSession = issueFor(userId, SessionPlatform.IOS, "iPhone 15");
        IssuedSession currentSession = issueFor(userId, SessionPlatform.WEB, "Chrome · macOS");
        IssuedSession revokedSession = issueFor(userId, SessionPlatform.ANDROID, "Galaxy");
        jdbcTemplate.update(
                "UPDATE auth_session SET last_used_at = last_used_at - INTERVAL '1 hour' WHERE id = ?",
                olderSession.sessionId());
        jdbcTemplate.update(
                "UPDATE auth_session SET revoked_at = NOW(), revoke_reason = 'LOGOUT' WHERE id = ?",
                revokedSession.sessionId());

        List<SessionSummary> sessions = authSessionService.listSessions(userId, currentSession.sessionId());

        assertThat(sessions).hasSize(2);
        assertThat(sessions.get(0).sessionId()).isEqualTo(currentSession.sessionId());
        assertThat(sessions.get(0).current()).isTrue();
        assertThat(sessions.get(0).platform()).isEqualTo(SessionPlatform.WEB);
        assertThat(sessions.get(0).deviceLabel()).isEqualTo("Chrome · macOS");
        assertThat(sessions.get(1).sessionId()).isEqualTo(olderSession.sessionId());
        assertThat(sessions.get(1).current()).isFalse();
    }

    @Test
    @DisplayName("본인 세션 개별 폐기는 리프레시 토큰까지 폐기하고 다른 세션을 건드리지 않는다")
    void revokeOneRevokesOnlyTargetSession() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession targetSession = issueFor(userId, SessionPlatform.WEB, null);
        IssuedSession survivingSession = issueFor(userId, SessionPlatform.IOS, null);

        boolean revoked = authSessionService.revokeOne(userId, targetSession.sessionId());

        assertThat(revoked).isTrue();
        assertThat(authSessionRepository.findById(targetSession.sessionId()).orElseThrow().getRevokeReason())
                .isEqualTo(SessionRevokeReason.LOGOUT);
        assertThat(authRefreshTokenRepository.findBySessionIdAndStatus(
                targetSession.sessionId(), RefreshTokenStatus.ACTIVE)).isEmpty();
        assertThat(authSessionRepository.findById(survivingSession.sessionId()).orElseThrow().getRevokedAt())
                .isNull();
    }

    @Test
    @DisplayName("타인 세션·미존재 세션 폐기 시도는 아무것도 폐기하지 않고 false 를 반환한다")
    void revokeOneRejectsForeignAndMissingSessions() {
        Long ownerId = userRepository.save(UserFixture.unique()).getId();
        Long attackerId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession ownerSession = issueFor(ownerId, SessionPlatform.WEB, null);

        assertThat(authSessionService.revokeOne(attackerId, ownerSession.sessionId())).isFalse();
        assertThat(authSessionService.revokeOne(ownerId, 999_999L)).isFalse();
        assertThat(authSessionRepository.findById(ownerSession.sessionId()).orElseThrow().getRevokedAt())
                .isNull();
    }

    @Test
    @DisplayName("이미 폐기된 세션의 재폐기는 false 로 멱등 처리된다")
    void revokeOneIsIdempotentOnAlreadyRevoked() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession session = issueFor(userId, SessionPlatform.WEB, null);
        authSessionService.revokeOne(userId, session.sessionId());

        assertThat(authSessionService.revokeOne(userId, session.sessionId())).isFalse();
    }
}
```

- [ ] **Step 2: 실패 확인** — Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.user.service.AuthSessionListRevokeTest'` → Expected: 컴파일 실패(listSessions/revokeOne/SessionSummary 미존재)

- [ ] **Step 3: 구현**

`SessionSummary.java`:

```java
package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.SessionPlatform;
import java.time.LocalDateTime;

/** 세션 목록 항목 (spec §13) — current 는 요청 access 토큰의 sid 와 일치 여부. */
public record SessionSummary(
        Long sessionId,
        SessionPlatform platform,
        String deviceLabel,
        LocalDateTime lastUsedAt,
        LocalDateTime createdAt,
        boolean current
) {}
```

`AuthSessionService.java` 에 추가:

```java
    /** 활성 세션 목록 — 최근 사용 내림차순, currentSessionIdOrNull(access sid)과 일치하는 항목을 current 로 표시. */
    List<SessionSummary> listSessions(Long userId, Long currentSessionIdOrNull);

    /**
     * 본인 세션 1개 폐기(세션 관리 화면의 개별 로그아웃). 본인 활성 세션이면 폐기 후 true,
     * 타인·미존재·이미 폐기는 false — 응답 코드는 호출 측이 결정한다.
     */
    boolean revokeOne(Long userId, Long sessionId);
```

`GeneralAuthSessionService.java` 에 추가(import: `SessionSummary`, `Comparator`):

```java
    @Override
    public List<SessionSummary> listSessions(Long userId, Long currentSessionIdOrNull) {
        return authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(userId).stream()
                .sorted(Comparator.comparing(AuthSession::getLastUsedAt).reversed())
                .map(session -> new SessionSummary(
                        session.getId(), session.getPlatform(), session.getDeviceLabel(),
                        session.getLastUsedAt(), session.getCreatedAt(),
                        session.getId().equals(currentSessionIdOrNull)))
                .toList();
    }

    @Override
    @Transactional
    public boolean revokeOne(Long userId, Long sessionId) {
        AuthSession session = authSessionRepository.findByIdForUpdate(sessionId).orElse(null);
        // 타인 세션 지목 차단 — revokeCurrent 와 동일한 소유 검증 (spec §8: 본인 것만)
        if (session == null || !session.getUserId().equals(userId) || session.getRevokedAt() != null) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        session.revoke(now, SessionRevokeReason.LOGOUT);
        authRefreshTokenRepository.revokeBySessionIds(List.of(session.getId()), RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(userId, session.getId(), AuthEventType.LOGOUT, null, null, null));
        return true;
    }
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: BUILD SUCCESSFUL, 4 tests

- [ ] **Step 5: Commit** — `git add backend/src && git commit -m "feat(backend): 세션 목록 조회와 개별 세션 폐기 서비스 추가"`

---

### Task 2 (BE): 세션 관리 API 3종

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/api/UserApi.java`, `.../controller/UserController.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/response/MySessionResponse.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/UserSessionManagementTest.java`

**Interfaces:**
- Consumes: Task 1 `listSessions`/`revokeOne`, 기존 `AuthSessionService.revokeAll`, `UserService.logout`(전환기 폴백 포함), `UserPrincipal.sessionId()`, `clearWebCookiesWhenCookieAuthenticated`(UserController 기존 private — 재사용)
- Produces: `GET /users/me/sessions` 200 `List<MySessionResponse>` / `DELETE /users/me/sessions/{sessionId}` 204·404 / `DELETE /users/me/sessions` 204

- [ ] **Step 1: 실패하는 인수 테스트 작성** — `UserSessionManagementTest.java` (헬퍼는 `AuthLogoutSessionTest` 전례: saveUser·webLogin·RestAssured·loginAttemptRateLimiter.reset)

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.LoginAttemptRateLimiter;
import com.duing.global.auth.WebAuthCookieService;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDateTime;
import java.util.List;
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
import org.springframework.security.crypto.password.PasswordEncoder;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class UserSessionManagementTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptRateLimiter loginAttemptRateLimiter;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        loginAttemptRateLimiter.reset();
    }

    private User saveUser() {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%08d", unique % 100_000_000L), "세션관리테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private String mobileAccessToken(User user, String deviceLabel) {
        return given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD,
                        "deviceLabel", deviceLabel, "platform", "IOS"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.accessToken");
    }

    private Response webLogin(User user) {
        return given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");
    }

    @Test
    @DisplayName("세션 목록은 현재 세션을 표시하고 최근 사용 순으로 반환한다")
    void listSessionsMarksCurrentAndOrdersByRecency() {
        User user = saveUser();
        mobileAccessToken(user, "iPhone 15");
        String currentAccessToken = mobileAccessToken(user, "iPad Air");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data[0].deviceLabel", equalTo("iPad Air"))
                .body("data[0].current", equalTo(true))
                .body("data[1].deviceLabel", equalTo("iPhone 15"))
                .body("data[1].current", equalTo(false));
    }

    @Test
    @DisplayName("다른 기기 세션을 개별 폐기하면 그 세션만 로그아웃되고 현재 세션은 유지된다")
    void revokeOtherSessionKeepsCurrentAlive() {
        User user = saveUser();
        mobileAccessToken(user, "old-phone");
        String currentAccessToken = mobileAccessToken(user, "new-phone");
        Integer otherSessionId = given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.find { it.current == false }.sessionId");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().delete("/api/v1/users/me/sessions/" + otherSessionId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].current", equalTo(true));
    }

    @Test
    @DisplayName("타인의 세션 폐기 시도는 404 로 거부되고 대상 세션은 살아있다")
    void revokeForeignSessionReturns404() {
        User victim = saveUser();
        User attacker = saveUser();
        String victimToken = mobileAccessToken(victim, "victim-phone");
        String attackerToken = mobileAccessToken(attacker, "attacker-phone");
        Integer victimSessionId = given().header(HttpHeaders.AUTHORIZATION, "Bearer " + victimToken)
                .when().get("/api/v1/users/me/sessions")
                .then().extract().path("data[0].sessionId");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + attackerToken)
                .when().delete("/api/v1/users/me/sessions/" + victimSessionId)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(authSessionRepository.findById(victimSessionId.longValue()).orElseThrow().getRevokedAt())
                .isNull();
    }

    @Test
    @DisplayName("전체 로그아웃은 모든 세션을 폐기하고 tokenVersion 을 올려 기존 access 도 무효화한다")
    void logoutAllRevokesEverySessionAndBumpsTokenVersion() {
        User user = saveUser();
        mobileAccessToken(user, "phone-a");
        String currentAccessToken = mobileAccessToken(user, "phone-b");
        int tokenVersionBefore = userRepository.findById(user.getId()).orElseThrow().getTokenVersion();

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().delete("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .isEmpty();
        assertThat(userRepository.findById(user.getId()).orElseThrow().getTokenVersion())
                .isGreaterThan(tokenVersionBefore);
        // 범프로 기존 access 는 즉시 401
        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + currentAccessToken)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("웹(쿠키) 전체 로그아웃은 인증 쿠키 3종을 삭제한다")
    void webLogoutAllClearsAuthCookies() {
        User user = saveUser();
        Response loginResponse = webLogin(user);
        String accessCookie = loginResponse.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);

        Response logoutAllResponse = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().delete("/api/v1/users/me/sessions");

        assertThat(logoutAllResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        List<String> cookies = logoutAllResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        assertThat(cookies).allMatch(cookieHeader -> cookieHeader.contains("Max-Age=0"));
    }

    @Test
    @DisplayName("현재 세션을 개별 폐기하면 로그아웃과 동일하게 동작하고 웹이면 쿠키를 삭제한다")
    void revokingCurrentSessionActsAsLogout() {
        User user = saveUser();
        Response loginResponse = webLogin(user);
        String accessCookie = loginResponse.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);
        Integer currentSessionId = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .when().get("/api/v1/users/me/sessions")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data[0].sessionId");

        Response revokeResponse = given()
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().delete("/api/v1/users/me/sessions/" + currentSessionId);

        assertThat(revokeResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(revokeResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE))
                .as("현재 세션 폐기 = 로그아웃 — 웹 인증 쿠키 삭제")
                .hasSize(3)
                .allMatch(cookieHeader -> cookieHeader.contains("Max-Age=0"));
    }
}
```

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.controller.UserSessionManagementTest'` → Expected: FAIL(404/405 — 엔드포인트 미존재)

- [ ] **Step 3: 구현**

`MySessionResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.SessionSummary;
import java.time.LocalDateTime;

public record MySessionResponse(
        Long sessionId,
        String platform,
        String deviceLabel,
        LocalDateTime lastUsedAt,
        LocalDateTime createdAt,
        boolean current
) {
    public static MySessionResponse from(SessionSummary sessionSummary) {
        return new MySessionResponse(
                sessionSummary.sessionId(),
                sessionSummary.platform().name(),
                sessionSummary.deviceLabel(),
                sessionSummary.lastUsedAt(),
                sessionSummary.createdAt(),
                sessionSummary.current());
    }
}
```

`UserApi.java` 에 선언 3개 추가(기존 스타일 — @Operation·@SecurityRequirement, import: `MySessionResponse`, `PathVariable`, `List`):

```java
    @Operation(summary = "내 세션 목록",
            description = "로그인된 기기(활성 세션) 목록을 최근 사용 순으로 반환한다. 요청에 사용된 세션은 current 로 표시된다.")
    @SecurityRequirement(name = "BearerAuth")
    @GetMapping("/users/me/sessions")
    ResponseEntity<ApiResponse<List<MySessionResponse>>> listMySessions(
            @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "세션 개별 로그아웃",
            description = "지정한 세션과 그 리프레시 토큰을 폐기한다. 본인 세션이 아니거나 없으면 404. "
                    + "현재 세션을 지정하면 로그아웃과 동일하며, 웹(쿠키) 인증이면 인증 Cookie 를 삭제한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "폐기됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "본인 활성 세션이 아님")
    })
    @SecurityRequirement(name = "BearerAuth")
    @DeleteMapping("/users/me/sessions/{sessionId}")
    ResponseEntity<Void> revokeMySession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse);

    @Operation(summary = "전체 로그아웃",
            description = "모든 세션·리프레시 토큰을 폐기하고 token_version 을 올려 전 기기의 access 토큰을 즉시 무효화한다. "
                    + "웹(쿠키) 인증이면 인증 Cookie 를 삭제한다.")
    @SecurityRequirement(name = "BearerAuth")
    @DeleteMapping("/users/me/sessions")
    ResponseEntity<Void> logoutAllSessions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse);
```

`UserController.java` 구현 추가 — 필드 `private final AuthSessionService authSessionService;`, `private final UserService userService;`(기존 존재 확인) 주입. 전체 로그아웃의 "전 세션 폐기 + 범프"는 `GeneralUserService` 에 이미 있는 조합을 재사용하기 위해 **`UserService` 에 `logoutAll(Long userId)` 를 추가**한다(스펙 §9.3):

`UserService.java` 에 추가:

```java
    /** 전체 로그아웃 — 전 세션 폐기(LOGOUT_ALL) + token_version 범프로 전 기기 access 즉시 무효화 (spec §9.3). */
    void logoutAll(Long userId);
```

`GeneralUserService.java` 에 추가(기존 logout 아래):

```java
    @Override
    @Transactional
    public void logoutAll(Long userId) {
        // 범프의 lost update 방지 — 행잠금 후 세션 일괄 폐기(기존 자격 변경 경로와 동일 순서)
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
        authSessionService.revokeAll(userId, SessionRevokeReason.LOGOUT_ALL);
    }
```

`UserController.java` 메서드 3개:

```java
    @Override
    public ResponseEntity<ApiResponse<List<MySessionResponse>>> listMySessions(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<MySessionResponse> sessions =
                authSessionService.listSessions(currentUser.id(), currentUser.sessionId()).stream()
                        .map(MySessionResponse::from)
                        .toList();
        return ResponseEntity.ok(ApiResponse.success(sessions));
    }

    @Override
    public ResponseEntity<Void> revokeMySession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        boolean revoked = authSessionService.revokeOne(currentUser.id(), sessionId);
        if (!revoked) {
            throw new UserException.SessionNotFoundException();
        }
        // 현재 세션을 스스로 끊었다면 로그아웃과 동일 — 웹(쿠키) 인증이면 쿠키도 삭제 (spec §8)
        if (sessionId.equals(currentUser.sessionId())) {
            clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        }
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> logoutAllSessions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        userService.logoutAll(currentUser.id());
        clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        return ResponseEntity.noContent().build();
    }
```

`UserException.java` 에 추가:

```java
    public static class SessionNotFoundException extends UserException {
        private static final String MESSAGE = "해당 세션을 찾을 수 없습니다.";

        public SessionNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }
```

참고: `DELETE /users/me/sessions` 와 `/users/me/sessions/{id}` 는 SecurityConfig 의 `anyRequest().authenticated()` 로 이미 보호된다(변경 불필요). CookieCsrfOriginFilter 는 쿠키 인증 상태변경 요청에 Origin 을 이미 강제한다(웹 테스트에 Origin 헤더 포함 이유).

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: BUILD SUCCESSFUL, 6 tests. 이어서 회귀: `./gradlew test --tests 'com.duing.domain.user.controller.*'` green.

- [ ] **Step 5: Commit** — `git add backend/src && git commit -m "feat(backend): 세션 목록·개별 폐기·전체 로그아웃 API 추가"`

---

### Task 3 (FE): 타입·클라이언트·훅

**Files:**
- Modify: `frontend/packages/types/src/user.ts`, `frontend/packages/api/src/client.ts`, `frontend/packages/hooks/src/auth.ts`
- Test: `frontend/packages/api/test/sessionManagement.test.ts`

**Interfaces:**
- Produces:
  - `MySession = { sessionId: number; platform: 'WEB'|'IOS'|'ANDROID'|'UNKNOWN'; deviceLabel: string | null; lastUsedAt: string; createdAt: string; current: boolean }`
  - client: `users.sessions(): Promise<MySession[]>` / `users.revokeSession(sessionId: number): Promise<void>` / `users.logoutAllSessions(): Promise<void>`
  - hooks: `useMySessionsQuery()`(queryKey `['users','me','sessions']`, status==='authenticated' 시만 enabled — useMeQuery 전례), `useRevokeSessionMutation()`(성공 시 세션 목록 invalidate), `useLogoutAllMutation()`(성공 시 useLogout 와 동일한 로컬 정리 — clearSession + queryClient.clear)

- [ ] **Step 1: 실패하는 msw 테스트 작성** — `sessionManagement.test.ts` (관례: authTransport.test.ts — BASE_URL·setupServer·cookie 클라이언트)

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

import { createApiClient } from '../src/client';

import type { MySession } from '@duing/types';

const BASE_URL = 'http://localhost:8080/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SESSION_FIXTURE: MySession[] = [
  {
    sessionId: 2, platform: 'WEB', deviceLabel: 'Chrome · macOS',
    lastUsedAt: '2026-07-19T10:00:00', createdAt: '2026-07-01T09:00:00', current: true,
  },
  {
    sessionId: 1, platform: 'IOS', deviceLabel: 'iPhone 15',
    lastUsedAt: '2026-07-18T22:00:00', createdAt: '2026-06-20T08:00:00', current: false,
  },
];

function cookieClient() {
  return createApiClient({ baseUrl: BASE_URL, authTransport: 'cookie' });
}

describe('세션 관리 API 클라이언트', () => {
  it('세션 목록을 조회한다', async () => {
    server.use(
      http.get(`${BASE_URL}/users/me/sessions`, () =>
        HttpResponse.json({ ok: true, data: SESSION_FIXTURE, message: null })),
    );

    const sessions = await cookieClient().users.sessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0].current).toBe(true);
    expect(sessions[1].deviceLabel).toBe('iPhone 15');
  });

  it('개별 세션을 폐기한다', async () => {
    let deletedPath = '';
    server.use(
      http.delete(`${BASE_URL}/users/me/sessions/:sessionId`, ({ params }) => {
        deletedPath = String(params.sessionId);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await cookieClient().users.revokeSession(1);

    expect(deletedPath).toBe('1');
  });

  it('전체 로그아웃을 호출한다', async () => {
    let called = false;
    server.use(
      http.delete(`${BASE_URL}/users/me/sessions`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await cookieClient().users.logoutAllSessions();

    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend && pnpm --filter @duing/api test -- run test/sessionManagement.test.ts` → Expected: FAIL(메서드 미존재 컴파일 에러)

- [ ] **Step 3: 구현**

`types/user.ts` 에 추가:

```ts
export type SessionPlatform = 'WEB' | 'IOS' | 'ANDROID' | 'UNKNOWN';

export type MySession = {
  sessionId: number;
  platform: SessionPlatform;
  deviceLabel: string | null;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
};
```

`client.ts` — `users` 타입 선언과 구현에 추가(import `MySession`):

```ts
    // 타입 선언부(users: { ... })
    sessions(): Promise<MySession[]>;
    revokeSession(sessionId: number): Promise<void>;
    logoutAllSessions(): Promise<void>;

    // 구현부(users: { ... })
    sessions: () => jsonOk<MySession[]>(http.get('users/me/sessions')),
    revokeSession: (sessionId) => jsonVoid(http.delete(`users/me/sessions/${sessionId}`)),
    logoutAllSessions: () =>
      jsonVoid(http.delete('users/me/sessions', { timeout: REQUEST_TIMEOUT_MS.logoutRevoke })),
```

`hooks/auth.ts` 에 추가(기존 import 재사용, `userQueryKeys` 에 `sessions` 키가 없으면 추가 — 기존 키 구조 확인 후 정합):

```ts
export function useMySessionsQuery() {
  const client = useApiClient();
  const status = useAuthStore((s) => s.status);
  return useQuery<MySession[]>({
    queryKey: userQueryKeys.sessions(),
    queryFn: () => client.users.sessions(),
    enabled: status === 'authenticated',
  });
}

export function useRevokeSessionMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) => client.users.revokeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.sessions() });
    },
  });
}

export function useLogoutAllMutation() {
  const client = useApiClient();
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.users.logoutAllSessions(),
    onSuccess: async () => {
      await clearSession();
      queryClient.clear();
    },
  });
}
```

(`userQueryKeys` 정의 파일을 찾아 `sessions: () => ['users', 'me', 'sessions'] as const` 형태로 추가 — 기존 키 팩토리 스타일을 그대로 따르되 `as const` 가 금지 패턴이면 기존 스타일 우선.)

- [ ] **Step 4: 통과 확인** — `pnpm --filter @duing/api test -- run && pnpm typecheck` → Expected: 전체 green

- [ ] **Step 5: Commit** — `git add frontend/packages && git commit -m "feat(frontend): 세션 관리 API 클라이언트·React Query 훅 추가"`

---

### Task 4 (FE): 설정 페이지 세션 목록 UI

**Files:**
- Create: `frontend/apps/web/app/me/settings/_components/SessionListCard.tsx`
- Modify: `frontend/apps/web/app/me/settings/_pages/SettingsPage.tsx` (계정 보안 카드 아래 배치)
- Test: `frontend/apps/web/test/me/settings/session-list.test.tsx`

**Interfaces:**
- Consumes: Task 3 훅 3종, `SettingsPage` 의 로컬 `SettingsCard`/`SettingsRow` 패턴(파일 내 정의 — SessionListCard 는 자체 마크업으로 카드 스타일 재현 또는 SettingsCard 를 export 해 재사용, **기존 파일 구조를 크게 흔들지 않는 쪽 선택**), `useToast`, `useLogout`(전체 로그아웃 후 로그인 이동 흐름은 기존 로그아웃 버튼과 동일 UX)

- [ ] **Step 1: UI 설계 (구현 가이드)**

`SessionListCard.tsx` — 요구사항:
- 제목 "로그인된 기기", 힌트 "이 계정으로 로그인된 세션 목록이에요. 낯선 기기가 있다면 로그아웃하세요."
- 각 행: 플랫폼 아이콘 대신 한글 라벨(`WEB→'웹'`, `IOS→'iOS'`, `ANDROID→'Android'`, `UNKNOWN→'기타'`) + deviceLabel(null 이면 플랫폼 라벨만) + "마지막 사용 {상대/절대 시각}" — 시각 포맷은 레포 기존 날짜 유틸(`bookingDisplay` 류가 아닌 공용 유틸을 grep 으로 확인, 없으면 `new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })`)
- 현재 세션 행: "현재 기기" 배지(초록 계열 기존 배지 스타일), 개별 로그아웃 버튼 숨김
- 다른 세션 행: "로그아웃" 버튼 → `useRevokeSessionMutation` → 성공 토스트 "해당 기기에서 로그아웃했어요." / 실패 토스트(한글)
- 하단: "다른 모든 기기에서 로그아웃" 버튼 → confirm 다이얼로그 없이 즉시(전체 로그아웃은 파괴적이지만 가역 — 재로그인) → `useLogoutAllMutation` → 성공 시 기존 로그아웃과 동일하게 `/login` 이동(SettingsPage 기존 로그아웃 핸들러의 라우팅 패턴 재사용)
- 로딩: 기존 로딩 컨벤션(`components/loading` Skeleton — 텍스트 로딩 금지), 빈 목록(이론상 현재 세션은 항상 있음): 방어적으로 안내 문구
- 배치: SettingsPage "계정 보안" 카드 바로 아래("계정" danger 카드 위)

- [ ] **Step 2: 실패하는 컴포넌트 테스트 작성** — `session-list.test.tsx` (관례: login-remember-me.test.tsx — MSW + provider + next/navigation mock)

핵심 케이스 4건:
1. 세션 2개(현재 1 + 타기기 1) 렌더 — 현재 기기 배지·타기기 로그아웃 버튼 존재, 현재 기기엔 버튼 없음
2. 타기기 로그아웃 클릭 → DELETE 호출 + 목록 재조회(invalidate) — msw 로 목록 2회째는 1개 반환, 화면에서 사라짐 단언
3. 전체 로그아웃 클릭 → DELETE /users/me/sessions 호출 + 스토어 clearSession(상태 unauthenticated 단언)
4. deviceLabel null 세션은 플랫폼 한글 라벨로 표시

(구현 시 실제 마크업 셀렉터에 맞춰 조정 — role/text 기반, 기존 관례 우선)

- [ ] **Step 3: 실패 확인** — Run: `pnpm --filter web test -- run test/me/settings/session-list.test.tsx` → Expected: FAIL(컴포넌트 미존재)

- [ ] **Step 4: 구현 후 통과 확인** — 같은 명령 green + `pnpm --filter web test -- run`(설정 페이지 기존 테스트 포함) green

- [ ] **Step 5: Commit** — `git add frontend/apps/web && git commit -m "feat(frontend): 설정에 로그인된 기기 목록·개별 및 전체 로그아웃 추가"`

---

### Task 5: 전체 회귀

- [ ] **Step 1: BE** — `cd .../backend && ./gradlew test` → BUILD SUCCESSFUL (전체)
- [ ] **Step 2: FE** — `cd .../frontend && pnpm lint && pnpm typecheck && pnpm test -- run` → 전체 green
- [ ] **Step 3: 보정 있으면** — 최소 수정 + `test(...)` 커밋, report 나열

## Self-Review (작성자 수행)

- 스펙 §8 PR-3 행 3 API 전부 태스크 매핑(T1 서비스, T2 API — current 판정 sid·404·쿠키 삭제 계약 포함). §13 표시 항목(플랫폼·라벨·마지막 사용·생성·현재) T4 반영. 관리자 강제 로그아웃은 PR-1 완료로 범위 제외 명시.
- 타입 일관성: `SessionSummary`(BE query) → `MySessionResponse`(BE response) → `MySession`(FE) 필드 동형(sessionId/platform/deviceLabel/lastUsedAt/createdAt/current). `revokeOne(userId, sessionId)` T1 정의 = T2 소비. `logoutAll` UserService 추가 = T2 소비.
- 미확정 지점(FE 날짜 유틸·userQueryKeys 구조·SettingsCard 재사용 방식)은 "기존 관례 grep 후 우선" 지시로 명시.
