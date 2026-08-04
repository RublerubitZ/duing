package com.duing.domain.fee.service.dto.query;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 관리자 회비 감사 공통 기간(스펙 §7.0). from/to 는 KST 날짜이고 to 는 포함(당일 끝까지)이다.
 *
 * <p>존 이중 체제를 여기 한 곳에 가둔다 — created_at 은 JVM 존 벽시계(prod=UTC),
 * paid_at·transaction_at 은 KST 벽시계라 같은 날짜 범위라도 비교 경계가 다르다.
 * created·paid 경계는 전부 exclusive upper(+1일 자정)로 통일한다.
 */
public record AdminFeePeriod(
        LocalDate dateFrom, LocalDate dateTo,
        LocalDateTime createdFrom, LocalDateTime createdTo,
        LocalDateTime paidFrom, LocalDateTime paidTo
) {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    public static AdminFeePeriod of(LocalDate from, LocalDate to) {
        return new AdminFeePeriod(
                from, to,
                from == null ? null : toSystemZone(from),
                to == null ? null : toSystemZone(to.plusDays(1)),
                from == null ? null : from.atStartOfDay(),
                to == null ? null : to.plusDays(1).atStartOfDay());
    }

    private static LocalDateTime toSystemZone(LocalDate kstDate) {
        return kstDate.atStartOfDay(SEOUL).withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
    }
}
