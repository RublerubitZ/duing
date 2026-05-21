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
                false, 10, 99L);
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(10);
        assertThat(promotion.getCreatedBy()).isEqualTo(99L);
    }

    @Test
    @DisplayName("update 호출 시 명시된 필드만 갱신되고 나머지는 유지된다")
    void partialUpdate() {
        Promotion promotion = Promotion.create(
                42L, "원래 제목", "/files/old.png", "https://old", true, 1, 99L);

        promotion.update(new Promotion.UpdatePayload(
                "새 제목", null, null, null, false, null, null));

        assertThat(promotion.getTitle()).isEqualTo("새 제목");
        assertThat(promotion.getBannerImageUrl()).isEqualTo("/files/old.png");
        assertThat(promotion.getLinkUrl()).isEqualTo("https://old");
        assertThat(promotion.isActive()).isFalse();
        assertThat(promotion.getDisplayOrder()).isEqualTo(1);
    }

    @Test
    @DisplayName("clearClubId=true 면 clubId 가 null 로 비워진다")
    void clearClubId() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L);
        promotion.update(new Promotion.UpdatePayload(null, null, null, null, null, null, true));
        assertThat(promotion.getClubId()).isNull();
    }

    @Test
    @DisplayName("clubId=새 값 으로 갱신되며 clearClubId 가 우선이다")
    void updateClubIdWithClearPrecedence() {
        Promotion promotion = Promotion.create(
                42L, "T", "/files/b.png", null, true, 0, 99L);
        promotion.update(new Promotion.UpdatePayload(null, null, null, 7L, null, null, true));
        assertThat(promotion.getClubId()).isNull();
    }
}
