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
 *
 * <p>암호문은 {@code clubId} 에 AAD 로 바인딩되므로, 암호화·복호화에 같은 {@code clubId} 를 넘겨야만
 * 라운드트립이 성립한다. 다른 동아리로 복호화하면 GCM 인증이 실패한다.
 */
class FeeAccountCipherTest {

    // 테스트 전용 더미 키 — 실 시크릿 아님. "duing-test-fee-account-aes256-ke"(32바이트)의 base64.
    private static final String TEST_KEY_BASE64 =
            Base64.getEncoder().encodeToString(
                    "duing-test-fee-account-aes256-ke".getBytes(StandardCharsets.UTF_8));

    private static final long CLUB_A = 1L;
    private static final long CLUB_B = 2L;

    private final FeeAccountCipher cipher = new FeeAccountCipher(TEST_KEY_BASE64);

    @Test
    @DisplayName("같은 clubId 로 암호화한 값을 복호화하면 원본 평문이 그대로 복원된다")
    void decryptReturnsOriginalPlaintext() {
        String plaintext = "352-1234-5678-90";

        String token = cipher.encrypt(plaintext, CLUB_A);
        String decrypted = cipher.decrypt(token, CLUB_A);

        assertThat(decrypted).isEqualTo(plaintext);
        assertThat(token).isNotEqualTo(plaintext);
    }

    @Test
    @DisplayName("한 동아리(A)의 암호문을 다른 동아리(B)로 복호화하면 AAD 불일치로 인증이 실패한다")
    void decryptWithDifferentClubIdFails() {
        String plaintext = "352-1234-5678-90";
        String tokenForClubA = cipher.encrypt(plaintext, CLUB_A);

        assertThatThrownBy(() -> cipher.decrypt(tokenForClubA, CLUB_B))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("같은 평문·같은 clubId 를 두 번 암호화해도 IV 가 매번 달라 서로 다른 암호문이 나온다")
    void sameInputAndClubProducesDifferentCiphertext() {
        String plaintext = "110-987-654321";

        String firstToken = cipher.encrypt(plaintext, CLUB_A);
        String secondToken = cipher.encrypt(plaintext, CLUB_A);

        assertThat(firstToken).isNotEqualTo(secondToken);
        assertThat(cipher.decrypt(firstToken, CLUB_A)).isEqualTo(plaintext);
        assertThat(cipher.decrypt(secondToken, CLUB_A)).isEqualTo(plaintext);
    }

    @Test
    @DisplayName("변조된 토큰은 GCM 태그 검증에 실패해 복호화 시 예외가 발생한다")
    void tamperedTokenFailsToDecrypt() {
        String token = cipher.encrypt("123-456-789", CLUB_A);
        byte[] raw = Base64.getDecoder().decode(token);
        raw[raw.length - 1] ^= 0x01; // 마지막 바이트(태그 영역) 1비트 뒤집기
        String tamperedToken = Base64.getEncoder().encodeToString(raw);

        assertThatThrownBy(() -> cipher.decrypt(tamperedToken, CLUB_A))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("base64 가 아닌 쓰레기 토큰은 복호화 시 예외가 발생한다")
    void garbageTokenFailsToDecrypt() {
        assertThatThrownBy(() -> cipher.decrypt("!!!not-base64!!!", CLUB_A))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("null/공백 평문을 암호화하려 하면 예외가 발생한다")
    void encryptRejectsNullOrBlank() {
        assertThatThrownBy(() -> cipher.encrypt(null, CLUB_A))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> cipher.encrypt("   ", CLUB_A))
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
