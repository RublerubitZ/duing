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

    /** 거래 조회/삭제 대상 계좌가 BANK API 에 등록되어 있지 않은 경우. */
    public static class AccountNotRegisteredException extends BankApiException {
        private static final String MESSAGE = "BANK API 에 등록된 계좌가 아닙니다.";

        public AccountNotRegisteredException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** BANK API 호출 한도(rate limit) 초과. 재시도 권장 시각(초)을 함께 담는다. */
    @Getter
    public static class RateLimitExceededException extends BankApiException {
        private static final String MESSAGE = "BANK API 호출 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";

        /** 재시도까지 대기해야 할 시간(초). 응답에 정보가 없으면 null. */
        private final Integer retryAfterSeconds;

        public RateLimitExceededException() {
            this(null);
        }

        public RateLimitExceededException(Integer retryAfterSeconds) {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
            this.retryAfterSeconds = retryAfterSeconds;
        }
    }

    /** BANK API 계좌 등록 한도를 초과한 경우. */
    public static class AccountLimitExceededException extends BankApiException {
        private static final String MESSAGE = "BANK API 계좌 등록 한도(5)를 초과했습니다.";

        public AccountLimitExceededException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** 자동매칭을 지원하지 않는 은행(농협·KB국민·우리 외)을 요청한 경우. */
    public static class UnsupportedBankException extends BankApiException {
        private static final String MESSAGE = "농협·KB국민·우리은행만 자동매칭을 지원합니다.";

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
