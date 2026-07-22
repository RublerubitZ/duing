package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubProject;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.entity.FeeCycle;
import com.duing.domain.user.entity.College;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

/** 리더/어드민 공용 수정 커맨드. 리더 요청은 잠금 필드(name/category/division/college)에 항상 null 을 넣는다. */
public record UpdateClubCommand(
        Long clubId,
        Long requesterId,
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs,
        Integer foundedYear,
        Integer cohortNumber,
        String location,
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        String tagline,
        List<String> highlights,
        ContactVisibility contactVisibility,
        FeeCycle feeCycle,
        Integer membershipFeeAmount,
        List<ClubProject> projects,
        College college,
        Boolean clearCollege,
        Boolean clearLogoImage,
        Boolean clearCoverImage
) {
    public Club.UpdatePayload toPayload() {
        return new Club.UpdatePayload(
                name(), category(), division(), description(), logoUrl(), coverUrl(),
                tags(), snsLinks(), faqs(), foundedYear(), cohortNumber(), location(),
                activityFrequency(), activeDays(), tagline(), highlights(),
                contactVisibility(), feeCycle(), membershipFeeAmount(), projects(),
                college(), clearCollege(), clearLogoImage(), clearCoverImage()
        );
    }
}
