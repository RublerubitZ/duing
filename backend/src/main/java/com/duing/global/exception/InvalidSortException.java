package com.duing.global.exception;

import org.springframework.http.HttpStatus;

/**
 * 허용되지 않은 정렬 필드가 요청된 경우(정렬 화이트리스트 위반). 클라이언트 입력 오류이므로 400.
 * {@link GlobalExceptionHandler#handleApplicationException} 가 상태코드·메시지를 그대로 응답한다.
 */
public class InvalidSortException extends ApplicationException {

    public InvalidSortException(String property) {
        super("지원하지 않는 정렬 조건입니다: " + property, HttpStatus.BAD_REQUEST);
    }
}
