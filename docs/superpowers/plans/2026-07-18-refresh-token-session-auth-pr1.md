# Refresh Token · 세션 인증 시스템 PR-1(BE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Access 30분 + opaque Refresh 30일(Sliding·Rotation·재사용 탐지·grace) + 서버 세션(LRU 5)·rememberMe 쿠키 지속성 이원화를 백엔드에 구현한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-18-refresh-token-session-auth-design.md` 를 따른다. 세션=토큰 패밀리 2-테이블(auth_session/auth_refresh_token) + append-only auth_event. 인증 코드는 기존 위치(`domain/user`, `global/auth`)를 확장한다.

**Tech Stack:** Spring Boot 3.4 / Java 21, JPA+Flyway(V86), auth0 java-jwt(HS256), RestAssured+Testcontainers, Fixture는 `common/fixture` 전례.

## Global Constraints

- 브랜치 `feat/auth-refresh-session` (스펙 커밋 3개 존재). **push·PR 생성 금지** — 로컬 커밋만.
- 커밋 메시지: Conventional Commits 한국어 (`feat(backend): ...`). **Co-Authored-By/🤖 Generated 라인 절대 금지.**
- gradle 은 반드시 `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend` 후 실행. Testcontainers 라 Docker 필수. 출력에서 `BUILD SUCCESSFUL` 을 확인한다(`| tail` 은 exit code 를 가린다).
- 테스트 날짜는 상대시간만(Clock/`LocalDateTime.now().minus...`) — 하드코딩 미래 절대날짜 금지.
- `@DisplayName` 은 요구사항 문장. 변수명 축약(`dto`/`r`/`e`) 금지. DTO 는 record.
- Flyway 기존 파일 수정 금지 — V86 신규 추가만.
- 잠금 순서 불변식: **user 행 → auth_session 행 → auth_refresh_token 행** (역순 획득 금지 — 데드락).
- 시크릿 하드코딩 금지. 신규 설정 키는 `duing.auth.*` (env 오버라이드 가능, 기본값 존재 — 시크릿 아님).

---

### Task 1: V86 마이그레이션 + 엔티티 3종 + 리포지토리

**Files:**
- Create: `backend/src/main/resources/db/migration/V86__create_auth_session_tables.sql`
- Create: `backend/src/main/java/com/duing/domain/user/entity/AuthSession.java`, `AuthRefreshToken.java`, `AuthEvent.java`, `SessionPlatform.java`, `SessionRevokeReason.java`, `RefreshTokenStatus.java`, `AuthEventType.java`
- Create: `backend/src/main/java/com/duing/domain/user/repository/AuthSessionRepository.java`, `AuthRefreshTokenRepository.java`, `AuthEventRepository.java`
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java` (TRUNCATE 목록)
- Test: `backend/src/test/java/com/duing/domain/user/entity/AuthSessionPersistenceTest.java`

**Interfaces (Produces):**
- `AuthSession.create(Long userId, SessionPlatform platform, String deviceLabel, String userAgent, String ipAddress, boolean rememberMe, LocalDateTime now, Duration ttl)` / `touch(LocalDateTime now, Duration ttl)` / `revoke(LocalDateTime now, SessionRevokeReason reason)` / `boolean isUsable(LocalDateTime now)` / getters (`isRememberMe()`, `getExpiresAt()`, `getLastUsedAt()`, `getRevokedAt()`, `getRevokeReason()`, `getUserId()`)
- `AuthRefreshToken.issue(Long sessionId, String tokenHash)` / `markRotated(LocalDateTime now)` / `markRevoked()` / `boolean isReusableWithinGrace(LocalDateTime now, Duration grace)` / `getStatus()`, `getSessionId()`, `getRotatedAt()`
- `AuthEvent.of(Long userId, Long sessionId, AuthEventType eventType, String detail, String ipAddress, String userAgent)`
- Repos: 아래 코드의 메서드 시그니처 전부.

- [ ] **Step 1: V86 마이그레이션 작성**

`V86__create_auth_session_tables.sql` — 스펙 §7 DDL 그대로(remember_me 포함):

```sql
-- 세션 = 리프레시 토큰 패밀리. revoked_at 이 논리 폐기(soft delete 아님),
-- 물리 삭제는 AuthSessionCleanupJob 이 보존기간 후 수행(PiiRetentionJob 전례).
CREATE TABLE auth_session (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users (id),
    platform      VARCHAR(20) NOT NULL,
    device_label  VARCHAR(100),
    user_agent    VARCHAR(500),
    ip_address    VARCHAR(45),
    remember_me   BOOLEAN     NOT NULL DEFAULT FALSE,
    last_used_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMP   NOT NULL,
    revoked_at    TIMESTAMP,
    revoke_reason VARCHAR(30),
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);
CREATE INDEX idx_auth_session_user_active ON auth_session (user_id, last_used_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_refresh_token (
    id         BIGSERIAL PRIMARY KEY,
    session_id BIGINT      NOT NULL REFERENCES auth_session (id),
    token_hash CHAR(64)    NOT NULL,
    status     VARCHAR(10) NOT NULL,
    rotated_at TIMESTAMP,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);
CREATE UNIQUE INDEX uq_auth_refresh_token_hash   ON auth_refresh_token (token_hash);
CREATE UNIQUE INDEX uq_auth_refresh_token_active ON auth_refresh_token (session_id) WHERE status = 'ACTIVE';

-- 인증 보안 이벤트 감사 로그. append-only (phone_verification_events 전례).
-- session_id 는 FK 미지정 — 세션 물리삭제 후에도 이벤트를 보존한다.
CREATE TABLE auth_event (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      REFERENCES users (id),
    session_id BIGINT,
    event_type VARCHAR(40) NOT NULL,
    detail     VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);
CREATE INDEX idx_auth_event_user ON auth_event (user_id, created_at);

ALTER TABLE auth_session       ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_refresh_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_event         ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: enum 4종 작성** (`domain/user/entity/`, 각각 별도 파일)

```java
public enum SessionPlatform {
    WEB, IOS, ANDROID, UNKNOWN;

    /** 클라이언트 자유 입력을 안전하게 매핑한다 — 모르는 값은 UNKNOWN. */
    public static SessionPlatform from(String raw) {
        if (raw == null) return UNKNOWN;
        try {
            return SessionPlatform.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ignored) {
            return UNKNOWN;
        }
    }
}
public enum SessionRevokeReason { LOGOUT, LOGOUT_ALL, SESSION_LIMIT, REUSE_DETECTED, CREDENTIAL_CHANGE, ADMIN_FORCE, EXPIRED }
public enum RefreshTokenStatus { ACTIVE, ROTATED, REVOKED }
public enum AuthEventType { LOGIN, SESSION_EVICTED, REUSE_DETECTED, LOGOUT, LOGOUT_ALL, SESSIONS_REVOKED, ADMIN_FORCE_LOGOUT }
```

- [ ] **Step 3: 엔티티 3종 작성**

`AuthSession.java` — user 는 연관이 아니라 **id 컬럼**으로 둔다(soft-delete 사용자 lazy 프록시의 EntityNotFound 함정 회피 + 인증 핫패스 명시 조회):

```java
package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "auth_session")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthSession extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SessionPlatform platform;

    @Column(name = "device_label", length = 100)
    private String deviceLabel;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    /** 웹 "로그인 상태 유지" — rotation 시 쿠키 지속성(Persistent/Session) 복원 근거 (spec §10.1). */
    @Column(name = "remember_me", nullable = false)
    private boolean rememberMe;

    @Column(name = "last_used_at", nullable = false)
    private LocalDateTime lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "revoke_reason", length = 30)
    private SessionRevokeReason revokeReason;

    @Builder(access = AccessLevel.PRIVATE)
    private AuthSession(Long userId, SessionPlatform platform, String deviceLabel, String userAgent,
                        String ipAddress, boolean rememberMe, LocalDateTime lastUsedAt, LocalDateTime expiresAt) {
        this.userId = userId;
        this.platform = platform;
        this.deviceLabel = deviceLabel;
        this.userAgent = userAgent;
        this.ipAddress = ipAddress;
        this.rememberMe = rememberMe;
        this.lastUsedAt = lastUsedAt;
        this.expiresAt = expiresAt;
    }

    public static AuthSession create(Long userId, SessionPlatform platform, String deviceLabel,
                                     String userAgent, String ipAddress, boolean rememberMe,
                                     LocalDateTime now, Duration ttl) {
        return AuthSession.builder()
                .userId(userId)
                .platform(platform)
                .deviceLabel(truncate(deviceLabel, 100))
                .userAgent(truncate(userAgent, 500))
                .ipAddress(truncate(ipAddress, 45))
                .rememberMe(rememberMe)
                .lastUsedAt(now)
                .expiresAt(now.plus(ttl))
                .build();
    }

    /** rotation 성공 시 sliding — 마지막 사용을 기록하고 만료를 now+ttl 로 연장한다 (spec §4). */
    public void touch(LocalDateTime now, Duration ttl) {
        this.lastUsedAt = now;
        this.expiresAt = now.plus(ttl);
    }

    public void revoke(LocalDateTime now, SessionRevokeReason reason) {
        if (this.revokedAt == null) {
            this.revokedAt = now;
            this.revokeReason = reason;
        }
    }

    public boolean isUsable(LocalDateTime now) {
        return revokedAt == null && expiresAt.isAfter(now);
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return null;
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
```

`AuthRefreshToken.java`:

```java
package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "auth_refresh_token")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthRefreshToken extends BaseEntity {

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    /** SHA-256 hex — 토큰 원문은 어디에도 저장하지 않는다. */
    @Column(name = "token_hash", nullable = false, length = 64)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private RefreshTokenStatus status;

    /** ROTATED 전환 시각 = 동시 탭 grace 판정 기준점 (spec §11). */
    @Column(name = "rotated_at")
    private LocalDateTime rotatedAt;

    private AuthRefreshToken(Long sessionId, String tokenHash) {
        this.sessionId = sessionId;
        this.tokenHash = tokenHash;
        this.status = RefreshTokenStatus.ACTIVE;
    }

    public static AuthRefreshToken issue(Long sessionId, String tokenHash) {
        return new AuthRefreshToken(sessionId, tokenHash);
    }

    public void markRotated(LocalDateTime now) {
        this.status = RefreshTokenStatus.ROTATED;
        this.rotatedAt = now;
    }

    public void markRevoked() {
        this.status = RefreshTokenStatus.REVOKED;
    }

    /** 폐기(ROTATED) 직후 grace 창 안의 재제시 = 동시 탭으로 간주한다 (spec §5.3, §11). */
    public boolean isReusableWithinGrace(LocalDateTime now, Duration grace) {
        return status == RefreshTokenStatus.ROTATED
                && rotatedAt != null
                && rotatedAt.plus(grace).isAfter(now);
    }
}
```

`AuthEvent.java`:

```java
package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 인증 보안 이벤트 감사 로그 — append-only, 수정 메서드를 두지 않는다 (spec §7.1). */
@Getter
@Entity
@Table(name = "auth_event")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuthEvent extends BaseEntity {

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "session_id")
    private Long sessionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 40)
    private AuthEventType eventType;

    @Column(length = 500)
    private String detail;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 500)
    private String userAgent;

    private AuthEvent(Long userId, Long sessionId, AuthEventType eventType,
                      String detail, String ipAddress, String userAgent) {
        this.userId = userId;
        this.sessionId = sessionId;
        this.eventType = eventType;
        this.detail = detail;
        this.ipAddress = ipAddress;
        this.userAgent = userAgent;
    }

    public static AuthEvent of(Long userId, Long sessionId, AuthEventType eventType,
                               String detail, String ipAddress, String userAgent) {
        return new AuthEvent(userId, sessionId, eventType, detail, ipAddress, userAgent);
    }
}
```

- [ ] **Step 4: 리포지토리 3종 작성**

`AuthSessionRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.SessionRevokeReason;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthSessionRepository extends JpaRepository<AuthSession, Long> {

    /** rotation·폐기의 직렬화 지점 — 같은 세션의 동시 갱신을 행잠금으로 직렬화한다 (spec §11). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM AuthSession s WHERE s.id = :id")
    Optional<AuthSession> findByIdForUpdate(@Param("id") Long id);

    /** 활성 세션을 LRU 순(가장 오래 미사용 먼저)으로 — 상한 초과 폐기 대상 선정용. */
    List<AuthSession> findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(Long userId);

    /**
     * 전 세션 일괄 폐기(전체 로그아웃·자격 변경·관리자 강제). flushAutomatically 로 같은 트랜잭션의
     * 선행 엔티티 변경(tokenVersion bump 등)을 벌크 실행 전에 flush 한다 — clear 는 하지 않아
     * 호출 측의 managed 엔티티(User)가 detach 되지 않는다.
     */
    @Modifying(flushAutomatically = true)
    @Query("UPDATE AuthSession s SET s.revokedAt = :now, s.revokeReason = :reason "
            + "WHERE s.userId = :userId AND s.revokedAt IS NULL")
    int revokeAllActive(@Param("userId") Long userId, @Param("now") LocalDateTime now,
                        @Param("reason") SessionRevokeReason reason);
}
```

`AuthRefreshTokenRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthRefreshToken;
import com.duing.domain.user.entity.RefreshTokenStatus;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthRefreshTokenRepository extends JpaRepository<AuthRefreshToken, Long> {

    /**
     * 잠금 전 스칼라 조회 — 엔티티를 영속성 컨텍스트에 올리지 않아, 세션 행잠금 획득 후의
     * findByTokenHash 재조회가 잠금 대기 중 변경된 최신 상태를 읽는다 (spec §11 원자성).
     */
    @Query("SELECT t.sessionId FROM AuthRefreshToken t WHERE t.tokenHash = :tokenHash")
    Optional<Long> findSessionIdByTokenHash(@Param("tokenHash") String tokenHash);

    Optional<AuthRefreshToken> findByTokenHash(String tokenHash);

    Optional<AuthRefreshToken> findBySessionIdAndStatus(Long sessionId, RefreshTokenStatus status);

    List<AuthRefreshToken> findBySessionIdOrderByIdAsc(Long sessionId);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE AuthRefreshToken t SET t.status = :revoked "
            + "WHERE t.sessionId IN :sessionIds AND t.status <> :revoked")
    int revokeBySessionIds(@Param("sessionIds") List<Long> sessionIds,
                           @Param("revoked") RefreshTokenStatus revoked);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE AuthRefreshToken t SET t.status = :revoked WHERE t.status <> :revoked "
            + "AND t.sessionId IN (SELECT s.id FROM AuthSession s WHERE s.userId = :userId)")
    int revokeAllByUserId(@Param("userId") Long userId, @Param("revoked") RefreshTokenStatus revoked);
}
```

`AuthEventRepository.java`:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.AuthEvent;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthEventRepository extends JpaRepository<AuthEvent, Long> {

    List<AuthEvent> findByUserIdOrderByIdAsc(Long userId);
}
```

- [ ] **Step 5: IntegrationTestBase TRUNCATE 목록에 신규 테이블 추가**

`IntegrationTestBase.java` 의 TRUNCATE 문자열에서 `"phone_verification_events, "` 바로 앞에 다음 3줄을 추가한다(FK 순서: 자식 먼저):

```java
                "auth_refresh_token, " +
                "auth_session, " +
                "auth_event, " +
```

- [ ] **Step 6: 실패하는 영속성 테스트 작성** — `AuthSessionPersistenceTest.java`

```java
package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthSessionPersistenceTest extends IntegrationTestBase {

    @Autowired UserRepository userRepository;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;

    @Test
    @DisplayName("세션과 리프레시 토큰이 저장·재조회되고 rememberMe·만료 시각이 유지된다")
    void sessionAndTokenRoundTrip() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        LocalDateTime now = LocalDateTime.now();
        AuthSession savedSession = authSessionRepository.save(AuthSession.create(
                userId, SessionPlatform.WEB, "Chrome · macOS", "Mozilla/5.0", "127.0.0.1",
                true, now, Duration.ofDays(30)));
        authRefreshTokenRepository.save(AuthRefreshToken.issue(savedSession.getId(), "a".repeat(64)));

        AuthSession foundSession = authSessionRepository.findById(savedSession.getId()).orElseThrow();
        assertThat(foundSession.isRememberMe()).isTrue();
        assertThat(foundSession.isUsable(now)).isTrue();
        assertThat(foundSession.getExpiresAt()).isEqualTo(now.plusDays(30));
        assertThat(authRefreshTokenRepository.findByTokenHash("a".repeat(64))).isPresent();
    }

    @Test
    @DisplayName("같은 세션에 ACTIVE 리프레시 토큰은 DB 부분 유니크 인덱스로 최대 1개만 허용된다")
    void activePartialUniqueIndexRejectsSecondActive() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        AuthSession savedSession = authSessionRepository.save(AuthSession.create(
                userId, SessionPlatform.WEB, null, null, null, false,
                LocalDateTime.now(), Duration.ofDays(30)));
        authRefreshTokenRepository.saveAndFlush(AuthRefreshToken.issue(savedSession.getId(), "b".repeat(64)));

        assertThatThrownBy(() -> authRefreshTokenRepository.saveAndFlush(
                AuthRefreshToken.issue(savedSession.getId(), "c".repeat(64))))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("폐기된 세션은 사용 불가로 판정되고 폐기 사유가 기록된다")
    void revokedSessionIsNotUsable() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        LocalDateTime now = LocalDateTime.now();
        AuthSession session = AuthSession.create(userId, SessionPlatform.IOS, "iPhone 15", null, null,
                false, now, Duration.ofDays(30));
        session.revoke(now, SessionRevokeReason.LOGOUT);

        assertThat(session.isUsable(now)).isFalse();
        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.LOGOUT);
    }
}
```

- [ ] **Step 7: 실패 확인** — Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test --tests 'com.duing.domain.user.entity.AuthSessionPersistenceTest'` → Expected: 컴파일 실패(클래스 미존재) 또는 마이그레이션 미적용 실패

