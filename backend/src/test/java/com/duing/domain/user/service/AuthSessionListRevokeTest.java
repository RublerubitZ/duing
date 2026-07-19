package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.repository.AuthEventRepository;
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
    @Autowired AuthEventRepository authEventRepository;
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
        assertThat(authEventRepository.findByUserIdOrderByIdAsc(userId))
                .anyMatch(authEvent -> authEvent.getEventType() == AuthEventType.LOGOUT);
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
