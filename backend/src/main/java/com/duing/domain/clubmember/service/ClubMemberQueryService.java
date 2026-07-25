package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.query.AdminClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.util.List;

public interface ClubMemberQueryService {

    List<ClubMemberQuery> getMembers(Long clubId, Long requesterId);

    List<MyClubQuery> findMyClubs(Long userId);

    // memberIds 가 비어있지 않으면 그 멤버만 내보낸다(화면 필터 결과 범위). null·빈 목록이면 전체.
    List<ClubMemberExportQuery> getMembersForExport(
            Long clubId, Long requesterId, boolean includePhone, List<Long> memberIds);

    /**
     * 회원의 원본 연락처를 반환한다. LEADER 전용이며 조회 사실을 구조화 로그로 남긴다.
     * 목록·export 는 계속 마스킹만 제공하고, 원본은 이 경로로만 나간다.
     */
    String getMemberPhone(Long clubId, Long memberId, Long requesterId);

    /**
     * 총동연(ADMIN) 동아리원 명단 조회. 소속 여부와 무관하게 조회하며 인가는 컨트롤러의
     * {@code @PreAuthorize("hasRole('ADMIN')")} 가 보장한다(리더용 getMembers 와 달리 소속 검증 없음).
     */
    List<AdminClubMemberQuery> getMembersForAdmin(Long clubId);
}
