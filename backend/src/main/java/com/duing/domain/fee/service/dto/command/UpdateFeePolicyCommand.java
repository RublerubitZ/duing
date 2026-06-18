package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.BillingType;

public record UpdateFeePolicyCommand(Long clubId, Long actorId, Long policyId,
                                     String name, Long amount, BillingType billingType, Boolean active,
                                     Boolean autoIssue, Integer issueDay, Integer dueDay) {
}
