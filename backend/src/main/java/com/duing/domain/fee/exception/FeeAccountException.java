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

    /**
     * 자동매칭이 사용 가능한(active && api_registered, 지원 은행) 계좌를 수정·재등록하려 한 경우.
     * 외부 BANK 에 등록된 번호와 DB 가 어긋나는 드리프트를 막기 위해 잠근다 — 변경하려면 자동매칭을 먼저 해제해야 한다.
     */
    public static class BankMatchingActiveException extends FeeAccountException {
        private static final String MESSAGE =
                "자동매칭이 활성화된 계좌는 수정할 수 없습니다. 자동매칭 해제 후 다시 시도해 주세요.";

        public BankMatchingActiveException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
