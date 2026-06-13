package com.duing.domain.user.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 인증 코드 생성과 HMAC-SHA256 해시를 담당한다.
 *
 * <p>6자리 코드는 해시되어도 전수 대입으로 역산 가능하므로 해시는 보조 장치이며,
 * 실질 방어선은 만료 20분 + 시도 5회 제한이다 (spec §4.1).
 */
@Component
public class VerificationCodeManager {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final String secret;

    public VerificationCodeManager(@Value("${email.verification.secret}") String secret) {
        this.secret = secret;
    }

    /** 선행 0 을 허용하는 6자리 숫자 코드 (000000~999999). */
    public String generateCode() {
        return String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
    }

    public String hash(String email, String code) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] hmac = mac.doFinal((email + ":" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hmac);
        } catch (java.security.GeneralSecurityException hmacFailure) {
            // HmacSHA256 은 JDK 필수 알고리즘 — 발생 시 설정 오류이므로 즉시 노출한다.
            throw new IllegalStateException("HMAC 계산 실패", hmacFailure);
        }
    }

    public boolean matches(String email, String code, String storedHash) {
        byte[] computed = hash(email, code).getBytes(StandardCharsets.UTF_8);
        byte[] stored = storedHash.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(computed, stored);
    }
}
