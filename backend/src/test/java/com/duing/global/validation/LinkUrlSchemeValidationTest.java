package com.duing.global.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
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

/**
 * 공지/홍보 도메인의 사용자·운영진 입력 링크 필드(linkUrl/suggestedLinkUrl)가
 * http(s) 스킴만 허용하는지 검증한다. javascript: 등 스크립트 실행이 가능한 값이
 * 그대로 저장되면 렌더 시점에 저장형 XSS 가 되므로, DTO 단계에서 차단되어야 한다.
 */
class LinkUrlSchemeValidationTest {

    private static final String JAVASCRIPT_URL = "javascript:alert(document.cookie)";

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
    @DisplayName("CreateNoticeRequest: linkUrl 의 javascript: 스킴은 거부, http(s)/빈값/null 은 허용된다")
    void noticeCreateLinkUrlScheme() {
        assertThat(hasViolationOn(validator.validate(noticeCreate(JAVASCRIPT_URL)), "linkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(noticeCreate("https://duings.com")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(noticeCreate("")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(noticeCreate(null)), "linkUrl")).isFalse();
    }

    @Test
    @DisplayName("UpdateNoticeRequest: linkUrl 의 javascript: 스킴은 거부, http(s)/빈값/null 은 허용된다")
    void noticeUpdateLinkUrlScheme() {
        assertThat(hasViolationOn(validator.validate(noticeUpdate(JAVASCRIPT_URL)), "linkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(noticeUpdate("http://example.com/path?q=1")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(noticeUpdate("")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(noticeUpdate(null)), "linkUrl")).isFalse();
    }

    @Test
    @DisplayName("CreatePromotionRequest: linkUrl 의 javascript: 스킴은 거부, http(s)/빈값/null 은 허용된다")
    void promotionCreateLinkUrlScheme() {
        assertThat(hasViolationOn(validator.validate(promotionCreate(JAVASCRIPT_URL)), "linkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(promotionCreate("https://duings.com")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(promotionCreate("")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(promotionCreate(null)), "linkUrl")).isFalse();
    }

    @Test
    @DisplayName("UpdatePromotionRequest: linkUrl 의 javascript: 스킴은 거부, http(s)/빈값/null 은 허용된다")
    void promotionUpdateLinkUrlScheme() {
        assertThat(hasViolationOn(validator.validate(promotionUpdate(JAVASCRIPT_URL)), "linkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(promotionUpdate("https://duings.com")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(promotionUpdate("")), "linkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(promotionUpdate(null)), "linkUrl")).isFalse();
    }

    @Test
    @DisplayName("CreatePromotionRequestRequest: suggestedLinkUrl 의 javascript: 스킴은 거부된다 (운영진 → 관리자 저장형 XSS 차단)")
    void promotionRequestSuggestedLinkUrlScheme() {
        assertThat(hasViolationOn(validator.validate(promotionRequest(JAVASCRIPT_URL)), "suggestedLinkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(promotionRequest("https://duings.com")), "suggestedLinkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(promotionRequest("")), "suggestedLinkUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(promotionRequest(null)), "suggestedLinkUrl")).isFalse();
    }

    private static <T> boolean hasViolationOn(Set<ConstraintViolation<T>> violations, String field) {
        return violations.stream().anyMatch(violation -> violation.getPropertyPath().toString().equals(field));
    }

    private static CreateNoticeRequest noticeCreate(String linkUrl) {
        return new CreateNoticeRequest(
                "제목", "요약", "<p>본문</p>", "https://files.duings.com/cover.png", linkUrl,
                null, null, null, null, null,
                false, null, false, null, null, null, null, null, null);
    }

    private static UpdateNoticeRequest noticeUpdate(String linkUrl) {
        return new UpdateNoticeRequest(
                null, null, null, null, linkUrl,
                null, null, null, null, null,
                null, null, null, null, null,
                null, null, null, null, null, null);
    }

    private static CreatePromotionRequest promotionCreate(String linkUrl) {
        return new CreatePromotionRequest(
                null, "제목", null, linkUrl, true, 0,
                null, null, null, null, PromotionPalette.INK,
                null, null, PromotionRenderMode.SYSTEM_COMPOSED, null, null);
    }

    private static UpdatePromotionRequest promotionUpdate(String linkUrl) {
        return new UpdatePromotionRequest(
                null, null, linkUrl, null, null, null, null,
                null, null, null, null, PromotionPalette.INK,
                PromotionRenderMode.SYSTEM_COMPOSED, null,
                null, null,
                null, null, null, null, null, null,
                null, null, null,
                null, null);
    }

    private static CreatePromotionRequestRequest promotionRequest(String suggestedLinkUrl) {
        return new CreatePromotionRequestRequest("제목", "설명입니다", null, suggestedLinkUrl);
    }
}