- [ ] **Step 8: Step 1~5 구현 후 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL`, 3 tests passed

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/resources/db/migration/V86__create_auth_session_tables.sql backend/src/main/java/com/duing/domain/user/entity backend/src/main/java/com/duing/domain/user/repository backend/src/test/java/com/duing/domain/user/entity/AuthSessionPersistenceTest.java backend/src/test/java/com/duing/common/IntegrationTestBase.java
git commit -m "feat(backend): 인증 세션·리프레시 토큰·감사 이벤트 테이블과 도메인 추가 (V86)"
```

---

### Task 2: RefreshTokenGenerator

**Files:**
- Create: `backend/src/main/java/com/duing/global/auth/RefreshTokenGenerator.java`
- Test: `backend/src/test/java/com/duing/global/auth/RefreshTokenGeneratorTest.java`

**Interfaces (Produces):** `String generate()` — 256bit 랜덤 base64url(43자, 패딩 없음). `String hash(String rawToken)` — SHA-256 소문자 hex 64자.

- [ ] **Step 1: 실패하는 테스트 작성**

```java
package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RefreshTokenGeneratorTest {

    private final RefreshTokenGenerator refreshTokenGenerator = new RefreshTokenGenerator();

    @Test
    @DisplayName("리프레시 토큰은 256bit 엔트로피의 base64url 43자로 생성되고 호출마다 다르다")
    void generatesUniqueUrlSafeTokens() {
        Set<String> generatedTokens = new HashSet<>();
        for (int i = 0; i < 100; i++) {
            String token = refreshTokenGenerator.generate();
            assertThat(token).hasSize(43).matches("[A-Za-z0-9_-]+");
            generatedTokens.add(token);
        }
        assertThat(generatedTokens).hasSize(100);
    }

    @Test
    @DisplayName("해시는 SHA-256 소문자 hex 64자로 결정적이며 원문과 다르다")
    void hashIsDeterministicSha256Hex() {
        String rawToken = refreshTokenGenerator.generate();
        String firstHash = refreshTokenGenerator.hash(rawToken);
        assertThat(firstHash).hasSize(64).matches("[0-9a-f]+").isNotEqualTo(rawToken);
        assertThat(refreshTokenGenerator.hash(rawToken)).isEqualTo(firstHash);
        assertThat(refreshTokenGenerator.hash("known-input"))
                .isEqualTo("d321065cfa88e924a7fed80cdba565fdd28259ce43c4bcdcd1cbdd7290a9e04b");
    }
}
```

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.global.auth.RefreshTokenGeneratorTest'` → Expected: 컴파일 실패

- [ ] **Step 3: 구현**

```java
package com.duing.global.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/**
 * Opaque 리프레시 토큰 생성기 (spec §4) — JWT 가 아닌 256bit 랜덤 값.
 * DB 에는 SHA-256 해시만 저장하고 원문은 응답으로만 나간다.
 */
@Component
public class RefreshTokenGenerator {

    private static final int TOKEN_BYTES = 32;

    private final SecureRandom secureRandom = new SecureRandom();

    public String generate() {
        byte[] randomBytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(randomBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
    }

    public String hash(String rawToken) {
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha256.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 알고리즘을 사용할 수 없습니다.", exception);
        }
    }
}
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL` (known-input 기대 해시가 다르면 테스트 출력의 실제 값으로 교체하지 말고 `echo -n "known-input" | shasum -a 256` 으로 검증 후 잘못된 쪽을 고친다)

- [ ] **Step 5: Commit** — `git add backend/src/main/java/com/duing/global/auth/RefreshTokenGenerator.java backend/src/test/java/com/duing/global/auth/RefreshTokenGeneratorTest.java && git commit -m "feat(backend): opaque 리프레시 토큰 생성·SHA-256 해시 유틸 추가"`

---

### Task 3: Access 30분 핀 + sid 클레임 + hint 수명 재계약

**Files:**
- Modify: `backend/src/main/java/com/duing/global/auth/JwtTokenProvider.java`, `UserPrincipal.java`, `JwtAuthenticationFilter.java`, `AuthHintTokenProvider.java`
- Modify: `backend/src/main/resources/application.yml`, `backend/src/test/resources/application.yml`
- Test: `backend/src/test/java/com/duing/global/auth/AuthTokenContractTest.java`

**Interfaces (Produces):**
- `JwtTokenProvider.createToken(Long userId, String role, int tokenVersion)` — 유지(sid 없음, 기존 테스트 헬퍼 호환), `createToken(Long userId, String role, int tokenVersion, Long sessionId)` — 신규, `TokenClaims(Long userId, int tokenVersion, Long sessionId)`, `long expirySeconds()`
- `UserPrincipal(Long id, String role, Long sessionId)` record + `of(Long id, String role)`(sessionId=null) + `of(Long id, String role, Long sessionId)` + `Long sessionId()`
- `AuthHintTokenProvider.create(String role)` — exp 가 30일(= `duing.auth.refresh.ttl-days`)로 변경, `maxAgeSeconds()` 삭제
- yml: `jwt.expiry-ms` 기본 `1800000`, 신규 `duing.auth.refresh.ttl-days`(30)·`duing.auth.refresh.reuse-grace-seconds`(30)·`duing.auth.session.max-concurrent`(5)·`duing.auth.session.cleanup.enabled`(false)

- [ ] **Step 1: 실패하는 테스트 작성** — `AuthTokenContractTest.java`

```java
package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.auth0.jwt.JWT;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.duing.common.TestcontainersConfiguration;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthTokenContractTest {

    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired AuthHintTokenProvider authHintTokenProvider;

    @Test
    @DisplayName("Access 토큰은 30분 만료이고 세션 id(sid) 클레임을 담아 파싱된다")
    void accessTokenCarriesSidAndThirtyMinuteExpiry() {
        String accessToken = jwtTokenProvider.createToken(7L, "STUDENT", 3, 42L);
        JwtTokenProvider.TokenClaims claims = jwtTokenProvider.parse(accessToken);
        assertThat(claims.userId()).isEqualTo(7L);
        assertThat(claims.tokenVersion()).isEqualTo(3);
        assertThat(claims.sessionId()).isEqualTo(42L);
        assertThat(jwtTokenProvider.expirySeconds()).isEqualTo(1800L);

        DecodedJWT decoded = JWT.decode(accessToken);
        long lifetimeSeconds = Duration.between(
                decoded.getIssuedAt().toInstant(), decoded.getExpiresAt().toInstant()).toSeconds();
        assertThat(lifetimeSeconds).isEqualTo(1800L);
    }

    @Test
    @DisplayName("sid 없는 구버전 토큰도 파싱되며 sessionId 는 null 이다")
    void legacyTokenWithoutSidParsesWithNullSessionId() {
        String legacyToken = jwtTokenProvider.createToken(7L, "STUDENT", 0);
        assertThat(jwtTokenProvider.parse(legacyToken).sessionId()).isNull();
    }

    @Test
    @DisplayName("auth_hint 는 세션 지평선(30일) 만료로 발급되고 클레임 구성은 typ·role·exp 그대로다")
    void authHintExpiresAtSessionHorizonWithUnchangedClaims() {
        DecodedJWT decodedHint = JWT.decode(authHintTokenProvider.create("STUDENT"));
        assertThat(decodedHint.getClaim("typ").asString()).isEqualTo("AUTH_HINT");
        assertThat(decodedHint.getClaim("role").asString()).isEqualTo("STUDENT");
        Instant expectedAround = Instant.now().plus(Duration.ofDays(30));
        assertThat(decodedHint.getExpiresAt().toInstant())
                .isBetween(expectedAround.minusSeconds(60), expectedAround.plusSeconds(60));
        // 미들웨어가 페이로드 키를 정확히 {exp, role, typ} 로 검증하므로 클레임 추가 금지 (spec §10)
        assertThat(decodedHint.getClaims().keySet()).containsExactlyInAnyOrder("typ", "role", "exp");
    }
}
```

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.global.auth.AuthTokenContractTest'` → Expected: FAIL (`createToken` 4-인자 미존재 / expiry 3600)

- [ ] **Step 3: 구현**

`JwtTokenProvider.java` 수정 — 핀·클레임·accessor:

```java
// 상수 교체 (기존 REQUIRED_EXPIRY_MS = 3_600_000L)
private static final long REQUIRED_EXPIRY_MS = 1_800_000L;

// init() 의 예외 메시지 교체
throw new IllegalStateException(
        "웹 인증 계약을 위해 jwt.expiry-ms는 정확히 1,800,000이어야 합니다.");

// createToken — 3-인자는 유지(sid 미포함), 4-인자 신규
public String createToken(Long userId, String role, int tokenVersion) {
    return createToken(userId, role, tokenVersion, null);
}

public String createToken(Long userId, String role, int tokenVersion, Long sessionId) {
    Date now = new Date();
    var jwtBuilder = JWT.create()
            .withSubject(String.valueOf(userId))
            .withClaim("role", role)
            .withClaim("tokenVersion", tokenVersion)
            .withIssuedAt(now)
            .withExpiresAt(new Date(now.getTime() + expiryMs));
    if (sessionId != null) {
        jwtBuilder.withClaim("sid", sessionId);
    }
    return jwtBuilder.sign(algorithm);
}

// parse — sid 추가 (없으면 null)
public TokenClaims parse(String token) throws JWTVerificationException {
    DecodedJWT decoded = verifier.verify(token);
    Long userId = Long.parseLong(decoded.getSubject());
    Integer tokenVersion = decoded.getClaim("tokenVersion").asInt();
    Long sessionId = decoded.getClaim("sid").asLong();
    return new TokenClaims(userId, tokenVersion == null ? 0 : tokenVersion, sessionId);
}

public record TokenClaims(Long userId, int tokenVersion, Long sessionId) {
}

/** 웹 access 쿠키 Max-Age 정렬용 — 토큰 수명(초). */
public long expirySeconds() {
    return expiryMs / 1000;
}
```

기존 `createToken(Long userId, String role)` 2-인자 오버로드는 삭제하지 말고 유지한다(호출처 존재 가능 — 컴파일이 알려준다).

`UserPrincipal.java` — record 헤더와 팩토리만 교체(UserDetails 구현부 유지):

```java
public record UserPrincipal(Long id, String role, Long sessionId) implements UserDetails {

    public static UserPrincipal of(Long id, String role) {
        return new UserPrincipal(id, role, null);
    }

    public static UserPrincipal of(Long id, String role, Long sessionId) {
        return new UserPrincipal(id, role, sessionId);
    }
    // ... 이하 기존 메서드 그대로
```

