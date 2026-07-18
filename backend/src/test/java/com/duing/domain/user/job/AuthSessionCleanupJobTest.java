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
