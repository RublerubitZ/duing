package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;

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
        List<@Valid ClubFaq> faqs
) {
    public UpdateClubCommand toCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(
                clubId, requesterId,
                name, category, division, description,
                logoUrl, coverUrl, tags, snsLinks, faqs
        );
    }
}