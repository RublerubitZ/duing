package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.query.AdminClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.util.List;

public interface ClubMemberQueryService {

    List<ClubMemberQuery> getMembers(Long clubId, Long requesterId);

    List<MyClubQuery> findMyClubs(Long userId);

    List<ClubMemberExportQuery> getMembersForExport(Long clubId, Long requesterId, boolean includePhone);

    /**
     * 총동연(ADMIN) 동아리원 명단 조회. 소속 여부와 무관하게 조회하며 인가는 컨트롤러의
     * {@code @PreAuthorize("hasRole('ADMIN')")} 가 보장한다(리더용 getMembers 와 달리 소속 검증 없음).
     */
    List<AdminClubMemberQuery> getMembersForAdmin(Long clubId);
}
