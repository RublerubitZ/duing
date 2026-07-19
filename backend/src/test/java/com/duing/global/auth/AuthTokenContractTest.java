package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.auth0.jwt.JWT;
import com.auth0.jwt.interfaces.DecodedJWT;
import com.duing.common.TestcontainersConfiguration;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AuthTokenContractTest {

    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired AuthHintTokenProvider authHintTokenProvider;

    @Test
    @DisplayName("Access 토큰은 30분 만료이고 세션 id(sid) 클레임을 담아 파싱된다")
    void accessTokenCarriesSidAndThirtyMinuteExpiry() {
        String accessToken = jwtTokenProvider.createToken(7L, "STUDENT", 3, 42L);
        JwtTokenProvider.TokenClaims claims = jwtTokenProvider.parse(accessToken);
        assertThat(claims.userId()).isEqualTo(7L);
        assertThat(claims.tokenVersion()).isEqualTo(3);
        assertThat(claims.sessionId()).isEqualTo(42L);
        assertThat(jwtTokenProvider.expirySeconds()).isEqualTo(1800L);

        DecodedJWT decoded = JWT.decode(accessToken);
        long lifetimeSeconds = Duration.between(
                decoded.getIssuedAt().toInstant(), decoded.getExpiresAt().toInstant()).toSeconds();
        assertThat(lifetimeSeconds).isEqualTo(1800L);
    }

    @Test
    @DisplayName("sid 없는 구버전 토큰도 파싱되며 sessionId 는 null 이다")
    void legacyTokenWithoutSidParsesWithNullSessionId() {
        String legacyToken = jwtTokenProvider.createToken(7L, "STUDENT", 0);
        assertThat(jwtTokenProvider.parse(legacyToken).sessionId()).isNull();
    }

    @Test
    @DisplayName("auth_hint 는 세션 지평선(30일) 만료로 발급되고 클레임 구성은 typ·role·exp 그대로다")
    void authHintExpiresAtSessionHorizonWithUnchangedClaims() {
        DecodedJWT decodedHint = JWT.decode(authHintTokenProvider.create("STUDENT"));
        assertThat(decodedHint.getClaim("typ").asString()).isEqualTo("AUTH_HINT");
        assertThat(decodedHint.getClaim("role").asString()).isEqualTo("STUDENT");
        Instant expectedAround = Instant.now().plus(Duration.ofDays(30));
        assertThat(decodedHint.getExpiresAt().toInstant())
                .isBetween(expectedAround.minusSeconds(60), expectedAround.plusSeconds(60));
        // 미들웨어가 페이로드 키를 정확히 {exp, role, typ} 로 검증하므로 클레임 추가 금지 (spec §10)
        assertThat(decodedHint.getClaims().keySet()).containsExactlyInAnyOrder("typ", "role", "exp");
    }
}
