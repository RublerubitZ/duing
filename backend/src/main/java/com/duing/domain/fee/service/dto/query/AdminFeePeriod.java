package com.duing.domain.fee.service.dto.query;

import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 관리자 회비 감사 공통 기간(스펙 §7.0). from/to 는 KST 날짜이고 to 는 포함(당일 끝까지)이다.
 *
 * <p>존 이중 체제를 여기 한 곳에 가둔다 — created_at 은 JVM 존 벽시계(prod=UTC)라 벽시계 경계가 필요하고,
 * paid_at·transaction_at 은 정합 절대시각이라 KST 날짜 경계를 Instant 로 굳혀 비교한다.
 * created·paid 경계는 전부 exclusive upper(+1일 자정)로 통일한다.
 */
public record AdminFeePeriod(
        LocalDate dateFrom, LocalDate dateTo,
        LocalDateTime createdFrom, LocalDateTime createdTo,
        Instant paidFrom, Instant paidTo
) {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    public static AdminFeePeriod of(LocalDate from, LocalDate to) {
        return new AdminFeePeriod(
                from, to,
                from == null ? null : toSystemZone(from),
                to == null ? null : toSystemZone(to.plusDays(1)),
                from == null ? null : from.atStartOfDay(SEOUL).toInstant(),
                to == null ? null : to.plusDays(1).atStartOfDay(SEOUL).toInstant());
    }

    private static LocalDateTime toSystemZone(LocalDate kstDate) {
        return TimeMapper.seoulToSystemWallClock(kstDate.atStartOfDay());
    }
}
