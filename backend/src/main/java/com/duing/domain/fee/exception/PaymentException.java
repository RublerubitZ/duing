package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class PaymentException extends ApplicationException {

    protected PaymentException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class PaymentNotFoundException extends PaymentException {
        private static final String MESSAGE = "납부 기록을 찾을 수 없습니다.";

        public PaymentNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class PaymentExceedsRemainingException extends PaymentException {
        private static final String MESSAGE = "납부 금액이 남은 미납액을 초과합니다.";

        public PaymentExceedsRemainingException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class BillNotPayableException extends PaymentException {
        private static final String MESSAGE = "취소된 청구에는 납부를 기록할 수 없습니다.";

        public BillNotPayableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class ManualMethodRequiredException extends PaymentException {
        private static final String MESSAGE = "수동 납부 기록에는 현금/계좌이체/기타만 사용할 수 있습니다.";

        public ManualMethodRequiredException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
