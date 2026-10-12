package com.duing.global.web;

import java.io.IOException;

/**
 * 길이를 모르는(chunked) 요청 본문이 읽는 도중 상한을 넘었을 때(#1322 F-4).
 *
 * <p>IOException 하위여야 한다 — Spring 은 본문 읽기 중의 IOException 을 HttpMessageNotReadableException 으로 감싸고
 * (GlobalExceptionHandler 가 원인을 보고 413 으로 돌린다), Jackson 은 자기 계열이 아닌 IOException 을 그대로 다시 던진다.
 * RuntimeException 이면 Jackson 의 WRAP_EXCEPTIONS 로 감싸이는 위치가 읽기 지점마다 달라진다.
 */
public class RequestBodyTooLargeException extends IOException {

    public static final String MESSAGE = "요청 본문이 허용된 최대 크기를 초과했습니다.";

    public RequestBodyTooLargeException() {
        super(MESSAGE);
    }
}
