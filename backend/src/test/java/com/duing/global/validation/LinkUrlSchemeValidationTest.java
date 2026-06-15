package com.duing.global.validation;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.controller.dto.request.CreateClubRequest;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.notice.controller.dto.request.CreateNoticeRequest;
import com.duing.domain.notice.controller.dto.request.UpdateNoticeRequest;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.entity.PromotionPalette;
import com.duing.domain.promotion.entity.PromotionRenderMode;
import com.duing.domain.recruitment.controller.dto.request.CreateRecruitmentRequest;
import com.duing.domain.recruitment.entity.ApplicationMode;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.time.LocalDate;
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

    @Test
    @DisplayName("CreateRecruitmentRequest: externalFormUrl 의 javascript: 스킴은 거부, http(s)/빈값/null 은 허용된다")
    void recruitmentExternalFormUrlScheme() {
        assertThat(hasViolationOn(validator.validate(recruitmentCreate(JAVASCRIPT_URL)), "externalFormUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(recruitmentCreate("https://forms.gle/abc")), "externalFormUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(recruitmentCreate("")), "externalFormUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(recruitmentCreate(null)), "externalFormUrl")).isFalse();
    }

    @Test
    @DisplayName("CreateClubRequest: logoUrl 은 javascript:/data://-/\\ 를 거부하고 http(s)/내부경로(/files)/빈값/null 은 허용한다")
    void clubCreateLogoUrlScheme() {
        assertThat(hasViolationOn(validator.validate(clubCreate(JAVASCRIPT_URL)), "logoUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(clubCreate("data:text/html,<script>")), "logoUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(clubCreate("//evil.com/x.png")), "logoUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(clubCreate("/\\evil.com/x.png")), "logoUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(clubCreate("https://files.duings.com/logo.png")), "logoUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(clubCreate("/files/club/logo.png")), "logoUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(clubCreate("")), "logoUrl")).isFalse();
        assertThat(hasViolationOn(validator.validate(clubCreate(null)), "logoUrl")).isFalse();
    }

    @Test
    @DisplayName("링크 스킴 검증은 data:/vbscript:/ftp: 등 비-http 스킴도 거부한다")
    void rejectsOtherDangerousSchemes() {
        assertThat(hasViolationOn(validator.validate(noticeCreate("data:text/html,<script>alert(1)</script>")), "linkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(noticeCreate("vbscript:msgbox(1)")), "linkUrl")).isTrue();
        assertThat(hasViolationOn(validator.validate(promotionRequest("ftp://example.com/file")), "suggestedLinkUrl")).isTrue();
    }

    private static <T> boolean hasViolationOn(Set<ConstraintViolation<T>> violations, String field) {
        return violations.stream().anyMatch(violation -> violation.getPropertyPath().toString().equals(field));
    }

    private static CreateClubRequest clubCreate(String logoUrl) {
        return new CreateClubRequest("동아리", ClubCategory.OTHER, "분과", "설명", logoUrl, 1L, false, null);
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

    private static CreateRecruitmentRequest recruitmentCreate(String externalFormUrl) {
        return new CreateRecruitmentRequest(
                "제목", null, LocalDate.of(2026, 1, 1), null, 1,
                ApplicationMode.EXTERNAL, externalFormUrl,
                null, null, null, null, null, null);
    }
}
