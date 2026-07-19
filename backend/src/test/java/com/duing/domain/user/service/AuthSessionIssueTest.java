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
