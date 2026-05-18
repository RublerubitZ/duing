package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

public record UpdateClubRequest(
        @Size(min = 1, max = 100, message = "동아리 이름은 1~100자여야 합니다.")
        String name,

        ClubCategory category,

        @Size(max = 50, message = "분류는 50자 이하여야 합니다.")
        String division,

        String description,

        @Size(max = 500, message = "로고 URL은 500자 이하여야 합니다.")
        String logoUrl,

        @Size(max = 500, message = "커버 URL은 500자 이하여야 합니다.")
        String coverUrl,

        @Size(max = 20, message = "태그는 최대 20개까지 가능합니다.")
        List<@Size(min = 1, max = 20, message = "각 태그는 1~20자여야 합니다.") String> tags,

        @Size(max = 10, message = "SNS 링크는 최대 10개까지 가능합니다.")
        List<@Valid ClubSnsLink> snsLinks,

        @Size(max = 20, message = "FAQ는 최대 20개까지 가능합니다.")
        List<@Valid ClubFaq> faqs,

        @Min(value = 1900, message = "창설년도는 1900 이상이어야 합니다.")
        @Max(value = 2100, message = "창설년도가 너무 큽니다.")
        Integer foundedYear,

        @Min(value = 1, message = "기수는 1 이상이어야 합니다.")
        Integer cohortNumber,

        @Size(max = 200, message = "위치는 200자 이하여야 합니다.")
        String location,

        @Email(message = "이메일 형식이 올바르지 않습니다.")
        @Size(max = 200, message = "이메일은 200자 이하여야 합니다.")
        String contactEmail,

        @Min(value = 1, message = "활동 빈도는 1 이상이어야 합니다.")
        Integer activityFrequency,

        Set<DayOfWeek> activeDays,

        @Size(max = 100, message = "회비 표기는 100자 이하여야 합니다.")
        String membershipFee
) {
    public UpdateClubCommand toCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(
                clubId, requesterId,
                name, category, division, description,
                logoUrl, coverUrl, tags, snsLinks, faqs,
                foundedYear, cohortNumber, location, contactEmail,
                activityFrequency, activeDays, membershipFee
        );
    }
}
