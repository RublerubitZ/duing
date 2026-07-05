package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateFederationInquiryAnswerRequest(
        @NotBlank(message = "답변 내용은 필수 입력값입니다.")
        @Size(max = 4000, message = "답변은 4000자 이하여야 합니다.")
        String content
) {
    public UpdateInquiryAnswerCommand toCommand(Long inquiryId) {
        return new UpdateInquiryAnswerCommand(inquiryId, content);
    }
}
