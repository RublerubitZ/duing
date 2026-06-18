package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.BillingType;

public record CreateFeePolicyCommand(Long clubId, Long actorId, String name, Long amount, BillingType billingType,
                                     Boolean autoIssue, Integer issueDay, Integer dueDay) {
}
