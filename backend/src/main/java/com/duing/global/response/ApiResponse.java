package com.duing.global.response;

import com.fasterxml.jackson.annotation.JsonInclude;

public record ApiResponse<T>(
        boolean ok,
        T data,
        String message,
        // null 이면 직렬화에서 생략 — 기존 3-필드 응답 계약을 깨지 않기 위해 code 에만 NON_NULL 적용
        @JsonInclude(JsonInclude.Include.NON_NULL) String code
) {
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, null, null);
    }

    public static ApiResponse<Void> success() {
        return new ApiResponse<>(true, null, null, null);
    }

    public static ApiResponse<Void> error(String message) {
        return new ApiResponse<>(false, null, message, null);
    }

    public static ApiResponse<Void> error(String message, String code) {
        return new ApiResponse<>(false, null, message, code);
    }
}
