package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.UserRole;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class ClubAuthServiceTest {

    private final ClubMemberRepository repository = mock(ClubMemberRepository.class);
    private final ClubAuthService service = new ClubAuthService(repository);

    private ClubMember memberWithRole(ClubMemberRole role) {
        ClubMember member = mock(ClubMember.class);
        when(member.getRole()).thenReturn(role);
        when(member.canManageClub()).thenReturn(role.canManageClub());
        return member;
    }

    @Test
    @DisplayName("LEADER 멤버는 requireLeader 검증을 통과한다")
    void leaderPassesRequireLeader() {
        ClubMember leaderMember = memberWithRole(ClubMemberRole.LEADER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(leaderMember));
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
    @DisplayName("LEADER 또는 OFFICER 는 requireManager 검증을 통과한다")
    void managerRolesPassRequireManager() {
        ClubMember officerMember = memberWithRole(ClubMemberRole.OFFICER);
        when(repository.findByClubIdAndUserId(1L, 10L)).thenReturn(Optional.of(officerMember));
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