package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.SubmitFederationFaqFeedbackCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SubmitFederationFaqFeedbackRequest(
        @NotNull(message = "도움 여부는 필수 입력값입니다.")
        Boolean helpful,

        @Size(max = 64, message = "세션 키는 64자 이하여야 합니다.")
        String sessionKey
) {
    public SubmitFederationFaqFeedbackCommand toCommand(Long faqId, Long userId, String clientIp) {
        return new SubmitFederationFaqFeedbackCommand(faqId, helpful, sessionKey, userId, clientIp);
    }
}
