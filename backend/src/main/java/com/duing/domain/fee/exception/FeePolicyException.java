package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FeePolicyException extends ApplicationException {

    protected FeePolicyException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class FeePolicyNotFoundException extends FeePolicyException {
        private static final String MESSAGE = "회비 정책을 찾을 수 없습니다.";

        public FeePolicyNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class InactiveFeePolicyException extends FeePolicyException {
        private static final String MESSAGE = "비활성 상태의 회비 정책으로는 청구할 수 없습니다.";

        public InactiveFeePolicyException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class FeePolicyDeleteForbiddenException extends FeePolicyException {
        private static final String MESSAGE = "이미 청구 이력이 있는 정책은 삭제할 수 없습니다. 비활성화하세요.";

        public FeePolicyDeleteForbiddenException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class FeePolicyBillingTypeImmutableException extends FeePolicyException {
        private static final String MESSAGE = "이미 청구 이력이 있는 정책의 회비 유형은 변경할 수 없습니다.";

        public FeePolicyBillingTypeImmutableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class AutoIssueNotMonthlyException extends FeePolicyException {
        private static final String MESSAGE = "자동 발행은 매월(MONTHLY) 정책에서만 설정할 수 있습니다.";

        public AutoIssueNotMonthlyException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidIssueScheduleException extends FeePolicyException {
        private static final String MESSAGE =
                "발행일·마감일은 1~28 사이여야 하며, 마감일은 발행일과 같거나 이후여야 합니다.";

        public InvalidIssueScheduleException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class AutoIssueRequiresAllMembersException extends FeePolicyException {
        private static final String MESSAGE = "자동 발행은 전체 회원(ALL_MEMBERS) 정책에서만 설정할 수 있습니다.";

        public AutoIssueRequiresAllMembersException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
