package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreatePromotionRequest(
        Long clubId,
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 500, message = "배너 이미지 URL은 500자 이하여야 합니다.") String bannerImageUrl,
        @Size(max = 2000, message = "링크는 2000자 이하여야 합니다.") String linkUrl,
        boolean active,
        @Min(value = 0, message = "정렬 순서는 0 이상이어야 합니다.") int displayOrder,
        @Size(max = 60, message = "태그는 60자 이하여야 합니다.") String tag,
        @Size(max = 200, message = "부제는 200자 이하여야 합니다.") String subtitle,
        @Size(max = 40, message = "CTA 라벨은 40자 이하여야 합니다.") String ctaLabel,
        @Size(max = 8, message = "이모지는 8자 이하여야 합니다.") String emoji,
        @NotNull(message = "팔레트는 필수입니다.") PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        @Size(max = 200, message = "이미지 대체 텍스트는 200자 이하여야 합니다.") String imageAltText
) {
    @AssertTrue(message = "노출 종료 시각은 시작 시각 이후여야 합니다.")
    public boolean isScheduleRangeValid() {
        return startAt == null || endAt == null || startAt.isBefore(endAt);
    }

    public CreatePromotionCommand toCommand(Long createdBy) {
        return new CreatePromotionCommand(
                clubId, title, bannerImageUrl, linkUrl, active, displayOrder, createdBy,
                tag, subtitle, ctaLabel, emoji, palette, startAt, endAt,
                renderMode, imageAltText);
    }
}
