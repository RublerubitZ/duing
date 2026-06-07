package com.duing.domain.promotion.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PromotionRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    @Test
    @DisplayName("CreatePromotionRequest: FULL_BLEED_IMAGE 인데 imageAltText 가 비어 있으면 검증 실패")
    void createFullBleedRequiresAltText() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", "/files/b.png", null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("Alt Text"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: FULL_BLEED_IMAGE 인데 bannerImageUrl 이 비어 있으면 검증 실패")
    void createFullBleedRequiresBannerImage() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", null, null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, "alt");
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("배너 이미지가 필수"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: SYSTEM_COMPOSED 는 alt / 이미지 누락이어도 통과")
    void createSystemComposedAllowsMissingAltAndImage() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", null, null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("UpdatePromotionRequest: FULL_BLEED_IMAGE + alt 공백이면 검증 실패")
    void updateFullBleedRequiresAltText() {
        UpdatePromotionRequest request = new UpdatePromotionRequest(
                null, null, null, null, null, null, null,
                null, null, null, null, PromotionPalette.INK,
                PromotionRenderMode.FULL_BLEED_IMAGE, "   ",
                null, null,
                null, null, null, null, null, null,
                null, null, null);
        Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("Alt Text"));
    }
}
