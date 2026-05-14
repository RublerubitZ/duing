package com.duing.global.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public abstract class ApplicationException extends RuntimeException {

    private final HttpStatus status;

    protected ApplicationException(String message, HttpStatus status) {
        super(message);
        this.status = status;
    }
}
