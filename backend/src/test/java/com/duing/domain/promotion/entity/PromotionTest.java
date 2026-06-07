package com.duing.domain.promotion.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionTest {

    @Test
    @DisplayName("Promotion 생성 시 기본 active=false, displayOrder 가 그대로 저장된다")
    void createInitializesDefaults() {
        Promotion promotion = Promotion.create(
                42L, "행사 배너", "/files/banner.png", "https://example.com",
                false, 10, 99L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(10);
        assertThat(promotion.getCreatedBy()).isEqualTo(99L);
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.INK);
        assertThat(promotion.getStartAt()).isNull();
        assertThat(promotion.getEndAt()).isNull();
    }

    @Test
    @DisplayName("palette=null 로 생성하면 INK 로 폴백된다")
    void paletteNullFallsBackToInk() {
        Promotion promotion = Promotion.create(
                null, "T", null, null, true, 0, 1L,
                null, null, null, null, null,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.INK);
    }

    @Test
    @DisplayName("startAt/endAt 가 지정되어 생성되면 그대로 저장된다")
    void createWithSchedule() {
        LocalDateTime start = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime end = LocalDateTime.of(2026, 6, 10, 0, 0);
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 1L,
                null, null, null, null, PromotionPalette.INK,
                start, end,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        assertThat(promotion.getStartAt()).isEqualTo(start);
        assertThat(promotion.getEndAt()).isEqualTo(end);
    }

    @Test
    @DisplayName("update 호출 시 명시된 필드만 갱신되고 나머지는 유지된다")
    void partialUpdate() {
        Promotion promotion = Promotion.create(
                42L, "원래 제목", "/files/old.png", "https://old", true, 1, 99L,
                "TAG", "sub", "더보기", "🎉", PromotionPalette.SAGE,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);

        promotion.update(new Promotion.UpdatePayload(
                "새 제목", null, null, null, false, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null));

        assertThat(promotion.getTitle()).isEqualTo("새 제목");
        assertThat(promotion.getBannerImageUrl()).isEqualTo("/files/old.png");
        assertThat(promotion.getLinkUrl()).isEqualTo("https://old");
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(1);
        assertThat(promotion.getTag()).isEqualTo("TAG");
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.SAGE);
    }

    @Test
    @DisplayName("clearClubId=true 면 clubId 가 null 로 비워진다")
    void clearClubId() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, true,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getClubId()).isNull();
    }

    @Test
    @DisplayName("clubId=새 값 보다 clearClubId 가 우선 적용된다")
    void updateClubIdWithClearPrecedence() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, 7L, null, null, true,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getClubId()).isNull();
    }

    @Test
    @DisplayName("clearBannerImageUrl=true 면 이미지가 비워지고, 텍스트+팔레트만 남는다")
    void clearBannerImageUrl() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.WARM,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                true, null, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getBannerImageUrl()).isNull();
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.WARM);
    }

    @Test
    @DisplayName("clearLinkUrl=true 면 linkUrl 이 null 로 비워진다")
    void clearLinkUrl() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", "https://old.example.com", true, 0, 99L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, true, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getLinkUrl()).isNull();
    }

    @Test
    @DisplayName("clearLinkUrl=true 가 linkUrl=새 값 보다 우선 적용된다")
    void clearLinkUrlPrecedence() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", "https://old.example.com", true, 0, 99L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, "https://new.example.com", null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, true, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getLinkUrl()).isNull();
    }

    @Test
    @DisplayName("startAt/endAt 갱신은 명시된 값으로 덮어쓴다")
    void updateSchedule() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.INK,
                LocalDateTime.of(2026, 6, 1, 0, 0), LocalDateTime.of(2026, 6, 10, 0, 0),
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        LocalDateTime newStart = LocalDateTime.of(2026, 7, 1, 0, 0);
        LocalDateTime newEnd = LocalDateTime.of(2026, 7, 20, 0, 0);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                newStart, newEnd,
                null, null, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getStartAt()).isEqualTo(newStart);
        assertThat(promotion.getEndAt()).isEqualTo(newEnd);
    }

    @Test
    @DisplayName("clearStartAt=true / clearEndAt=true 면 기간이 비워져 상시 노출이 된다")
    void clearSchedule() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.INK,
                LocalDateTime.of(2026, 6, 1, 0, 0), LocalDateTime.of(2026, 6, 10, 0, 0),
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                true, true,
                null));
        assertThat(promotion.getStartAt()).isNull();
        assertThat(promotion.getEndAt()).isNull();
    }

    @Test
    @DisplayName("renderMode 가 명시되지 않은 create 는 SYSTEM_COMPOSED 로 폴백된다")
    void createDefaultsToSystemComposed() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 1L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                null, null);
        assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.SYSTEM_COMPOSED);
        assertThat(promotion.getImageAltText()).isNull();
    }

    @Test
    @DisplayName("FULL_BLEED_IMAGE + imageAltText 가 지정된 create 는 그대로 저장된다")
    void createWithFullBleed() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 1L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, "2026 해커톤 포스터");
        assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.FULL_BLEED_IMAGE);
        assertThat(promotion.getImageAltText()).isEqualTo("2026 해커톤 포스터");
    }

    @Test
    @DisplayName("update 에서 renderMode 가 null 이면 기존 모드를 유지한다 (partial-update 규칙)")
    void updateRenderModeNullIsNoChange() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 1L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, "alt");
        promotion.update(new Promotion.UpdatePayload(
                "새 제목", null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.FULL_BLEED_IMAGE);
        assertThat(promotion.getImageAltText()).isEqualTo("alt");
    }

    @Test
    @DisplayName("renderMode 만 토글하는 update 가 다른 필드를 건드리지 않는다 (모드 보존 가드)")
    void updateRenderModeToggleDoesNotClearOtherFields() {
        Promotion promotion = Promotion.create(
                null, "원래 제목", "/files/b.png", "https://x", true, 0, 1L,
                "TAG", "sub", "CTA", "🎉", PromotionPalette.WARM,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null));
        assertThat(promotion.getRenderMode()).isEqualTo(PromotionRenderMode.FULL_BLEED_IMAGE);
        assertThat(promotion.getTitle()).isEqualTo("원래 제목");
        assertThat(promotion.getTag()).isEqualTo("TAG");
        assertThat(promotion.getSubtitle()).isEqualTo("sub");
        assertThat(promotion.getCtaLabel()).isEqualTo("CTA");
        assertThat(promotion.getEmoji()).isEqualTo("🎉");
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.WARM);
        assertThat(promotion.getLinkUrl()).isEqualTo("https://x");
    }

    @Test
    @DisplayName("clearImageAltText=true 면 imageAltText 가 null 로 비워진다")
    void clearImageAltText() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 1L,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, "기존 alt");
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                true));
        assertThat(promotion.getImageAltText()).isNull();
    }
}
