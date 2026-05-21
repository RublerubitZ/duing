package com.duing.domain.promotion.service.dto.command;

import com.duing.domain.promotion.entity.PromotionRequestStatus;

public record ProcessPromotionRequestCommand(
        Long requestId,
        Long handlerAdminId,
        PromotionRequestStatus status,
        String actionNote
) {}
