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
        boolean facilitySecuredTimeTarget,
        String rejectionReason,
        LocalDateTime statusChangedAt,
        String statusChangedByName,
        LocalDateTime pendingSince,
        // 운영 중단(INACTIVE) 동아리만 채우고(0 포함) 다른 상태는 null — 남은 미결 판정은 ClubRepositoryImpl 한 곳이다(스펙 §3-1).
        // 총동연 모집 목록의 pendingApplicationCount(SUBMITTED 만)와 뜻이 달라 이름을 달리한다(제출·보류·면접 대기).
        Long undecidedApplicationCount,
        Long pendingJoinRequestCount
) {
}
