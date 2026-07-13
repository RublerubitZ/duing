package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.exception.FacilityBookingException.SchoolConflictException;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * 승인·확정 충돌(409) 응답 data(§8.3) — 겹치는 학교 점유행 목록과 판단 기준 크롤 수집 시각.
 * crawlBasisAt 은 스냅샷이 없으면 null 이라 Map.of 로 담을 수 없어 전용 record 로 싣는다.
 */
public record FacilityBookingConflictResponse(List<ConflictSlot> conflicts, LocalDateTime crawlBasisAt) {

    public record ConflictSlot(String organization, LocalTime startTime, LocalTime endTime) {}

    public static FacilityBookingConflictResponse from(SchoolConflictException exception) {
        List<ConflictSlot> conflicts = exception.getConflicts().stream()
                .map(item -> new ConflictSlot(item.organization(), item.startTime(), item.endTime()))
                .toList();
        return new FacilityBookingConflictResponse(conflicts, exception.getCrawlBasisAt());
    }
}
