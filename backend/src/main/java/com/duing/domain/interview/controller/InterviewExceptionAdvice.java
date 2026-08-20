package com.duing.domain.interview.controller;

import com.duing.domain.interview.controller.dto.response.UnresolvedMembersResponse;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.global.response.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 면접 도메인 전용 예외 어드바이스 — 미처리 멤버 확정 거부(409)에는 경고 2종(미응답·응답했으나 미배정) payload 를
 * 실어야 하므로(§6.3), GlobalExceptionHandler 의 ApplicationException catch-all 보다 먼저 이 예외만 가로챈다.
 * @Order(HIGHEST_PRECEDENCE) 로 우선순위를 보장한다 — 그 외 예외는 손대지 않아 전역 처리에 그대로 위임한다.
 */
@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class InterviewExceptionAdvice {

    @ExceptionHandler(InterviewException.RoundHasUnresolvedMembers.class)
    public ResponseEntity<ApiResponse<UnresolvedMembersResponse>> handleUnresolvedMembers(
            InterviewException.RoundHasUnresolvedMembers exception) {
        // §6.3 — 경고 2종을 데이터로 실어 FE 가 분리 렌더·강조할 수 있게 한다.
        log.warn("RoundHasUnresolvedMembers: unresponded={}, respondedUnassigned={}",
                exception.getPayload().unresponded().size(),
                exception.getPayload().respondedUnassigned().size());
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(false, UnresolvedMembersResponse.from(exception.getPayload()),
                        exception.getMessage(), null));
    }
}
