package com.duing.global.constant;

/**
 * 여러 도메인 예외가 공유하는 응답 에러 코드.
 *
 * <p>프론트엔드는 예외 타입이 아니라 응답의 {@code code} 로 분기하므로, 서로 다른 도메인이
 * 같은 코드를 내보내는 순간 그 문자열은 도메인 밖의 계약이 된다. 한 곳만 고쳐 코드가 어긋나는 일을
 * 막으려고 여기서 한 번만 정의한다.
 *
 * <p>한 곳에서만 쓰이는 코드 17종은 의도적으로 각 예외의 리터럴로 둔다 — 정의가 곧 사용처라
 * 상수로 빼면 오히려 추적만 한 단계 늘어난다.
 */
public final class ErrorCodes {

    /**
     * 마감된 모집에 대한 쓰기 시도. 모집 재마감·마감 모집 읽기 전용 가드·면접 가능 시간 제출·지원 철회가
     * 같은 코드를 공유한다(HTTP 409).
     */
    public static final String RECRUITMENT_CLOSED = "RECRUITMENT_CLOSED";

    private ErrorCodes() {
        // 상수 모음 클래스 — 인스턴스화 금지
    }
}
