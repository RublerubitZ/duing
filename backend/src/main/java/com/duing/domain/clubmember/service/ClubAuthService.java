package com.duing.domain.clubmember.service;

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

    public ClubMember requireMember(Long userId, Long clubId) {
        return findMembershipOrThrow(userId, clubId);
    }

    /** 멤버십 판정 — 클럽 미존재/비-멤버는 NotAMember 로 통일 (가드 응답 일관성). */
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
