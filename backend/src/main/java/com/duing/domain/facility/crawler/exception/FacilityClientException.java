package com.duing.domain.facility.crawler.exception;

/**
 * 크롤러 계층 내부 예외(HTTP 실패 분류 전용). 컨트롤러/사용자에게 노출되지 않고 크롤 서비스가 부모 타입으로
 * 잡아 "룸 실패"로 처리하므로, HttpStatus 를 싣는 도메인 예외(ApplicationException)가 아니라 RuntimeException 을 상속한다.
 * 재시도 여부만 하위 타입으로 구분한다 — @Retryable 은 {@link FacilityFetchException} 에만 반응한다.
 */
public class FacilityClientException extends RuntimeException {

    public FacilityClientException(String message) {
        super(message);
    }

    public FacilityClientException(String message, Throwable cause) {
        super(message, cause);
    }

    /** 네트워크 오류·Timeout·HTTP 5xx — 재시도 대상. */
    public static class FacilityFetchException extends FacilityClientException {
        public FacilityFetchException(String message) {
            super(message);
        }

        public FacilityFetchException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** HTTP 4xx·JSON 형식 오류 — 재시도 안 함(즉시 룸 실패). */
    public static class FacilityBadResponseException extends FacilityClientException {
        public FacilityBadResponseException(String message) {
            super(message);
        }
    }
}
