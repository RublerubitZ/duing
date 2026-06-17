package com.duing.domain.fee.repository;

import java.time.LocalDate;

/**
 * 입금액과 잔액이 정확히 일치하는 미납 청구 후보 1건.
 * 매칭 결정 로직(BE-5b)이 자동/수동 매칭 대상을 고를 때 쓰는 읽기 전용 투영이다.
 */
public record MatchCandidate(
        Long feeBillId,
        Long userId,
        String memberName,
        String billingPeriod,
        LocalDate dueDate,
        long remaining
) {}
