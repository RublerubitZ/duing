package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.util.List;

public interface ClubMemberQueryService {

    List<ClubMemberQuery> getMembers(Long clubId, Long requesterId);

    List<MyClubQuery> findMyClubs(Long userId);

    List<ClubMemberExportQuery> getMembersForExport(Long clubId, Long requesterId, boolean includePhone);
}
