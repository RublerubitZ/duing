package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RefreshTokenGeneratorTest {

    private final RefreshTokenGenerator refreshTokenGenerator = new RefreshTokenGenerator();

    @Test
    @DisplayName("리프레시 토큰은 256bit 엔트로피의 base64url 43자로 생성되고 호출마다 다르다")
    void generatesUniqueUrlSafeTokens() {
        Set<String> generatedTokens = new HashSet<>();
        for (int i = 0; i < 100; i++) {
            String token = refreshTokenGenerator.generate();
            assertThat(token).hasSize(43).matches("[A-Za-z0-9_-]+");
            generatedTokens.add(token);
        }
        assertThat(generatedTokens).hasSize(100);
    }

    @Test
    @DisplayName("해시는 SHA-256 소문자 hex 64자로 결정적이며 원문과 다르다")
    void hashIsDeterministicSha256Hex() {
        String rawToken = refreshTokenGenerator.generate();
        String firstHash = refreshTokenGenerator.hash(rawToken);
        assertThat(firstHash).hasSize(64).matches("[0-9a-f]+").isNotEqualTo(rawToken);
        assertThat(refreshTokenGenerator.hash(rawToken)).isEqualTo(firstHash);
        assertThat(refreshTokenGenerator.hash("known-input"))
                .isEqualTo("27ae49c070b1265efa164dd0941a7cec3eb64c4154b426110d25f8266b6d8b68");
    }
}
