package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AuthHintTokenProviderTest {
    private static final String JWT_SECRET = "jwt-secret-that-is-at-least-thirty-two-bytes";
    private static final String HINT_SECRET = "hint-secret-that-is-at-least-thirty-two-bytes";

    @Test
    @DisplayName("인증 힌트에는 고정 typ과 역할 및 1시간 만료 시각만 포함한다")
    void createsOnlyFixedTypeRoleAndExpirationClaims() {
        Instant creationStartedAt = Instant.now();
        AuthHintTokenProvider provider =
                new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_600_000L);

        String hint = provider.create("ADMIN");
        DecodedJWT decoded = JWT.require(Algorithm.HMAC256(HINT_SECRET)).build().verify(hint);

        assertThat(decoded.getClaim("typ").asString()).isEqualTo("AUTH_HINT");
        assertThat(decoded.getClaim("role").asString()).isEqualTo("ADMIN");
        assertThat(decoded.getSubject()).isNull();
        assertThat(decoded.getClaims().keySet()).containsExactlyInAnyOrder("typ", "role", "exp");
        assertThat(decoded.getExpiresAtAsInstant())
                .isBetween(
                        creationStartedAt.plusSeconds(3_599),
                        Instant.now().plusSeconds(3_600));
    }

    @Test
    @DisplayName("Access Token과 인증 힌트가 같은 서명 키를 사용하면 기동을 거부한다")
    void rejectsSameAccessAndHintSecret() {
        assertThatThrownBy(() ->
                        new AuthHintTokenProvider(JWT_SECRET, JWT_SECRET, 3_600_000L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("서로 다른 값");
    }

    @Test
    @DisplayName("인증 힌트 서명 키가 32바이트 미만이면 기동을 거부한다")
    void rejectsShortHintSecret() {
        assertThatThrownBy(() ->
                        new AuthHintTokenProvider("short", JWT_SECRET, 3_600_000L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32바이트");
    }

    @Test
    @DisplayName("웹 인증 세션 만료 시간이 정확히 1시간이 아니면 기동을 거부한다")
    void rejectsWebSessionLifetimeOtherThanExactlyOneHour() {
        assertThatThrownBy(() ->
                        new AuthHintTokenProvider(HINT_SECRET, JWT_SECRET, 3_599_999L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("3,600,000");
    }
}
