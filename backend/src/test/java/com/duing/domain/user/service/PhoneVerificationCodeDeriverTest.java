package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    @DisplayName("같은 학번에서는 항상 같은 decoy 번호가 파생된다 — 재시도마다 마스킹 번호가 흔들리면 그 자체가 계정 열거 오라클이 된다")
    void sameStudentIdDerivesSameDecoyPhone() {
        assertThat(codeDeriver.deriveDecoyPhone("20250001"))
                .isEqualTo(codeDeriver.deriveDecoyPhone("20250001"));
    }

    @Test
    @DisplayName("decoy 번호는 실계정 번호와 같은 010-XXXX-XXXX(13자) 형식이라 저장·마스킹 결과로 구분되지 않는다")
    void decoyPhoneUsesRealPhoneFormat() {
        assertThat(codeDeriver.deriveDecoyPhone("20250001"))
                .hasSize(13)
                .matches("^010-\\d{4}-\\d{4}$");
    }

    @Test
    @DisplayName("secret 이 다르면 같은 학번이라도 decoy 번호가 다르다 — 예측 가능한 decoy 는 마스킹 번호 대조로 계정 열거를 되살린다")
    void differentSecretsDeriveDifferentDecoyPhones() {
        PhoneVerificationCodeDeriver otherSecretDeriver = new PhoneVerificationCodeDeriver("other-secret");
        assertThat(codeDeriver.deriveDecoyPhone("20250001"))
                .isNotEqualTo(otherSecretDeriver.deriveDecoyPhone("20250001"));
    }

    @Test
    @DisplayName("학번이 다르면 decoy 번호도 다르다 — 미가입 학번들이 한 세션 행을 공유해 서로의 쿨다운에 걸리지 않도록")
    void differentStudentIdsDeriveDifferentDecoyPhones() {
        assertThat(codeDeriver.deriveDecoyPhone("20250001"))
                .isNotEqualTo(codeDeriver.deriveDecoyPhone("20250002"));
    }

    @Test
    @DisplayName("secret 이 비어 있으면 기동 시점에 실패한다 — 운영 설정 실수를 늦게 발견하지 않도록")
    void blankSecretFailsFast() {
        assertThatThrownBy(() -> new PhoneVerificationCodeDeriver(" "))
                .isInstanceOf(IllegalStateException.class);
    }
}
