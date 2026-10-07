package com.duing.global.exception;

import org.springframework.http.HttpStatus;

/**
 * 요청한 페이지의 오프셋(page × size)이 int 범위를 넘는 경우. 클라이언트 입력 오류이므로 400.
 * 입력값은 메시지에 싣지 않는다.
 * {@link GlobalExceptionHandler#handleApplicationException} 가 상태코드·메시지를 그대로 응답한다.
 */
public class InvalidPageRequestException extends ApplicationException {

    private static final String MESSAGE = "요청한 페이지가 범위를 벗어났습니다.";

    public InvalidPageRequestException() {
        super(MESSAGE, HttpStatus.BAD_REQUEST);
    }
}
