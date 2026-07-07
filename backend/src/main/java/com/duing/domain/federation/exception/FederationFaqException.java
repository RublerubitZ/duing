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

    public static class FederationFaqCategoryNotFoundException extends FederationFaqException {
        private static final String MESSAGE = "FAQ 카테고리를 찾을 수 없습니다.";
        public FederationFaqCategoryNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class DuplicateFederationFaqCategoryNameException extends FederationFaqException {
        private static final String MESSAGE = "이미 존재하는 카테고리 이름입니다.";
        public DuplicateFederationFaqCategoryNameException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class FaqOrderMismatchException extends FederationFaqException {
        private static final String MESSAGE = "정렬 대상 FAQ 목록이 현재 목록과 일치하지 않습니다.";
        public FaqOrderMismatchException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static class FaqFeedbackSessionKeyRequiredException extends FederationFaqException {
        private static final String MESSAGE = "세션 키는 필수 입력값입니다.";
        public FaqFeedbackSessionKeyRequiredException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static class FederationFaqCategoryInUseException extends FederationFaqException {
        private static final String MESSAGE = "FAQ가 있는 카테고리는 삭제할 수 없습니다. 이관할 카테고리를 지정해 주세요.";
        public FederationFaqCategoryInUseException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidCategoryMoveTargetException extends FederationFaqException {
        private static final String MESSAGE = "이관 대상은 삭제하려는 카테고리와 달라야 합니다.";
        public InvalidCategoryMoveTargetException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
}
