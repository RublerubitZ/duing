package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.util.List;

public interface ClubMemberRepositoryCustom {

    /**
     * 사용자가 LEADER 또는 OFFICER 로 활동 중인 ACTIVE 동아리 목록 + 활성 모집 카운트.
     * 활성 모집 = recruitment.status = OPEN AND end_date >= today, soft delete 제외.
     * 단일 쿼리(GROUP BY)로 동아리당 1행 반환하여 N+1 을 회피한다.
     */
    List<ManagedClubQuery> findActiveManagedClubsByUser(Long userId);

    /**
     * 사용자가 현재 소속(LEADER/OFFICER/MEMBER) 된 동아리 목록 + 활성 모집 카운트 + 가입일.
     * - role 무관. soft-deleted 멤버십·동아리는 제외 (@SQLRestriction 자동 적용).
     * - 동아리 status 무관 (INACTIVE/PENDING_APPROVAL/REJECTED 도 포함) — 화면에서 분기.
     *   (MVP 의도된 단순화. 후속에서 UI 표기 분기 추가.)
     * - joinedAt = ClubMember.createdAt
     * - 정렬: joinedAt DESC
     */
    List<MyClubQuery> findMyClubsByUser(Long userId);
}
