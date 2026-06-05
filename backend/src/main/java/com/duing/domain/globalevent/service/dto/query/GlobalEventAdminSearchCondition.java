package com.duing.domain.globalevent.service.dto.query;

import com.duing.domain.globalevent.entity.GlobalEventCategory;

public record GlobalEventAdminSearchCondition(
        GlobalEventCategory category,
        String keyword
) {}
