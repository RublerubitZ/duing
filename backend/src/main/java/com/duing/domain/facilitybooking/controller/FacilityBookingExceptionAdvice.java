package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityBookingConflictResponse;
import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import com.duing.global.response.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 대관 도메인 전용 예외 어드바이스 — 학교 충돌(409)에는 겹침 목록·크롤 기준 시각 payload 를 실어야 하므로(§8.3),
 * GlobalExceptionHandler 의 ApplicationException catch-all 보다 먼저 이 예외만 가로챈다.
 * @Order(HIGHEST_PRECEDENCE) 로 우선순위를 보장한다 — 그 외 예외는 손대지 않아 전역 처리에 그대로 위임한다.
 */
@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class FacilityBookingExceptionAdvice {

    @ExceptionHandler(FacilityBookingException.SchoolConflictException.class)
    public ResponseEntity<ApiResponse<FacilityBookingConflictResponse>> handleSchoolConflict(
            FacilityBookingException.SchoolConflictException exception) {
        log.warn("SchoolConflict (409): conflicts={}, crawlBasisAt={}",
                exception.getConflicts().size(), exception.getCrawlBasisAt());
        return ResponseEntity.status(exception.getStatus())
                .body(new ApiResponse<>(false, FacilityBookingConflictResponse.from(exception),
                        exception.getMessage(), exception.getCode()));
    }
}