`new UserPrincipal(...)` 2-인자 직접 생성 호출처가 있으면 `UserPrincipal.of(...)` 로 바꾼다: `grep -rn "new UserPrincipal(" backend/src`

`JwtAuthenticationFilter.java` — sid 전달:

```java
// doFilterInternal 내부 교체
JwtTokenProvider.TokenClaims claims = jwtTokenProvider.parse(candidate.token());
userRepository.findById(claims.userId())
        .filter(user -> user.getTokenVersion() == claims.tokenVersion())
        .ifPresentOrElse(
                user -> authenticate(user, claims.sessionId()),
                SecurityContextHolder::clearContext);

// authenticate 시그니처 교체
private void authenticate(User user, Long sessionId) {
    UserPrincipal principal = UserPrincipal.of(user.getId(), user.getRole().name(), sessionId);
    UsernamePasswordAuthenticationToken authentication =
            new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
    SecurityContextHolder.getContext().setAuthentication(authentication);
}
```

`AuthHintTokenProvider.java` — 수명을 refresh TTL 에 정렬(1시간 핀 제거), 전체 교체:

```java
package com.duing.global.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 미들웨어 라우팅 힌트 토큰 (spec §10). 인증 자격이 아니다 — API 인가는 access 토큰이 전담한다.
 * 수명은 refresh 세션 지평선(30일)에 정렬하고 rotation 마다 재발급된다.
 * 클레임은 정확히 {typ, role, exp} — FE 미들웨어가 키 집합을 검증하므로 추가 금지.
 */
@Component
public class AuthHintTokenProvider {
    private static final int MIN_SECRET_BYTES = 32;
    private static final String HINT_TYPE = "AUTH_HINT";

    private final Algorithm algorithm;
    private final Duration hintLifetime;

    public AuthHintTokenProvider(
            @Value("${web-auth.hint-secret}") String hintSecret,
            @Value("${jwt.secret}") String jwtSecret,
            @Value("${duing.auth.refresh.ttl-days:30}") int refreshTtlDays) {
        validateSecret(hintSecret);
        if (hintSecret.equals(jwtSecret)) {
            throw new IllegalStateException("JWT_SECRET과 AUTH_HINT_SECRET은 서로 다른 값이어야 합니다.");
        }
        this.algorithm = Algorithm.HMAC256(hintSecret);
        this.hintLifetime = Duration.ofDays(refreshTtlDays);
    }

    public String create(String role) {
        Instant expiresAt = Instant.now().plus(hintLifetime);
        return JWT.create()
                .withClaim("typ", HINT_TYPE)
                .withClaim("role", role)
                .withExpiresAt(Date.from(expiresAt))
                .sign(algorithm);
    }

    private void validateSecret(String hintSecret) {
        if (!StringUtils.hasText(hintSecret)
                || hintSecret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("AUTH_HINT_SECRET은 최소 32바이트여야 합니다.");
        }
    }
}
```

주의: `maxAgeSeconds()` 삭제로 `WebAuthCookieService.issue()` 가 컴파일 실패한다 — 이 태스크에서 `WebAuthCookieService` 의 해당 줄만 임시 조치하지 말고, **같은 태스크에서 Task 5 의 최종 형태 대신 최소 수정**을 한다: `issue(...)` 내부의 `long maxAgeSeconds = authHintTokenProvider.maxAgeSeconds();` 를 `long maxAgeSeconds = 1800L;` 로 바꾼다(다음 태스크들에서 전면 개편되므로 임시 상수 — `// Task 5 에서 rememberMe 지속성 계약으로 교체된다` 주석 필수).

`backend/src/main/resources/application.yml` 수정:

```yaml
# jwt 블록 교체
jwt:
  secret: ${JWT_SECRET}
  expiry-ms: ${JWT_EXPIRY_MS:1800000}
```

`duing:` 블록 안(`request:` 위)에 추가:

```yaml
  auth:
    refresh:
      # opaque 리프레시 토큰 수명(일) — sliding, rotation 마다 연장. auth_hint 쿠키 수명도 이 값에 정렬.
      ttl-days: ${DUING_AUTH_REFRESH_TTL_DAYS:30}
      # rotation 직후 구토큰 재제시를 '동시 탭'으로 간주하는 창(초) — 운영 튜닝 노브 (spec §11).
      # 오탐(멀티탭 세션 폐기)이 보이면 넓히고, 안정되면 좁힌다. 코드 상수 아님.
      reuse-grace-seconds: ${DUING_AUTH_REFRESH_REUSE_GRACE_SECONDS:30}
    session:
      # 사용자당 동시 세션 상한 — 초과 로그인 시 LRU 자동 폐기 (spec §13).
      max-concurrent: ${DUING_AUTH_SESSION_MAX_CONCURRENT:5}
      cleanup:
        # 만료/폐기 세션·감사 로그 물리 삭제 잡(매일 04:50 Asia/Seoul). 기본 비활성 —
        # 운영은 application-prod.yml 에서 기본 활성(만료 데이터 삭제만이라 안전).
        enabled: ${DUING_AUTH_SESSION_CLEANUP_ENABLED:false}
```

`backend/src/test/resources/application.yml`: `jwt.expiry-ms: 3600000` → `1800000`.

- [ ] **Step 4: 통과 확인** — Run: `./gradlew test --tests 'com.duing.global.auth.AuthTokenContractTest' --tests 'com.duing.domain.user.controller.WebAuthControllerTest'` → Expected: `BUILD SUCCESSFUL` (WebAuth 는 기존 계약 유지 확인용 — 쿠키 2종 그대로)

- [ ] **Step 5: Commit** — `git add -A backend/src && git commit -m "feat(backend): access 토큰 30분 전환·sid 클레임 추가, auth_hint 수명 세션 지평선 재계약"`

---

### Task 4: AuthSessionService.issue — 세션 발급 + LRU 상한

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/service/AuthSessionService.java`, `GeneralAuthSessionService.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/command/IssueSessionCommand.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/query/IssuedSession.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/AuthSessionIssueTest.java`

**Interfaces:**
- Consumes: Task 1 엔티티/리포지토리, Task 2 `RefreshTokenGenerator`, Task 3 yml 키
- Produces: `IssuedSession issue(IssueSessionCommand command)` — `IssueSessionCommand(Long userId, SessionPlatform platform, String deviceLabel, String userAgent, String ipAddress, boolean rememberMe)`, `IssuedSession(Long sessionId, String refreshToken)`
- **호출 전제(문서화 필수)**: `issue` 는 로그인 트랜잭션(=user 행잠금 보유) 안에서 호출된다 — LRU 계산의 동시성 보호가 이 잠금에 의존한다 (spec §13).

- [ ] **Step 1: DTO 2종 작성**

```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.SessionPlatform;

public record IssueSessionCommand(
        Long userId,
        SessionPlatform platform,
        String deviceLabel,
        String userAgent,
        String ipAddress,
        boolean rememberMe
) {}
```

```java
package com.duing.domain.user.service.dto.query;

/** 로그인 세션 발급 결과 — refreshToken 은 원문(1회성 응답용, 저장 금지). */
public record IssuedSession(Long sessionId, String refreshToken) {}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `AuthSessionIssueTest.java`

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthSessionIssueTest extends IntegrationTestBase {

    @Autowired AuthSessionService authSessionService;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired AuthEventRepository authEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private IssueSessionCommand webCommand(Long userId) {
        return new IssueSessionCommand(userId, SessionPlatform.WEB, "Chrome · macOS",
                "Mozilla/5.0", "127.0.0.1", true);
    }

    @Test
    @DisplayName("세션 발급은 ACTIVE 리프레시 토큰과 LOGIN 감사 이벤트를 남기고 원문 토큰의 해시만 저장한다")
    void issueCreatesSessionActiveTokenAndLoginEvent() {
        Long userId = userRepository.save(UserFixture.unique()).getId();

        IssuedSession issuedSession = authSessionService.issue(webCommand(userId));

        AuthSession savedSession = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow();
        assertThat(savedSession.isRememberMe()).isTrue();
        assertThat(savedSession.getPlatform()).isEqualTo(SessionPlatform.WEB);
        assertThat(authRefreshTokenRepository.findByTokenHash(issuedSession.refreshToken())).isEmpty();
        assertThat(authRefreshTokenRepository.findBySessionIdAndStatus(
                issuedSession.sessionId(), RefreshTokenStatus.ACTIVE)).isPresent();
        assertThat(authEventRepository.findByUserIdOrderByIdAsc(userId))
                .anyMatch(authEvent -> authEvent.getEventType() == AuthEventType.LOGIN);
    }

    @Test
    @DisplayName("동시 세션이 상한(5)에 찬 상태의 로그인은 가장 오래 사용하지 않은 세션을 자동 폐기한다")
    void sixthLoginEvictsLeastRecentlyUsedSession() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        for (int i = 0; i < 5; i++) {
            authSessionService.issue(webCommand(userId));
        }
        List<AuthSession> activeSessions =
                authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(userId);
        Long lruSessionId = activeSessions.get(0).getId();
        // LRU 판정이 last_used_at 기준임을 못박는다 — 가장 오래된 세션을 명시적으로 과거로 민다
        jdbcTemplate.update("UPDATE auth_session SET last_used_at = last_used_at - INTERVAL '1 hour' WHERE id = ?",
                lruSessionId);

        authSessionService.issue(webCommand(userId));

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(userId)).hasSize(5);
        AuthSession evictedSession = authSessionRepository.findById(lruSessionId).orElseThrow();
        assertThat(evictedSession.getRevokeReason()).isEqualTo(SessionRevokeReason.SESSION_LIMIT);
        assertThat(authRefreshTokenRepository.findBySessionIdAndStatus(lruSessionId, RefreshTokenStatus.ACTIVE))
                .isEmpty();
        assertThat(authEventRepository.findByUserIdOrderByIdAsc(userId))
                .anyMatch(authEvent -> authEvent.getEventType() == AuthEventType.SESSION_EVICTED);
    }
}
```

- [ ] **Step 3: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.service.AuthSessionIssueTest'` → Expected: 컴파일 실패(서비스 미존재)

- [ ] **Step 4: 서비스 구현**

`AuthSessionService.java` (인터페이스 — 이후 태스크에서 메서드가 추가된다):

```java
package com.duing.domain.user.service;

import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;

public interface AuthSessionService {

    /**
     * 로그인 세션 + ACTIVE 리프레시 토큰을 발급한다. 상한(5) 초과분은 LRU 폐기.
     * 반드시 로그인 트랜잭션(user 행잠금 보유) 안에서 호출한다 — LRU 동시성 보호 전제 (spec §13).
     */
    IssuedSession issue(IssueSessionCommand issueSessionCommand);
}
```

`GeneralAuthSessionService.java`:

```java
package com.duing.domain.user.service;

import com.duing.domain.user.entity.AuthEvent;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.AuthRefreshToken;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.auth.RefreshTokenGenerator;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@Transactional(readOnly = true)
public class GeneralAuthSessionService implements AuthSessionService {

    private final AuthSessionRepository authSessionRepository;
    private final AuthRefreshTokenRepository authRefreshTokenRepository;
    private final AuthEventRepository authEventRepository;
    private final UserRepository userRepository;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final JwtTokenProvider jwtTokenProvider;
    private final Clock clock;
    private final Duration refreshTtl;
    private final Duration reuseGrace;
    private final int maxConcurrentSessions;

    public GeneralAuthSessionService(
            AuthSessionRepository authSessionRepository,
            AuthRefreshTokenRepository authRefreshTokenRepository,
            AuthEventRepository authEventRepository,
            UserRepository userRepository,
            RefreshTokenGenerator refreshTokenGenerator,
            JwtTokenProvider jwtTokenProvider,
            Clock clock,
            @Value("${duing.auth.refresh.ttl-days:30}") int refreshTtlDays,
            @Value("${duing.auth.refresh.reuse-grace-seconds:30}") long reuseGraceSeconds,
            @Value("${duing.auth.session.max-concurrent:5}") int maxConcurrentSessions) {
        this.authSessionRepository = authSessionRepository;
        this.authRefreshTokenRepository = authRefreshTokenRepository;
        this.authEventRepository = authEventRepository;
        this.userRepository = userRepository;
        this.refreshTokenGenerator = refreshTokenGenerator;
        this.jwtTokenProvider = jwtTokenProvider;
        this.clock = clock;
        this.refreshTtl = Duration.ofDays(refreshTtlDays);
        this.reuseGrace = Duration.ofSeconds(reuseGraceSeconds);
        this.maxConcurrentSessions = maxConcurrentSessions;
    }

    @Override
    @Transactional
    public IssuedSession issue(IssueSessionCommand issueSessionCommand) {
        LocalDateTime now = LocalDateTime.now(clock);
        evictOverLimit(issueSessionCommand, now);

        AuthSession session = authSessionRepository.save(AuthSession.create(
                issueSessionCommand.userId(), issueSessionCommand.platform(),
                issueSessionCommand.deviceLabel(), issueSessionCommand.userAgent(),
                issueSessionCommand.ipAddress(), issueSessionCommand.rememberMe(), now, refreshTtl));
        String rawRefreshToken = refreshTokenGenerator.generate();
        authRefreshTokenRepository.save(
                AuthRefreshToken.issue(session.getId(), refreshTokenGenerator.hash(rawRefreshToken)));
        authEventRepository.save(AuthEvent.of(issueSessionCommand.userId(), session.getId(),
                AuthEventType.LOGIN, issueSessionCommand.platform().name(),
                issueSessionCommand.ipAddress(), issueSessionCommand.userAgent()));
        return new IssuedSession(session.getId(), rawRefreshToken);
    }

    /** 상한 초과분 LRU 폐기 — 엔티티 revoke 를 먼저 모아서 하고, 토큰 벌크 폐기는 한 번에 실행한다. */
    private void evictOverLimit(IssueSessionCommand issueSessionCommand, LocalDateTime now) {
        List<AuthSession> activeSessions = authSessionRepository
                .findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(issueSessionCommand.userId());
        int overflowCount = activeSessions.size() - (maxConcurrentSessions - 1);
        if (overflowCount <= 0) {
            return;
        }
        List<Long> evictedSessionIds = new ArrayList<>();
        for (int i = 0; i < overflowCount; i++) {
            AuthSession lruSession = activeSessions.get(i);
            lruSession.revoke(now, SessionRevokeReason.SESSION_LIMIT);
            evictedSessionIds.add(lruSession.getId());
            authEventRepository.save(AuthEvent.of(issueSessionCommand.userId(), lruSession.getId(),
                    AuthEventType.SESSION_EVICTED, "limit=" + maxConcurrentSessions,
                    issueSessionCommand.ipAddress(), issueSessionCommand.userAgent()));
        }
        authRefreshTokenRepository.revokeBySessionIds(evictedSessionIds, RefreshTokenStatus.REVOKED);
    }
}
```

