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

        // 위 잠금 조회는 명시 HQL 이라 탈퇴 계정의 잔존 멤버십도 잡힌다. 그대로 지정하면 로그인 불가한
        // 유령 회장이 부분 유니크 인덱스를 점유하고 콘솔에는 "회장 없음"으로 보인다 —
        // 파생 쿼리로 계정 생존을 확인해 멤버가 아닌 것과 같게 처리한다.
        if (clubMemberRepository.findByClubIdAndUserId(command.clubId(), command.newLeaderUserId())
                .isEmpty()) {
            throw new ClubMemberException.AdminAssignTargetNotMember();
        }

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
