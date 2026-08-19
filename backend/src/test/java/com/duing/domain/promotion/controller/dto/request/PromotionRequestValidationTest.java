package com.duing.domain.promotion.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.time.LocalDateTime;
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
                PromotionRenderMode.FULL_BLEED_IMAGE, null,
                null);
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
                PromotionRenderMode.FULL_BLEED_IMAGE, "alt",
                null);
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
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                null);
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
                null, null, null,
                null, null);
        Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("Alt Text"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: FULL_BLEED_IMAGE + 이미지 + alt 모두 있으면 통과")
    void createFullBleedWithAllFieldsPassesValidation() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", "/files/b.png", null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.FULL_BLEED_IMAGE, "대형 배너",
                null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("UpdatePromotionRequest: FULL_BLEED_IMAGE 인데 bannerImageUrl 이 비어 있으면 검증 실패")
    void updateFullBleedRequiresBannerImage() {
        UpdatePromotionRequest request = new UpdatePromotionRequest(
                null, null, null, null, null, null, null,
                null, null, null, null, PromotionPalette.INK,
                PromotionRenderMode.FULL_BLEED_IMAGE, "alt",
                null, null,
                null, null, null, null, null, null,
                null, null, null,
                null, null);
        Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("배너 이미지가 필수"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: linkUrl + noticeId 동시 set 이면 검증 실패")
    void createRejectsTwoLinks() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", null, "https://example.com", true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                42L);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("하나만 선택"));
    }

    @Test
    @DisplayName("CreatePromotionRequest: noticeId 만 set 이면 통과")
    void createAllowsNoticeOnly() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", "/files/b.png", null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                42L);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("CreatePromotionRequest: 세 link 모두 null 이면 통과 (연결 안 함)")
    void createAllowsNoLinks() {
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", "/files/b.png", null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("CreatePromotionRequest: 노출 시작 시각이 종료 시각과 같거나 뒤면 검증 실패")
    void createRejectsNonIncreasingSchedule() {
        LocalDateTime sameMoment = LocalDateTime.now();
        CreatePromotionRequest request = new CreatePromotionRequest(
                null, "T", "/files/b.png", null, true, 0,
                null, null, null, null, PromotionPalette.INK,
                sameMoment, sameMoment,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                null);
        Set<ConstraintViolation<CreatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("시작 시각 이후"));
    }

    @Test
    @DisplayName("UpdatePromotionRequest: 노출 시작 시각이 종료 시각보다 뒤면 검증 실패")
    void updateRejectsReversedSchedule() {
        LocalDateTime endMoment = LocalDateTime.now();
        UpdatePromotionRequest request = new UpdatePromotionRequest(
                null, null, null, null, null, null, null,
                null, null, null, null, PromotionPalette.INK,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                endMoment.plusDays(1), endMoment,
                null, null, null, null, null, null,
                null, null, null,
                null, null);
        Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("시작 시각 이후"));
    }

    @Test
    @DisplayName("UpdatePromotionRequest: linkUrl + clubId + noticeId 셋 다 set 이면 검증 실패")
    void updateRejectsAllThreeLinks() {
        UpdatePromotionRequest request = new UpdatePromotionRequest(
                null, null, "https://x.com", 7L, null, null, null,
                null, null, null, null, PromotionPalette.INK,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                null, null,
                null, null, null, null, null, null,
                null, null,
                null,
                42L,
                null);
        Set<ConstraintViolation<UpdatePromotionRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(v -> v.getMessage().contains("하나만 선택"));
    }
}
