package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMemberQueryService implements ClubMemberQueryService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;

    @Override
    public List<ClubMemberQuery> getMembers(Long clubId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        return clubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(ClubMemberQuery::from)
                .toList();
    }

    @Override
    public List<MyClubQuery> findMyClubs(Long userId) {
        return clubMemberRepository.findMyClubsByUser(userId);
    }
}
