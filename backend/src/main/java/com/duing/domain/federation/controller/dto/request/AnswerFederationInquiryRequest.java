package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AnswerFederationInquiryRequest(
        @NotBlank(message = "답변 내용은 필수 입력값입니다.")
        @Size(max = 4000, message = "답변은 4000자 이하여야 합니다.")
        String content,
        Long version    // RECEIVED 직행 답변 시 필수(서비스 검증)
) {
    public AnswerFederationInquiryCommand toCommand(Long inquiryId, Long answeredBy) {
        return new AnswerFederationInquiryCommand(inquiryId, answeredBy, content, version);
    }
}
