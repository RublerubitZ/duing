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
     * - 운영 중(ACTIVE) 동아리만 반환한다 — 승인 대기(PENDING_APPROVAL)·거절(REJECTED)·운영 중단(INACTIVE) 상태는 제외.
     * - joinedAt = ClubMember.createdAt
     * - 정렬: joinedAt DESC
     */
    List<MyClubQuery> findMyClubsByUser(Long userId);
}
