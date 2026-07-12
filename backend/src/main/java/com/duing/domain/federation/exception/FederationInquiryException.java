package com.duing.domain.federation.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FederationInquiryException extends ApplicationException {

    protected FederationInquiryException(String message, HttpStatus status) {
        super(message, status);
    }

    protected FederationInquiryException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    // 타인 문의 접근도 404 — 존재 자체를 은닉한다(스펙 §5·§7).
    public static class FederationInquiryNotFoundException extends FederationInquiryException {
        private static final String MESSAGE = "문의를 찾을 수 없습니다.";
        public FederationInquiryNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    // admin 상세 전용 — 관리자는 접수 알림으로 존재를 이미 알아 은닉 실익이 없다(스펙 §4 삭제 정책).
    public static class InquiryDeletedException extends FederationInquiryException {
        private static final String MESSAGE = "작성자가 삭제한 문의입니다.";
        public InquiryDeletedException() { super(MESSAGE, HttpStatus.GONE, "INQUIRY_DELETED"); }
    }

    // version echo 불일치 — stale-render 방어(스펙 §4 상태머신).
    public static class InquiryContentChangedException extends FederationInquiryException {
        private static final String MESSAGE = "문의가 수정되었습니다. 새로고침 후 다시 시도해 주세요.";
        public InquiryContentChangedException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidInquiryStatusException extends FederationInquiryException {
        public InvalidInquiryStatusException(String reason) { super(reason, HttpStatus.CONFLICT); }
    }

    public static class InquiryAlreadyAnsweredException extends FederationInquiryException {
        private static final String MESSAGE = "이미 답변이 등록된 문의입니다.";
        public InquiryAlreadyAnsweredException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class ConcurrentInquiryUpdateException extends FederationInquiryException {
        private static final String MESSAGE = "다른 처리와 동시에 요청되어 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
        public ConcurrentInquiryUpdateException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class TooManyOpenInquiriesException extends FederationInquiryException {
        private static final String MESSAGE = "처리 대기 중인 문의가 많아 새 문의를 등록할 수 없습니다. 답변 후 다시 시도해 주세요.";
        public TooManyOpenInquiriesException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    // 첨부 URL 이 이 스토리지의 URL 이 아니거나(toStorageKey 실패), federation/inquiry 목적으로
    // 업로드된 키가 아니거나(타 purpose 키 주입), ".." 경로 탈출 세그먼트를 포함하거나(순회 키),
    // 실제로 스토리지에 존재하지 않는 경우(위조된 키).
    public static class InvalidInquiryException extends FederationInquiryException {
        private static final String MESSAGE = "유효하지 않은 첨부 파일입니다.";
        public InvalidInquiryException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
}
