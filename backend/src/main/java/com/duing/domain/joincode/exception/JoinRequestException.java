package com.duing.domain.joincode.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class JoinRequestException extends ApplicationException {

    protected JoinRequestException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 미존재·타 동아리 요청을 하나로 묶어 존재 여부 열거를 막는다(JoinCodeNotFoundException 전례). */
    public static final class JoinRequestNotFoundException extends JoinRequestException {
        private static final String MESSAGE = "가입 요청을 찾을 수 없습니다.";

        public JoinRequestNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    /** 두 운영진이 같은 요청을 동시에 처리한 경우 — 뒤늦은 처리를 거부한다(스펙 4.3). */
    public static final class AlreadyProcessedException extends JoinRequestException {
        private static final String MESSAGE = "이미 처리된 가입 요청입니다.";

        public AlreadyProcessedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
