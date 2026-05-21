package com.duing.domain.promotion.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class PromotionException extends ApplicationException {

    protected PromotionException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class PromotionRequestNotFoundException extends PromotionException {
        private static final String MESSAGE = "홍보 요청을 찾을 수 없습니다.";
        public PromotionRequestNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class DuplicatePendingPromotionRequestException extends PromotionException {
        private static final String MESSAGE = "이미 처리 대기 중인 홍보 요청이 있습니다.";
        public DuplicatePendingPromotionRequestException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidPromotionRequestTransitionException extends PromotionException {
        public InvalidPromotionRequestTransitionException(String reason) {
            super("홍보 요청 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }

    public static class PromotionNotFoundException extends PromotionException {
        private static final String MESSAGE = "홍보 배너를 찾을 수 없습니다.";
        public PromotionNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
}