(`userRepository`·`jwtTokenProvider`·`reuseGrace` 는 Task 6 rotate 에서 사용한다 — 이번 태스크에서는 주입만.)

- [ ] **Step 5: 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL`, 2 tests passed

- [ ] **Step 6: Commit** — `git add backend/src/main/java/com/duing/domain/user/service backend/src/test/java/com/duing/domain/user/service/AuthSessionIssueTest.java && git commit -m "feat(backend): 로그인 세션 발급과 동시 세션 상한(LRU 5) 구현"`

---

### Task 5: 로그인 통합 + 쿠키 계약 개편(rememberMe 지속성 이원화)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/controller/dto/request/LoginRequest.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/command/LoginContext.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/dto/query/LoginResult.java`, `.../controller/dto/response/LoginResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/UserService.java`, `GeneralUserService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/AuthController.java`
- Modify: `backend/src/main/java/com/duing/global/auth/WebAuthCookieService.java`
- Create: `backend/src/main/java/com/duing/global/auth/DeviceLabelParser.java`
- Modify: `backend/src/test/java/com/duing/domain/user/controller/WebAuthControllerTest.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthLoginSessionAcceptanceTest.java`

**Interfaces:**
- Consumes: Task 4 `AuthSessionService.issue`, Task 3 `createToken(..., sessionId)`·`expirySeconds()`
- Produces: `UserService.login(LoginCommand loginCommand, LoginContext loginContext)`, `LoginContext(String clientIp, String userAgent, SessionPlatform platform, String deviceLabel, boolean rememberMe)`, `LoginResult(String accessToken, String refreshToken, UserQuery user)`, `WebAuthCookieService.issue(HttpServletRequest request, HttpServletResponse response, String accessToken, String refreshToken, String role, boolean rememberMe)` / `clear(HttpServletResponse response)`(3종) / 상수 `REFRESH_COOKIE_NAME = "__Secure-duing_refresh_token"`, `REFRESH_COOKIE_PATH = "/api/v1/auth"`, `DeviceLabelParser.summarize(String userAgent)`

- [ ] **Step 1: 실패하는 테스트 작성** — `AuthLoginSessionAcceptanceTest.java`

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.SessionPlatform;
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
class AuthLoginSessionAcceptanceTest extends IntegrationTestBase {

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
                String.format("%08d", unique % 100_000_000L), "세션테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    @Test
    @DisplayName("모바일 로그인 응답은 리프레시 토큰을 포함하고 기기 라벨·플랫폼이 세션에 저장된다")
    void mobileLoginReturnsRefreshTokenAndStoresDeviceMetadata() {
        User user = saveUser();

        given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD,
                        "deviceLabel", "iPhone 15 Pro", "platform", "IOS"))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.refreshToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"));

        var sessions = authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId());
        assertThat(sessions).hasSize(1);
        assertThat(sessions.get(0).getPlatform()).isEqualTo(SessionPlatform.IOS);
        assertThat(sessions.get(0).getDeviceLabel()).isEqualTo("iPhone 15 Pro");
    }

    @Test
    @DisplayName("rememberMe 로그인은 3종 Persistent Cookie(access 30분·refresh/hint 30일)를 발급한다")
    void rememberMeLoginIssuesPersistentCookies() {
        User user = saveUser();

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD, "rememberMe", true))
                .when().post("/api/v1/auth/web/login");

        response.then().statusCode(HttpStatus.OK.value());
        List<String> cookies = response.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        assertThat(cookieOf(cookies, WebAuthCookieService.ACCESS_COOKIE_NAME)).contains("Max-Age=1800");
        assertThat(cookieOf(cookies, WebAuthCookieService.REFRESH_COOKIE_NAME))
                .contains("Max-Age=2592000", "Path=/api/v1/auth");
        assertThat(cookieOf(cookies, WebAuthCookieService.AUTH_HINT_COOKIE_NAME)).contains("Max-Age=2592000");
    }

    @Test
    @DisplayName("rememberMe 미지정(기본) 로그인은 Max-Age 없는 세션 쿠키 3종을 발급한다")
    void defaultLoginIssuesSessionCookies() {
        User user = saveUser();

        Response response = given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");

        response.then().statusCode(HttpStatus.OK.value());
        List<String> cookies = response.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        for (String cookieHeader : cookies) {
            assertThat(cookieHeader).doesNotContain("Max-Age").doesNotContain("Expires");
            assertThat(cookieHeader).contains("HttpOnly", "Secure", "SameSite=Lax");
        }
        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .singleElement()
                .satisfies(session -> assertThat(session.isRememberMe()).isFalse());
    }

    private String cookieOf(List<String> cookies, String cookieName) {
        return cookies.stream().filter(header -> header.startsWith(cookieName + "="))
                .findFirst().orElseThrow(() -> new AssertionError(cookieName + " Set-Cookie 헤더가 없습니다."));
    }
}
```

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthLoginSessionAcceptanceTest'` → Expected: FAIL (refreshToken null / 쿠키 2종)

- [ ] **Step 3: DTO·서비스 시그니처 수정**

`LoginRequest.java` 전체 교체:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.LoginCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{8}", message = "학번은 8자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        String password,

        @Size(max = 100, message = "기기 이름은 100자 이하여야 합니다.")
        String deviceLabel,

        String platform,

        Boolean rememberMe
) {
    public LoginCommand toCommand() {
        return new LoginCommand(studentId, password);
    }

    /** 웹 전용 의미 — 미지정(null)은 false(세션 쿠키). 모바일 로그인은 이 값을 무시한다 (spec §8). */
    public boolean rememberMeOrDefault() {
        return Boolean.TRUE.equals(rememberMe);
    }
}
```

`LoginContext.java` 신규:

```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.SessionPlatform;

/** 로그인 요청의 세션 메타데이터 — transport(웹/모바일)별 구성은 컨트롤러 책임. */
public record LoginContext(
        String clientIp,
        String userAgent,
        SessionPlatform platform,
        String deviceLabel,
        boolean rememberMe
) {}
```

`LoginResult.java`: `public record LoginResult(String accessToken, String refreshToken, UserQuery user) {}`

`LoginResponse.java`:

```java
public record LoginResponse(
        String accessToken,
        String tokenType,
        String refreshToken,
        UserResponse user
) {
    public static LoginResponse from(LoginResult loginResult) {
        return new LoginResponse(
                loginResult.accessToken(),
                "Bearer",
                loginResult.refreshToken(),
                UserResponse.from(loginResult.user())
        );
    }
}
```

`UserService.java`: `LoginResult login(LoginCommand loginCommand, String clientIp);` → `LoginResult login(LoginCommand loginCommand, LoginContext loginContext);` (import 추가)

`GeneralUserService.java` — 필드 `private final AuthSessionService authSessionService;` 추가, `login` 교체:

```java
public LoginResult login(LoginCommand loginCommand, LoginContext loginContext) {
    LocalDateTime now = LocalDateTime.now();
    loginAttemptRateLimiter.assertWithinLimit(loginContext.clientIp(), now);

    User user = userRepository.findByStudentIdForUpdate(loginCommand.studentId()).orElse(null);
    if (user == null) {
        burnPasswordComparison(loginCommand.rawPassword());
        loginAttemptRateLimiter.recordFailureOrThrow(loginContext.clientIp(), now);
        throw new UserException.InvalidCredentialsException();
    }

    if (user.isLocked(now)) {
        loginAttemptRateLimiter.recordFailureOrThrow(loginContext.clientIp(), now);
        throw new UserException.AccountLockedException();
    }

    if (!passwordEncoder.matches(loginCommand.rawPassword(), user.getPasswordHash())) {
        user.recordFailedLogin(MAX_FAILED_LOGIN_ATTEMPTS, LOGIN_LOCK_DURATION, now);
        loginAttemptRateLimiter.recordFailureOrThrow(loginContext.clientIp(), now);
        throw new UserException.InvalidCredentialsException();
    }

    user.recordSuccessfulLogin();
    // 세션 발급은 이 트랜잭션의 user 행잠금 안 — LRU 상한 계산의 동시성 보호 전제 (spec §13)
    IssuedSession issuedSession = authSessionService.issue(new IssueSessionCommand(
            user.getId(), loginContext.platform(), loginContext.deviceLabel(),
            loginContext.userAgent(), loginContext.clientIp(), loginContext.rememberMe()));
    String accessToken = jwtTokenProvider.createToken(
            user.getId(), user.getRole().name(), user.getTokenVersion(), issuedSession.sessionId());
    return new LoginResult(accessToken, issuedSession.refreshToken(), UserQuery.from(user));
}
```

기존 주석(레이트리밋·행잠금·타이밍 방어 설명)은 그대로 유지한다. `login(command, clientIp)` 를 호출하는 다른 테스트가 있으면 `new LoginContext(clientIp, null, SessionPlatform.UNKNOWN, null, false)` 로 맞춘다(컴파일 에러가 알려준다).

- [ ] **Step 4: WebAuthCookieService 개편 + DeviceLabelParser + 컨트롤러**

`WebAuthCookieService.java` 전체 교체:

```java
package com.duing.global.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 웹 인증 쿠키 3종(access·refresh·auth_hint) 발급/삭제 (spec §10).
 * rememberMe=false 면 3종 모두 세션 쿠키(Max-Age 미기록) — refresh 만 내리면 브라우저 재시작 후
 * access 잔여 수명과 hint 가 "종료 시 로그아웃" 약속을 깨기 때문 (spec §10.1).
 */
@Component
public class WebAuthCookieService {
    public static final String ACCESS_COOKIE_NAME = "__Host-duing_access_token";
    public static final String REFRESH_COOKIE_NAME = "__Secure-duing_refresh_token";
    public static final String AUTH_HINT_COOKIE_NAME = "auth_hint";
    /** __Host- 는 Path=/ 를 강제하므로 경로 스코프(auth 전용 전송)엔 __Secure- 프리픽스를 쓴다. */
    public static final String REFRESH_COOKIE_PATH = "/api/v1/auth";
    private static final String PRODUCTION_HINT_COOKIE_DOMAIN = ".duings.com";
    private static final long SESSION_COOKIE = -1L; // 음수 Max-Age = 속성 미기록(브라우저 세션 쿠키)

    private final AuthHintTokenProvider authHintTokenProvider;
    private final JwtTokenProvider jwtTokenProvider;
    private final String hintCookieDomain;
    private final long refreshMaxAgeSeconds;

    public WebAuthCookieService(
            AuthHintTokenProvider authHintTokenProvider,
            JwtTokenProvider jwtTokenProvider,
            @Value("${web-auth.hint-cookie-domain:}") String hintCookieDomain,
            @Value("${duing.auth.refresh.ttl-days:30}") int refreshTtlDays,
            Environment environment) {
        if (environment.acceptsProfiles(Profiles.of("prod"))
                && !PRODUCTION_HINT_COOKIE_DOMAIN.equals(hintCookieDomain)) {
            throw new IllegalStateException(
                    "운영 AUTH_HINT_COOKIE_DOMAIN은 정확히 .duings.com이어야 합니다.");
        }
        this.authHintTokenProvider = authHintTokenProvider;
        this.jwtTokenProvider = jwtTokenProvider;
        this.hintCookieDomain = hintCookieDomain;
        this.refreshMaxAgeSeconds = refreshTtlDays * 86_400L;
    }

    public void issue(
            HttpServletRequest request,
            HttpServletResponse response,
            String accessToken,
            String refreshToken,
            String role,
            boolean rememberMe) {
        requireSecureOrLocalhost(request);
        add(response, accessCookie(accessToken,
                rememberMe ? jwtTokenProvider.expirySeconds() : SESSION_COOKIE));
        add(response, refreshCookie(refreshToken, rememberMe ? refreshMaxAgeSeconds : SESSION_COOKIE));
        add(response, hintCookie(authHintTokenProvider.create(role),
                rememberMe ? refreshMaxAgeSeconds : SESSION_COOKIE));
    }

    public void clear(HttpServletResponse response) {
        add(response, accessCookie("", 0));
        add(response, refreshCookie("", 0));
        add(response, hintCookie("", 0));
    }

    private ResponseCookie accessCookie(String value, long maxAgeSeconds) {
        return baseCookie(ACCESS_COOKIE_NAME, value, "/", maxAgeSeconds).build();
    }

    private ResponseCookie refreshCookie(String value, long maxAgeSeconds) {
        return baseCookie(REFRESH_COOKIE_NAME, value, REFRESH_COOKIE_PATH, maxAgeSeconds).build();
    }

    private ResponseCookie hintCookie(String value, long maxAgeSeconds) {
        ResponseCookie.ResponseCookieBuilder builder =
                baseCookie(AUTH_HINT_COOKIE_NAME, value, "/", maxAgeSeconds);
        if (StringUtils.hasText(hintCookieDomain)) {
            builder.domain(hintCookieDomain);
        }
        return builder.build();
    }

