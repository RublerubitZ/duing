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

    /** 동아리당 활성 코드 1개 제약(partial unique)에 동시 재생성이 걸린 경우 — 재시도로 해소된다. */
    public static final class ConcurrentJoinCodeOperationException extends JoinCodeException {
        private static final String MESSAGE =
                "다른 운영진이 먼저 가입 코드를 변경했습니다. 새로고침 후 다시 시도해주세요.";

        public ConcurrentJoinCodeOperationException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /** 승인 시점 잔여 인원 소진 — 코드 행 잠금 하의 원자 차감이 실패한 경우다(스펙 4.3). */
    public static final class InsufficientRemainingUsesException extends JoinCodeException {
        private static final String MESSAGE = "잔여 사용 가능 인원이 부족합니다.";

        public InsufficientRemainingUsesException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static final class ExternalRecruitmentRequiredException extends JoinCodeException {
        private static final String MESSAGE = "진행 중인 외부 폼 모집이 있을 때만 가입 코드를 생성할 수 있습니다.";

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
