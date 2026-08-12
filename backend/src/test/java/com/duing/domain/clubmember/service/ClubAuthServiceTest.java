package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.UserRole;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class ClubAuthServiceTest {

    private final ClubMemberRepository repository = mock(ClubMemberRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final ClubAuthService service = new ClubAuthService(repository, clubRepository);

    private ClubMember memberWithRole(ClubMemberRole role) {
        ClubMember member = mock(ClubMember.class);
        when(member.getRole()).thenReturn(role);
        when(member.canManageClub()).thenReturn(role.canManageClub());
        return member;
    }

    private void stubClubStatus(ClubStatus status) {
        when(clubRepository.findStatusById(1L)).thenReturn(Optional.of(status));
    }

    @Test
    @DisplayName("ACTIVE 동아리의 LEADER 멤버는 requireLeader 검증을 통과한다")
    void leaderPassesRequireLeader() {
        ClubMember leaderMember = memberWithRole(ClubMemberRole.LEADER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(leaderMember));
        stubClubStatus(ClubStatus.ACTIVE);
        assertThat(service.requireLeader(10L, 1L).getRole()).isEqualTo(ClubMemberRole.LEADER);
    }

    @Test
    @DisplayName("OFFICER 는 requireLeader 검증에서 거부된다")
    void officerFailsRequireLeader() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
        assertThatThrownBy(() -> service.requireLeader(10L, 1L))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("ACTIVE 동아리의 LEADER 또는 OFFICER 는 requireManager 검증을 통과한다")
    void managerRolesPassRequireManager() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
        stubClubStatus(ClubStatus.ACTIVE);
        assertThat(service.requireManager(10L, 1L).getRole()).isEqualTo(ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("MEMBER 는 requireManager 검증에서 거부된다")
    void memberFailsRequireManager() {
        ClubMember regularMember = memberWithRole(ClubMemberRole.MEMBER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(regularMember));
        assertThatThrownBy(() -> service.requireManager(10L, 1L))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("운영진이라도 비 ACTIVE(승인대기·거절·운영종료) 동아리에서는 운영 행위가 차단된다")
    void managerBlockedOnNonActiveClub() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
        for (ClubStatus blockedStatus : List.of(
                ClubStatus.PENDING_APPROVAL, ClubStatus.REJECTED, ClubStatus.INACTIVE)) {
            stubClubStatus(blockedStatus);
            assertThatThrownBy(() -> service.requireManager(10L, 1L))
                    .isInstanceOf(ClubMemberException.NotActiveClub.class);
        }
    }

    @Test
    @DisplayName("리더라도 비 ACTIVE 동아리에서는 requireLeader 가 차단된다")
    void leaderBlockedOnNonActiveClub() {
        ClubMember leaderMember = memberWithRole(ClubMemberRole.LEADER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(leaderMember));
        stubClubStatus(ClubStatus.INACTIVE);
        assertThatThrownBy(() -> service.requireLeader(10L, 1L))
                .isInstanceOf(ClubMemberException.NotActiveClub.class);
    }

    @Test
    @DisplayName("OFFICER 라도 비 ACTIVE 동아리에서는 requireOfficer 가 차단된다")
    void officerBlockedOnNonActiveClub() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
        stubClubStatus(ClubStatus.REJECTED);
        assertThatThrownBy(() -> service.requireOfficer(10L, 1L))
                .isInstanceOf(ClubMemberException.NotActiveClub.class);
    }

    @Test
    @DisplayName("비멤버는 동아리 상태 조회 전에 NotAMember 로 거부된다 (상태 정보 유출 방지)")
    void nonMemberRejectedBeforeStatusLookup() {
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.requireManager(10L, 1L))
                .isInstanceOf(ClubMemberException.NotAMember.class);
        verify(clubRepository, never()).findStatusById(anyLong());
    }

    @Test
    @DisplayName("역할 미달(MEMBER)은 비 ACTIVE 동아리라도 상태가 아닌 역할 사유로 거부된다")
    void roleCheckPrecedesStatusCheck() {
        ClubMember regularMember = memberWithRole(ClubMemberRole.MEMBER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(regularMember));
        stubClubStatus(ClubStatus.INACTIVE);
        assertThatThrownBy(() -> service.requireManager(10L, 1L))
                .isInstanceOf(AccessDeniedException.class);
        verify(clubRepository, never()).findStatusById(anyLong());
    }

    @Test
    @DisplayName("삭제된 동아리의 잔존 멤버십은 비멤버로 취급된다")
    void deletedClubMembershipTreatedAsNonMember() {
        ClubMember leaderMember = memberWithRole(ClubMemberRole.LEADER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(leaderMember));
        when(clubRepository.findStatusById(1L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.requireLeader(10L, 1L))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("프로필 보완 게이트는 승인대기·거절·운영중 운영진의 접근을 허용한다")
    void editableManagerAllowsPendingRejectedActive() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
        for (ClubStatus allowedStatus : List.of(
                ClubStatus.PENDING_APPROVAL, ClubStatus.REJECTED, ClubStatus.ACTIVE)) {
            stubClubStatus(allowedStatus);
            assertThat(service.requireEditableClubManager(10L, 1L).getRole())
                    .isEqualTo(ClubMemberRole.OFFICER);
        }
    }

    @Test
    @DisplayName("프로필 보완 게이트도 운영 종료(INACTIVE) 동아리 운영진은 차단한다")
    void editableManagerBlocksInactive() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
        stubClubStatus(ClubStatus.INACTIVE);
        assertThatThrownBy(() -> service.requireEditableClubManager(10L, 1L))
                .isInstanceOf(ClubMemberException.NotActiveClub.class);
    }

    @Test
    @DisplayName("MEMBER 는 프로필 보완 게이트에서도 역할 미달로 거부된다")
    void memberFailsEditableManager() {
        ClubMember regularMember = memberWithRole(ClubMemberRole.MEMBER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(regularMember));
        assertThatThrownBy(() -> service.requireEditableClubManager(10L, 1L))
                .isInstanceOf(AccessDeniedException.class);
        verify(clubRepository, never()).findStatusById(anyLong());
    }

    @Test
    @DisplayName("멤버십이 없는 사용자는 requireMember 검증에서 거부된다")
    void nonMemberFailsRequireMember() {
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.requireMember(10L, 1L))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("ADMIN 글로벌 역할은 requireAdmin 검증을 통과한다")
    void adminPassesRequireAdmin() {
        service.requireAdmin(UserRole.ADMIN);
    }

    @Test
    @DisplayName("STUDENT 글로벌 역할은 requireAdmin 검증에서 거부된다")
    void studentFailsRequireAdmin() {
        assertThatThrownBy(() -> service.requireAdmin(UserRole.STUDENT))
                .isInstanceOf(AccessDeniedException.class);
    }
}