    private ResponseCookie.ResponseCookieBuilder baseCookie(
            String name, String value, String path, long maxAgeSeconds) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path(path)
                .maxAge(maxAgeSeconds);
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

`DeviceLabelParser.java` 신규:

```java
package com.duing.global.auth;

/** 웹 세션 목록 표시용 UA 경량 요약 — 외부 파서 의존성 없이 대표 브라우저·OS 만 식별한다. */
public final class DeviceLabelParser {

    private DeviceLabelParser() {
    }

    public static String summarize(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return null;
        }
        String browser = userAgent.contains("Edg/") ? "Edge"
                : userAgent.contains("SamsungBrowser/") ? "Samsung Internet"
                : userAgent.contains("Firefox/") ? "Firefox"
                : userAgent.contains("Chrome/") ? "Chrome"
                : userAgent.contains("Safari/") ? "Safari"
                : "브라우저";
        // iPhone/iPad UA 는 "like Mac OS X" 를 포함하므로 iOS 판정을 macOS 보다 먼저 둔다
        String operatingSystem = userAgent.contains("Windows") ? "Windows"
                : (userAgent.contains("iPhone") || userAgent.contains("iPad")) ? "iOS"
                : userAgent.contains("Mac OS X") ? "macOS"
                : userAgent.contains("Android") ? "Android"
                : null;
        return operatingSystem == null ? browser : browser + " · " + operatingSystem;
    }
}
```

`AuthController.java` — `login`·`webLogin` 교체(나머지 메서드 유지):

```java
@Override
public ResponseEntity<ApiResponse<LoginResponse>> login(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest httpServletRequest) {
    String clientIp = httpServletRequest.getRemoteAddr();
    String userAgent = httpServletRequest.getHeader("User-Agent");
    LoginContext loginContext = new LoginContext(clientIp, userAgent,
            SessionPlatform.from(loginRequest.platform()),
            loginRequest.deviceLabel() != null ? loginRequest.deviceLabel()
                    : DeviceLabelParser.summarize(userAgent),
            false);
    LoginResponse loginResponse =
            LoginResponse.from(userService.login(loginRequest.toCommand(), loginContext));
    return ResponseEntity.ok(ApiResponse.success(loginResponse));
}

@Override
public ResponseEntity<ApiResponse<WebLoginResponse>> webLogin(
        @Valid @RequestBody LoginRequest loginRequest,
        HttpServletRequest httpServletRequest,
        HttpServletResponse httpServletResponse) {
    String clientIp = httpServletRequest.getRemoteAddr();
    String userAgent = httpServletRequest.getHeader("User-Agent");
    boolean rememberMe = loginRequest.rememberMeOrDefault();
    LoginContext loginContext = new LoginContext(clientIp, userAgent, SessionPlatform.WEB,
            DeviceLabelParser.summarize(userAgent), rememberMe);
    LoginResult loginResult = userService.login(loginRequest.toCommand(), loginContext);
    webAuthCookieService.issue(
            httpServletRequest,
            httpServletResponse,
            loginResult.accessToken(),
            loginResult.refreshToken(),
            loginResult.user().role().name(),
            rememberMe);
    return ResponseEntity.ok(ApiResponse.success(WebLoginResponse.from(loginResult)));
}
```

import 추가: `SessionPlatform`, `LoginContext`, `DeviceLabelParser`.

- [ ] **Step 5: WebAuthControllerTest 를 쿠키 3종 계약으로 갱신**

헬퍼 3개를 다음으로 교체(테스트 본문은 그대로 두면 통과한다 — 기본 로그인은 세션 쿠키 모드):

```java
private void assertIssuedCookies(Response response) {
    List<String> cookies = setCookieHeaders(response);
    assertThat(cookies).hasSize(3);
    assertThat(cookieHeader(cookies, WebAuthCookieService.ACCESS_COOKIE_NAME))
            .contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/")
            .doesNotContain("Max-Age");
    assertThat(cookieHeader(cookies, WebAuthCookieService.REFRESH_COOKIE_NAME))
            .contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/api/v1/auth")
            .doesNotContain("Max-Age");
    assertThat(cookieHeader(cookies, WebAuthCookieService.AUTH_HINT_COOKIE_NAME))
            .contains("HttpOnly", "Secure", "SameSite=Lax", "Path=/")
            .doesNotContain("Max-Age");
}

private void assertClearedCookies(Response response) {
    List<String> cookies = setCookieHeaders(response);
    assertThat(cookies).hasSize(3);
    assertThat(cookieHeader(cookies, WebAuthCookieService.ACCESS_COOKIE_NAME)).contains("Max-Age=0");
    assertThat(cookieHeader(cookies, WebAuthCookieService.REFRESH_COOKIE_NAME)).contains("Max-Age=0");
    assertThat(cookieHeader(cookies, WebAuthCookieService.AUTH_HINT_COOKIE_NAME)).contains("Max-Age=0");
}
```

- [ ] **Step 6: 통과 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthLoginSessionAcceptanceTest' --tests 'com.duing.domain.user.controller.WebAuthControllerTest' --tests 'com.duing.domain.user.controller.AuthStudentIdLoginTest'` → Expected: `BUILD SUCCESSFUL` (AuthStudentIdLoginTest 등 로그인 경유 테스트의 컴파일 에러는 LoginContext 로 보정)

- [ ] **Step 7: Commit** — `git add -A backend/src && git commit -m "feat(backend): 로그인 세션 연동·rememberMe 쿠키 지속성 이원화·refresh 쿠키 발급"`

---

### Task 6: rotate() — 정상 Rotation·Sliding·실패 401

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/exception/AuthSessionException.java`
- Create: `backend/src/main/java/com/duing/domain/user/service/dto/query/RotationResult.java`
- Modify: `backend/src/main/java/com/duing/domain/user/service/AuthSessionService.java`, `GeneralAuthSessionService.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/AuthSessionRotationTest.java`

**Interfaces:**
- Consumes: Task 4 `issue`, Task 1 리포지토리, Task 3 `createToken(..., sessionId)`
- Produces: `RotationResult rotate(String rawRefreshToken)` — `RotationResult(String accessToken, String refreshToken, String role, boolean rememberMe)`, `AuthSessionException.SessionExpiredException`(401, code `AUTH_SESSION_EXPIRED`)

- [ ] **Step 1: 예외·DTO 작성**

`AuthSessionException.java`:

```java
package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class AuthSessionException extends ApplicationException {

    protected AuthSessionException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    /**
     * Refresh 실패는 사유 불문 단일 401 — 재사용 탐지 여부를 외부에 구분해 주지 않는다 (spec §8).
     * 상세 사유는 auth_event·Sentry 로만 남긴다.
     */
    public static class SessionExpiredException extends AuthSessionException {
        private static final String MESSAGE = "로그인이 만료되었습니다. 다시 로그인해주세요.";

        public SessionExpiredException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED, "AUTH_SESSION_EXPIRED");
        }
    }
}
```

`RotationResult.java`:

```java
package com.duing.domain.user.service.dto.query;

/** Rotation 결과 — refreshToken 은 원문(응답 전용), rememberMe 는 웹 쿠키 지속성 복원용 (spec §10.1). */
public record RotationResult(
        String accessToken,
        String refreshToken,
        String role,
        boolean rememberMe
) {}
```

- [ ] **Step 2: 실패하는 테스트 작성** — `AuthSessionRotationTest.java`

```java
package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.exception.AuthSessionException;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.domain.user.service.dto.query.RotationResult;
import com.duing.global.auth.JwtTokenProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthSessionRotationTest extends IntegrationTestBase {

    @Autowired AuthSessionService authSessionService;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private IssuedSession issueFor(Long userId, boolean rememberMe) {
        return authSessionService.issue(new IssueSessionCommand(
                userId, SessionPlatform.WEB, "Chrome · macOS", "Mozilla/5.0", "127.0.0.1", rememberMe));
    }

    @Test
    @DisplayName("정상 rotation 은 새 토큰 쌍을 발급하고 구토큰을 ROTATED, 세션 만료를 sliding 연장한다")
    void rotationIssuesNewPairAndSlidesExpiry() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession issuedSession = issueFor(userId, true);
        // sliding 연장을 관측할 수 있게 만료를 과거 방향으로 당겨 둔다(상대시간)
        jdbcTemplate.update("UPDATE auth_session SET expires_at = expires_at - INTERVAL '10 days' WHERE id = ?",
                issuedSession.sessionId());
        var expiresBefore = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow().getExpiresAt();

        RotationResult rotationResult = authSessionService.rotate(issuedSession.refreshToken());

        assertThat(rotationResult.refreshToken()).isNotEqualTo(issuedSession.refreshToken());
        assertThat(rotationResult.rememberMe()).isTrue();
        assertThat(jwtTokenProvider.parse(rotationResult.accessToken()).sessionId())
                .isEqualTo(issuedSession.sessionId());
        var tokens = authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId());
        assertThat(tokens).hasSize(2);
        assertThat(tokens.get(0).getStatus()).isEqualTo(RefreshTokenStatus.ROTATED);
        assertThat(tokens.get(1).getStatus()).isEqualTo(RefreshTokenStatus.ACTIVE);
        var refreshedSession = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow();
        assertThat(refreshedSession.getExpiresAt()).isAfter(expiresBefore);
    }

    @Test
    @DisplayName("존재하지 않는 리프레시 토큰은 세션 만료 401로 거부된다")
    void unknownTokenIsRejected() {
        assertThatThrownBy(() -> authSessionService.rotate("never-issued-token"))
                .isInstanceOf(AuthSessionException.SessionExpiredException.class);
    }

    @Test
    @DisplayName("만료된 세션의 리프레시 토큰은 거부된다")
    void expiredSessionIsRejected() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession issuedSession = issueFor(userId, false);
        jdbcTemplate.update("UPDATE auth_session SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = ?",
                issuedSession.sessionId());

        assertThatThrownBy(() -> authSessionService.rotate(issuedSession.refreshToken()))
                .isInstanceOf(AuthSessionException.SessionExpiredException.class);
    }

    @Test
    @DisplayName("폐기된 세션의 리프레시 토큰은 거부된다")
    void revokedSessionIsRejected() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession issuedSession = issueFor(userId, false);
        jdbcTemplate.update(
                "UPDATE auth_session SET revoked_at = NOW(), revoke_reason = 'LOGOUT' WHERE id = ?",
                issuedSession.sessionId());

        assertThatThrownBy(() -> authSessionService.rotate(issuedSession.refreshToken()))
                .isInstanceOf(AuthSessionException.SessionExpiredException.class);
    }
}
```

- [ ] **Step 3: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.service.AuthSessionRotationTest'` → Expected: 컴파일 실패(rotate 미존재)

- [ ] **Step 4: rotate 구현**

`AuthSessionService.java` 에 추가:

```java
    /**
     * Refresh Rotation (spec §11) — 검증→구토큰 폐기→새 쌍 발급→sliding 을 세션 행잠금 안에서
     * 원자 처리한다. 실패는 사유 불문 SessionExpiredException(401).
     */
    RotationResult rotate(String rawRefreshToken);
```

(import: `com.duing.domain.user.service.dto.query.RotationResult`)

`GeneralAuthSessionService.java` 에 추가 — Task 7 에서 ROTATED 분기에 grace 가 더해진다:

```java
    @Override
    @Transactional
    public RotationResult rotate(String rawRefreshToken) {
        LocalDateTime now = LocalDateTime.now(clock);
        String tokenHash = refreshTokenGenerator.hash(rawRefreshToken);
        // 잠금 순서 불변식(user → session → token)에 맞추기 위해 스칼라로 세션 id 만 먼저 얻는다.
        // 엔티티를 영속성 컨텍스트에 올리지 않아, 잠금 획득 후 재조회가 최신 상태를 읽는다.
        Long sessionId = authRefreshTokenRepository.findSessionIdByTokenHash(tokenHash)
                .orElseThrow(AuthSessionException.SessionExpiredException::new);
        AuthSession session = authSessionRepository.findByIdForUpdate(sessionId)
                .orElseThrow(AuthSessionException.SessionExpiredException::new);
        AuthRefreshToken presentedToken = authRefreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(AuthSessionException.SessionExpiredException::new);
        if (!session.isUsable(now)) {
            throw new AuthSessionException.SessionExpiredException();
        }
        // 연관 아닌 명시 조회 — 탈퇴(soft-delete) 사용자는 @SQLRestriction 으로 미발견 → 401
        User user = userRepository.findById(session.getUserId())
                .orElseThrow(AuthSessionException.SessionExpiredException::new);

        switch (presentedToken.getStatus()) {
            case ACTIVE -> presentedToken.markRotated(now);
            case ROTATED, REVOKED -> detectReuse(session, presentedToken, now);
        }

        // Hibernate flush 는 INSERT 를 UPDATE 보다 먼저 실행한다 — 상태 전이를 먼저 flush 하지 않으면
        // 새 ACTIVE INSERT 가 구 ACTIVE 와 부분 유니크(uq_auth_refresh_token_active)에서 충돌한다.
        authRefreshTokenRepository.flush();
        String newRawRefreshToken = refreshTokenGenerator.generate();
        authRefreshTokenRepository.save(
                AuthRefreshToken.issue(sessionId, refreshTokenGenerator.hash(newRawRefreshToken)));
        session.touch(now, refreshTtl);
        String accessToken = jwtTokenProvider.createToken(
                user.getId(), user.getRole().name(), user.getTokenVersion(), sessionId);
        return new RotationResult(accessToken, newRawRefreshToken,
                user.getRole().name(), session.isRememberMe());
    }

    /** 폐기 토큰 재사용 = Replay/탈취 — 해당 세션(패밀리)만 폐기하고 감사·모니터링에 남긴다 (spec §5.4). */
    private void detectReuse(AuthSession session, AuthRefreshToken presentedToken, LocalDateTime now) {
        session.revoke(now, SessionRevokeReason.REUSE_DETECTED);
        authRefreshTokenRepository.revokeBySessionIds(
                List.of(session.getId()), RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(session.getUserId(), session.getId(),
                AuthEventType.REUSE_DETECTED, "tokenId=" + presentedToken.getId(), null, null));
        // ERROR 레벨은 logback-Sentry 연동으로 이벤트 전송된다 — 보안 모니터링 (spec §18.2)
        log.error("리프레시 토큰 재사용 탐지 — 세션 폐기. userId={}, sessionId={}",
                session.getUserId(), session.getId());
        throw new AuthSessionException.SessionExpiredException();
    }
```

(import 추가: `AuthSessionException`, `RotationResult`, `User`)

