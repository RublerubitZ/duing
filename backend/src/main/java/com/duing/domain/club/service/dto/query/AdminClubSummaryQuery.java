package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.user.entity.College;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 총동연(ADMIN) 콘솔 목록 행. 학생 측 {@link ClubSummaryQuery} 에 leader 정보가 추가된다.
 * leader 가 부재한 동아리(이론상 발생하지 않지만 데이터 정합 깨졌을 때 대비) 는 leader 필드가 null 로 내려간다.
 */
public record AdminClubSummaryQuery(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        Long leaderId,
        String leaderName,
        String leaderStudentId,
        boolean centralClub,
        String rejectionReason,
        LocalDateTime statusChangedAt,
        String statusChangedByName
) {
}
