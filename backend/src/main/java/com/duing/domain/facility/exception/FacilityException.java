package com.duing.domain.facility.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FacilityException extends ApplicationException {

    protected FacilityException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 조회 가능한 월 범위(현재월 ±12개월)를 벗어난 요청 — enumeration abuse 방지. */
    public static class MonthOutOfRangeException extends FacilityException {
        private static final String MESSAGE = "조회할 수 없는 월입니다. 현재월 기준 ±12개월 범위만 조회할 수 있습니다.";

        public MonthOutOfRangeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** 존재하지 않거나 아카이브된 시설 상세 요청. */
    public static class FacilityNotFoundException extends FacilityException {
        private static final String MESSAGE = "시설을 찾을 수 없습니다.";

        public FacilityNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }
}
