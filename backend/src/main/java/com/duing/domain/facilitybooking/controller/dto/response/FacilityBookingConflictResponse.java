package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.exception.FacilityBookingException.SchoolConflictException;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 승인·확정 충돌(409) 응답 data(§8.3) — 겹치는 학교 점유행 목록과 판단 기준 크롤 수집 시각.
 * conflicts 항목은 source("SCHOOL" 고정)·단체명·시작/끝(HH:mm)으로, crawlBasisAt 은 절대시각(Instant, …Z)이다.
 * crawlBasisAt 은 스냅샷이 없으면 null 이라 Map.of 로 담을 수 없어 전용 record 로 싣는다.
 */
public record FacilityBookingConflictResponse(List<ConflictSlot> conflicts, Instant crawlBasisAt) {

    /** §8.3 conflicts[] — 학교 점유행 1건. source 는 "SCHOOL" 고정, 시간은 HH:mm 문자열. */
    public record ConflictSlot(String source, String organization, String start, String end) {}

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    public static FacilityBookingConflictResponse from(SchoolConflictException exception) {
        List<ConflictSlot> conflicts = exception.getConflicts().stream()
                .map(item -> new ConflictSlot("SCHOOL", item.organization(),
                        item.startTime().format(HH_MM), item.endTime().format(HH_MM)))
                .toList();
        // crawl_basis_at 은 seoulClock 기준 KST wall-clock LocalDateTime 저장값.
        return new FacilityBookingConflictResponse(conflicts,
                TimeMapper.seoulWallClockToInstant(exception.getCrawlBasisAt()));
    }
}
