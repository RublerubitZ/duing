package com.duing.global.mo;

/** MO 벤더 호출 실패 래핑 — 상태조회는 이를 삼키고 PENDING 을 유지한다 (폴링이 자연 재시도). */
public class MoProviderException extends RuntimeException {

    public MoProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}
