# 웹 HttpOnly Cookie·모바일 Bearer 이중 인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웹 JavaScript에서 Access Token JWT를 완전히 제거하고, Spring Security가 웹 host-only HttpOnly Cookie와 모바일 Authorization Bearer를 안전하게 함께 인증하도록 한다.

**Architecture:** 백엔드는 기존 모바일 로그인 API를 유지하면서 웹 전용 로그인·로그아웃 API와 `__Host-duing_access_token` Cookie를 추가한다. 별도 키로 서명한 최소 정보 `auth_hint`는 Next.js Middleware의 UX에만 사용하고, 웹 API 클라이언트는 Cookie 모드에서 `credentials: include`로 요청하며 Zustand에는 사용자와 인증 상태만 둔다.

**Tech Stack:** Spring Boot 3.4, Spring Security 6, Java 21, auth0 java-jwt 4.4, Next.js 15 Middleware, React 19, TypeScript 5, ky, Zustand 5, Vitest 4, JUnit 5, RestAssured

## Global Constraints

- Access Token Cookie 이름은 `__Host-duing_access_token`이며 Domain 없이 `HttpOnly; Secure; SameSite=Lax; Path=/`를 사용한다.
- 현재 `JWT_EXPIRY_MS=3600000` 정책에 맞춰 Cookie와 `auth_hint`의 수명은 3600초다.
- `auth_hint` payload는 `typ: "AUTH_HINT"`, `role`, `exp`만 포함하고 인증·권한 부여에 절대 사용하지 않는다.
- 백엔드는 `JWT_SECRET`과 `AUTH_HINT_SECRET`을 사용하고, Vercel은 `AUTH_HINT_SECRET`만 사용한다. 두 Secret은 최소 32바이트이고 서로 달라야 한다.
- Spring Security는 Bearer가 있으면 Bearer만, Bearer가 없으면 Access Token Cookie만 인증한다. `auth_hint`는 무시한다.
- Bearer가 없는 Cookie 상태 변경 요청과 웹 로그인·로그아웃은 허용 Origin을 요구한다. Referer fallback은 사용하지 않는다.
- 모든 GET·HEAD API는 읽기 전용이다. 상태 변경은 POST·PUT·PATCH·DELETE만 사용한다.
- 웹·모바일 로그아웃은 기존 `token_version` 정책에 따라 전 디바이스 토큰을 무효화한다.
- 운영과 localhost만 완전 지원한다. 일반 `*.vercel.app` Preview 인증은 지원하지 않는다.
- Refresh Token, Rotation, CSRF Token, 서버 세션 저장소, 실제 React Native Secure Storage 설치는 범위 밖이다.
- 구현 순서는 백엔드 호환 계층 → 웹 전환으로 유지해 각 커밋이 롤백 가능해야 한다.

---

### Task 1: 백엔드 `auth_hint` 서명과 Cookie 수명주기

**Files:**
- Create: `backend/src/main/java/com/duing/global/auth/AuthHintTokenProvider.java`
- Create: `backend/src/main/java/com/duing/global/auth/WebAuthCookieService.java`
- Create: `backend/src/test/java/com/duing/global/auth/AuthHintTokenProviderTest.java`
- Create: `backend/src/test/java/com/duing/global/auth/WebAuthCookieServiceTest.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-prod.yml`
- Modify: `backend/src/test/resources/application.yml`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `AuthHintTokenProvider#create(String role): String`
- Produces: `WebAuthCookieService#issue(HttpServletRequest, HttpServletResponse, String, String): void`
- Produces: `WebAuthCookieService#clear(HttpServletResponse): void`
- Produces: constants `ACCESS_COOKIE_NAME`, `AUTH_HINT_COOKIE_NAME`

- [ ] **Step 1: Secret 분리와 hint payload 테스트를 작성한다**

`AuthHintTokenProviderTest`는 생성자를 직접 호출해 다음을 검증한다.

```java
class AuthHintTokenProviderTest {
    private static final String JWT_SECRET = "jwt-secret-that-is-at-least-thirty-two-bytes";
    private static final String HINT_SECRET = "hint-secret-that-is-at-least-thirty-two-bytes";

    @Test
    void createsOnlyFixedTypeRoleAndExpirationClaims() {
        AuthHintTokenProvider provider =
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L);

        String hint = provider.create("ADMIN");
        DecodedJWT decoded = JWT.require(Algorithm.HMAC256(HINT_SECRET)).build().verify(hint);

        assertThat(decoded.getClaim("typ").asString()).isEqualTo("AUTH_HINT");
        assertThat(decoded.getClaim("role").asString()).isEqualTo("ADMIN");
        assertThat(decoded.getSubject()).isNull();
        assertThat(decoded.getClaims().keySet()).containsExactlyInAnyOrder("typ", "role", "exp");
    }

    @Test
    void rejectsSameAccessAndHintSecret() {
        assertThatThrownBy(() -> new AuthHintTokenProvider(JWT_SECRET, JWT_SECRET, 3_600_000L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("서로 다른 값");
    }

    @Test
    void rejectsShortHintSecret() {
        assertThatThrownBy(() -> new AuthHintTokenProvider("short", JWT_SECRET, 3_600_000L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32바이트");
    }
}
```

- [ ] **Step 2: Cookie 발급·삭제 대칭성과 HTTP 차단 테스트를 작성한다**

`WebAuthCookieServiceTest`는 `MockHttpServletRequest/Response`로 다음을 검증한다.

