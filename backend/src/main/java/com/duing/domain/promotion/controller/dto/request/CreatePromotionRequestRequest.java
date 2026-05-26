package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.service.dto.command.CreatePromotionRequestCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePromotionRequestRequest(
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 80, message = "제목은 80자 이하여야 합니다.") String title,
        @NotBlank(message = "설명은 필수입니다.")
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String suggestedBannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String suggestedLinkUrl
) {
    public CreatePromotionRequestCommand toCommand(Long clubId, Long requesterUserId) {
        return new CreatePromotionRequestCommand(
                clubId, requesterUserId, title, description, suggestedBannerImageUrl, suggestedLinkUrl);
    }
}
