package com.duing.domain.adminconsole.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

/** 총동연 콘솔 공통 예외. 주 단위 조회의 400 은 프론트가 code 로 갈라 읽는다(기기 시계가 앞선 경우 한 주 물러서기 등). */
public class AdminConsoleException extends ApplicationException {

    protected AdminConsoleException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class WeekNotMondayException extends AdminConsoleException {
        private static final String MESSAGE = "주 시작일은 월요일이어야 합니다.";

        public WeekNotMondayException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "WEEK_NOT_MONDAY");
        }
    }

    public static class WeekNotEndedException extends AdminConsoleException {
        private static final String MESSAGE = "아직 끝나지 않은 주입니다.";

        public WeekNotEndedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "WEEK_NOT_ENDED");
        }
    }

    public static class WeekInFutureException extends AdminConsoleException {
        private static final String MESSAGE = "아직 오지 않은 주입니다.";

        public WeekInFutureException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "WEEK_IN_FUTURE");
        }
    }

    public static class WeekTooOldException extends AdminConsoleException {
        private static final String MESSAGE = "52주 전까지의 주만 조회할 수 있습니다.";

        public WeekTooOldException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "WEEK_TOO_OLD");
        }
    }
}
