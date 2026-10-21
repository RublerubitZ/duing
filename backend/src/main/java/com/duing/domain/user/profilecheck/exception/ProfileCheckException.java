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
     * 화면을 그린 뒤 학기가 바뀐 운영진 화면의 켜는 저장. 처음 불러온 노출 여부(켜짐)를 그대로 보내면 아무도 다시 켜지 않았는데
     * 새 학기 팝업이 시작되므로(원 스펙 D7) 저장하지 않는다. 아무 것도 바꾸지 않는다 — 콘솔은 코드로 분기해 최신 설정을 다시 받는다.
     */
    public static class ProfileCheckSemesterChangedException extends ProfileCheckException {
        private static final String MESSAGE = "학기가 바뀌었습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요.";

        public ProfileCheckSemesterChangedException() {
            super(MESSAGE, HttpStatus.CONFLICT, "PROFILE_CHECK_SEMESTER_CHANGED");
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
