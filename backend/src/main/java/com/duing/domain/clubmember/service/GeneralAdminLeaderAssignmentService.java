package com.duing.domain.clubmember.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminLeaderAssignmentService implements AdminLeaderAssignmentService {

    private final ClubRepository clubRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubMemberHistoryRecorder historyRecorder;

    @Override
    @Transactional
    public void assign(AssignLeaderByAdminCommand command) {
        if (!clubRepository.existsById(command.clubId())) {
            throw new ClubException.ClubNotFoundException();
        }

        ClubMember candidate = clubMemberRepository
                .findByClubIdAndUserIdForUpdate(command.clubId(), command.newLeaderUserId())
                .orElseThrow(ClubMemberException.AdminAssignTargetNotMember::new);

        ClubMember currentLeader = clubMemberRepository
                .findByClubIdAndRoleForUpdate(command.clubId(), ClubMemberRole.LEADER)
                .orElse(null);
        if (currentLeader != null && currentLeader.getId().equals(candidate.getId())) {
            throw new ClubMemberException.AdminAssignLeaderAlreadyExists();
        }

        // 기존 회장은 정상 인계와 동일하게 MEMBER 로 강등한다.
        // 부분 유니크 인덱스(uk_club_member_leader_active) 때문에 강등을 먼저 flush 해야 승격이 통과한다.
        if (currentLeader != null) {
            currentLeader.changeRole(ClubMemberRole.MEMBER);
            clubMemberRepository.flush();
        }

        ClubMemberRole previousRole = candidate.getRole();
        try {
            candidate.changeRole(ClubMemberRole.LEADER);
            clubMemberRepository.flush();
        } catch (DataIntegrityViolationException race) {
            throw new ClubMemberException.ConcurrentSuccessionUpdateException();
        }

        if (currentLeader != null) {
            historyRecorder.record(
                    command.clubId(), currentLeader.getUser().getId(), command.actorAdminId(),
                    ClubMemberEventType.ADMIN_LEADER_ASSIGNED,
                    ClubMemberRole.LEADER, ClubMemberRole.MEMBER, command.reason());
        }
        historyRecorder.record(
                command.clubId(), candidate.getUser().getId(), command.actorAdminId(),
                ClubMemberEventType.ADMIN_LEADER_ASSIGNED,
                previousRole, ClubMemberRole.LEADER, command.reason());
    }
}
