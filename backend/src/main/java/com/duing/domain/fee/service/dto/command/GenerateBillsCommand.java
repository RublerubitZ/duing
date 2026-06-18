package com.duing.domain.fee.service.dto.command;

import java.time.LocalDate;
import java.util.List;

public record GenerateBillsCommand(
        Long clubId,
        Long actorId,
        Long policyId,
        String billingPeriod,        // MONTHLY/YEARLY 라벨 또는 ONE_TIME/SEMESTER 표시 라벨
        LocalDate billingStartDate,  // 명시형(SEMESTER/ONE_TIME)일 때 사용
        LocalDate billingEndDate,
        LocalDate dueDate,           // null 이면 타입별 자동 산출
        List<Long> memberIds         // SELECTED_MEMBERS 정책의 청구 대상(ALL_MEMBERS 면 null/빈 값)
) {
}
