package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;

public record ClubDetailQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        Long leaderId,
        String leaderName,
        ClubStatus status
) {
    /**
     * leaderId / leaderName 은 ClubMember 테이블에서 role = LEADER 인 행을 조회해 주입한다.
     * 회장 부재(공석) 상황을 허용하므로 null 이 가능하다.
     */
    public static ClubDetailQuery of(Club club, Long leaderId, String leaderName) {
        return new ClubDetailQuery(
                club.getId(),
                club.getName(),
                club.getCategory(),
                club.getDivision(),
                club.getDescription(),
                club.getLogoUrl(),
                leaderId,
                leaderName,
                club.getStatus()
        );
    }
}