```java
@Test
void issuesHostOnlySecureAccessCookieAndSignedHint() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setSecure(true);
    request.setServerName("api.duings.com");
    MockHttpServletResponse response = new MockHttpServletResponse();

    cookieService.issue(request, response, "access.jwt", "STUDENT");

    List<String> cookies = response.getHeaders(HttpHeaders.SET_COOKIE);
    assertThat(cookies).anySatisfy(cookie -> {
        assertThat(cookie).startsWith("__Host-duing_access_token=access.jwt");
        assertThat(cookie).contains("Path=/", "Max-Age=3600", "Secure", "HttpOnly", "SameSite=Lax");
        assertThat(cookie).doesNotContain("Domain=");
    });
    assertThat(cookies).anySatisfy(cookie -> {
        assertThat(cookie).startsWith("auth_hint=");
        assertThat(cookie).contains("Domain=.duings.com", "Path=/", "Secure", "HttpOnly", "SameSite=Lax");
    });
}

@Test
void clearsCookiesWithIssuanceAttributesAndZeroMaxAge() {
    MockHttpServletResponse response = new MockHttpServletResponse();
    cookieService.clear(response);

    assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).allSatisfy(cookie ->
            assertThat(cookie).contains("Path=/", "Max-Age=0", "Secure", "HttpOnly", "SameSite=Lax"));
}

@Test
void allowsSecureCookiesOnHttpLocalhostOnly() {
    MockHttpServletRequest localhost = new MockHttpServletRequest();
    localhost.setServerName("localhost");
    MockHttpServletResponse response = new MockHttpServletResponse();

    cookieService.issue(localhost, response, "access.jwt", "STUDENT");

    assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).allSatisfy(cookie ->
            assertThat(cookie).contains("Secure"));
}

@Test
void rejectsCookieIssuanceOnNonLocalHttp() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setServerName("api.example.com");

    assertThatThrownBy(() -> cookieService.issue(
            request, new MockHttpServletResponse(), "access.jwt", "STUDENT"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("HTTPS");
}
```

- [ ] **Step 3: RED를 확인한다**

Run:

```bash
cd backend
./gradlew test --tests "*AuthHintTokenProviderTest" --tests "*WebAuthCookieServiceTest"
```

Expected: FAIL — 두 클래스가 아직 존재하지 않는다.

- [ ] **Step 4: `AuthHintTokenProvider`를 구현한다**

```java
package com.duing.global.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class AuthHintTokenProvider {
    private static final int MIN_SECRET_BYTES = 32;
    private static final String HINT_TYPE = "AUTH_HINT";

    private final Algorithm algorithm;
    private final long expiryMs;

    public AuthHintTokenProvider(
            @Value("${web-auth.hint-secret}") String hintSecret,
            @Value("${jwt.secret}") String jwtSecret,
            @Value("${jwt.expiry-ms}") long expiryMs) {
        validateSecret(hintSecret);
        if (hintSecret.equals(jwtSecret)) {
            throw new IllegalStateException("JWT_SECRET과 AUTH_HINT_SECRET은 서로 다른 값이어야 합니다.");
        }
        this.algorithm = Algorithm.HMAC256(hintSecret);
        this.expiryMs = expiryMs;
    }

    public String create(String role) {
        Instant expiresAt = Instant.now().plusMillis(expiryMs);
        return JWT.create()
                .withClaim("typ", HINT_TYPE)
                .withClaim("role", role)
                .withExpiresAt(Date.from(expiresAt))
                .sign(algorithm);
    }

    long maxAgeSeconds() {
        return expiryMs / 1000L;
    }

    private void validateSecret(String hintSecret) {
        if (!StringUtils.hasText(hintSecret)
                || hintSecret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("AUTH_HINT_SECRET은 최소 32바이트여야 합니다.");
        }
    }
}
```

- [ ] **Step 5: `WebAuthCookieService`를 구현한다**

Cookie builder는 발급과 삭제가 같은 속성 함수를 공유해야 한다. `auth_hint` Domain은 빈 문자열이면 생략한다.

```java
package com.duing.global.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class WebAuthCookieService {
    public static final String ACCESS_COOKIE_NAME = "__Host-duing_access_token";
    public static final String AUTH_HINT_COOKIE_NAME = "auth_hint";

    private final AuthHintTokenProvider authHintTokenProvider;

    @Value("${web-auth.hint-cookie-domain:}")
    private String hintCookieDomain;

    public void issue(HttpServletRequest request, HttpServletResponse response,
                      String accessToken, String role) {
        requireSecureOrLocalhost(request);
        long maxAgeSeconds = authHintTokenProvider.maxAgeSeconds();
        add(response, accessCookie(accessToken, maxAgeSeconds));
        add(response, hintCookie(authHintTokenProvider.create(role), maxAgeSeconds));
    }

    public void clear(HttpServletResponse response) {
        add(response, accessCookie("", 0));
        add(response, hintCookie("", 0));
    }

    private ResponseCookie accessCookie(String value, long maxAgeSeconds) {
        return baseCookie(ACCESS_COOKIE_NAME, value, maxAgeSeconds).build();
    }

    private ResponseCookie hintCookie(String value, long maxAgeSeconds) {
        ResponseCookie.ResponseCookieBuilder builder =
                baseCookie(AUTH_HINT_COOKIE_NAME, value, maxAgeSeconds);
        if (StringUtils.hasText(hintCookieDomain)) {
            builder.domain(hintCookieDomain);
        }
        return builder.build();
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(
            String name, String value, long maxAgeSeconds) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ofSeconds(maxAgeSeconds));
    }

    private void requireSecureOrLocalhost(HttpServletRequest request) {
        if (!request.isSecure() && !"localhost".equalsIgnoreCase(request.getServerName())) {
            throw new IllegalStateException("웹 인증 Cookie는 HTTPS 또는 localhost에서만 발급할 수 있습니다.");
        }
    }

    private void add(HttpServletResponse response, ResponseCookie cookie) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
```

- [ ] **Step 6: 환경 설정을 추가한다**

`application.yml`:

```yaml
web-auth:
  hint-secret: ${AUTH_HINT_SECRET}
  hint-cookie-domain: ${AUTH_HINT_COOKIE_DOMAIN:}
```

`application-prod.yml`:

```yaml
web-auth:
  hint-cookie-domain: ${AUTH_HINT_COOKIE_DOMAIN:.duings.com}
```

`src/test/resources/application.yml`에는 JWT 테스트 키와 다른 32바이트 이상의 더미 `hint-secret`을 추가한다. `backend/.env.example`에는 실제 값 없이 `AUTH_HINT_SECRET=`과 운영 기본 설명용 `AUTH_HINT_COOKIE_DOMAIN=.duings.com`을 추가한다.

- [ ] **Step 7: GREEN과 설정 회귀를 확인한다**

Run:

```bash
cd backend
./gradlew test --tests "*AuthHintTokenProviderTest" --tests "*WebAuthCookieServiceTest"
./gradlew compileJava
```

Expected: PASS, BUILD SUCCESSFUL.

