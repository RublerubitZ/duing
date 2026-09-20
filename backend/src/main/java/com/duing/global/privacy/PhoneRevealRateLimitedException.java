package com.duing.global.privacy;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

/**
 * 원본 전화번호 열람 한도 초과(429).
 *
 * <p>지원자 번호·부원 번호 두 도메인이 {@link PhoneRevealRateLimiter} 하나를 공유하므로 예외도 어느 도메인에도
 * 속하지 않는 {@code global.privacy} 에 둔다. FE 는 서버 message 를 그대로 노출하므로 분기용 code 는 두지 않는다
 * (429 전례 {@code FileException.UploadRateLimitedException} 과 같은 2-인자 생성자).
 */
public class PhoneRevealRateLimitedException extends ApplicationException {

    private static final String MESSAGE = "전화번호 열람이 너무 잦습니다. 잠시 후 다시 시도해주세요.";

    public PhoneRevealRateLimitedException() {
        super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
}