주의: `detectReuse` 는 예외로 종료하므로 switch 이후 코드는 ACTIVE(→Task 7 에서 grace 포함) 경로만 도달한다. `rotate` 는 쓰기 오케스트레이션 — 클래스 레벨 `readOnly=true` 를 메서드 `@Transactional` 이 덮는지 반드시 확인(콜드 경로 실PG 함정 전례).

- [ ] **Step 5: 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL`, 4 tests passed

- [ ] **Step 6: Commit** — `git add -A backend/src && git commit -m "feat(backend): refresh rotation·sliding 연장·재사용 시 세션 폐기 구현"`

---

### Task 7: Grace Window — 동시 탭 latest-wins

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralAuthSessionService.java`
- Test: `backend/src/test/java/com/duing/domain/user/service/AuthSessionRotationTest.java` (추가)

**Interfaces:** Consumes: Task 6 `rotate`. 외부 시그니처 변화 없음 — ROTATED 분기 내부만 변경.

- [ ] **Step 1: 실패하는 테스트 추가** — `AuthSessionRotationTest` 에 2개 추가:

```java
    @Test
    @DisplayName("rotation 직후 grace 창 안의 구토큰 재제시는 동시 탭으로 간주되어 세션을 유지하고 latest-wins 로 체인을 잇는다")
    void reuseWithinGraceKeepsSessionWithLatestWins() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession issuedSession = issueFor(userId, false);
        RotationResult firstRotation = authSessionService.rotate(issuedSession.refreshToken());

        // grace(기본 30초) 안 — 방금 ROTATED 된 구토큰을 다시 제시(다른 탭 시나리오)
        RotationResult graceRotation = authSessionService.rotate(issuedSession.refreshToken());

        assertThat(graceRotation.refreshToken())
                .isNotEqualTo(firstRotation.refreshToken())
                .isNotEqualTo(issuedSession.refreshToken());
        var session = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow();
        assertThat(session.getRevokedAt()).isNull();
        var tokens = authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId());
        assertThat(tokens).hasSize(3);
        assertThat(tokens.get(0).getStatus()).isEqualTo(RefreshTokenStatus.ROTATED);   // 최초 토큰
        assertThat(tokens.get(1).getStatus()).isEqualTo(RefreshTokenStatus.REVOKED);   // 직전 후계 — 밀려남
        assertThat(tokens.get(2).getStatus()).isEqualTo(RefreshTokenStatus.ACTIVE);    // latest-wins
    }

    @Test
    @DisplayName("grace 창을 지난 구토큰 재사용은 Replay 로 간주되어 세션 전체가 폐기되고 감사 이벤트가 남는다")
    void reuseAfterGraceRevokesWholeSession() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession issuedSession = issueFor(userId, false);
        authSessionService.rotate(issuedSession.refreshToken());
        // grace(30초) 바깥으로 — rotated_at 을 상대시간으로 과거 이동
        jdbcTemplate.update(
                "UPDATE auth_refresh_token SET rotated_at = rotated_at - INTERVAL '31 seconds' "
                        + "WHERE session_id = ? AND status = 'ROTATED'",
                issuedSession.sessionId());

        assertThatThrownBy(() -> authSessionService.rotate(issuedSession.refreshToken()))
                .isInstanceOf(AuthSessionException.SessionExpiredException.class);

        var session = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow();
        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.REUSE_DETECTED);
        assertThat(authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId()))
                .allMatch(token -> token.getStatus() == RefreshTokenStatus.REVOKED);
        assertThat(authEventRepository.findByUserIdOrderByIdAsc(userId))
                .anyMatch(authEvent -> authEvent.getEventType() == AuthEventType.REUSE_DETECTED);
    }
```

(테스트 클래스에 `@Autowired AuthEventRepository authEventRepository;` 와 import `SessionRevokeReason`, `AuthEventType` 추가)

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.service.AuthSessionRotationTest'` → Expected: grace 테스트 FAIL (현재는 ROTATED 즉시 재사용 판정)

- [ ] **Step 3: ROTATED 분기에 grace 적용** — `rotate` 의 switch 교체:

```java
        switch (presentedToken.getStatus()) {
            case ACTIVE -> presentedToken.markRotated(now);
            case ROTATED -> {
                if (presentedToken.isReusableWithinGrace(now, reuseGrace)) {
                    // 동시 탭 latest-wins (spec §5.3): 직전 후계(현재 ACTIVE)를 REVOKED 로 밀어내고
                    // 새 체인을 잇는다. 구토큰은 ROTATED 그대로 — grace 기준점(rotated_at)을 보존한다.
                    authRefreshTokenRepository
                            .findBySessionIdAndStatus(session.getId(), RefreshTokenStatus.ACTIVE)
                            .ifPresent(AuthRefreshToken::markRevoked);
                } else {
                    detectReuse(session, presentedToken, now);
                }
            }
            case REVOKED -> detectReuse(session, presentedToken, now);
        }
```

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL`, 6 tests passed

- [ ] **Step 5: Commit** — `git add -A backend/src && git commit -m "feat(backend): 동시 탭 grace window latest-wins 로 rotation 오탐 제거"`

---

### Task 8: Refresh API 2종 + CSRF Origin 경로

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java`, `.../controller/AuthController.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/RefreshRequest.java`, `.../dto/response/RefreshResponse.java`
- Modify: `backend/src/main/java/com/duing/global/auth/CookieCsrfOriginFilter.java`
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthRefreshControllerTest.java`

**Interfaces:**
- Consumes: Task 6~7 `rotate`, Task 5 `WebAuthCookieService.issue(...)`·`REFRESH_COOKIE_NAME`
- Produces: `POST /api/v1/auth/refresh` (바디 `{refreshToken}` → 200 `{accessToken, tokenType, refreshToken}`), `POST /api/v1/auth/web/refresh` (쿠키 → 204 + Set-Cookie 3종). SecurityConfig 는 `/auth/**` permitAll 이라 변경 없음.

- [ ] **Step 1: 실패하는 테스트 작성** — `AuthRefreshControllerTest.java`

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
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
class AuthRefreshControllerTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;
    @Autowired UserRepository userRepository;
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
                String.format("%08d", unique % 100_000_000L), "갱신테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private Response webLogin(User user, boolean rememberMe) {
        return given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD,
                        "rememberMe", rememberMe))
                .when().post("/api/v1/auth/web/login");
    }

    @Test
    @DisplayName("웹 refresh 는 쿠키 3종을 재발급하고 rememberMe 지속성 모드를 유지한다")
    void webRefreshReissuesCookiesKeepingPersistenceMode() {
        User user = saveUser();
        String persistentRefreshCookie =
                webLogin(user, true).getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        Response refreshResponse = given()
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, persistentRefreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        List<String> cookies = refreshResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE);
        assertThat(cookies).hasSize(3);
        assertThat(cookies).anyMatch(header ->
                header.startsWith(WebAuthCookieService.REFRESH_COOKIE_NAME + "=")
                        && header.contains("Max-Age=2592000"));
    }

    @Test
    @DisplayName("세션 쿠키 모드 로그인의 refresh 재발급도 Max-Age 없는 세션 쿠키를 유지한다")
    void webRefreshKeepsSessionCookieMode() {
        User user = saveUser();
        String sessionRefreshCookie =
                webLogin(user, false).getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        Response refreshResponse = given()
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, sessionRefreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh");

        assertThat(refreshResponse.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        for (String cookieHeader : refreshResponse.getHeaders().getValues(HttpHeaders.SET_COOKIE)) {
            assertThat(cookieHeader).doesNotContain("Max-Age").doesNotContain("Expires");
        }
    }

    @Test
    @DisplayName("웹 refresh 는 허용 Origin 없이는 403으로 거부된다")
    void webRefreshRequiresAllowedOrigin() {
        User user = saveUser();
        String refreshCookie = webLogin(user, true).getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        given().cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("refresh 쿠키가 없는 웹 refresh 는 세션 만료 401 코드를 반환한다")
    void webRefreshWithoutCookieReturnsSessionExpired() {
        given().header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", equalTo("AUTH_SESSION_EXPIRED"));
    }

    @Test
    @DisplayName("모바일 refresh 는 새 access·refresh 쌍을 바디로 반환한다")
    void mobileRefreshReturnsNewTokenPair() {
        User user = saveUser();
        String mobileRefreshToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.refreshToken");

        given().contentType(ContentType.JSON)
                .body(Map.of("refreshToken", mobileRefreshToken))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.accessToken", notNullValue())
                .body("data.tokenType", equalTo("Bearer"))
                .body("data.refreshToken", notNullValue());
    }

    @Test
    @DisplayName("위조된 리프레시 토큰의 모바일 refresh 는 세션 만료 401 코드를 반환한다")
    void mobileRefreshWithUnknownTokenReturnsSessionExpired() {
        given().contentType(ContentType.JSON)
                .body(Map.of("refreshToken", "forged-refresh-token"))
                .when().post("/api/v1/auth/refresh")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value())
                .body("code", equalTo("AUTH_SESSION_EXPIRED"));
    }
}
```

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthRefreshControllerTest'` → Expected: FAIL (404)

- [ ] **Step 3: DTO·API·컨트롤러·필터 구현**

`RefreshRequest.java`:

```java
package com.duing.domain.user.controller.dto.request;

import jakarta.validation.constraints.NotBlank;

public record RefreshRequest(
        @NotBlank(message = "리프레시 토큰은 필수 입력값입니다.")
        String refreshToken
) {}
```

`RefreshResponse.java`:

```java
package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.RotationResult;

public record RefreshResponse(
        String accessToken,
        String tokenType,
        String refreshToken
) {
    public static RefreshResponse from(RotationResult rotationResult) {
        return new RefreshResponse(rotationResult.accessToken(), "Bearer", rotationResult.refreshToken());
    }
}
```

`AuthApi.java` 에 추가(webLogout 선언 아래):

```java
    @Operation(summary = "토큰 갱신(모바일)",
            description = "리프레시 토큰을 회전시켜 새 access·refresh 쌍을 발급한다. 기존 리프레시 토큰은 "
                    + "즉시 폐기되며, 폐기된 토큰의 재사용은 세션 폐기로 이어진다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "갱신 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "만료·폐기·재사용 리프레시 토큰(AUTH_SESSION_EXPIRED)")
    })
    @PostMapping("/auth/refresh")
    ResponseEntity<ApiResponse<RefreshResponse>> refresh(@Valid @RequestBody RefreshRequest refreshRequest);

    @Operation(summary = "토큰 갱신(웹)",
            description = "refresh Cookie 를 회전시켜 인증 Cookie 3종을 재발급한다. rememberMe 지속성 모드를 유지한다.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "갱신 성공"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401",
                    description = "만료·폐기·재사용 리프레시 토큰(AUTH_SESSION_EXPIRED)")
    })
    @PostMapping("/auth/web/refresh")
    ResponseEntity<Void> webRefresh(HttpServletRequest httpServletRequest,
                                    HttpServletResponse httpServletResponse);
```

(import 추가: `RefreshRequest`, `RefreshResponse`)

`AuthController.java` 에 추가 — 필드 `private final AuthSessionService authSessionService;` 주입:

```java
    @Override
    public ResponseEntity<ApiResponse<RefreshResponse>> refresh(
            @Valid @RequestBody RefreshRequest refreshRequest) {
        RotationResult rotationResult = authSessionService.rotate(refreshRequest.refreshToken());
        return ResponseEntity.ok(ApiResponse.success(RefreshResponse.from(rotationResult)));
    }

    @Override
    public ResponseEntity<Void> webRefresh(HttpServletRequest httpServletRequest,
                                           HttpServletResponse httpServletResponse) {
        String rawRefreshToken = readRefreshCookie(httpServletRequest);
        if (rawRefreshToken == null) {
            throw new AuthSessionException.SessionExpiredException();
        }
        RotationResult rotationResult = authSessionService.rotate(rawRefreshToken);
        webAuthCookieService.issue(
                httpServletRequest,
                httpServletResponse,
                rotationResult.accessToken(),
                rotationResult.refreshToken(),
                rotationResult.role(),
                rotationResult.rememberMe());
        return ResponseEntity.noContent().build();
    }

    private String readRefreshCookie(HttpServletRequest httpServletRequest) {
        if (httpServletRequest.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : httpServletRequest.getCookies()) {
            if (WebAuthCookieService.REFRESH_COOKIE_NAME.equals(cookie.getName())
                    && StringUtils.hasText(cookie.getValue())) {
                return cookie.getValue();
            }
        }
        return null;
    }
```

(import 추가: `jakarta.servlet.http.Cookie`, `org.springframework.util.StringUtils`, `AuthSessionException`, `AuthSessionService`, `RotationResult`, `RefreshRequest`, `RefreshResponse`)

`CookieCsrfOriginFilter.java` — `isWebAuthPath` 교체:

```java
    private boolean isWebAuthPath(String uri) {
        return uri.equals("/api/v1/auth/web/login")
                || uri.equals("/api/v1/auth/web/logout")
                || uri.equals("/api/v1/auth/web/refresh");
    }
```

(바디 기반 `/api/v1/auth/refresh` 는 Origin 강제 불필요 — httpOnly 쿠키 값을 JS 가 읽을 수 없어 브라우저발 CSRF 로는 토큰을 실을 수 없다. spec §14)

- [ ] **Step 4: 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL`, 6 tests passed

- [ ] **Step 5: Commit** — `git add -A backend/src && git commit -m "feat(backend): 웹·모바일 refresh API 와 Origin 검증 경로 추가"`

---

### Task 9: 동시성 테스트 — latest-wins·LRU 상한 (사용자 명시 요구)

> **이 태스크는 스킵·축소 금지.** 사용자가 "latest-wins 로직은 동시성 테스트를 충분히 작성"을 승인 조건으로 명시했다.
> 실스레드(ExecutorService + CountDownLatch, 레포 전례)로 검증하고, 각 테스트는 다음 불변식을 단언한다:
> **어떤 동시성에서도 세션당 ACTIVE 토큰 정확히 1개 · 정상 경합은 세션을 죽이지 않음 · 상한 5 초과 불가.**

**Files:**
- Test: `backend/src/test/java/com/duing/domain/user/service/AuthRefreshConcurrencyTest.java`

**Interfaces:** Consumes: Task 4~8 전부. 프로덕션 코드 변경 없음 — 실패 시 원인은 서비스 구현이며 테스트를 약화시키지 말 것.

- [ ] **Step 1: 동시성 테스트 작성**

```java
package com.duing.domain.user.service;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
class AuthRefreshConcurrencyTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String ALLOWED_ORIGIN = "http://localhost:3000";

    @LocalServerPort int port;
    @Autowired AuthSessionService authSessionService;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired UserRepository userRepository;
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
                String.format("%08d", unique % 100_000_000L), "동시성테스터",
                passwordEncoder.encode(RAW_PASSWORD), UserRole.STUDENT, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private IssuedSession issueFor(Long userId) {
        return authSessionService.issue(new IssueSessionCommand(
                userId, SessionPlatform.WEB, null, null, "127.0.0.1", false));
    }

    /** 스레드 전원을 latch 로 정렬해 같은 순간에 작업을 실행시키고 예외를 수집한다. */
    private List<Throwable> runConcurrently(int threadCount, Runnable action) throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        for (int i = 0; i < threadCount; i++) {
            executorService.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    action.run();
                } catch (Throwable throwable) {
                    failures.add(throwable);
                } finally {
                    doneLatch.countDown();
                }
            });
        }
        assertThat(readyLatch.await(10, TimeUnit.SECONDS)).isTrue();
        startLatch.countDown();
        assertThat(doneLatch.await(30, TimeUnit.SECONDS)).as("동시 작업이 제한시간 안에 끝나야 한다(데드락 의심)").isTrue();
        executorService.shutdownNow();
        return List.copyOf(failures);
    }

    @Test
    @DisplayName("같은 리프레시 토큰의 동시 갱신 2건은 모두 성공하고 세션은 살아있으며 ACTIVE 토큰은 정확히 1개다")
    void twoConcurrentRotationsOfSameTokenBothSucceed() throws InterruptedException {
        Long userId = saveUser().getId();
        IssuedSession issuedSession = issueFor(userId);

        List<Throwable> failures = runConcurrently(2,
                () -> authSessionService.rotate(issuedSession.refreshToken()));

        assertThat(failures).as("동시 탭 경합은 grace latest-wins 로 흡수되어야 한다(오탐 금지)").isEmpty();
        assertThat(authSessionRepository.findById(issuedSession.sessionId()).orElseThrow().getRevokedAt()).isNull();
        assertThat(authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId())
                .stream().filter(token -> token.getStatus() == RefreshTokenStatus.ACTIVE)).hasSize(1);
    }

    @Test
    @DisplayName("같은 리프레시 토큰의 동시 갱신 8건에서도 세션 생존·ACTIVE 1개 불변식이 유지된다")
    void eightConcurrentRotationsKeepInvariants() throws InterruptedException {
        Long userId = saveUser().getId();
        IssuedSession issuedSession = issueFor(userId);

        List<Throwable> failures = runConcurrently(8,
                () -> authSessionService.rotate(issuedSession.refreshToken()));

        assertThat(failures).isEmpty();
        assertThat(authSessionRepository.findById(issuedSession.sessionId()).orElseThrow().getRevokedAt()).isNull();
        long activeCount = authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId())
                .stream().filter(token -> token.getStatus() == RefreshTokenStatus.ACTIVE).count();
        assertThat(activeCount).isEqualTo(1);
    }

    @Test
    @DisplayName("세션 4개 상태의 동시 로그인 2건 후에도 활성 세션은 상한 5를 넘지 않는다")
    void concurrentLoginsNeverExceedSessionLimit() throws InterruptedException {
        User user = saveUser();
        for (int i = 0; i < 4; i++) {
            issueFor(user.getId());
        }

        List<Throwable> failures = runConcurrently(2, () ->
                given().contentType(ContentType.JSON)
                        .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                        .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                        .when().post("/api/v1/auth/web/login")
                        .then().statusCode(HttpStatus.OK.value()));

        assertThat(failures).isEmpty();
        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .as("user 행잠금이 동시 로그인을 직렬화해 상한 5를 보장해야 한다")
                .hasSize(5);
    }
}
```

- [ ] **Step 2: 실행** — Run: `./gradlew test --tests 'com.duing.domain.user.service.AuthRefreshConcurrencyTest'` → Expected: `BUILD SUCCESSFUL`, 3 tests passed. **flaky 확인을 위해 최소 2회 연속 실행**해 둘 다 통과해야 한다. 실패하면 서비스 구현(잠금 순서·grace)을 고친다 — 테스트의 단언을 약화시키는 수정은 금지.

- [ ] **Step 3: Commit** — `git add backend/src/test/java/com/duing/domain/user/service/AuthRefreshConcurrencyTest.java && git commit -m "test(backend): refresh latest-wins·세션 상한 실스레드 동시성 검증"`

---

### Task 10: 로그아웃 의미 전환(현재 기기) + 자격 변경 전 세션 폐기

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/AuthSessionService.java`, `GeneralAuthSessionService.java`, `UserService.java`, `GeneralUserService.java`
- Modify: `backend/src/main/java/com/duing/domain/user/api/AuthApi.java`, `.../controller/AuthController.java`
- Create: `backend/src/main/java/com/duing/domain/user/controller/dto/request/LogoutRequest.java`
- Modify: `backend/src/test/java/com/duing/domain/user/controller/WebAuthControllerTest.java` (기존 로그아웃 테스트 재해석)
- Test: `backend/src/test/java/com/duing/domain/user/controller/AuthLogoutSessionTest.java`

