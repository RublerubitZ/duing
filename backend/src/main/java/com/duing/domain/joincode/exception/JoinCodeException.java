package com.duing.domain.joincode.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class JoinCodeException extends ApplicationException {

    protected JoinCodeException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 미존재·타 동아리 코드를 하나로 묶어 존재 여부 열거를 막는다(IDOR 차단). */
    public static final class JoinCodeNotFoundException extends JoinCodeException {
        private static final String MESSAGE = "유효하지 않은 가입 코드입니다.";

        public JoinCodeNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    /** 모집당 활성 코드 1개 제약(partial unique)에 동시 재생성이 걸린 경우 — 재시도로 해소된다. */
    public static final class ConcurrentJoinCodeOperationException extends JoinCodeException {
        private static final String MESSAGE =
                "다른 운영진이 먼저 가입 코드를 변경했습니다. 새로고침 후 다시 시도해주세요.";

        public ConcurrentJoinCodeOperationException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** 자체 폼(SELF) 모집에는 가입 코드 개념이 없다 — 지원서·합격 처리가 두잉 안에서 끝난다. */
    public static final class ExternalRecruitmentRequiredException extends JoinCodeException {
        private static final String MESSAGE = "외부 폼 모집에서만 가입 코드를 사용할 수 있습니다.";

        public ExternalRecruitmentRequiredException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static final class InvalidExpiresInDaysException extends JoinCodeException {
        private static final String MESSAGE = "만료 기간은 7일, 30일, 90일 중 하나여야 합니다.";

        public InvalidExpiresInDaysException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
