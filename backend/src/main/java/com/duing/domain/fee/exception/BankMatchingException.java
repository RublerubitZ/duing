package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

/**
 * BANK 자동매칭 설정 관련 예외의 부모. ADMIN 의 허용/해제 적격성 검증과
 * 다른 도메인(청구·정산)의 자동매칭 사용 가능 여부 검증에서 함께 쓴다.
 */
public class BankMatchingException extends ApplicationException {

    protected BankMatchingException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 회비 계좌가 없는 동아리에 자동매칭을 켜려 한 경우. 계좌 등록이 선행 조건이다. */
    public static class FeeAccountRequiredException extends BankMatchingException {
        private static final String MESSAGE = "회비 계좌를 먼저 등록해야 BANK 자동매칭을 사용할 수 있습니다.";

        public FeeAccountRequiredException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** 자동매칭이 켜져 있지 않거나 사용 불가 상태인 동아리에 자동매칭 동작을 요청한 경우. */
    public static class BankMatchingNotEnabledException extends BankMatchingException {
        private static final String MESSAGE = "이 동아리는 BANK 자동매칭을 사용할 수 없습니다.";

        public BankMatchingNotEnabledException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    /**
     * 저장된 회비 계좌 암호문을 복호화하지 못해(키 회전·AAD 불일치·암호문 손상) 자동매칭 등록/해제를
     * 진행할 수 없는 경우. 불투명한 500 대신 처리 불가(422)로 매핑한다.
     * 암호·평문·키 등 어떤 세부정보도 메시지에 싣지 않는다.
     */
    public static class AccountDecryptFailedException extends BankMatchingException {
        private static final String MESSAGE = "회비 계좌 복호화에 실패했습니다. 계좌를 다시 등록해 주세요.";

        public AccountDecryptFailedException() {
            super(MESSAGE, HttpStatus.UNPROCESSABLE_ENTITY);
        }
    }

    /**
     * 매칭 시점에 잠근 청구의 잔액이 입금액과 더 이상 일치하지 않는 경우(동시 분할 납부로 잔액이 변동).
     * 자동 매칭은 진행하지 않고 검토 큐로 보내야 하므로 409 로 매핑한다.
     */
    public static class MatchAmountMismatchException extends BankMatchingException {
        private static final String MESSAGE = "입금 금액이 청구 잔액과 일치하지 않습니다.";

        public MatchAmountMismatchException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** 매칭하려는 입금 거래를 동아리 범위에서 찾지 못한 경우(잘못된 거래 id 또는 cross-club 접근). */
    public static class BankTransactionNotFoundException extends BankMatchingException {
        private static final String MESSAGE = "입금 거래를 찾을 수 없습니다.";

        public BankTransactionNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }
}
