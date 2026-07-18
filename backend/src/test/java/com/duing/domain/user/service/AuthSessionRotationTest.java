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
