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
