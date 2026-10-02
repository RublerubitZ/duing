package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubProject;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.entity.FeeCycle;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

/**
 * 리더(운영진) 프로필 수정 요청. 동아리명·카테고리·분과·단과대학은 총동연 전용(AdminUpdateClubRequest) —
 * 이 요청에는 필드 자체가 없어 API 로도 수정할 수 없다. null/미포함 필드는 변경되지 않는다.
 */
public record UpdateClubRequest(
        String description,

        // 허용 형태와 차단 이유는 ClubProfileValidationRules.LINK_OR_INTERNAL_PATH 참고.
        @Size(max = ClubProfileValidationRules.URL_MAX, message = "로고 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = ClubProfileValidationRules.LINK_OR_INTERNAL_PATH,
                message = ClubProfileValidationRules.LOGO_URL_MESSAGE)
        String logoUrl,

        @Size(max = ClubProfileValidationRules.URL_MAX, message = "커버 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = ClubProfileValidationRules.LINK_OR_INTERNAL_PATH,
                message = ClubProfileValidationRules.COVER_URL_MESSAGE)
        String coverUrl,

        @Size(max = ClubProfileValidationRules.TAGS_MAX, message = "태그는 최대 20개까지 가능합니다.")
        List<@NotNull(message = "태그는 비어 있을 수 없습니다.")
                @Size(min = ClubProfileValidationRules.TAG_LENGTH_MIN,
                        max = ClubProfileValidationRules.TAG_LENGTH_MAX,
                        message = "각 태그는 1~20자여야 합니다.") String> tags,

        @Size(max = ClubProfileValidationRules.SNS_LINKS_MAX, message = "SNS 링크는 최대 10개까지 가능합니다.")
        List<@NotNull(message = "SNS 링크는 비어 있을 수 없습니다.") @Valid ClubSnsLink> snsLinks,

        @Size(max = ClubProfileValidationRules.FAQS_MAX, message = "FAQ는 최대 20개까지 가능합니다.")
        List<@NotNull(message = "FAQ 항목은 비어 있을 수 없습니다.") @Valid ClubFaq> faqs,

        @Min(value = ClubProfileValidationRules.FOUNDED_YEAR_MIN, message = "창설년도는 1900 이상이어야 합니다.")
        @Max(value = ClubProfileValidationRules.FOUNDED_YEAR_MAX, message = "창설년도가 너무 큽니다.")
        Integer foundedYear,

        @Min(value = ClubProfileValidationRules.COHORT_NUMBER_MIN, message = "기수는 1 이상이어야 합니다.")
        Integer cohortNumber,

        @Size(max = ClubProfileValidationRules.LOCATION_MAX, message = "위치는 200자 이하여야 합니다.")
        String location,

        @Min(value = ClubProfileValidationRules.ACTIVITY_FREQUENCY_MIN, message = "활동 빈도는 1 이상이어야 합니다.")
        Integer activityFrequency,

        Set<DayOfWeek> activeDays,

        @Size(max = ClubProfileValidationRules.TAGLINE_MAX, message = "한줄 소개는 60자 이하여야 합니다.")
        String tagline,

        @Size(max = ClubProfileValidationRules.HIGHLIGHTS_MAX, message = "강조 항목은 최대 10개까지 가능합니다.")
        List<@NotNull(message = "강조 항목은 비어 있을 수 없습니다.")
                @Size(min = ClubProfileValidationRules.HIGHLIGHT_LENGTH_MIN,
                        max = ClubProfileValidationRules.HIGHLIGHT_LENGTH_MAX,
                        message = "각 강조 항목은 1~100자여야 합니다.") String> highlights,

        ContactVisibility contactVisibility,

        FeeCycle feeCycle,

        @Min(value = ClubProfileValidationRules.FEE_AMOUNT_MIN, message = "회비 금액은 1원 이상이어야 합니다.")
        @Max(value = ClubProfileValidationRules.FEE_AMOUNT_MAX, message = "회비 금액이 너무 큽니다.")
        Integer membershipFeeAmount,

        @Size(max = ClubProfileValidationRules.FEE_NOTE_MAX, message = "회비 안내는 150자 이하여야 합니다.")
        String feeNote,

        @Size(max = ClubProfileValidationRules.PROJECTS_MAX, message = "주요 프로젝트는 최대 6개까지 가능합니다.")
        List<@NotNull(message = "프로젝트 항목은 비어 있을 수 없습니다.") @Valid ClubProject> projects,

        Boolean clearLogoImage,

        Boolean clearCoverImage,

        // 회원 기수 표시 여부 (표시 제어 전용). null=미변경.
        Boolean useGeneration,

        // 단과대 동아리의 소속 학과. 잠금 필드가 아니라 운영진이 직접 최신으로 유지한다. "" 전송 = 비우기.
        @Size(max = ClubProfileValidationRules.DEPARTMENT_MAX, message = "학과는 50자 이하여야 합니다.")
        String department
) {
    @AssertTrue(message = "회비는 납부 주기와 금액을 함께 보내야 하며, 회비 없음(NONE)은 금액 없이 보내야 합니다.")
    public boolean isFeePairConsistent() {
        return ClubProfileValidationRules.isFeePairConsistent(feeCycle, membershipFeeAmount);
    }

    public UpdateClubCommand toCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(
                clubId, requesterId,
                null, null, null,                       // name, category, division — 총동연 전용
                description, logoUrl, coverUrl,
                tags, snsLinks, faqs,
                foundedYear, cohortNumber, location,
                activityFrequency, activeDays, tagline, highlights,
                contactVisibility, feeCycle, membershipFeeAmount, projects,
                null, null,                             // college, clearCollege — 총동연 전용
                clearLogoImage, clearCoverImage, useGeneration, feeNote, department
        );
    }
}
