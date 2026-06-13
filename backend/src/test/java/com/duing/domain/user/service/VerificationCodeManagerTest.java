package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

class VerificationCodeManagerTest {

    private final VerificationCodeManager verificationCodeManager =
            new VerificationCodeManager("test-secret");

    @RepeatedTest(20)
    @DisplayName("생성되는 코드는 선행 0 을 포함해 항상 6자리 숫자다")
    void generatedCodeIsAlwaysSixDigits() {
        String code = verificationCodeManager.generateCode();
        assertThat(code).matches("\\d{6}");
    }

    @Test
    @DisplayName("같은 이메일·코드는 같은 해시, 코드가 다르면 다른 해시가 나온다")
    void hashIsDeterministicPerEmailAndCode() {
        String hash = verificationCodeManager.hash("hong@daegu.ac.kr", "123456");

        assertThat(hash).hasSize(64);
        assertThat(verificationCodeManager.hash("hong@daegu.ac.kr", "123456")).isEqualTo(hash);
        assertThat(verificationCodeManager.hash("hong@daegu.ac.kr", "654321")).isNotEqualTo(hash);
        assertThat(verificationCodeManager.hash("kim@daegu.ac.kr", "123456")).isNotEqualTo(hash);
    }

    @Test
    @DisplayName("matches 는 올바른 코드만 true 를 반환한다")
    void matchesComparesHashInConstantTime() {
        String storedHash = verificationCodeManager.hash("hong@daegu.ac.kr", "123456");

        assertThat(verificationCodeManager.matches("hong@daegu.ac.kr", "123456", storedHash)).isTrue();
        assertThat(verificationCodeManager.matches("hong@daegu.ac.kr", "000000", storedHash)).isFalse();
    }

    @Test
    @DisplayName("시크릿이 다르면 같은 입력도 다른 해시가 나온다")
    void differentSecretYieldsDifferentHash() {
        VerificationCodeManager otherSecretManager = new VerificationCodeManager("other-secret");
        assertThat(otherSecretManager.hash("hong@daegu.ac.kr", "123456"))
                .isNotEqualTo(verificationCodeManager.hash("hong@daegu.ac.kr", "123456"));
    }
}
