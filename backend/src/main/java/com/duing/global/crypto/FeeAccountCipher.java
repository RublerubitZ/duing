package com.duing.global.crypto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 회비 계좌번호 같은 민감 문자열을 AES-256-GCM 으로 암·복호화한다.
 *
 * <p>키는 {@code security.fee-account.encryption-key}(base64 32바이트) 에서 주입받고,
 * 기동 시 32바이트로 디코딩되는지 검증해 잘못된 키면 빈 생성 단계에서 즉시 실패한다(fail fast).
 *
 * <p>토큰 형식: base64({@code IV(12B) || ciphertext+tag}). 호출마다 SecureRandom 으로 새 IV 를 생성하므로
 * 같은 평문도 매번 다른 암호문이 된다. GCM 태그(128bit)가 무결성을 보장해 변조된 토큰은 복호화 시 예외가 난다.
 *
 * <p>추가로 {@code clubId} 를 GCM 의 AAD(Additional Authenticated Data) 로 바인딩한다(8바이트 big-endian).
 * AAD 는 암호문에 포함되지 않지만 태그 계산에 들어가므로, 한 동아리의 암호문을 다른 동아리 행에 끼워 넣으면
 * 복호화 시 AAD 가 달라 GCM 인증이 실패한다 — 동아리 간 암호문 치환을 막는 심층 방어(defense-in-depth) 장치다.
 */
@Component
public class FeeAccountCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String KEY_ALGORITHM = "AES";
    private static final int KEY_LENGTH_BYTES = 32;   // AES-256
    private static final int IV_LENGTH_BYTES = 12;    // GCM 권장 96bit
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec secretKey;

    public FeeAccountCipher(@Value("${security.fee-account.encryption-key}") String base64Key) {
        if (!StringUtils.hasText(base64Key)) {
            throw new IllegalStateException(
                    "회비 계좌 암호화 키(security.fee-account.encryption-key)가 비어 있습니다. "
                            + "FEE_ACCOUNT_ENC_KEY 환경변수로 base64 인코딩된 32바이트 키를 주입하세요.");
        }
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException invalidBase64) {
            throw new IllegalStateException(
                    "회비 계좌 암호화 키가 유효한 base64 가 아닙니다.", invalidBase64);
        }
        if (keyBytes.length != KEY_LENGTH_BYTES) {
            throw new IllegalStateException(
                    "회비 계좌 암호화 키는 32바이트(AES-256)여야 합니다. 실제: " + keyBytes.length + "바이트");
        }
        this.secretKey = new SecretKeySpec(keyBytes, KEY_ALGORITHM);
    }

    /**
     * 평문을 암호화해 base64({@code IV || ciphertext+tag}) 토큰을 반환한다.
     * {@code clubId} 를 AAD 로 바인딩하므로, 같은 {@code clubId} 로만 복호화할 수 있다.
     *
     * @throws IllegalArgumentException 평문이 null 또는 공백일 때(민감값을 빈 채로 저장하는 실수 방지)
     */
    public String encrypt(String plaintext, long clubId) {
        if (!StringUtils.hasText(plaintext)) {
            throw new IllegalArgumentException("암호화할 평문은 null 또는 공백일 수 없습니다.");
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            cipher.updateAAD(aadOf(clubId)); // 동아리 바인딩: 같은 clubId 로만 복호화 가능
            byte[] cipherTextWithTag = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] token = new byte[iv.length + cipherTextWithTag.length];
            System.arraycopy(iv, 0, token, 0, iv.length);
            System.arraycopy(cipherTextWithTag, 0, token, iv.length, cipherTextWithTag.length);
            return Base64.getEncoder().encodeToString(token);
        } catch (GeneralSecurityException encryptionFailure) {
            throw new IllegalStateException("회비 계좌 암호화에 실패했습니다.", encryptionFailure);
        }
    }

    /**
     * {@link #encrypt(String, long)} 가 만든 토큰을 복호화해 평문을 반환한다.
     * 암호화에 쓰인 {@code clubId} 와 같은 값을 넘겨야 한다 — 다르면 AAD 가 어긋나 GCM 인증이 실패한다.
     *
     * @throws IllegalArgumentException 토큰이 null/공백이거나 형식이 잘못됐을 때
     * @throws IllegalStateException 토큰이 변조됐거나, 다른 키/다른 clubId 로 만들어져 복호화/인증이 실패할 때
     */
    public String decrypt(String token, long clubId) {
        if (!StringUtils.hasText(token)) {
            throw new IllegalArgumentException("복호화할 토큰은 null 또는 공백일 수 없습니다.");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(token.trim());
        } catch (IllegalArgumentException invalidBase64) {
            throw new IllegalArgumentException("복호화할 토큰이 유효한 base64 가 아닙니다.", invalidBase64);
        }
        if (decoded.length <= IV_LENGTH_BYTES) {
            throw new IllegalArgumentException("복호화할 토큰 형식이 올바르지 않습니다.");
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            byte[] cipherTextWithTag = new byte[decoded.length - IV_LENGTH_BYTES];
            System.arraycopy(decoded, 0, iv, 0, IV_LENGTH_BYTES);
            System.arraycopy(decoded, IV_LENGTH_BYTES, cipherTextWithTag, 0, cipherTextWithTag.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            cipher.updateAAD(aadOf(clubId)); // 암호화 때와 같은 clubId 라야 태그가 일치한다
            byte[] plaintext = cipher.doFinal(cipherTextWithTag);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (GeneralSecurityException authenticationFailure) {
            // GCM 태그 불일치(변조·키 불일치·clubId 불일치 등) 포함 — 인증 실패는 예외로 노출한다.
            throw new IllegalStateException(
                    "회비 계좌 복호화에 실패했습니다(토큰 변조 또는 키·동아리 불일치).",
                    authenticationFailure);
        }
    }

    /**
     * {@code clubId} 를 결정적(deterministic)으로 8바이트 big-endian 으로 직렬화해 GCM 의 AAD 로 쓴다.
     * 같은 clubId 면 항상 같은 AAD 가 나오므로 합법적인 라운드트립은 그대로 동작하고,
     * 다른 동아리 행으로 암호문을 치환하면 AAD 가 달라져 인증이 실패한다.
     */
    private static byte[] aadOf(long clubId) {
        return ByteBuffer.allocate(Long.BYTES).putLong(clubId).array();
    }
}
