package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.exception.AuthSessionException;
import com.duing.domain.user.repository.AuthEventRepository;
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
    @Autowired AuthEventRepository authEventRepository;
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

        // 조기 401(세션 폐기 확인)이 detectReuse 를 앞질러, 시드한 LOGOUT reason 이 덮이지 않는다
        var session = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow();
        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.LOGOUT);
    }

    @Test
    @DisplayName("폐기된 토큰 재사용 탐지의 세션 폐기와 감사 기록은 401 이후에도 영속된다")
    void reuseDetectionPersistsRevocationDespiteThrow() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        IssuedSession issuedSession = issueFor(userId, false);
        // 토큰만 REVOKED 로 (세션은 활성 유지) — status 기반 재사용 경로로 유도
        jdbcTemplate.update("UPDATE auth_refresh_token SET status = 'REVOKED' WHERE session_id = ?",
                issuedSession.sessionId());

        assertThatThrownBy(() -> authSessionService.rotate(issuedSession.refreshToken()))
                .isInstanceOf(AuthSessionException.SessionExpiredException.class);

        var session = authSessionRepository.findById(issuedSession.sessionId()).orElseThrow();
        assertThat(session.getRevokedAt()).isNotNull();
        assertThat(session.getRevokeReason()).isEqualTo(SessionRevokeReason.REUSE_DETECTED);
        assertThat(authRefreshTokenRepository.findBySessionIdOrderByIdAsc(issuedSession.sessionId()))
                .allMatch(token -> token.getStatus() == RefreshTokenStatus.REVOKED);
        assertThat(authEventRepository.findByUserIdOrderByIdAsc(userId))
                .anyMatch(authEvent -> authEvent.getEventType() == AuthEventType.REUSE_DETECTED);
    }

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
}
