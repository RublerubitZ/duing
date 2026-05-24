package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Set;

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
        String contactEmail,
        Integer activityFrequency,
        Set<DayOfWeek> activeDays,
        String membershipFee,
        String tagline,
        List<String> highlights,
        String majorProjects
) {
    public Club.UpdatePayload toPayload() {
        return new Club.UpdatePayload(
                name(),
                category(),
                division(),
                description(),
                logoUrl(),
                coverUrl(),
                tags(),
                snsLinks(),
                faqs(),
                foundedYear(),
                cohortNumber(),
                location(),
                contactEmail(),
                activityFrequency(),
                activeDays(),
                membershipFee(),
                tagline(),
                highlights(),
                majorProjects(),
                null,
                null
        );
    }
}
