package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeTargetType;

public record CreateFeePolicyCommand(Long clubId, Long actorId, String name, Long amount, BillingType billingType,
                                     FeeTargetType targetType, Boolean autoIssue, Integer issueDay, Integer dueDay) {
}