- [ ] **Step 8: 커밋한다**

```bash
git add backend/src/main/java/com/duing/global/auth \
  backend/src/test/java/com/duing/global/auth \
  backend/src/main/resources/application.yml \
  backend/src/main/resources/application-prod.yml \
  backend/src/test/resources/application.yml backend/.env.example
git commit -m "feat(backend): 웹 인증 Cookie 발급 기반 추가 (#641)"
```

---

### Task 2: Bearer 우선·Cookie 차선 인증과 Origin 방어

**Files:**
- Create: `backend/src/main/java/com/duing/global/auth/AuthTransport.java`
- Create: `backend/src/main/java/com/duing/global/auth/CookieCsrfOriginFilter.java`
- Create: `backend/src/test/java/com/duing/global/auth/JwtAuthenticationFilterTest.java`
- Create: `backend/src/test/java/com/duing/global/auth/CookieCsrfOriginFilterTest.java`
- Modify: `backend/src/main/java/com/duing/global/auth/JwtAuthenticationFilter.java`
- Modify: `backend/src/main/java/com/duing/global/auth/JwtAuthenticationEntryPoint.java`
- Modify: `backend/src/main/java/com/duing/global/config/SecurityConfig.java`

**Interfaces:**
- Produces: request attribute `AuthTransport.REQUEST_ATTRIBUTE`
- Produces: enum `BEARER`, `COOKIE`, `NONE`
- Consumes: `WebAuthCookieService.ACCESS_COOKIE_NAME`

- [ ] **Step 1: 전송 우선순위와 401 Cookie 삭제 테스트를 먼저 작성한다**

`JwtAuthenticationFilterTest`는 MockMvc 또는 필터 단위 테스트로 다음 계약을 잠근다.

```java
@Test
void bearerWinsWhenBearerAndCookieAreBothPresent() throws Exception {
    request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer bearer-token");
    request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));

    authenticationFilter.doFilter(request, response, filterChain);

    verify(jwtTokenProvider).parse("bearer-token");
    verify(jwtTokenProvider, never()).parse("cookie-token");
    assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.BEARER);
}

@Test
void cookieIsUsedOnlyWithoutBearer() throws Exception {
    request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));

    authenticationFilter.doFilter(request, response, filterChain);

    verify(jwtTokenProvider).parse("cookie-token");
    assertThat(request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE)).isEqualTo(AuthTransport.COOKIE);
}
```

`JwtAuthenticationEntryPoint` 테스트는 COOKIE attribute에서만 `cookieService.clear`가 호출되고 BEARER에서는 호출되지 않는지 검증한다.

- [ ] **Step 2: Origin 필터 테스트를 작성한다**

```java
@Test
void rejectsCookieMutationWithoutOrigin() throws Exception {
    request.setMethod("PATCH");
    request.setRequestURI("/api/v1/users/me");
    request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));

    filter.doFilter(request, response, chain);

    assertThat(response.getStatus()).isEqualTo(403);
    verify(chain, never()).doFilter(any(), any());
}

@Test
void allowsCookieMutationFromConfiguredOrigin() throws Exception {
    request.setMethod("PATCH");
    request.setRequestURI("/api/v1/users/me");
    request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
    request.addHeader(HttpHeaders.ORIGIN, "https://duings.com");

    filter.doFilter(request, response, chain);

    verify(chain).doFilter(request, response);
}

@Test
void bearerSkipsOriginValidationEvenWhenCookieExists() throws Exception {
    request.setMethod("PATCH");
    request.setRequestURI("/api/v1/users/me");
    request.setCookies(new Cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, "cookie-token"));
    request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer mobile-token");

    filter.doFilter(request, response, chain);

    verify(chain).doFilter(request, response);
}

@Test
void webLoginRequiresOriginWithoutCookie() throws Exception {
    request.setMethod("POST");
    request.setRequestURI("/api/v1/auth/web/login");

    filter.doFilter(request, response, chain);

    assertThat(response.getStatus()).isEqualTo(403);
}
```

- [ ] **Step 3: RED를 확인한다**

Run:

```bash
cd backend
./gradlew test --tests "*JwtAuthenticationFilterTest" --tests "*CookieCsrfOriginFilterTest"
```

Expected: FAIL — Cookie 추출과 Origin 필터가 없다.

- [ ] **Step 4: 인증 전송 타입과 필터 추출 순서를 구현한다**

```java
package com.duing.global.auth;

public enum AuthTransport {
    BEARER,
    COOKIE,
    NONE;

    public static final String REQUEST_ATTRIBUTE = AuthTransport.class.getName();
}
```

`JwtAuthenticationFilter`의 토큰 추출은 다음 결과 record를 사용한다.

```java
private TokenCandidate extractToken(HttpServletRequest request) {
    String header = request.getHeader(HEADER);
    if (StringUtils.hasText(header) && header.startsWith(PREFIX)
            && StringUtils.hasText(header.substring(PREFIX.length()))) {
        return new TokenCandidate(header.substring(PREFIX.length()), AuthTransport.BEARER);
    }
    if (request.getCookies() != null) {
        for (Cookie cookie : request.getCookies()) {
            if (WebAuthCookieService.ACCESS_COOKIE_NAME.equals(cookie.getName())
                    && StringUtils.hasText(cookie.getValue())) {
                return new TokenCandidate(cookie.getValue(), AuthTransport.COOKIE);
            }
        }
    }
    return new TokenCandidate(null, AuthTransport.NONE);
}

private record TokenCandidate(String token, AuthTransport transport) {}
```

`doFilterInternal`은 candidate transport를 request attribute에 먼저 기록하고 기존 JWT·DB 검증을 동일하게 수행한다.

- [ ] **Step 5: Origin 필터를 구현한다**

`CookieCsrfOriginFilter`는 `OncePerRequestFilter`, `CorsConfigurationSource`, `ObjectMapper`를 사용한다. 안전 메서드, Bearer, 웹 인증 경로, Access Cookie 순서로 판별하고 거부 시 `ApiResponse.error("허용되지 않은 요청 출처입니다.")`를 403 JSON으로 쓴다. Origin 허용 판정은 `corsConfigurationSource.getCorsConfiguration(request).checkOrigin(origin)`을 사용한다.

