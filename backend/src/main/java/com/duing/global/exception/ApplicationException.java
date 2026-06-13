package com.duing.global.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public abstract class ApplicationException extends RuntimeException {

    private final HttpStatus status;
    /** 프론트 분기용 machine-readable 코드. 미지정 시 null → 응답에서 생략된다. */
    private final String code;

    protected ApplicationException(String message, HttpStatus status) {
        this(message, status, null);
    }

    protected ApplicationException(String message, HttpStatus status, String code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
