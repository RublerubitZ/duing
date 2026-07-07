package com.duing.domain.clubmember.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;
import com.duing.domain.user.entity.UserRole;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 동아리 권한 검증의 단일 진입점.
 * Controller / 다른 Service 는 본 클래스의 require* 메서드를 호출하여 검증한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ClubAuthService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubRepository clubRepository;

    public ClubMember requireLeader(Long userId, Long clubId) {
        ClubMember clubMember = findMembershipOrThrow(userId, clubId);
        if (clubMember.getRole() != ClubMemberRole.LEADER) {
            throw new AccessDeniedException("해당 동아리의 회장만 가능한 작업입니다.");
        }
        return clubMember;
    }

    public ClubMember requireManager(Long userId, Long clubId) {
        ClubMember clubMember = findMembershipOrThrow(userId, clubId);
        if (!clubMember.canManageClub()) {
            throw new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다.");
        }
        return clubMember;
    }

    /**
     * 현재 프로덕션 호출처 없음 — 비 ACTIVE 접근 정책(Part B) 도입으로 requireActiveMember 가 멤버 검증의
     * 기본 진입점이다. 상태 무관 멤버십 검증이 필요한 새 기능을 위해 유지한다.
     */
    public ClubMember requireMember(Long userId, Long clubId) {
        return findMembershipOrThrow(userId, clubId);
    }

    /**
     * 멤버십과 동아리 운영 상태(ACTIVE)를 함께 요구한다 — 비 ACTIVE 동아리의 멤버 내부 영역
     * 접근 차단 (스펙 Part B). 소속 멤버에게는 존재 은닉이 무의미하므로 404 가 아닌 403 + 상태별 안내.
     */
    public ClubMember requireActiveMember(Long userId, Long clubId) {
        ClubMember clubMember = findMembershipOrThrow(userId, clubId);
        // soft-delete 된 동아리는 @SQLRestriction 으로 조회되지 않는다 — 잔존 멤버십(정합 깨짐)은 비멤버로 취급해
        // lazy 프록시 초기화 실패(500)를 방지한다.
        ClubStatus clubStatus = clubRepository.findById(clubId)
                .map(Club::getStatus)
                .orElseThrow(ClubMemberException.NotAMember::new);
        if (clubStatus != ClubStatus.ACTIVE) {
            throw new ClubMemberException.NotActiveClub(clubStatus);
        }
        return clubMember;
    }

    /**
     * 멤버십 판정 — 클럽 미존재/비-멤버는 NotAMember 로 통일 (가드 응답 일관성).
     * 현재 프로덕션 호출처 없음 — 비 ACTIVE 접근 정책(Part B) 도입으로 requireActiveMember 가 멤버 검증의
     * 기본 진입점이다. 상태 무관 멤버십 검증이 필요한 새 기능을 위해 유지한다.
     */
    public ClubMember resolveMembership(Long userId, Long clubId) {
        return clubMemberRepository.findByClubIdAndUserId(clubId, userId)
                .orElseThrow(ClubMemberException.NotAMember::new);
    }

    public ClubMember requireOfficer(Long userId, Long clubId) {
        ClubMember clubMember = findMembershipOrThrow(userId, clubId);
        if (clubMember.getRole() != ClubMemberRole.OFFICER) {
            throw new AccessDeniedException("해당 동아리의 운영진(OFFICER)만 가능한 작업입니다.");
        }
        return clubMember;
    }

    /**
     * 사용자가 운영(LEADER/OFFICER) 가능한 동아리 목록을 조회한다.
     * 운영 콘솔 진입 시 셀렉터와 가드 판정에 사용된다.
     */
    public List<ManagedClubQuery> findManagedClubs(Long userId) {
        return clubMemberRepository.findActiveManagedClubsByUser(userId);
    }

    public void requireAdmin(UserRole globalRole) {
        if (globalRole != UserRole.ADMIN) {
            throw new AccessDeniedException("총동연(ADMIN) 권한이 필요합니다.");
        }
    }

    private ClubMember findMembershipOrThrow(Long userId, Long clubId) {
        return clubMemberRepository.findByClubIdAndUserId(clubId, userId)
                .orElseThrow(ClubMemberException.NotAMember::new);
    }
}
