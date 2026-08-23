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

    /**
     * 익명 FAQ 피드백 제출의 IP 레이트리밋 초과 — sessionKey 는 클라이언트가 만들어 보내는 값이라
     * 키를 갈아끼우면 dedup 이 무력해진다. IP 창이 행 증식의 유일한 총량 상한이다.
     */
    public static class FaqFeedbackRateLimitedException extends FederationFaqException {
        private static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
        public FaqFeedbackRateLimitedException() { super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS); }
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