**Interfaces:**
- Produces: `AuthSessionService.revokeCurrent(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull): boolean`, `AuthSessionService.revokeAll(Long userId, SessionRevokeReason reason)`, `UserService.logout(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull)`
- **의미 변화(스펙 §13.2)**: 로그아웃은 세션이 식별되면 **그 세션만** 폐기하고 tokenVersion 을 건드리지 않는다. 세션 미식별(구 토큰) 시에만 기존 전역 범프 폴백.

- [ ] **Step 1: 실패하는 테스트 작성** — `AuthLogoutSessionTest.java`

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.SessionRevokeReason;
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
class AuthLogoutSessionTest extends IntegrationTestBase {

    private static final String RAW_PASSWORD = "Abcd1234!";
    private static final String NEW_PASSWORD = "New5678!";
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

    private User saveUser(UserRole role) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%08d", unique % 100_000_000L), "로그아웃테스터",
                passwordEncoder.encode(RAW_PASSWORD), role, Grade.JUNIOR,
                College.IT_ENGINEERING, "컴퓨터정보공학부",
                String.format("010-%04d-%04d", (unique / 10_000) % 10_000, unique % 10_000),
                LocalDateTime.now()));
    }

    private Response webLogin(User user) {
        return given().contentType(ContentType.JSON)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/web/login");
    }

    @Test
    @DisplayName("웹 로그아웃은 현재 세션만 폐기하고 다른 기기 세션과 tokenVersion 은 건드리지 않는다")
    void webLogoutRevokesOnlyCurrentSession() {
        User user = saveUser(UserRole.STUDENT);
        int tokenVersionBefore = user.getTokenVersion();
        webLogin(user); // 다른 기기 세션
        Response currentLogin = webLogin(user);
        String accessCookie = currentLogin.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);
        String refreshCookie = currentLogin.getCookie(WebAuthCookieService.REFRESH_COOKIE_NAME);

        given().cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/logout")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .as("다른 기기 세션은 살아있어야 한다").hasSize(1);
        assertThat(userRepository.findById(user.getId()).orElseThrow().getTokenVersion())
                .as("현재 기기 로그아웃은 tokenVersion 을 올리지 않는다 (spec §13.2)")
                .isEqualTo(tokenVersionBefore);
        // 폐기된 refresh 로의 갱신은 즉시 거부된다
        given().cookie(WebAuthCookieService.REFRESH_COOKIE_NAME, refreshCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .when().post("/api/v1/auth/web/refresh")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("Bearer 로그아웃은 access 토큰의 sid 로 현재 세션을 특정해 폐기한다")
    void bearerLogoutRevokesSessionViaSidClaim() {
        User user = saveUser(UserRole.STUDENT);
        String accessToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", user.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.accessToken");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .when().post("/api/v1/auth/logout")
                .then().statusCode(HttpStatus.OK.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .isEmpty();
        assertThat(authSessionRepository.findAll())
                .filteredOn(session -> session.getUserId().equals(user.getId()))
                .singleElement()
                .satisfies(session ->
                        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.LOGOUT));
    }

    @Test
    @DisplayName("비밀번호 변경은 그 사용자의 모든 세션을 자격 변경 사유로 폐기한다")
    void passwordChangeRevokesAllSessions() {
        User user = saveUser(UserRole.STUDENT);
        webLogin(user);
        Response currentLogin = webLogin(user);
        String accessCookie = currentLogin.getCookie(WebAuthCookieService.ACCESS_COOKIE_NAME);

        given().contentType(ContentType.JSON)
                .cookie(WebAuthCookieService.ACCESS_COOKIE_NAME, accessCookie)
                .header(HttpHeaders.ORIGIN, ALLOWED_ORIGIN)
                .body(Map.of("currentPassword", RAW_PASSWORD, "newPassword", NEW_PASSWORD))
                .when().patch("/api/v1/users/me/password")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(user.getId()))
                .isEmpty();
        assertThat(authSessionRepository.findAll())
                .filteredOn(session -> session.getUserId().equals(user.getId()))
                .allSatisfy(session ->
                        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.CREDENTIAL_CHANGE));
    }

    @Test
    @DisplayName("관리자 강제 로그아웃은 대상 사용자의 모든 세션을 폐기하고 tokenVersion 도 올린다")
    void adminForceLogoutRevokesAllSessionsAndBumpsTokenVersion() {
        User admin = saveUser(UserRole.ADMIN);
        User target = saveUser(UserRole.STUDENT);
        webLogin(target);
        int tokenVersionBefore = target.getTokenVersion();
        String adminAccessToken = given().contentType(ContentType.JSON)
                .body(Map.of("studentId", admin.getStudentId(), "password", RAW_PASSWORD))
                .when().post("/api/v1/auth/login")
                .then().statusCode(HttpStatus.OK.value())
                .extract().path("data.accessToken");

        given().header(HttpHeaders.AUTHORIZATION, "Bearer " + adminAccessToken)
                .when().post("/api/v1/admin/users/" + target.getId() + "/force-logout")
                .then().statusCode(HttpStatus.OK.value());

        assertThat(authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(target.getId()))
                .isEmpty();
        assertThat(userRepository.findById(target.getId()).orElseThrow().getTokenVersion())
                .isGreaterThan(tokenVersionBefore);
    }
}
```

(force-logout 응답 코드가 200이 아니면 기존 `AdminForceLogoutControllerTest` 의 기대값에 맞춘다 — 기존 테스트가 정답이다.)

- [ ] **Step 2: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthLogoutSessionTest'` → Expected: FAIL (로그아웃이 전역 범프 / 세션 미폐기)

- [ ] **Step 3: 서비스 구현**

`AuthSessionService.java` 에 추가:

```java
    /**
     * 현재 기기 로그아웃 — refresh 토큰(우선) 또는 access 의 sid 로 세션을 특정해 폐기한다.
     * 세션을 식별하지 못하면 false (호출 측이 전환기 폴백을 결정). 이미 폐기된 세션은 멱등 true.
     */
    boolean revokeCurrent(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull);

    /** 전 세션 폐기 — 전체 로그아웃·자격 변경·관리자 강제. 감사 이벤트를 사유별로 남긴다. */
    void revokeAll(Long userId, SessionRevokeReason reason);
```

(import: `SessionRevokeReason`)

`GeneralAuthSessionService.java` 에 추가:

```java
    @Override
    @Transactional
    public boolean revokeCurrent(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull) {
        Long targetSessionId = resolveSessionId(rawRefreshTokenOrNull, sessionIdOrNull);
        if (targetSessionId == null) {
            return false;
        }
        AuthSession session = authSessionRepository.findByIdForUpdate(targetSessionId).orElse(null);
        if (session == null) {
            return false;
        }
        // refresh 소지 없이 sid 만으로 타인 세션을 지목하는 경로 차단 — 사용자 불일치는 미식별로 처리.
        // (이 분기에서 잡은 세션 잠금은 타인 것이라 이후 user 잠금과 교차하지 않는다 — 순환 없음)
        if (userIdOrNull != null && !session.getUserId().equals(userIdOrNull)) {
            return false;
        }
        if (session.getRevokedAt() != null) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        session.revoke(now, SessionRevokeReason.LOGOUT);
        authRefreshTokenRepository.revokeBySessionIds(List.of(session.getId()), RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(session.getUserId(), session.getId(),
                AuthEventType.LOGOUT, null, null, null));
        return true;
    }

    private Long resolveSessionId(String rawRefreshTokenOrNull, Long sessionIdOrNull) {
        if (rawRefreshTokenOrNull != null) {
            Long sessionIdFromToken = authRefreshTokenRepository
                    .findSessionIdByTokenHash(refreshTokenGenerator.hash(rawRefreshTokenOrNull))
                    .orElse(null);
            if (sessionIdFromToken != null) {
                return sessionIdFromToken;
            }
        }
        return sessionIdOrNull;
    }

    @Override
    @Transactional
    public void revokeAll(Long userId, SessionRevokeReason reason) {
        LocalDateTime now = LocalDateTime.now(clock);
        int revokedCount = authSessionRepository.revokeAllActive(userId, now, reason);
        authRefreshTokenRepository.revokeAllByUserId(userId, RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(userId, null, eventTypeFor(reason),
                "revokedSessions=" + revokedCount, null, null));
    }

    private AuthEventType eventTypeFor(SessionRevokeReason reason) {
        return switch (reason) {
            case LOGOUT_ALL -> AuthEventType.LOGOUT_ALL;
            case ADMIN_FORCE -> AuthEventType.ADMIN_FORCE_LOGOUT;
            default -> AuthEventType.SESSIONS_REVOKED;
        };
    }
```

`UserService.java`: `void logout(Long userId);` → `void logout(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull);`

