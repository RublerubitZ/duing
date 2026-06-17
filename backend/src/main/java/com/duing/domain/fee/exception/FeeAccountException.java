package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FeeAccountException extends ApplicationException {

    protected FeeAccountException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class FeeAccountNotFoundException extends FeeAccountException {
        private static final String MESSAGE = "등록된 회비 계좌가 없습니다.";

        public FeeAccountNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    /**
     * 저장된 암호문이 변조됐거나 키가 바뀌어 복호화에 실패한 경우(서버 측 데이터 무결성 문제).
     * 원인(cause)만 로깅 체계로 넘기고 평문·암호문·키는 메시지에 절대 싣지 않는다.
     */
    public static class AccountDecryptionFailedException extends FeeAccountException {
        private static final String MESSAGE = "회비 계좌 정보를 불러올 수 없습니다.";

        public AccountDecryptionFailedException(Throwable cause) {
            super(MESSAGE, HttpStatus.INTERNAL_SERVER_ERROR);
            initCause(cause); // 원인 스택은 보존하되, 메시지엔 평문·암호문·키를 절대 싣지 않는다.
        }
    }
}
