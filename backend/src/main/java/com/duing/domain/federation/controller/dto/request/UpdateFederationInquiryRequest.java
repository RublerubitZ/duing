package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public record UpdateFederationInquiryRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
        String title,
        @NotBlank(message = "내용은 필수 입력값입니다.")
        @Size(max = 2000, message = "내용은 2000자 이하여야 합니다.")
        String content,
        // clear-intent 규약: null=기존 첨부 유지, []=전체 삭제, 배열=전체 교체.
        @Size(max = 5, message = "첨부는 최대 5개까지 등록할 수 있습니다.")
        List<String> attachmentUrls
) {
    public UpdateFederationInquiryCommand toCommand(Long inquiryId, Long authorId) {
        return new UpdateFederationInquiryCommand(inquiryId, authorId, title, content, attachmentUrls);
    }
}
