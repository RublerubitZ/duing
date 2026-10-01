package com.duing.global.exception;

import org.springframework.http.HttpStatus;

/**
 * 허용되지 않은 정렬 조건이 요청된 경우(허용 목록 밖 속성·대소문자 무시 정렬). 클라이언트 입력 오류이므로 400.
 * {@link GlobalExceptionHandler#handleApplicationException} 가 상태코드·메시지를 그대로 응답한다.
 *
 * <p>메시지는 고정 문구다 — 요청한 속성값을 실으면 응답 본문과 WARN 로그에 그대로 반사되고, CR/LF 가 섞이면
 * 로그 줄을 위조할 수 있다. 속성값은 호출부 호환을 위해 받기만 한다.
 */
public class InvalidSortException extends ApplicationException {

    private static final String MESSAGE = "지원하지 않는 정렬 조건입니다.";

    public InvalidSortException(String property) {
        super(MESSAGE, HttpStatus.BAD_REQUEST);
    }
}
