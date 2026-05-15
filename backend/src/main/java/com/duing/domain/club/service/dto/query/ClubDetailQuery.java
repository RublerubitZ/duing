package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubFaq;
import com.duing.domain.club.entity.ClubSnsLink;
import com.duing.domain.club.entity.ClubStatus;
import java.util.List;

public record ClubDetailQuery(
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
    /**
     * leaderId / leaderName 은 ClubMember 테이블에서 role = LEADER 인 행을 조회해 주입한다.
     * 회장 부재(공석) 상황을 허용하므로 null 이 가능하다.
     */
    public static ClubDetailQuery of(Club club, Long leaderId, String leaderName,
                                     List<ClubPhotoQuery> photos) {
        return new ClubDetailQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getDescription(),
                club.getLogoUrl(),
                club.getCoverUrl(),
                club.getTags(),
                club.getSnsLinks(),
                club.getFaqs(),
                leaderId,
                leaderName,
                club.getStatus(),
                photos
        );
    }
}