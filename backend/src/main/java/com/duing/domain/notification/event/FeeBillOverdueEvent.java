package com.duing.domain.notification.event;

public record FeeBillOverdueEvent(Long billId, Long userId, String billingPeriod) {}
