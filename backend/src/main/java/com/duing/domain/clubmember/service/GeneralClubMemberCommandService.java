package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMemberCommandService implements ClubMemberCommandService {

    private final ClubMemberRepository clubMemberRepository;
    private final ClubAuthService clubAuthService;
    private final EntityManager entityManager;
    private final ClubMemberHistoryRecorder historyRecorder;

    @Override
    @Transactional
    public void updateRole(UpdateMemberRoleCommand command) {
        clubAuthService.requireLeader(command.requesterId(), command.clubId());

        if (command.role() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.InvalidRoleAssignment();
        }

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());

        if (target.getUser().getId().equals(command.requesterId())) {
            throw new ClubMemberException.CannotChangeOwnRole();
        }
        if (target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.CannotModifyLeader();
        }

        ClubMemberRole previousRole = target.getRole();
        target.changeRole(command.role());

        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.ROLE_CHANGED,
                previousRole, command.role(), null);
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

        ClubMemberRole previousRole = target.getRole();
        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.REMOVED, previousRole, null, null);
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

        ClubMemberRole previousRole = membership.getRole();
        historyRecorder.record(
                command.clubId(), command.requesterId(), command.requesterId(),
                ClubMemberEventType.LEFT, previousRole, null, null);
        clubMemberRepository.delete(membership);
    }

    @Override
    @Transactional
    public TransferLeaderQuery transferLeader(TransferLeaderCommand command) {
        ClubMember requesterMembership = clubAuthService.requireLeader(
                command.requesterId(), command.clubId());

        // requireLeader 가 영속성 컨텍스트에 올린 엔티티를 1차 캐시에서 비워야
        // 이어지는 PESSIMISTIC_WRITE 가 최신 DB 상태(다른 트랜잭션의 커밋 결과)를 가져온다.
        entityManager.clear();

        // 동시 인계 경합을 막기 위해 두 행 모두 PESSIMISTIC_WRITE 로 잠근다.
        ClubMember currentLeader = clubMemberRepository.findByIdForUpdate(requesterMembership.getId())
                .orElseThrow(ClubMemberException.NotFound::new);
        ClubMember target = clubMemberRepository.findByIdForUpdate(command.memberId())
                .orElseThrow(ClubMemberException.NotFound::new);

        // 잠금 획득 후 재검증: 다른 트랜잭션이 먼저 인계를 끝낸 경우 본 요청자는 더 이상 LEADER 가 아니다.
        if (currentLeader.getRole() != ClubMemberRole.LEADER) {
            throw new ClubMemberException.ConcurrentTransferDetected();
        }
        if (!target.getClub().getId().equals(command.clubId())
                || target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.TransferTargetInvalid();
        }

        ClubMemberRole previousTargetRole = target.getRole();

        currentLeader.changeRole(ClubMemberRole.OFFICER);
        target.changeRole(ClubMemberRole.LEADER);

        historyRecorder.record(
                command.clubId(), currentLeader.getUser().getId(), command.requesterId(),
                ClubMemberEventType.LEADER_TRANSFERRED,
                ClubMemberRole.LEADER, ClubMemberRole.OFFICER, null);
        historyRecorder.record(
                command.clubId(), target.getUser().getId(), command.requesterId(),
                ClubMemberEventType.LEADER_TRANSFERRED,
                previousTargetRole, ClubMemberRole.LEADER, null);

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