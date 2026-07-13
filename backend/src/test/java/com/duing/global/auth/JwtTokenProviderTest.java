package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        jwtTokenProvider = providerWithSecret(SECRET);
        ReflectionTestUtils.invokeMethod(jwtTokenProvider, "init");
    }

    // @Value 필드를 리플렉션으로 주입하는 단위 테스트 방식(기존 패턴 유지). init() 은 별도로 호출한다.
    private JwtTokenProvider providerWithSecret(String secret) {
        JwtTokenProvider provider = new JwtTokenProvider();
        ReflectionTestUtils.setField(provider, "secret", secret);
        ReflectionTestUtils.setField(provider, "expiryMs", 3_600_000L);
        return provider;
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

    @Test
    @DisplayName("32바이트 미만의 짧은 서명 키면 기동(init) 시점에 즉시 실패한다(fail fast)")
    void rejectsSecretShorterThan32Bytes() {
        JwtTokenProvider providerWithShortSecret = providerWithSecret("too-short-secret"); // 16바이트

        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(providerWithShortSecret, "init"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32바이트");
    }

    @Test
    @DisplayName("공백 서명 키면 기동(init) 시점에 즉시 실패한다(fail fast)")
    void rejectsBlankSecret() {
        JwtTokenProvider providerWithBlankSecret = providerWithSecret("   ");

        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(providerWithBlankSecret, "init"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("비어 있습니다");
    }

    @Test
    @DisplayName("정확히 32바이트인 서명 키는 기동에 성공하고 토큰을 정상 발급·검증한다(경계값)")
    void acceptsSecretOfExactly32Bytes() {
        String secretOfExactly32Bytes = "0123456789abcdef0123456789abcdef"; // 32바이트
        JwtTokenProvider providerWithBoundarySecret = providerWithSecret(secretOfExactly32Bytes);
        ReflectionTestUtils.invokeMethod(providerWithBoundarySecret, "init");

        String token = providerWithBoundarySecret.createToken(1L, "STUDENT");

        assertThat(providerWithBoundarySecret.parse(token).userId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("문자 수는 32 미만이어도 UTF-8 바이트가 32 이상인 멀티바이트 키는 통과한다(바이트 기준 검증)")
    void measuresSecretByUtf8BytesNotCharCount() {
        // 한글 11자 = UTF-8 33바이트(>=32). 문자 수(11)로 셌다면 실패했을 경계 — 바이트 기준임을 고정한다.
        String multibyteSecret = "두잉서명키두잉서명키한";
        JwtTokenProvider providerWithMultibyteSecret = providerWithSecret(multibyteSecret);
        ReflectionTestUtils.invokeMethod(providerWithMultibyteSecret, "init");

        String token = providerWithMultibyteSecret.createToken(2L, "STUDENT");

        assertThat(providerWithMultibyteSecret.parse(token).userId()).isEqualTo(2L);
    }

    @Test
    @DisplayName("Access JWT 만료가 1시간이 아니면 기동 시점에 즉시 실패한다")
    void rejectsAccessTokenLifetimeOtherThanExactlyOneHour() {
        JwtTokenProvider provider = providerWithSecret(SECRET);
        ReflectionTestUtils.setField(provider, "expiryMs", 3_600_001L);

        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(provider, "init"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("3,600,000");
    }
}
