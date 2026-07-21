package com.duing.domain.clubmember.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.AdminClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMemberQueryService implements ClubMemberQueryService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubRepository clubRepository;
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

    @Override
    public List<AdminClubMemberQuery> getMembersForAdmin(Long clubId) {
        // 소속 검증 없음 — 컨트롤러의 @PreAuthorize("hasRole('ADMIN')") 가 인가를 보장한다.
        // 다만 존재 검증은 한다 — 없는 clubId(오타)와 "회원 0명인 실제 동아리"가 빈 배열로 뭉개지면
        // 학교 제출 명단에서 오탐이 된다. 형제 admin 조회(/admin/clubs/{clubId})와 동일하게 404.
        if (!clubRepository.existsById(clubId)) {
            throw new ClubException.ClubNotFoundException();
        }
        // 리더용과 동일한 정렬(LEADER→OFFICER→MEMBER, 가입일 오름차순) 쿼리를 재사용한다.
        return clubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(AdminClubMemberQuery::from)
                .toList();
    }

    @Override
    public List<ClubMemberExportQuery> getMembersForExport(Long clubId, Long requesterId, boolean includePhone) {
        clubAuthService.requireLeader(requesterId, clubId);
        List<ClubMemberExportQuery> rows = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(clubMember -> ClubMemberExportQuery.from(clubMember, includePhone))
                .toList();
        log.info("club member export: clubId={}, actorId={}, includePhone={}, count={}",
                clubId, requesterId, includePhone, rows.size());
        return rows;
    }
}