```java
private boolean requiresOrigin(HttpServletRequest request) {
    if (Set.of("GET", "HEAD", "OPTIONS").contains(request.getMethod())) return false;
    if (isWebAuthPath(request.getRequestURI())) return true;
    if (hasBearer(request)) return false;
    return hasCookie(request, WebAuthCookieService.ACCESS_COOKIE_NAME);
}

private boolean isWebAuthPath(String uri) {
    return uri.equals("/api/v1/auth/web/login") || uri.equals("/api/v1/auth/web/logout");
}
```

Origin이 null이면 즉시 403이며 Referer를 읽지 않는다.

- [ ] **Step 6: 401 처리와 Security filter chain을 연결한다**

`JwtAuthenticationEntryPoint`에 `WebAuthCookieService`와 `ObjectMapper`를 주입한다. request attribute가 `COOKIE`일 때만 두 Cookie를 삭제하고, 401 `ApiResponse` JSON을 쓴다.

`SecurityConfig` 변경:

```java
.requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").authenticated()
.requestMatchers(HttpMethod.POST, "/api/v1/auth/web/logout").permitAll()
.requestMatchers("/api/v1/auth/**").permitAll()
```

필터 순서:

```java
.addFilterBefore(cookieCsrfOriginFilter, JwtAuthenticationFilter.class)
.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
```

- [ ] **Step 7: GREEN을 확인한다**

Run:

```bash
cd backend
./gradlew test --tests "*JwtAuthenticationFilterTest" --tests "*CookieCsrfOriginFilterTest"
./gradlew test --tests "*AuthSessionTest" --tests "*AdminUrlLayerAuthorizationAcceptanceTest"
```

Expected: PASS. 기존 Bearer 인증과 관리자 403 계약도 유지된다.

- [ ] **Step 8: 커밋한다**

```bash
git add backend/src/main/java/com/duing/global/auth \
  backend/src/main/java/com/duing/global/config/SecurityConfig.java \
  backend/src/test/java/com/duing/global/auth
git commit -m "fix(backend): Bearer Cookie 이중 인증과 Origin 검증 (#641)"
```

---

### Task 3: 웹 Cookie 로그인·멱등 로그아웃 API

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/response/WebLoginResponse.java`
- Create: `backend/src/test/java/com/duing/domain/user/controller/WebAuthControllerTest.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AuthController.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/UserApi.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/UserController.java`

**Interfaces:**
- Produces: `POST /api/v1/auth/web/login` → `ApiResponse<WebLoginResponse>` without JWT
- Produces: `POST /api/v1/auth/web/logout` → 204, always clears cookies
- Consumes: existing `UserService#login`, `UserService#logout`

- [ ] **Step 1: 웹 로그인 응답과 Cookie 계약 테스트를 작성한다**

`WebAuthControllerTest`는 기존 사용자 fixture와 실제 로그인 서비스를 사용한다.

```java
@Test
void webLoginReturnsUserWithoutJwtAndSetsBothCookies() {
    String studentId = saveUserWithPassword();

    given().contentType(ContentType.JSON)
            .header(HttpHeaders.ORIGIN, "http://localhost:3000")
            .body(Map.of("studentId", studentId, "password", RAW_PASSWORD))
            .when().post("/api/v1/auth/web/login")
            .then().statusCode(200)
            .body("data.user.studentId", equalTo(studentId))
            .body("data.accessToken", nullValue())
            .header(HttpHeaders.SET_COOKIE, containsString("__Host-duing_access_token="));
}
```

두 Set-Cookie 전체 검증은 RestAssured의 `getHeaders().getValues(HttpHeaders.SET_COOKIE)`로 수행한다.

- [ ] **Step 2: 웹 로그아웃의 멱등성과 전역 무효화 테스트를 작성한다**

다음 세 케이스를 한 테스트 클래스에 추가한다.

- 유효 Cookie: 204, 두 Cookie Max-Age=0, 같은 사용자 Bearer도 이후 401
- 손상 Cookie: 204, 두 Cookie Max-Age=0, 서비스 예외 없음
- Cookie 없음: 204, 두 Cookie Max-Age=0

또한 `/auth/login`이 계속 JWT를 반환하고 Origin 없이 동작하는 모바일 회귀 테스트를 유지한다.

- [ ] **Step 3: RED를 확인한다**

Run:

```bash
cd backend
./gradlew test --tests "*WebAuthControllerTest" --tests "*AuthStudentIdLoginTest"
```

Expected: FAIL — 웹 엔드포인트가 404다.

- [ ] **Step 4: 응답 DTO와 API 계약을 추가한다**

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.LoginResult;

public record WebLoginResponse(UserResponse user) {
    public static WebLoginResponse from(LoginResult loginResult) {
        return new WebLoginResponse(UserResponse.from(loginResult.user()));
    }
}
```

`AuthApi`에 다음 두 메서드를 추가한다.

```java
@PostMapping("/auth/web/login")
ResponseEntity<ApiResponse<WebLoginResponse>> webLogin(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest httpServletRequest,
        HttpServletResponse httpServletResponse);

@PostMapping("/auth/web/logout")
ResponseEntity<Void> webLogout(
        @AuthenticationPrincipal UserPrincipal currentUser,
        HttpServletResponse httpServletResponse);
```

- [ ] **Step 5: Controller를 구현한다**

```java
@Override
public ResponseEntity<ApiResponse<WebLoginResponse>> webLogin(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest httpServletRequest,
        HttpServletResponse httpServletResponse) {
    String clientIp = httpServletRequest.getRemoteAddr();
    LoginResult loginResult = userService.login(loginRequest.toCommand(), clientIp);
    webAuthCookieService.issue(
            httpServletRequest,
            httpServletResponse,
            loginResult.accessToken(),
            loginResult.user().role().name());
    return ResponseEntity.ok(ApiResponse.success(WebLoginResponse.from(loginResult)));
}

