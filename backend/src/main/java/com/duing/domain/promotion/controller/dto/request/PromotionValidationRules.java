package com.duing.domain.promotion.controller.dto.request;

import com.duing.domain.promotion.entity.PromotionRenderMode;
import java.time.LocalDateTime;

/**
 * 홍보 배너 입력 규칙. 생성({@link CreatePromotionRequest})·수정({@link UpdatePromotionRequest}) 요청이
 * 같은 필드를 받고 교차 필드 규칙 네 가지를 그대로 복제하고 있어, 규칙 본문과 길이 상한을 여기서 한 번만 정의한다.
 *
 * <p>필수 여부(@NotBlank/@NotNull)는 생성에만 있고 수정에는 없다 — 그 차이는 의도된 것이라 여기로 옮기지 않는다.
 */
public final class PromotionValidationRules {

    public static final int TITLE_MAX = 120;
    public static final int BANNER_IMAGE_URL_MAX = 500;
    public static final int LINK_URL_MAX = 2000;
    public static final int DISPLAY_ORDER_MIN = 0;
    public static final int TAG_MAX = 60;
    public static final int SUBTITLE_MAX = 200;
    public static final int CTA_LABEL_MAX = 40;
    public static final int EMOJI_MAX = 8;
    public static final int IMAGE_ALT_TEXT_MAX = 200;

    /** 노출 기간은 한쪽만 지정할 수 있고, 둘 다 있으면 시작이 종료보다 앞서야 한다. */
    public static boolean isScheduleRangeValid(LocalDateTime startAt, LocalDateTime endAt) {
        return startAt == null || endAt == null || startAt.isBefore(endAt);
    }

    /** 완성 이미지형 배너는 이미지가 곧 콘텐츠라 대체 텍스트가 없으면 스크린리더에 아무것도 남지 않는다. */
    public static boolean isImageAltTextRequiredForFullBleed(PromotionRenderMode renderMode, String imageAltText) {
        return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
                || (imageAltText != null && !imageAltText.isBlank());
    }

    /** 완성 이미지형 배너는 시스템 합성 요소가 없으므로 배너 이미지 없이는 렌더할 것이 없다. */
    public static boolean isBannerImageRequiredForFullBleed(PromotionRenderMode renderMode, String bannerImageUrl) {
        return renderMode != PromotionRenderMode.FULL_BLEED_IMAGE
                || (bannerImageUrl != null && !bannerImageUrl.isBlank());
    }

    /** 배너 클릭 대상은 외부 URL / 공지 / 동아리 중 최대 하나 — 셋 다 비우면 링크 없는 배너다. */
    public static boolean isSingleLinkTarget(String linkUrl, Long noticeId, Long clubId) {
        int targetCount = 0;
        if (linkUrl != null && !linkUrl.isBlank()) targetCount++;
        if (noticeId != null) targetCount++;
        if (clubId != null) targetCount++;
        return targetCount <= 1;
    }

    private PromotionValidationRules() {
        // 상수·검증 규칙 모음 클래스 — 인스턴스화 금지
    }
}
