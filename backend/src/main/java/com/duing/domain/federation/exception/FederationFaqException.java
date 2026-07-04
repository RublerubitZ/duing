package com.duing.domain.federation.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FederationFaqException extends ApplicationException {

    protected FederationFaqException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class FederationFaqNotFoundException extends FederationFaqException {
        private static final String MESSAGE = "FAQ를 찾을 수 없습니다.";
        public FederationFaqNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
}
