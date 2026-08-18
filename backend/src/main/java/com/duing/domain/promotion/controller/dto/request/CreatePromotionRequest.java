package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.promotion.service.dto.command.CreatePromotionCommand;
import com.duing.global.constant.LinkUrlPatterns;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreatePromotionRequest(
        Long clubId,
        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = PromotionValidationRules.TITLE_MAX, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = PromotionValidationRules.BANNER_IMAGE_URL_MAX, message = "배너 이미지 URL은 500자 이하여야 합니다.")
        String bannerImageUrl,
        @Size(max = PromotionValidationRules.LINK_URL_MAX, message = "링크는 2000자 이하여야 합니다.")
        @Pattern(regexp = LinkUrlPatterns.HTTP_LINK_OR_EMPTY, message = LinkUrlPatterns.HTTP_LINK_MESSAGE) String linkUrl,
        boolean active,
        @Min(value = PromotionValidationRules.DISPLAY_ORDER_MIN, message = "정렬 순서는 0 이상이어야 합니다.")
        int displayOrder,
        @Size(max = PromotionValidationRules.TAG_MAX, message = "태그는 60자 이하여야 합니다.") String tag,
        @Size(max = PromotionValidationRules.SUBTITLE_MAX, message = "부제는 200자 이하여야 합니다.") String subtitle,
        @Size(max = PromotionValidationRules.CTA_LABEL_MAX, message = "CTA 라벨은 40자 이하여야 합니다.") String ctaLabel,
        @Size(max = PromotionValidationRules.EMOJI_MAX, message = "이모지는 8자 이하여야 합니다.") String emoji,
        @NotNull(message = "팔레트는 필수입니다.") PromotionPalette palette,
        LocalDateTime startAt,
        LocalDateTime endAt,
        PromotionRenderMode renderMode,
        @Size(max = PromotionValidationRules.IMAGE_ALT_TEXT_MAX, message = "Alt Text는 200자 이하여야 합니다.")
        String imageAltText,
        Long noticeId
) {
    @AssertTrue(message = "노출 종료 시각은 시작 시각 이후여야 합니다.")
    public boolean isScheduleRangeValid() {
        return PromotionValidationRules.isScheduleRangeValid(startAt, endAt);
    }

    @AssertTrue(message = "완성 이미지형 배너는 Alt Text가 필수입니다.")
    public boolean isImageAltTextRequiredForFullBleed() {
        return PromotionValidationRules.isImageAltTextRequiredForFullBleed(renderMode, imageAltText);
    }

    @AssertTrue(message = "완성 이미지형 배너는 배너 이미지가 필수입니다.")
    public boolean isBannerImageRequiredForFullBleed() {
        return PromotionValidationRules.isBannerImageRequiredForFullBleed(renderMode, bannerImageUrl);
    }

    @AssertTrue(message = "링크 대상은 외부 URL / 공지 / 동아리 중 하나만 선택 가능합니다.")
    public boolean isSingleLinkTarget() {
        return PromotionValidationRules.isSingleLinkTarget(linkUrl, noticeId, clubId);
    }

    public CreatePromotionCommand toCommand(Long createdBy) {
        return new CreatePromotionCommand(
                clubId, title, bannerImageUrl, linkUrl, active, displayOrder, createdBy,
                tag, subtitle, ctaLabel, emoji, palette, startAt, endAt,
                renderMode, imageAltText, noticeId);
    }
}