@Override
public ResponseEntity<Void> webLogout(
        @AuthenticationPrincipal UserPrincipal currentUser,
        HttpServletResponse httpServletResponse) {
    try {
        if (currentUser != null) {
            userService.logout(currentUser.id());
        }
        return ResponseEntity.noContent().build();
    } finally {
        webAuthCookieService.clear(httpServletResponse);
    }
}
```

`clear`는 `finally`에서도 실행되도록 구현해 `userService.logout` 예외에도 삭제 헤더가 누락되지 않게 한다. 식별 불가능한 토큰은 principal null로 통과하므로 204다.

- [ ] **Step 6: Cookie 인증에서 token_version을 올리는 사용자 변경 응답도 Cookie를 삭제한다**

비밀번호 변경, 전화번호 변경, 회원 탈퇴는 성공 시 `token_version`을 올린다. Cookie를 남기면 `auth_hint`가 로그인 화면을 막으므로 `UserApi`의 세 메서드에 `HttpServletRequest`와 `HttpServletResponse`를 전달하고, Controller 성공 응답 전에 다음 helper를 호출한다.

```java
private void clearWebCookiesWhenCookieAuthenticated(
        HttpServletRequest request, HttpServletResponse response) {
    if (request.getAttribute(AuthTransport.REQUEST_ATTRIBUTE) == AuthTransport.COOKIE) {
        webAuthCookieService.clear(response);
    }
}
```

Bearer 요청에서는 Cookie를 변경하지 않는다. 기존 비밀번호·전화번호·탈퇴 controller 테스트에 Cookie transport 성공 시 두 삭제 header, Bearer 성공 시 Set-Cookie 부재 assertion을 추가한다.

- [ ] **Step 7: 상태 변경 GET 부재를 확인한다**

Run:

```bash
rg -n "@GetMapping|RequestMethod.GET" backend/src/main/java/com/duing
```

각 GET이 조회 동작인지 검토하고, 최소한 `/auth/logout`, `/auth/web/logout`, 비밀번호·전화번호·지원·회비·관리자 변경 경로에 GET 요청 시 405가 반환되는 acceptance assertion을 추가한다.

- [ ] **Step 8: GREEN을 확인한다**

Run:

```bash
cd backend
./gradlew test --tests "*WebAuthControllerTest" --tests "*AuthStudentIdLoginTest" --tests "*AuthSessionTest"
```

Expected: PASS.

- [ ] **Step 9: 커밋한다**

```bash
git add backend/src/main/java/com/duing/domain/user \
  backend/src/test/java/com/duing/domain/user/controller/WebAuthControllerTest.java
git commit -m "feat(backend): 웹 Cookie 로그인 로그아웃 API 추가 (#641)"
```

---

### Task 4: 공유 API 클라이언트의 인증 전송 모드 분리

**Files:**
- Create: `frontend/packages/api/test/authTransport.test.ts`
- Modify: `frontend/packages/api/src/client.ts`
- Modify: `frontend/packages/types/src/user.ts`
- Modify: `frontend/packages/api/test/authLogout.test.ts`
- Modify: `frontend/packages/api/test/timeoutPolicy.test.ts`

**Interfaces:**
- Extends: `CreateApiClientOptions.authTransport?: 'bearer' | 'cookie'`
- Changes: `DuingApiClient.auth.login(payload): Promise<User>`
- Preserves: default transport `bearer` for mobile and existing callers

- [ ] **Step 1: Cookie와 Bearer 전송 차이 테스트를 작성한다**

`authTransport.test.ts`에 다음을 작성한다.

```ts
it('cookie 모드는 웹 로그인 경로를 사용하고 Authorization을 붙이지 않는다', async () => {
  const client = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
  let authorization: string | null = 'not-called';
  server.use(
    http.post(`${BASE}/auth/web/login`, ({ request }) => {
      authorization = request.headers.get('authorization');
      return HttpResponse.json({ ok: true, data: { user: TEST_USER }, message: null });
    }),
  );

  await expect(client.auth.login(LOGIN_PAYLOAD)).resolves.toEqual(TEST_USER);
  expect(authorization).toBeNull();
});

it('bearer 모드는 기존 로그인 JWT를 storage에 저장한다', async () => {
  const client = createApiClient({ baseUrl: BASE });
  server.use(
    http.post(`${BASE}/auth/login`, () => HttpResponse.json({
      ok: true,
      data: { accessToken: 'mobile-jwt', tokenType: 'Bearer', user: TEST_USER },
      message: null,
    })),
  );

  await client.auth.login(LOGIN_PAYLOAD);

  expect(await memoryStorage.getItem(TOKEN_STORAGE_KEY)).toBe('mobile-jwt');
});

it('cookie 모드 요청은 credentials include를 사용한다', async () => {
  const client = createApiClient({ baseUrl: BASE, authTransport: 'cookie' });
  server.use(http.get(`${BASE}/users/me`, ({ request }) => {
    expect(request.credentials).toBe('include');
    return HttpResponse.json({ ok: true, data: TEST_USER, message: null });
  }));

  await client.users.me();
});
```

- [ ] **Step 2: 로그아웃 모드별 실패 계약 테스트를 추가한다**

- bearer: 서버 500이어도 local token 삭제 후 resolve
- cookie: `/auth/web/logout` 500이면 reject하고 브라우저 상태는 상위 계층이 유지
- cookie logout 401은 전역 만료 핸들러를 깨우지 않음

- [ ] **Step 3: RED를 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/api test -- --run test/authTransport.test.ts test/authLogout.test.ts
```

Expected: FAIL — `authTransport`와 웹 auth 경로가 없다.

- [ ] **Step 4: API client 옵션과 로그인 반환을 정규화한다**

```ts
export type AuthTransport = 'bearer' | 'cookie';

export type CreateApiClientOptions = {
  baseUrl: string;
  authTransport?: AuthTransport;
};
```

`createApiClient` 시작에서 `const authTransport = options.authTransport ?? 'bearer'`를 결정한다. ky에는 Cookie 모드일 때 `credentials: 'include'`, Bearer 모드일 때 `credentials: 'same-origin'`을 설정한다. beforeRequest의 `readToken`과 Authorization 설정은 Bearer 모드에서만 실행한다.

로그인 구현:

```ts
login: async (payload) => {
  if (authTransport === 'cookie') {
    const result = await jsonOk<{ user: User }>(
      http.post('auth/web/login', { json: payload, timeout: REQUEST_TIMEOUT_MS.login }),
    );
    return result.user;
  }
  const result = await jsonOk<LoginResult>(
    http.post('auth/login', { json: payload, timeout: REQUEST_TIMEOUT_MS.login }),
  );
  await writeToken(result.accessToken);
  return result.user;
},
```

