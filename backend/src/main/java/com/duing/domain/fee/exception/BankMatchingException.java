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
}
