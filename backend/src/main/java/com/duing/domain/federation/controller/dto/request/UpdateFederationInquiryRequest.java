package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateFederationInquiryRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
        String title,
        @NotBlank(message = "내용은 필수 입력값입니다.")
        @Size(max = 2000, message = "내용은 2000자 이하여야 합니다.")
        String content
) {
    public UpdateFederationInquiryCommand toCommand(Long inquiryId, Long authorId) {
        return new UpdateFederationInquiryCommand(inquiryId, authorId, title, content);
    }
}
