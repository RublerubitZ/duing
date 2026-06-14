package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class JwtTokenProviderTest {

    private static final String SECRET =
            "duing-test-jwt-secret-key-that-is-long-enough-for-hs256-algorithm";

    private JwtTokenProvider jwtTokenProvider;

    @BeforeEach
    void setUp() {
        jwtTokenProvider = new JwtTokenProvider();
        ReflectionTestUtils.setField(jwtTokenProvider, "secret", SECRET);
        ReflectionTestUtils.setField(jwtTokenProvider, "expiryMs", 3_600_000L);
        ReflectionTestUtils.invokeMethod(jwtTokenProvider, "init");
    }

    @Test
    @DisplayName("토큰에 실린 tokenVersion 클레임이 parse 결과로 그대로 복원된다")
    void roundTripsTokenVersion() {
        String token = jwtTokenProvider.createToken(7L, "STUDENT", 3);

        JwtTokenProvider.TokenClaims claims = jwtTokenProvider.parse(token);

        assertThat(claims.userId()).isEqualTo(7L);
        assertThat(claims.tokenVersion()).isEqualTo(3);
    }

    @Test
    @DisplayName("tokenVersion 클레임이 아예 없는 구 토큰도 버전 0 으로 파싱된다(하위 호환)")
    void tokenWithoutVersionClaimParsesAsZero() {
        String legacyToken = JWT.create()
                .withSubject("7")
                .withClaim("role", "STUDENT")
                .sign(Algorithm.HMAC256(SECRET));

        JwtTokenProvider.TokenClaims claims = jwtTokenProvider.parse(legacyToken);

        assertThat(claims.userId()).isEqualTo(7L);
        assertThat(claims.tokenVersion()).isZero();
    }
}
