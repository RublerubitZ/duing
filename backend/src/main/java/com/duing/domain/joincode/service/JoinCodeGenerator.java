package com.duing.domain.joincode.service;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/**
 * 가입 코드 문자열 생성기.
 *
 * <p>Crockford Base32(혼동 문자 I/L/O/U 제외) 6자 — 전화·구두 전달 오류를 줄이기 위해
 * {@code PhoneVerificationCodeDeriver} 와 같은 문자셋을 쓴다. 중복 검사는 호출 측(서비스)이 수행한다.
 */
@Component
public class JoinCodeGenerator {

    private static final char[] CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final int CODE_LENGTH = 6;

    private final SecureRandom secureRandom = new SecureRandom();

    public String generate() {
        StringBuilder codeBuilder = new StringBuilder(CODE_LENGTH);
        for (int index = 0; index < CODE_LENGTH; index++) {
            codeBuilder.append(CROCKFORD_ALPHABET[secureRandom.nextInt(CROCKFORD_ALPHABET.length)]);
        }
        return codeBuilder.toString();
    }
}
