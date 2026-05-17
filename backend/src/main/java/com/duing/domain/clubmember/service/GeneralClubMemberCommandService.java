package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMemberCommandService implements ClubMemberCommandService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;

    @Override
    @Transactional
    public void updateRole(UpdateMemberRoleCommand command) {
        clubAuthService.requireLeader(command.requesterId(), command.clubId());

        if (command.role() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.TransferTargetInvalid();
        }

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());

        if (target.getUser().getId().equals(command.requesterId())) {
            throw new ClubMemberException.CannotChangeOwnRole();
        }
        if (target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.CannotModifyLeader();
        }

        target.changeRole(command.role());
    }

    @Override
    @Transactional
    public void removeMember(RemoveMemberCommand command) {
        clubAuthService.requireLeader(command.requesterId(), command.clubId());

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());

        if (target.getUser().getId().equals(command.requesterId())) {
            throw new ClubMemberException.CannotRemoveSelf();
        }
        if (target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.CannotModifyLeader();
        }

        clubMemberRepository.delete(target);
    }

    @Override
    @Transactional
    public void leave(LeaveClubCommand command) {
        ClubMember membership = clubMemberRepository
                .findByClubIdAndUserId(command.clubId(), command.requesterId())
                .orElseThrow(ClubMemberException.NotFound::new);

        if (membership.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.LeaderCannotLeave();
        }

        clubMemberRepository.delete(membership);
    }

    @Override
    @Transactional
    public TransferLeaderQuery transferLeader(TransferLeaderCommand command) {
        ClubMember requesterMembership = clubAuthService.requireLeader(
                command.requesterId(), command.clubId());

        // 동시 인계 경합을 막기 위해 두 행 모두 PESSIMISTIC_WRITE 로 잠근다.
        ClubMember currentLeader = clubMemberRepository.findByIdForUpdate(requesterMembership.getId())
                .orElseThrow(ClubMemberException.NotFound::new);
        ClubMember target = clubMemberRepository.findByIdForUpdate(command.memberId())
                .orElseThrow(ClubMemberException.NotFound::new);

        if (!target.getClub().getId().equals(command.clubId())
                || target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.TransferTargetInvalid();
        }

        currentLeader.changeRole(ClubMemberRole.OFFICER);
        target.changeRole(ClubMemberRole.LEADER);

        return new TransferLeaderQuery(
                ClubMemberQuery.from(currentLeader),
                ClubMemberQuery.from(target)
        );
    }

    private ClubMember findMembershipInClub(Long memberId, Long clubId) {
        ClubMember membership = clubMemberRepository.findById(memberId)
                .orElseThrow(ClubMemberException.NotFound::new);
        if (!membership.getClub().getId().equals(clubId)) {
            throw new ClubMemberException.NotFound();
        }
        return membership;
    }
}