package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.service.dto.query.FeeBillQuery;
import java.time.LocalDate;

public record MyFeeResponse(
        Long id,
        Long clubId,
        Long feePolicyId,
        Long amount,
        String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        FeeStatus status,
        // 표기 축 — 조회 시점 기준 파생. status 는 저장 원본(레코드 보존용).
        FeeStatus displayStatus,
        Long paidAmount,
        Long remainingAmount,
        // 청구가 raw FK 로만 들고 있는 동아리의 이름. 조회 불가(삭제된 동아리)면 폴백 문구가 채워져 항상 non-null.
        String clubName
) {
    public static MyFeeResponse from(FeeBillQuery query, String clubName) {
        return new MyFeeResponse(
                query.id(),
                query.clubId(),
                query.feePolicyId(),
                query.amount(),
                query.billingPeriod(),
                query.billingStartDate(),
                query.billingEndDate(),
                query.dueDate(),
                query.status(),
                query.displayStatus(),
                query.paidAmount(),
                query.remainingAmount(),
                clubName);
    }
}
