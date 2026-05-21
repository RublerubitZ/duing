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

        clubMemberRepository
                .findByClubIdAndRoleForUpdate(command.clubId(), ClubMemberRole.LEADER)
                .ifPresent(existing -> {
                    throw new ClubMemberException.AdminAssignLeaderAlreadyExists();
                });

        ClubMemberRole previousRole = candidate.getRole();
        try {
            candidate.changeRole(ClubMemberRole.LEADER);
            clubMemberRepository.flush();
        } catch (DataIntegrityViolationException race) {
            throw new ClubMemberException.AdminAssignLeaderAlreadyExists();
        }

        historyRecorder.record(
                command.clubId(), candidate.getUser().getId(), command.actorAdminId(),
                ClubMemberEventType.ADMIN_LEADER_ASSIGNED,
                previousRole, ClubMemberRole.LEADER, command.reason());
    }
}
