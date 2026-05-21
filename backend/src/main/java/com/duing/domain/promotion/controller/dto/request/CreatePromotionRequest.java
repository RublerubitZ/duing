package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreatePromotionRequest(
        Long clubId,
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @NotBlank(message = "배너 이미지 URL은 필수입니다.")
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") int displayOrder
) {
    public CreatePromotionCommand toCommand(Long createdBy) {
        return new CreatePromotionCommand(
                clubId, title, bannerImageUrl, linkUrl, active, displayOrder, createdBy);
    }
}