`GeneralUserService.java` — `logout` 교체 + 4개 자격 변경 지점 연동:

```java
    @Override
    @Transactional
    public void logout(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull) {
        boolean sessionRevoked =
                authSessionService.revokeCurrent(userIdOrNull, rawRefreshTokenOrNull, sessionIdOrNull);
        if (sessionRevoked) {
            return; // 현재 기기만 로그아웃 — tokenVersion 불변 (spec §13.2)
        }
        if (userIdOrNull == null) {
            return; // 식별 수단 없음(만료 쿠키 등) — 멱등 무시
        }
        // 전환기 폴백: 세션 없는 구 토큰 사용자는 기존 의미(전 기기 무효화)로 처리한다
        User user = userRepository.findByIdForUpdate(userIdOrNull)
                .orElseThrow(UserException.UserNotFoundException::new);
        user.bumpTokenVersion();
    }
```

`changePassword`·`resetPassword` 의 `user.bumpTokenVersion();` 직후와 `changePhone`·`withdraw` 의 `user.bumpTokenVersion();` 직후에 각각 추가:

```java
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.CREDENTIAL_CHANGE);
```

`forceLogout` 의 `user.bumpTokenVersion();` 직후에 추가:

```java
        authSessionService.revokeAll(user.getId(), SessionRevokeReason.ADMIN_FORCE);
```

(import: `SessionRevokeReason`)

- [ ] **Step 4: API·컨트롤러 수정**

`LogoutRequest.java` 신규:

```java
package com.duing.domain.user.controller.dto.request;

/** 모바일 로그아웃 — refreshToken 이 있으면 세션 특정의 1순위로 쓴다(없으면 access 의 sid 폴백). */
public record LogoutRequest(String refreshToken) {}
```

`AuthApi.java` — `logout`·`webLogout` 선언 교체(설명도 새 의미로):

```java
    @Operation(summary = "로그아웃",
            description = "현재 기기의 세션과 리프레시 토큰을 폐기한다. 세션을 특정할 수 없는 "
                    + "구 토큰은 token_version 을 올려 전 기기에서 로그아웃된다(전환기 폴백).")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그아웃 성공"))
    @PostMapping("/auth/logout")
    ResponseEntity<ApiResponse<Void>> logout(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestBody(required = false) LogoutRequest logoutRequest);

    @Operation(summary = "웹 로그아웃",
            description = "현재 기기의 세션·리프레시 토큰을 폐기하고 웹 인증 Cookie 3종을 삭제한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "204", description = "로그아웃 완료"))
    @PostMapping("/auth/web/logout")
    ResponseEntity<Void> webLogout(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse);
```

(import: `LogoutRequest`)

`AuthController.java` — 두 메서드 교체:

```java
    @Override
    public ResponseEntity<ApiResponse<Void>> logout(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @RequestBody(required = false) LogoutRequest logoutRequest) {
        userService.logout(
                currentUser.id(),
                logoutRequest != null ? logoutRequest.refreshToken() : null,
                currentUser.sessionId());
        return ResponseEntity.ok(ApiResponse.success());
    }

    @Override
    public ResponseEntity<Void> webLogout(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        try {
            String rawRefreshToken = readRefreshCookie(httpServletRequest);
            if (currentUser != null || rawRefreshToken != null) {
                userService.logout(
                        currentUser != null ? currentUser.id() : null,
                        rawRefreshToken,
                        currentUser != null ? currentUser.sessionId() : null);
            }
            return ResponseEntity.noContent().build();
        } finally {
            webAuthCookieService.clear(httpServletResponse);
        }
    }
```

`WebAuthControllerTest.webLogoutWithValidCookieClearsCookiesAndRevokesAllTokens` 는 세션 없는 구 토큰(3-인자 `tokenFor`) 경로라 전역 범프 폴백으로 **그대로 통과한다** — `@DisplayName` 만 "세션 없는 구 토큰의 웹 로그아웃은 폴백으로 모든 기존 토큰을 무효화한다" 로 바꿔 의미를 명시한다.

- [ ] **Step 5: 통과 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.controller.AuthLogoutSessionTest' --tests 'com.duing.domain.user.controller.WebAuthControllerTest' --tests 'com.duing.domain.user.controller.AdminForceLogoutControllerTest' --tests 'com.duing.domain.user.controller.AuthWithdrawalTest'` → Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit** — `git add -A backend/src && git commit -m "feat(backend): 로그아웃 현재 기기 전환·자격 변경 시 전 세션 폐기"`

---

### Task 11: 만료 세션·감사 로그 Cleanup 잡

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/job/AuthSessionCleanupJob.java`
- Modify: `backend/src/main/java/com/duing/domain/user/repository/AuthSessionRepository.java`, `AuthRefreshTokenRepository.java`, `AuthEventRepository.java` (삭제 쿼리)
- Modify: `backend/src/main/resources/application-prod.yml`
- Test: `backend/src/test/java/com/duing/domain/user/job/AuthSessionCleanupJobTest.java`

**Interfaces:** Consumes: Task 1 리포지토리. 신규 빈은 `duing.auth.session.cleanup.enabled=true` 에서만 등록(OverdueBillJob 패턴).

- [ ] **Step 1: 리포지토리 삭제 쿼리 추가**

`AuthSessionRepository` 에:

```java
    /** 폐기/만료 후 보존기간(30일)을 넘긴 세션 — 재사용 포렌식 보존 뒤 물리 삭제 대상 (spec §18.1). */
    @Query("SELECT s.id FROM AuthSession s "
            + "WHERE (s.revokedAt IS NOT NULL AND s.revokedAt < :cutoff) OR s.expiresAt < :cutoff")
    List<Long> findPurgeableIds(@Param("cutoff") LocalDateTime cutoff);

    @Modifying
    @Query("DELETE FROM AuthSession s WHERE s.id IN :sessionIds")
    int deleteByIds(@Param("sessionIds") List<Long> sessionIds);
```

`AuthRefreshTokenRepository` 에:

```java
    @Modifying
    @Query("DELETE FROM AuthRefreshToken t WHERE t.sessionId IN :sessionIds")
    int deleteBySessionIds(@Param("sessionIds") List<Long> sessionIds);
```

`AuthEventRepository` 에(+ import Modifying/Query/Param/LocalDateTime):

```java
    /** 감사 로그 90일 보관 후 삭제 — IP·UA 포함 PII 최소 보관 (spec §18.1). */
    @Modifying
    @Query("DELETE FROM AuthEvent e WHERE e.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
```

(로그성 테이블의 물리 삭제는 PiiRetentionJob·phone_verification_events 전례 — soft delete 대상 아님)

- [ ] **Step 2: 실패하는 테스트 작성** — `AuthSessionCleanupJobTest.java`

```java
package com.duing.domain.user.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AuthEvent;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthSessionCleanupJobTest extends IntegrationTestBase {

    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired AuthEventRepository authEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired Clock clock;

    private Long saveSession(Long userId) {
        return authSessionRepository.save(AuthSession.create(
                userId, SessionPlatform.WEB, null, null, null, false,
                LocalDateTime.now(), Duration.ofDays(30))).getId();
    }

    @Test
    @DisplayName("보존기간을 넘긴 폐기·만료 세션과 90일 지난 감사 이벤트만 물리 삭제된다")
    void purgesOnlyRowsPastRetention() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        Long staleRevokedSessionId = saveSession(userId);
        Long recentRevokedSessionId = saveSession(userId);
        Long activeSessionId = saveSession(userId);
        // 상대시간으로 노화시킨다 — 절대날짜 금지
        jdbcTemplate.update("UPDATE auth_session SET revoked_at = NOW() - INTERVAL '31 days', "
                + "revoke_reason = 'LOGOUT' WHERE id = ?", staleRevokedSessionId);
        jdbcTemplate.update("UPDATE auth_session SET revoked_at = NOW() - INTERVAL '1 day', "
                + "revoke_reason = 'LOGOUT' WHERE id = ?", recentRevokedSessionId);
        Long staleEventId = authEventRepository.save(AuthEvent.of(userId, null,
                AuthEventType.LOGIN, null, null, null)).getId();
        Long recentEventId = authEventRepository.save(AuthEvent.of(userId, null,
                AuthEventType.LOGIN, null, null, null)).getId();
        jdbcTemplate.update("UPDATE auth_event SET created_at = NOW() - INTERVAL '91 days' WHERE id = ?",
                staleEventId);

        AuthSessionCleanupJob cleanupJob = new AuthSessionCleanupJob(
                authSessionRepository, authRefreshTokenRepository, authEventRepository, clock);
        // 잡 빈은 테스트 프로파일에서 비활성 — 직접 실행하되 @Modifying 쿼리를 위해 트랜잭션으로 감싼다
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> cleanupJob.run());

        assertThat(authSessionRepository.findById(staleRevokedSessionId)).isEmpty();
        assertThat(authSessionRepository.findById(recentRevokedSessionId)).isPresent();
        assertThat(authSessionRepository.findById(activeSessionId)).isPresent();
        assertThat(authEventRepository.findById(staleEventId)).isEmpty();
        assertThat(authEventRepository.findById(recentEventId)).isPresent();
    }
}
```

- [ ] **Step 3: 실패 확인** — Run: `./gradlew test --tests 'com.duing.domain.user.job.AuthSessionCleanupJobTest'` → Expected: 컴파일 실패(잡 미존재)

- [ ] **Step 4: 잡 구현 + prod yml**

`AuthSessionCleanupJob.java`:

```java
package com.duing.domain.user.job;

import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 04:50(Asia/Seoul) 만료/폐기 세션·감사 로그 물리 삭제 (spec §18.1).
 * 세션: 폐기/만료 후 30일 보존(재사용 포렌식) 뒤 토큰과 함께 삭제. 감사 이벤트: 90일 보존.
 * 백업(04:15)·PII 파기(04:30)와 시간 분산. {@code duing.auth.session.cleanup.enabled=true} 에서만 등록.
 */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.auth.session.cleanup", name = "enabled", havingValue = "true")
public class AuthSessionCleanupJob {

    private static final int SESSION_RETENTION_DAYS = 30;
    private static final int EVENT_RETENTION_DAYS = 90;

    private final AuthSessionRepository authSessionRepository;
    private final AuthRefreshTokenRepository authRefreshTokenRepository;
    private final AuthEventRepository authEventRepository;
    private final Clock clock;

    @Scheduled(cron = "0 50 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Long> purgeableSessionIds =
                authSessionRepository.findPurgeableIds(now.minusDays(SESSION_RETENTION_DAYS));
        int deletedSessions = 0;
        if (!purgeableSessionIds.isEmpty()) {
            authRefreshTokenRepository.deleteBySessionIds(purgeableSessionIds);
            deletedSessions = authSessionRepository.deleteByIds(purgeableSessionIds);
        }
        int deletedEvents = authEventRepository.deleteOlderThan(now.minusDays(EVENT_RETENTION_DAYS));
        log.info("AuthSessionCleanupJob: 세션 {}건, 감사 이벤트 {}건 삭제", deletedSessions, deletedEvents);
    }
}
```

`application-prod.yml` 의 `duing:` 블록에 추가(다른 잡들과 같은 "운영 기본 활성" 관례 — 만료 데이터 삭제만이라 안전):

```yaml
  auth:
    session:
      cleanup:
        # 만료/폐기 세션·감사 로그 정리 잡 — 운영 기본 활성(삭제 대상이 만료 데이터뿐이라 안전).
        # DUING_AUTH_SESSION_CLEANUP_ENABLED=false 로 끌 수 있다.
        enabled: ${DUING_AUTH_SESSION_CLEANUP_ENABLED:true}
```

- [ ] **Step 5: 통과 확인** — 같은 명령 → Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit** — `git add -A backend/src && git commit -m "feat(backend): 만료 세션·감사 로그 보존기간 Cleanup 잡 추가"`

---

### Task 12: 전체 회귀 + 문서 정리

**Files:**
- Modify: `backend/AGENTS.md` (환경변수 표)
- Test: 전체 스위트

- [ ] **Step 1: AGENTS.md 갱신** — `grep -n "JWT_EXPIRY_MS" backend/AGENTS.md` 로 찾은 환경변수 표의 `JWT_EXPIRY_MS=3600000` 을 `JWT_EXPIRY_MS=1800000` 으로 바꾸고, 같은 표에 한 줄 추가: `DUING_AUTH_*` — refresh TTL(30일)·grace(30초)·세션 상한(5)·cleanup 토글, 기본값으로 충분(운영 미주입 가능).

- [ ] **Step 2: 전체 회귀** — Run: `cd /Users/ksy/Desktop/BASIC/Coding/Duing/backend && ./gradlew test` → Expected: `BUILD SUCCESSFUL`. 실패 시 원인별로 고친다 — 특히 `login(command, clientIp)` 잔여 호출처, `UserPrincipal` 생성 인자, 쿠키 2종을 단언하던 테스트.

- [ ] **Step 3: 릴리스 메모 확인(코드 아님)** — PR 본문에 들어갈 운영 체크 2줄을 기억해 둔다: ① **prod `.env` 에 `JWT_EXPIRY_MS` 가 있으면 제거**(양방향 롤백 안전, spec §19.1) ② 배포 후 기존 로그인 사용자는 최대 1시간 내 1회 재로그인.

- [ ] **Step 4: Commit** — `git add backend/AGENTS.md && git commit -m "docs(backend): 인증 환경변수 표를 30분 access·세션 설정으로 갱신"`

---

## Self-Review Checklist (플랜 작성자가 이미 수행)

- 스펙 §4~§21 전 항목이 태스크에 매핑된다 (§8 API=T8, §10.1 rememberMe=T5/T8, §11 rotation=T6~7, §12 동시성=T9, §13 로그아웃/LRU=T4/T10, §18.1 cleanup=T11, sid=T3, CSRF=T8).
- FE(PR-2)·세션 목록 API(PR-3)는 이 플랜 범위 밖 — 스펙 §21 참조.
- 타입 일관성: `IssuedSession(sessionId, refreshToken)` / `RotationResult(accessToken, refreshToken, role, rememberMe)` / `LoginContext(clientIp, userAgent, platform, deviceLabel, rememberMe)` 로 전 태스크 통일.

