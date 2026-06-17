package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FeeBillException extends ApplicationException {

    protected FeeBillException(String message, HttpStatus status) {
        super(message, status);
    }

    // code 를 실어 프론트가 마감일 오류를 구분(§5.1). ApplicationException(message, status, code) 시그니처에 정렬.
    protected FeeBillException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    // inner 예외명은 코드베이스 컨벤션(풀네임 {Predicate}{Domain}Exception)을 따른다.
    public static class FeeBillNotFoundException extends FeeBillException {
        private static final String MESSAGE = "청구서를 찾을 수 없습니다.";

        public FeeBillNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidBillingPeriodException extends FeeBillException {
        private static final String MESSAGE = "청구 회차/기간 입력이 올바르지 않습니다.";
        private static final String DUE_BEFORE_PERIOD_MESSAGE = "마감일은 청구 기간 시작일 이후여야 합니다.";
        private static final String DUE_IN_PAST_MESSAGE = "마감일은 발행일보다 과거일 수 없습니다.";

        public InvalidBillingPeriodException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }

        private InvalidBillingPeriodException(String message, String code) {
            super(message, HttpStatus.BAD_REQUEST, code);
        }

        // 마감일 검증(§5.1)은 별도 예외를 만들지 않고 같은 400 을 code 로 구분한다.
        public static InvalidBillingPeriodException dueBeforePeriod() {
            return new InvalidBillingPeriodException(DUE_BEFORE_PERIOD_MESSAGE, "DUE_DATE_BEFORE_PERIOD");
        }

        public static InvalidBillingPeriodException dueInPast() {
            return new InvalidBillingPeriodException(DUE_IN_PAST_MESSAGE, "DUE_DATE_IN_PAST");
        }
    }
}
