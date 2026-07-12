package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import org.junit.jupiter.api.Test;

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
        assertThatThrownBy(() ->
                        new AuthHintTokenProvider(JWT_SECRET, JWT_SECRET, 3_600_000L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("서로 다른 값");
    }

    @Test
    void rejectsShortHintSecret() {
        assertThatThrownBy(() ->
                        new AuthHintTokenProvider("short", JWT_SECRET, 3_600_000L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32바이트");
    }
}