로그아웃 구현은 Cookie 모드 실패를 그대로 던지고, Bearer 모드는 best-effort 서버 폐기 후 `clearToken()`을 항상 수행해 resolve한다.

- [ ] **Step 5: 401 감지 기준을 전송 모드에 맞춘다**

Cookie 모드는 Authorization 헤더가 없어도 401을 세션 만료로 알리되 `auth/web/login`, `auth/web/logout`은 제외한다. Bearer 모드는 기존 Authorization 존재 조건을 유지한다.

- [ ] **Step 6: GREEN과 타입 검사를 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/api test -- --run test/authTransport.test.ts test/authLogout.test.ts test/timeoutPolicy.test.ts
pnpm --filter @duing/api typecheck
```

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add frontend/packages/api frontend/packages/types/src/user.ts
git commit -m "refactor(frontend): API 인증 전송 모드 분리 (#641)"
```

---

### Task 5: JWT 없는 Zustand와 웹 세션 복원·로그아웃 UX

**Files:**
- Create: `frontend/apps/web/app/_lib/legacy-auth-cleanup.ts`
- Create: `frontend/apps/web/app/_components/AuthSessionBootstrap.tsx`
- Create: `frontend/apps/web/test/auth/legacy-auth-cleanup.test.ts`
- Create: `frontend/apps/web/test/auth/session-bootstrap.test.tsx`
- Modify: `frontend/packages/stores/src/auth-store.ts`
- Modify: `frontend/packages/stores/src/index.ts`
- Modify: `frontend/packages/hooks/src/auth.ts`
- Modify: `frontend/packages/hooks/test/authLogout.test.tsx`
- Modify: `frontend/apps/web/app/providers.tsx`
- Modify: `frontend/apps/web/app/_components/SessionExpiryHandler.tsx`
- Modify: `frontend/apps/web/test/auth/session-expiry.test.tsx`
- Modify: `frontend/apps/web/test/(auth)/login/LoginFormPanel.test.tsx`
- Modify: `frontend/apps/web/components/UserMenu.tsx`
- Modify: `frontend/apps/web/app/me/settings/_pages/SettingsPage.tsx`
- Modify: `frontend/apps/web/test/components/user-menu.test.tsx`
- Create: `frontend/apps/web/test/me/settings/settings-logout.test.tsx`
- Modify: `frontend/apps/web/test/me/settings/account-dialogs.test.tsx`
- Modify: `frontend/apps/web/test/me/settings/phone-change-dialog.test.tsx`
- Modify: `frontend/packages/api/src/index.ts`
- Delete: `frontend/packages/api/src/auth-context.ts`
- Delete: `frontend/packages/api/src/auth-types.ts`
- Delete: `frontend/apps/web/app/_lib/cookie-adapter.ts`
- Delete: `frontend/apps/web/test/auth/cookie-adapter.test.ts`

**Interfaces:**
- Changes: Zustand contains `user`, `status`, `setSession(user)`, `clearSession()` only
- Produces: `clearLegacyWebAuthArtifacts(): void`
- Produces: `<AuthSessionBootstrap />`

- [ ] **Step 1: Store에 JWT가 없다는 타입·동작 테스트를 먼저 수정한다**

모든 테스트 fixture에서 `accessToken`을 제거한다. 로그인 성공 후 다음을 단언한다.

```ts
expect(useAuthStore.getState()).toMatchObject({
  status: 'authenticated',
  user: TEST_USER,
});
expect('accessToken' in useAuthStore.getState()).toBe(false);
expect(window.localStorage.getItem('duing.accessToken')).toBeNull();
```

- [ ] **Step 2: 레거시 정리 테스트를 작성한다**

```ts
it('인증 흔적만 localStorage sessionStorage와 legacy cookie에서 제거한다', () => {
  localStorage.setItem('duing.accessToken', 'legacy-local-jwt');
  sessionStorage.setItem('duing.accessToken', 'legacy-session-jwt');
  localStorage.setItem('duing:info-last-path', '/faq');
  document.cookie = 'duing_token=legacy-cookie; Path=/';

  clearLegacyWebAuthArtifacts();

  expect(localStorage.getItem('duing.accessToken')).toBeNull();
  expect(sessionStorage.getItem('duing.accessToken')).toBeNull();
  expect(localStorage.getItem('duing:info-last-path')).toBe('/faq');
  expect(document.cookie).not.toContain('duing_token=');
});
```

setter 캡처 테스트로 host-only 삭제와 `Domain=.duings.com` 삭제 문자열이 모두 `Max-Age=0; Path=/; SameSite=Lax`를 포함하는지도 검증한다.

- [ ] **Step 3: 세션 복원 성공·401·5xx 테스트를 작성한다**

- `/users/me` 성공: store authenticated + user
- 401: unauthenticated + user null
- 500/network: idle 유지, 인증 만료로 오판하지 않음

- [ ] **Step 4: RED를 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/auth/legacy-auth-cleanup.test.ts test/auth/session-bootstrap.test.tsx
pnpm --filter @duing/hooks test -- --run test/authLogout.test.tsx
```

Expected: FAIL — cleanup/bootstrap이 없고 store에 JWT가 남아 있다.

- [ ] **Step 5: auth store를 최소 상태로 변경한다**

```ts
type AuthState = {
  user: User | null;
  status: 'idle' | 'authenticated' | 'unauthenticated';
  setSession(user: User): void;
  clearSession(): Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  setSession(user) {
    set({ user, status: 'authenticated' });
  },
  async clearSession() {
    await clearToken();
    set({ user: null, status: 'unauthenticated' });
  },
}));
```

`hydrateAuthFromStorage`와 Cookie adapter 호출을 제거한다. `@duing/api` index의 `auth-context`·`auth-types` export와 두 미사용 파일도 삭제해 JavaScript Cookie API가 남지 않게 한다. 모바일 JWT는 API client의 Bearer mode가 Secure Storage 구현으로 주입될 `@duing/storage`에 저장한다.

- [ ] **Step 6: 로그인·로그아웃 hook을 새 계약에 맞춘다**

`useLoginMutation`의 성공값은 `User`이며 `setSession(user)`만 호출한다. `useLogout`은 Cookie mode API 실패를 삼키지 않는다. 성공한 경우에만 `clearSession()`과 `queryClient.clear()`를 수행한다. 오류는 Login/메뉴 호출 측이 기존 toast 체계로 표시할 수 있도록 전파한다.

- [ ] **Step 7: 웹 cleanup과 bootstrap을 구현한다**

`legacy-auth-cleanup.ts`:

```ts
const LEGACY_TOKEN_KEY = 'duing.accessToken';
const LEGACY_COOKIE_NAME = 'duing_token';

