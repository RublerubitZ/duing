package com.duing.domain.notification.event;

import java.time.LocalDate;

public record FeeBillsIssuedEvent(
        Long clubId,
        String clubName,
        Long feePolicyId,
        String billingPeriod,
        LocalDate billingStartDate,
        LocalDate dueDate
) {}
