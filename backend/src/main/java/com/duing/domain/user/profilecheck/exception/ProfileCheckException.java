package com.duing.domain.user.profilecheck.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ProfileCheckException extends ApplicationException {

    protected ProfileCheckException(String message, HttpStatus status) {
        super(message, status);
    }

    protected ProfileCheckException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    /**
     * 팝업이 꺼졌거나·켜 둔 학기가 지났거나·요청 학기가 오늘 학기가 아니거나·확인 대상이 아닐 때. 아무 것도 바꾸지
     * 않는다. 프론트는 코드로 분기해 팝업을 닫는다.
     */
    public static class ProfileCheckClosedException extends ProfileCheckException {
        private static final String MESSAGE = "지금은 정보 확인 기간이 아닙니다.";

        public ProfileCheckClosedException() {
            super(MESSAGE, HttpStatus.CONFLICT, "PROFILE_CHECK_CLOSED");
        }
    }

    /**
     * 서버 제안값이 아닌 학년으로 확인하려는 요청. 앱 화면에서는 생기지 않는다 — 학년이 바뀌는 경로(프로필 저장·가입)는
     * 모두 그 학기 확인 기록을 남겨 확인 요청이 멱등 분기에서 끝난다.
     */
    public static class InvalidProfileCheckGradeException extends ProfileCheckException {
        private static final String MESSAGE = "확인할 수 없는 학년입니다.";

        public InvalidProfileCheckGradeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