export function clearLegacyWebAuthArtifacts(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
    window.sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${LEGACY_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    document.cookie = `${LEGACY_COOKIE_NAME}=; Domain=.duings.com; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  }
}
```

`AuthSessionBootstrap`는 `useApiClient`, `ApiError`, store actions를 사용해 mount 1회 `/users/me`를 호출한다. 401만 unauthenticated로 전환하고 다른 오류는 idle을 유지한다.

```tsx
'use client';

import { useEffect } from 'react';
import { ApiError } from '@duing/api';
import { useApiClient } from '@duing/hooks';
import { useAuthStore } from '@duing/stores';

export function AuthSessionBootstrap() {
  const client = useApiClient();
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    let cancelled = false;
    void client.users.me()
      .then((user) => {
        if (!cancelled) setSession(user);
      })
      .catch((sessionError: unknown) => {
        if (!cancelled && sessionError instanceof ApiError && sessionError.status === 401) {
          void clearSession();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, setSession, clearSession]);

  return null;
}
```

`providers.tsx`는 `setStorage(webStorage)`를 유지해 Bearer 호환 token API와 레거시 삭제가 안전하게 동작하도록 한다. `createApiClient({ baseUrl, authTransport: 'cookie' })`, `clearLegacyWebAuthArtifacts()`, `<AuthSessionBootstrap />`를 사용하고 Cookie adapter 등록과 storage 기반 인증 hydration만 제거한다.

- [ ] **Step 8: 세션 만료 복귀 경로와 로그아웃 실패 UX를 구현한다**

`SessionExpiryHandler`는 현재 `window.location.pathname + window.location.search`를 `toLinkRoute`로 검증하고 `/login?next=...`로 이동한다. Cookie 401에서 store와 캐시는 비우되 403에서는 실행되지 않는다.

`UserMenu`와 `SettingsPage`의 로그아웃 호출부는 try/catch를 사용하고 rejected promise에 다음 메시지를 error toast로 표시한다.

```text
로그아웃하지 못했습니다. 네트워크 연결 후 다시 시도하고 이 기기를 떠나지 마세요.
```

성공 전에는 사용자 상태를 지우지 않는다.

- [ ] **Step 9: GREEN과 JWT 잔존 검색을 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/auth/legacy-auth-cleanup.test.ts test/auth/session-bootstrap.test.tsx test/auth/session-expiry.test.tsx 'test/(auth)/login/LoginFormPanel.test.tsx'
pnpm --filter @duing/hooks test -- --run test/authLogout.test.tsx
rg -n "accessToken|duing_token|hydrateAuthFromStorage|registerCookieAdapter" apps/web packages/stores packages/hooks --glob '!**/generated/**'
pnpm typecheck
```

Expected: 테스트와 typecheck PASS. `accessToken`은 모바일 API 응답 타입·Bearer 저장 경로와 테스트 fixture 외 웹 런타임에서 0건이다.

- [ ] **Step 10: 커밋한다**

```bash
git add frontend/apps/web frontend/packages/stores frontend/packages/hooks
git commit -m "fix(frontend): 웹 세션에서 JavaScript JWT 제거 (#641)"
```

---

### Task 6: 서명된 `auth_hint` Middleware UX

**Files:**
- Create: `frontend/apps/web/test/auth/middleware-auth-hint.test.ts`
- Modify: `frontend/apps/web/middleware.ts`
- Modify: `frontend/apps/web/.env.local.example`
- Modify: `frontend/apps/web/.env.production.example`
- Modify: `.github/workflows/frontend-ci.yml`

**Interfaces:**
- Produces: `verifyAuthHint(token, secret, nowSeconds): Promise<AuthHintClaims | null>`
- Consumes: server-only `process.env.AUTH_HINT_SECRET`
- Cookie: `auth_hint`

- [ ] **Step 1: JWS 검증과 Middleware UX 테스트를 작성한다**

테스트 전용 Node `createHmac('sha256', secret)` helper로 compact JWS를 생성한다. 다음 케이스를 검증한다.

- 올바른 `typ: AUTH_HINT`, STUDENT/ADMIN, 미래 exp → claims
- 위조 signature, 다른 typ, 알 수 없는 role, 만료 → null
- hint 없음 보호 경로 → `/login?next=...`
- STUDENT `/admin` → `/403` rewrite
- ADMIN `/admin` → next
- 유효 hint는 API 인증 성공을 의미하지 않는다는 주석과 테스트 이름 고정

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/auth/middleware-auth-hint.test.ts
```

Expected: FAIL — middleware가 아직 `duing_token` payload를 무서명 decode한다.

- [ ] **Step 3: Edge Web Crypto 검증을 middleware 내부에 구현한다**

미들웨어는 기존 Edge 번들 제약 때문에 `next/server` 외 import를 추가하지 않는다. `verifyAuthHint`는 다음 순서다.

1. compact JWS를 점 3개로 분리
2. header `alg === 'HS256'` 확인
3. `crypto.subtle.importKey`로 `AUTH_HINT_SECRET` HMAC 키 생성
4. `${header}.${payload}` signature 검증
5. payload가 정확히 `typ`, `role`, `exp`만 갖고 `typ === 'AUTH_HINT'`인지 확인
6. role allowlist와 exp 확인

```ts
type AuthHintClaims = {
  typ: 'AUTH_HINT';
  role: 'STUDENT' | 'ADMIN';
  exp: number;
};

const AUTH_HINT_COOKIE_NAME = 'auth_hint';

export async function verifyAuthHint(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AuthHintClaims | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature, extraSegment] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || extraSegment) return null;

    const header = decodeJson(encodedHeader);
    if (!isRecord(header) || header.alg !== 'HS256') return null;

    const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const signature = decodeBase64Url(encodedSignature);
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const validSignature = await crypto.subtle.verify('HMAC', key, signature, signingInput);
    if (!validSignature) return null;

    const payload = decodeJson(encodedPayload);
    if (!isRecord(payload)) return null;
    if (Object.keys(payload).sort().join(',') !== 'exp,role,typ') return null;
    if (payload.typ !== 'AUTH_HINT') return null;
    if (payload.role !== 'STUDENT' && payload.role !== 'ADMIN') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) return null;
    return { typ: 'AUTH_HINT', role: payload.role, exp: payload.exp };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeJson(encoded: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
}

function decodeBase64Url(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
```

- [ ] **Step 4: Middleware를 async hint UX로 교체한다**

`middleware`는 async 함수가 되고 `request.cookies.get('auth_hint')`만 읽는다. `AUTH_HINT_SECRET`이 없으면 production에서 오류를 던지고 development에서는 hint를 무효로 처리한다. 보호 라우트·로그인 라우트·admin role 분기는 기존 UX를 유지한다. Access Token Cookie 이름은 middleware 파일에 등장하지 않아야 한다.

- [ ] **Step 5: 환경 예시와 CI build secret을 추가한다**

두 `.env.*.example`에 공개 변수 접두사 없는 `AUTH_HINT_SECRET=` 설명을 추가하고 `JWT_SECRET`을 넣지 않는다.

`frontend-ci.yml` Build step:

```yaml
env:
  AUTH_HINT_SECRET: ci-only-auth-hint-secret-at-least-32-bytes
```

값은 CI 전용 더미이며 실제 서명 키가 아니다.

- [ ] **Step 6: GREEN과 Secret 노출 검색을 확인한다**

Run:

```bash
cd frontend
pnpm --filter @duing/web test -- --run test/auth/middleware-auth-hint.test.ts
pnpm --filter @duing/web typecheck
rg -n "JWT_SECRET" apps/web .env* ../.github/workflows/frontend-ci.yml
```

Expected: 테스트·typecheck PASS, 프론트/Vercel 설정에서 `JWT_SECRET` 0건.

- [ ] **Step 7: 커밋한다**

```bash
git add frontend/apps/web/middleware.ts frontend/apps/web/test/auth/middleware-auth-hint.test.ts \
  frontend/apps/web/.env.local.example frontend/apps/web/.env.production.example \
  .github/workflows/frontend-ci.yml
git commit -m "fix(frontend): 서명된 auth_hint 기반 Middleware UX 적용 (#641)"
```

---

### Task 7: 전체 계약 검증과 운영 문서 동기화

**Files:**
- Modify: `deploy/README.md`
- Modify: `README.md`
- Verify: `backend/**`, `frontend/**`, `.github/workflows/frontend-ci.yml`

**Interfaces:**
- Documents: backend-first rollout, frontend-only rollback, supported environments
- Documents: backend vs Vercel Secret ownership

- [ ] **Step 1: 운영 문서를 갱신한다**

다음을 자연어로 명시한다.

- Backend: `JWT_SECRET`, `AUTH_HINT_SECRET`, `AUTH_HINT_COOKIE_DOMAIN=.duings.com`
- Vercel: `AUTH_HINT_SECRET`만 사용, `JWT_SECRET` 금지
- backend first → frontend second
- backend가 Bearer+Cookie를 함께 지원하므로 frontend-only rollback 가능
- localhost는 양쪽 호스트 문자열을 `localhost`로 통일
- 일반 Vercel Preview 인증 미지원, 필요 시 동일 사이트 custom domain
- 한 곳 로그아웃은 전 디바이스 로그아웃

- [ ] **Step 2: 백엔드 전체 검증을 실행한다**

Run:

```bash
cd backend
./gradlew compileJava
./gradlew test
```

Expected: BUILD SUCCESSFUL. Docker/Testcontainers가 필요하며 실패 시 신규 실패와 환경 실패를 분리한다.

- [ ] **Step 3: 프론트 전체 검증을 실행한다**

Run:

```bash
cd frontend
pnpm lint
pnpm typecheck
pnpm test
AUTH_HINT_SECRET=ci-only-auth-hint-secret-at-least-32-bytes \
  NEXT_PUBLIC_API_BASE_URL=https://api.duings.com/api/v1 pnpm build
```

Expected: exit 0. 기존 lint warning은 신규 warning과 구분해 보고한다.

- [ ] **Step 4: 보안 불변식을 정적 검색한다**

Run:

```bash
rg -n "duing\.accessToken|duing_token|document\.cookie.*token|accessToken:" \
  frontend/apps/web frontend/packages/stores --glob '!**/test/**'
rg -n "JWT_SECRET" frontend .github/workflows/frontend-ci.yml
rg -n "__Host-duing_access_token|auth_hint" backend/src/main frontend/apps/web
git diff --check
```

Expected:

- 웹 런타임 JWT 저장 0건
- frontend의 `JWT_SECRET` 0건
- Access Token Cookie는 backend 인증 코드에만 존재
- `auth_hint`는 backend 발급과 middleware UX에만 존재
- whitespace 오류 0건

- [ ] **Step 5: 자체 리뷰를 수행한다**

설계 문서의 각 성공 기준을 diff와 테스트에 매핑한다. 특히 다음을 다시 확인한다.

- Bearer 실패가 Cookie를 삭제하지 않는가
- invalid Cookie 웹 로그아웃이 204이며 두 Cookie를 삭제하는가
- `auth_hint.role`이 API 권한 분기에 사용되지 않는가
- 로그아웃 전역 무효화가 테스트로 드러나는가
- 상태 변경 GET이 추가되지 않았는가
- Cookie mode에서 JWT가 응답·store·storage 어디에도 남지 않는가

- [ ] **Step 6: 문서와 최종 보완을 커밋한다**

```bash
git add README.md deploy/README.md
git commit -m "docs(auth): 웹 Cookie 인증 운영 절차 추가 (#641)"
```

- [ ] **Step 7: 최종 Git 상태를 확인한다**

Run:

```bash
git status --short
git log --oneline origin/develop..HEAD
git diff --check origin/develop...HEAD
```

Expected: working tree clean, #641 Conventional Commits만 존재, diff whitespace 오류 없음.
