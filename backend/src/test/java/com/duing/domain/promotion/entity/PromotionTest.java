package com.duing.domain.promotion.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionTest {

    @Test
    @DisplayName("Promotion 생성 시 기본 active=false, displayOrder 가 그대로 저장된다")
    void createInitializesDefaults() {
        Promotion promotion = Promotion.create(
                42L, "행사 배너", "/files/banner.png", "https://example.com",
                false, 10, 99L,
                null, null, null, null, PromotionPalette.INK);
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(10);
        assertThat(promotion.getCreatedBy()).isEqualTo(99L);
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.INK);
    }

    @Test
    @DisplayName("palette=null 로 생성하면 INK 로 폴백된다")
    void paletteNullFallsBackToInk() {
        Promotion promotion = Promotion.create(
                null, "T", null, null, true, 0, 1L,
                null, null, null, null, null);
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.INK);
    }

    @Test
    @DisplayName("update 호출 시 명시된 필드만 갱신되고 나머지는 유지된다")
    void partialUpdate() {
        Promotion promotion = Promotion.create(
                42L, "원래 제목", "/files/old.png", "https://old", true, 1, 99L,
                "TAG", "sub", "더보기", "🎉", PromotionPalette.SAGE);

        promotion.update(new Promotion.UpdatePayload(
                "새 제목", null, null, null, false, null, null,
                null, null, null, null, null,
                null, null, null, null, null, null));

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
                null, null, null, null, PromotionPalette.INK);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, true,
                null, null, null, null, null,
                null, null, null, null, null, null));
        assertThat(promotion.getClubId()).isNull();
    }

    @Test
    @DisplayName("clubId=새 값 보다 clearClubId 가 우선 적용된다")
    void updateClubIdWithClearPrecedence() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.INK);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, 7L, null, null, true,
                null, null, null, null, null,
                null, null, null, null, null, null));
        assertThat(promotion.getClubId()).isNull();
    }

    @Test
    @DisplayName("clearBannerImageUrl=true 면 이미지가 비워지고, 텍스트+팔레트만 남는다")
    void clearBannerImageUrl() {
        Promotion promotion = Promotion.create(
                null, "T", "/files/b.png", null, true, 0, 99L,
                null, null, null, null, PromotionPalette.WARM);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                true, null, null, null, null, null));
        assertThat(promotion.getBannerImageUrl()).isNull();
        assertThat(promotion.getPalette()).isEqualTo(PromotionPalette.WARM);
    }

    @Test
    @DisplayName("clearLinkUrl=true 면 linkUrl 이 null 로 비워진다")
    void clearLinkUrl() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", "https://old.example.com", true, 0, 99L,
                null, null, null, null, PromotionPalette.INK);
        promotion.update(new Promotion.UpdatePayload(
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, true, null, null, null, null));
        assertThat(promotion.getLinkUrl()).isNull();
    }

    @Test
    @DisplayName("clearLinkUrl=true 가 linkUrl=새 값 보다 우선 적용된다")
    void clearLinkUrlPrecedence() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", "https://old.example.com", true, 0, 99L,
                null, null, null, null, PromotionPalette.INK);
        promotion.update(new Promotion.UpdatePayload(
                null, null, "https://new.example.com", null, null, null, null,
                null, null, null, null, null,
                null, true, null, null, null, null));
        assertThat(promotion.getLinkUrl()).isNull();
    }
}
