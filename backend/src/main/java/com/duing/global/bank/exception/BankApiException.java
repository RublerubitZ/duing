package com.duing.global.bank.exception;

import com.duing.global.exception.ApplicationException;
import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * BANK API 연동 중 발생하는 예외의 부모. 모든 메시지·필드에 계좌비밀번호·주민번호·계좌번호 등
 * 민감정보를 절대 담지 않는다.
 */
public class BankApiException extends ApplicationException {

    protected BankApiException(String message, HttpStatus status) {
        super(message, status);
    }

    protected BankApiException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    /** BANK API 인증 실패(잘못된 apiKey/secretKey 등). 우리 측 설정 문제이므로 502 로 외부에 알린다. */
    public static class AuthFailedException extends BankApiException {
        private static final String MESSAGE = "BANK API 인증에 실패했습니다. 연동 키 설정을 확인해 주세요.";

        public AuthFailedException() {
            super(MESSAGE, HttpStatus.BAD_GATEWAY);
        }
    }

    /**
     * BANK API 호출 한도(rate limit) 초과. 재시도 권장 대기(초)를 함께 담는다.
     * 제한은 계좌 단위 쿨다운(같은 계좌 5분 1회)·키/IP 단위 조회·요청 한도 세 가지다.
     */
    @Getter
    public static class RateLimitExceededException extends BankApiException {
        private static final String MESSAGE = "BANK API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";

        // ponytail: 대기 초는 응답에서 파싱해 두지만 아직 사용자 문구로 노출하지 않는다.
        // "N분 후 다시 시도" 안내가 필요해지면 GlobalExceptionHandler 에서 이 값을 실어 보낸다.
        /** 재시도까지 대기해야 할 시간(초). 응답에 정보가 없으면 null. */
        private final Integer retryAfterSeconds;

        public RateLimitExceededException(Integer retryAfterSeconds) {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
            this.retryAfterSeconds = retryAfterSeconds;
        }
    }

    /** 자동매칭을 지원하지 않는 은행(농협·KB국민·우리·기업 외)을 요청한 경우. */
    public static class UnsupportedBankException extends BankApiException {
        private static final String MESSAGE = "농협·KB국민·우리·기업은행만 자동매칭을 지원합니다.";

        public UnsupportedBankException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** 위에서 분류되지 않은 BANK API 호출 실패(네트워크·5xx·알 수 없는 에러코드 등). */
    public static class BankApiCallFailedException extends BankApiException {
        private static final String MESSAGE = "BANK API 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.";

        public BankApiCallFailedException() {
            super(MESSAGE, HttpStatus.BAD_GATEWAY);
        }
    }
}
