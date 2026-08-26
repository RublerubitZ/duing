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
    /** decoy 번호 파생의 도메인 분리 접두사 — 같은 secret 을 쓰되 인증 코드와 출력 공간을 겹치지 않게 한다. */
    private static final String DECOY_PHONE_PREFIX = "decoy-phone:";
    private static final int PHONE_GROUP_MODULUS = 10_000;

    private final String secret;

    public PhoneVerificationCodeDeriver(@Value("${phone-verification.secret}") String secret) {
        if (secret == null || secret.isBlank()) {
            // 공백 secret 은 HMAC 초기화 시점의 런타임 500 으로 늦게 드러난다 — 기동에서 즉시 실패시킨다.
            throw new IllegalStateException(
                    "phone-verification.secret(PHONE_VERIFICATION_SECRET) 이 비어 있습니다. 배포 환경변수를 확인하세요.");
        }
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

    /**
     * 미가입 학번용 decoy 번호(010-XXXX-XXXX) — 계정 열거 평탄화 전용 (spec §7.6 균일 응답).
     *
     * <p>미존재 학번도 이 번호로 실제 세션을 발급해 존재 계정과 같은 응답·쿨다운·폴링·리밋을 태운다.
     * 학번당 결정적이라 재시도해도 같은 마스킹 번호가 나오고(값이 흔들리면 그 자체가 오라클),
     * secret 없이는 예측 불가라 실계정 번호와 구분되지 않는다. 실번호와의 충돌 확률은 사용자수/1e8 이며,
     * 충돌해도 세션 귀속은 targetUserId=null 이라 계정 탈취로 이어지지 않는다.
     */
    public String deriveDecoyPhone(String studentId) {
        byte[] hmac = hmac(DECOY_PHONE_PREFIX + studentId);
        int middleGroup = (((hmac[0] & 0xFF) << 8) | (hmac[1] & 0xFF)) % PHONE_GROUP_MODULUS;
        int lastGroup = (((hmac[2] & 0xFF) << 8) | (hmac[3] & 0xFF)) % PHONE_GROUP_MODULUS;
        // 010- 네임스페이스를 쓴다 — PhoneMasker 가 앞자리를 그대로 노출하므로 예약 대역을 쓰면
        // 마스킹 결과(예: 000-****-1234)만 보고 미가입 계정임을 알 수 있게 된다.
        return String.format("010-%04d-%04d", middleGroup, lastGroup);
    }

    private byte[] hmac(String message) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException hmacFailure) {
            // HmacSHA256 은 JDK 필수 알고리즘 — 발생 시 설정 오류이므로 즉시 노출한다.
            throw new IllegalStateException("HMAC 계산 실패", hmacFailure);
        }
    }
}
