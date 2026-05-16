package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;
import java.util.List;

public interface ClubMemberRepositoryCustom {

    /**
     * 사용자가 LEADER 또는 OFFICER 로 활동 중인 ACTIVE 동아리 목록 + 활성 모집 카운트.
     * 활성 모집 = recruitment.status = OPEN AND end_date >= today, soft delete 제외.
     * 단일 쿼리(GROUP BY)로 동아리당 1행 반환하여 N+1 을 회피한다.
     */
    List<ManagedClubQuery> findActiveManagedClubsByUser(Long userId);
}
