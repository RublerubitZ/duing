package com.duing.domain.clubmember.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.AdminClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.MemberFeeStatus;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.LatestBillStatusRow;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
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
    private final FeeBillRepository feeBillRepository;

    @Override
    public List<ClubMemberQuery> getMembers(Long clubId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        Map<Long, MemberFeeStatus> feeStatusByUser = feeStatusByUser(clubId);
        return clubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(clubMember -> ClubMemberQuery.from(
                        clubMember,
                        feeStatusByUser.getOrDefault(clubMember.getUser().getId(), MemberFeeStatus.NONE)))
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
        Map<Long, MemberFeeStatus> feeStatusByUser = feeStatusByUser(clubId);
        List<ClubMemberExportQuery> rows = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .map(clubMember -> ClubMemberExportQuery.from(
                        clubMember,
                        includePhone,
                        feeStatusByUser.getOrDefault(clubMember.getUser().getId(), MemberFeeStatus.NONE)))
                .toList();
        log.info("club member export: clubId={}, actorId={}, includePhone={}, count={}",
                clubId, requesterId, includePhone, rows.size());
        return rows;
    }

    // 회원별 최신 비-CANCELLED 청구 상태를 단일 배치 쿼리로 읽어 userId→MemberFeeStatus 로 매핑한다(멤버당 추가 쿼리 없음).
    private Map<Long, MemberFeeStatus> feeStatusByUser(Long clubId) {
        return feeBillRepository.findLatestNonCancelledBillStatusByClubId(clubId).stream()
                .collect(Collectors.toMap(
                        LatestBillStatusRow::userId,
                        row -> MemberFeeStatus.fromLatestBill(row.status())));
    }
}
