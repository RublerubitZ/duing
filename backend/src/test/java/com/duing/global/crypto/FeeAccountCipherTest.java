package com.duing.global.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * AES-256-GCM 암호화 동작 단위 검증. Spring 컨텍스트 없이 알려진 32바이트 키로 직접 생성한다
 * (@Value 주입이 런타임에 실제로 동작하는지는 {@code FeeAccountCipherWiringTest} 가 부팅으로 확인한다).
 */
class FeeAccountCipherTest {

    // 테스트 전용 더미 키 — 실 시크릿 아님. "duing-test-fee-account-aes256-ke"(32바이트)의 base64.
    private static final String TEST_KEY_BASE64 =
            Base64.getEncoder().encodeToString(
                    "duing-test-fee-account-aes256-ke".getBytes(StandardCharsets.UTF_8));

    private final FeeAccountCipher cipher = new FeeAccountCipher(TEST_KEY_BASE64);

    @Test
    @DisplayName("암호화한 값을 복호화하면 원본 평문이 그대로 복원된다")
    void decryptReturnsOriginalPlaintext() {
        String plaintext = "352-1234-5678-90";

        String token = cipher.encrypt(plaintext);
        String decrypted = cipher.decrypt(token);

        assertThat(decrypted).isEqualTo(plaintext);
        assertThat(token).isNotEqualTo(plaintext);
    }

    @Test
    @DisplayName("같은 평문을 두 번 암호화하면 IV 가 매번 달라 서로 다른 암호문이 나온다")
    void sameInputProducesDifferentCiphertext() {
        String plaintext = "110-987-654321";

        String firstToken = cipher.encrypt(plaintext);
        String secondToken = cipher.encrypt(plaintext);

        assertThat(firstToken).isNotEqualTo(secondToken);
        assertThat(cipher.decrypt(firstToken)).isEqualTo(plaintext);
        assertThat(cipher.decrypt(secondToken)).isEqualTo(plaintext);
    }

    @Test
    @DisplayName("변조된 토큰은 GCM 태그 검증에 실패해 복호화 시 예외가 발생한다")
    void tamperedTokenFailsToDecrypt() {
        String token = cipher.encrypt("123-456-789");
        byte[] raw = Base64.getDecoder().decode(token);
        raw[raw.length - 1] ^= 0x01; // 마지막 바이트(태그 영역) 1비트 뒤집기
        String tamperedToken = Base64.getEncoder().encodeToString(raw);

        assertThatThrownBy(() -> cipher.decrypt(tamperedToken))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("base64 가 아닌 쓰레기 토큰은 복호화 시 예외가 발생한다")
    void garbageTokenFailsToDecrypt() {
        assertThatThrownBy(() -> cipher.decrypt("!!!not-base64!!!"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("null/공백 평문을 암호화하려 하면 예외가 발생한다")
    void encryptRejectsNullOrBlank() {
        assertThatThrownBy(() -> cipher.encrypt(null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> cipher.encrypt("   "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("키가 32바이트가 아니면 생성 시점에 즉시 실패한다(fail fast)")
    void rejectsKeyThatIsNot32Bytes() {
        String shortKey = Base64.getEncoder().encodeToString(new byte[16]);

        assertThatThrownBy(() -> new FeeAccountCipher(shortKey))
                .isInstanceOf(IllegalStateException.class);
    }
}
