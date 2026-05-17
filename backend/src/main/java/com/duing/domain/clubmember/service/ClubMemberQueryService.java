package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import java.util.List;

public interface ClubMemberQueryService {

    List<ClubMemberQuery> getMembers(Long clubId, Long requesterId);
}
