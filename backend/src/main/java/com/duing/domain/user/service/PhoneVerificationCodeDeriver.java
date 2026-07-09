package com.duing.domain.user.service;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * MO 인증 코드를 세션 토큰에서 파생한다 — DB 에 코드를 저장하지 않기 위한 장치 (spec §5.2).
 *
 * <p>{@code code = Base32(HMAC-SHA256(secret, token))[0..8)}. DB 가 유출돼도 secret(env) 없이는
 * 활성 코드를 계산할 수 없다. 발급 응답 시점과 Octomo exists 질의 직전에 각각 재계산한다.
 * 바이트당 하위 5비트만 사용하므로 문자 분포가 균등하다 (8자 × 5bit = 40bit 엔트로피).
 */
@Component
public class PhoneVerificationCodeDeriver {

    /** Crockford Base32 — 혼동 문자 I/L/O/U 제외. 사용자가 문자로 옮겨 적는 값이라 가독성이 중요하다. */
    private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final int CODE_LENGTH = 8;
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String secret;

    public PhoneVerificationCodeDeriver(@Value("${phone-verification.secret}") String secret) {
        this.secret = secret;
    }

    public String deriveCode(String token) {
        byte[] hmac = hmac(token);
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int index = 0; index < CODE_LENGTH; index++) {
            code.append(ALPHABET[hmac[index] & 31]);
        }
        return code.toString();
    }

    private byte[] hmac(String token) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(token.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException hmacFailure) {
            // HmacSHA256 은 JDK 필수 알고리즘 — 발생 시 설정 오류이므로 즉시 노출한다.
            throw new IllegalStateException("HMAC 계산 실패", hmacFailure);
        }
    }
}
