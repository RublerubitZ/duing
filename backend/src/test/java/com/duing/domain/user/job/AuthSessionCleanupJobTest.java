package com.duing.domain.user.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AuthEvent;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.AuthRefreshToken;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.repository.AuthEventRepository;
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
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.auth.session.cleanup.enabled=true")
class AuthSessionCleanupJobTest extends IntegrationTestBase {

    @Autowired AuthSessionCleanupJob cleanupJob;
    @Autowired AuthSessionRepository authSessionRepository;
    @Autowired AuthRefreshTokenRepository authRefreshTokenRepository;
    @Autowired AuthEventRepository authEventRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private Long saveSession(Long userId) {
        return authSessionRepository.save(AuthSession.create(
                userId, SessionPlatform.WEB, null, null, null, false,
                LocalDateTime.now(), Duration.ofDays(30))).getId();
    }

    @Test
    @DisplayName("보존기간을 넘긴 폐기·만료 세션과 90일 지난 감사 이벤트만 물리 삭제되고, 폐기 세션의 리프레시 토큰도 동반 삭제된다")
    void purgesOnlyRowsPastRetention() {
        Long userId = userRepository.save(UserFixture.unique()).getId();
        Long staleRevokedSessionId = saveSession(userId);
        Long recentRevokedSessionId = saveSession(userId);
        Long expiredSessionId = saveSession(userId);
        Long activeSessionId = saveSession(userId);
        // 상대시간으로 노화시킨다 — 절대날짜 금지
        jdbcTemplate.update("UPDATE auth_session SET revoked_at = NOW() - INTERVAL '31 days', "
                + "revoke_reason = 'LOGOUT' WHERE id = ?", staleRevokedSessionId);
        jdbcTemplate.update("UPDATE auth_session SET revoked_at = NOW() - INTERVAL '1 day', "
                + "revoke_reason = 'LOGOUT' WHERE id = ?", recentRevokedSessionId);
        // revoked_at 은 NULL 이지만 만료가 보존기간을 넘긴 세션 — 술어 OR 우변(expires_at < cutoff) 검증
        jdbcTemplate.update("UPDATE auth_session SET expires_at = NOW() - INTERVAL '31 days' WHERE id = ?",
                expiredSessionId);
        // purge 대상 세션에 리프레시 토큰을 딸아 둔다 — 자식(토큰)→부모(세션) 삭제 순서(FK) 를 고정한다
        authRefreshTokenRepository.save(AuthRefreshToken.issue(staleRevokedSessionId, "a".repeat(64)));

        Long staleEventId = authEventRepository.save(AuthEvent.of(userId, null,
                AuthEventType.LOGIN, null, null, null)).getId();
        Long recentEventId = authEventRepository.save(AuthEvent.of(userId, null,
                AuthEventType.LOGIN, null, null, null)).getId();
        jdbcTemplate.update("UPDATE auth_event SET created_at = NOW() - INTERVAL '91 days' WHERE id = ?",
                staleEventId);

        cleanupJob.run();

        assertThat(authSessionRepository.findById(staleRevokedSessionId)).isEmpty();
        assertThat(authSessionRepository.findById(expiredSessionId)).isEmpty();
        assertThat(authSessionRepository.findById(recentRevokedSessionId)).isPresent();
        assertThat(authSessionRepository.findById(activeSessionId)).isPresent();
        assertThat(authRefreshTokenRepository.findBySessionIdOrderByIdAsc(staleRevokedSessionId)).isEmpty();
        assertThat(authEventRepository.findById(staleEventId)).isEmpty();
        assertThat(authEventRepository.findById(recentEventId)).isPresent();
    }
}
