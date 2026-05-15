package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import java.util.List;

public record ClubDetailResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        String coverUrl,
        List<String> tags,
        List<ClubSnsLink> snsLinks,
        List<ClubFaq> faqs,
        Long leaderId,
        String leaderName,
        ClubStatus status,
        List<ClubPhotoQuery> photos
) {
    public static ClubDetailResponse from(ClubDetailQuery detailQuery) {
        return new ClubDetailResponse(
                detailQuery.id(),
                detailQuery.name(),
                detailQuery.category(),
                detailQuery.division(),
                detailQuery.description(),
                detailQuery.logoUrl(),
                detailQuery.coverUrl(),
                detailQuery.tags(),
                detailQuery.snsLinks(),
                detailQuery.faqs(),
                detailQuery.leaderId(),
                detailQuery.leaderName(),
                detailQuery.status(),
                detailQuery.photos()
        );
    }
}