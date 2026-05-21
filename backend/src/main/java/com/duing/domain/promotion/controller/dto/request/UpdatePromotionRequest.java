package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.service.dto.command.UpdatePromotionCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record UpdatePromotionRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        Long clubId,
        Boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") Integer displayOrder,
        Boolean clearClubId
) {
    public UpdatePromotionCommand toCommand(Long promotionId) {
        return new UpdatePromotionCommand(
                promotionId, title, bannerImageUrl, linkUrl, clubId, active, displayOrder, clearClubId);
    }
}
