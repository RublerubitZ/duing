package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneVerificationCodeDeriverTest {

    private final PhoneVerificationCodeDeriver codeDeriver =
            new PhoneVerificationCodeDeriver("unit-test-phone-verification-secret");

    @Test
    @DisplayName("같은 토큰에서는 항상 같은 코드가 파생된다 (결정성 — 발급 응답과 exists 질의가 일치해야 한다)")
    void sameTokenDerivesSameCode() {
        String token = "550e8400-e29b-41d4-a716-446655440000";
        assertThat(codeDeriver.deriveCode(token)).isEqualTo(codeDeriver.deriveCode(token));
    }

    @Test
    @DisplayName("코드는 8자이며 Crockford Base32(혼동 문자 I/L/O/U 제외)만 사용한다")
    void codeUsesCrockfordAlphabet() {
        String code = codeDeriver.deriveCode("550e8400-e29b-41d4-a716-446655440000");
        assertThat(code).hasSize(8).matches("^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$");
    }

    @Test
    @DisplayName("토큰이 다르면 코드도 다르다 — 재발급 시 구 코드가 자연 무효되는 근거")
    void differentTokensDeriveDifferentCodes() {
        assertThat(codeDeriver.deriveCode("token-a")).isNotEqualTo(codeDeriver.deriveCode("token-b"));
    }

    @Test
    @DisplayName("secret 이 다르면 같은 토큰이라도 코드가 다르다 — DB 유출만으로는 코드를 계산할 수 없다")
    void differentSecretsDeriveDifferentCodes() {
        PhoneVerificationCodeDeriver otherSecretDeriver = new PhoneVerificationCodeDeriver("other-secret");
        assertThat(codeDeriver.deriveCode("token-a")).isNotEqualTo(otherSecretDeriver.deriveCode("token-a"));
    }

    @Test
    @DisplayName("고정 (secret, token) 입력의 파생 코드는 항상 같은 값이다 — 비트 연산 리팩토링 회귀 핀")
    void fixedInputDerivesPinnedCode() {
        assertThat(codeDeriver.deriveCode("golden-vector-token")).isEqualTo("XXHXEQVE");
    }
}
