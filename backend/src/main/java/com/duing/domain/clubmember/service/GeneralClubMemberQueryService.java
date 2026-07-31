package com.duing.domain.clubmember.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.exception.ClubMemberException;
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
import java.util.Set;
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
    public List<ClubMemberExportQuery> getMembersForExport(
            Long clubId, Long requesterId, boolean includePhone, List<Long> memberIds) {
        clubAuthService.requireManager(requesterId, clubId);
        Map<Long, MemberFeeStatus> feeStatusByUser = feeStatusByUser(clubId);
        // 지정된 멤버만 내려보낸다 — 화면에 없는 회원의 전화번호가 브라우저로 나가지 않게 하고,
        // 아래 감사 로그의 count 도 실제 내보낸 인원과 일치시킨다. 요청 크기는 URL 길이 제한이 막는다.
        // 타 동아리 memberId 는 이 클럽 조회 결과에 없으므로 자연히 걸러진다.
        Set<Long> targetMemberIds = memberIds == null ? Set.of() : Set.copyOf(memberIds);
        List<ClubMemberExportQuery> rows = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(clubId).stream()
                .filter(clubMember -> targetMemberIds.isEmpty() || targetMemberIds.contains(clubMember.getId()))
                .map(clubMember -> ClubMemberExportQuery.from(
                        clubMember,
                        includePhone,
                        feeStatusByUser.getOrDefault(clubMember.getUser().getId(), MemberFeeStatus.NONE)))
                .toList();
        log.info("club member export: clubId={}, actorId={}, includePhone={}, scoped={}, count={}",
                clubId, requesterId, includePhone, !targetMemberIds.isEmpty(), rows.size());
        return rows;
    }

    @Override
    public String getMemberPhone(Long clubId, Long memberId, Long requesterId) {
        clubAuthService.requireManager(requesterId, clubId);
        // clubId 스코프(타 동아리 id 로 남의 번호를 긁는 경로 차단)와 탈퇴 회원 잔존 행 제외를 쿼리가 함께 처리한다.
        // 셋 다 404 로 수렴해 존재 여부를 숨긴다.
        ClubMember target = clubMemberRepository.findByClubIdAndIdWithUser(clubId, memberId)
                .orElseThrow(ClubMemberException.NotFound::new);
        // 개인정보 원본 열람은 그 자체가 감사 대상 행위다. 번호 값은 절대 남기지 않는다.
        log.info("member phone view: clubId={}, actorUserId={}, targetMemberId={}, targetUserId={}, action=PHONE_VIEW",
                clubId, requesterId, memberId, target.getUser().getId());
        return target.getUser().getPhone();
    }

    // 회원별 최신 비-CANCELLED 청구 상태를 단일 배치 쿼리로 읽어 userId→MemberFeeStatus 로 매핑한다(멤버당 추가 쿼리 없음).
    private Map<Long, MemberFeeStatus> feeStatusByUser(Long clubId) {
        return feeBillRepository.findLatestNonCancelledBillStatusByClubId(clubId).stream()
                .collect(Collectors.toMap(
                        LatestBillStatusRow::userId,
                        row -> MemberFeeStatus.fromLatestBill(row.status())));
    }
}
