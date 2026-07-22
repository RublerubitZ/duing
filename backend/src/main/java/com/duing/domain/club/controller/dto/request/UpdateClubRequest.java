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

        // http(s) 절대 URL 또는 `/files/...` 내부 경로만 허용 — javascript:/data: 스킴과 // 차단(저장형 XSS 방어).
        @Size(max = 500, message = "로고 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = "^$|^https?://.+$|^/[^/\\\\].*$",
                message = "로고 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.")
        String logoUrl,

        @Size(max = 500, message = "커버 URL은 500자 이하여야 합니다.")
        @Pattern(regexp = "^$|^https?://.+$|^/[^/\\\\].*$",
                message = "커버 URL은 http:// 또는 https:// 로 시작하거나 / 로 시작하는 내부 경로여야 합니다.")
        String coverUrl,

        @Size(max = 20, message = "태그는 최대 20개까지 가능합니다.")
        List<@NotNull(message = "태그는 비어 있을 수 없습니다.")
                @Size(min = 1, max = 20, message = "각 태그는 1~20자여야 합니다.") String> tags,

        @Size(max = 10, message = "SNS 링크는 최대 10개까지 가능합니다.")
        List<@NotNull(message = "SNS 링크는 비어 있을 수 없습니다.") @Valid ClubSnsLink> snsLinks,

        @Size(max = 20, message = "FAQ는 최대 20개까지 가능합니다.")
        List<@NotNull(message = "FAQ 항목은 비어 있을 수 없습니다.") @Valid ClubFaq> faqs,

        @Min(value = 1900, message = "창설년도는 1900 이상이어야 합니다.")
        @Max(value = 2100, message = "창설년도가 너무 큽니다.")
        Integer foundedYear,

        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer cohortNumber,

        @Size(max = 200, message = "위치는 200자 이하여야 합니다.")
        String location,

        @Min(value = 1, message = "활동 빈도는 1 이상이어야 합니다.")
        Integer activityFrequency,

        Set<DayOfWeek> activeDays,

        @Size(max = 60, message = "한줄 소개는 60자 이하여야 합니다.")
        String tagline,

        @Size(max = 10, message = "강조 항목은 최대 10개까지 가능합니다.")
        List<@NotNull(message = "강조 항목은 비어 있을 수 없습니다.")
                @Size(min = 1, max = 100, message = "각 강조 항목은 1~100자여야 합니다.") String> highlights,

        ContactVisibility contactVisibility,

        FeeCycle feeCycle,

        @Min(value = 1, message = "회비 금액은 1원 이상이어야 합니다.")
        @Max(value = 10_000_000, message = "회비 금액이 너무 큽니다.")
        Integer membershipFeeAmount,

        @Size(max = 6, message = "주요 프로젝트는 최대 6개까지 가능합니다.")
        List<@NotNull(message = "프로젝트 항목은 비어 있을 수 없습니다.") @Valid ClubProject> projects,

        Boolean clearLogoImage,

        Boolean clearCoverImage
) {
    /** 회비는 주기+금액 쌍 전송 규약 (§4.3) — 주기 없이 금액만, NONE+금액, 유료 주기+금액 누락 전부 거부. */
    @AssertTrue(message = "회비는 납부 주기와 금액을 함께 보내야 하며, 회비 없음(NONE)은 금액 없이 보내야 합니다.")
    public boolean isFeePairConsistent() {
        if (feeCycle == null) return membershipFeeAmount == null;
        if (feeCycle == FeeCycle.NONE) return membershipFeeAmount == null;
        return membershipFeeAmount != null;
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
                clearLogoImage, clearCoverImage
        );
    }
}
