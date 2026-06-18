package com.duing.domain.cashbook.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class CashbookEntryException extends ApplicationException {

    protected CashbookEntryException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class CashbookEntryNotFoundException extends CashbookEntryException {
        private static final String MESSAGE = "장부 항목을 찾을 수 없습니다.";

        public CashbookEntryNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidCashbookCategoryException extends CashbookEntryException {
        private static final String MESSAGE = "선택한 카테고리가 수입/지출 유형에 맞지 않거나, 기타가 아닌데 직접입력이 들어 있습니다.";

        public InvalidCashbookCategoryException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class CashbookEntryImmutableException extends CashbookEntryException {
        private static final String MESSAGE = "BANK 자동 생성 항목은 카테고리·메모만 수정할 수 있습니다.";

        public CashbookEntryImmutableException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidCashbookUpdateException extends CashbookEntryException {
        private static final String MESSAGE = "수동 항목 수정에는 금액·설명·거래일이 모두 필요합니다.";

        public InvalidCashbookUpdateException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class CashbookEntryNotDeletableException extends CashbookEntryException {
        private static final String MESSAGE = "BANK 자동 생성 항목은 삭제할 수 없습니다.";

        public CashbookEntryNotDeletableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
