package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberGenerationCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;
import jakarta.persistence.EntityManager;
import java.util.List;
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
    public void updateGeneration(UpdateMemberGenerationCommand command) {
        // 기수는 권한과 무관한 표시용 메타라 운영진(LEADER/OFFICER) 공통. 역할 변경·강퇴와 달리
        // 회장 행 대상 제한(CannotModifyLeader)을 두지 않는 것도 의도된 정책이다.
        clubAuthService.requireManager(command.requesterId(), command.clubId());

        // use_generation 은 표시 제어 전용 — 저장 게이트가 아니므로 검사하지 않고 항상 저장한다.
        if (command.generation() != null && command.generation() < 1) {
            throw new ClubMemberException.InvalidGeneration();
        }

        ClubMember target = findMembershipInClub(command.memberId(), command.clubId());
        target.changeGeneration(command.generation());
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
        // 탈퇴 계정의 잔존 행이 대상이면 아래 응답 변환이 이름을 읽다 프록시 초기화에 실패해 500 이 된다.
        // 잠금 쿼리에 조인을 넣으면 users 행까지 잠겨 잠금 범위가 넓어지므로, 운영 명령 3경로와 같은
        // 조회로 생존만 따로 확인하고 대상 부적합으로 함께 거절한다.
        boolean targetUserAlive = clubMemberRepository
                .findByClubIdAndIdWithUser(command.clubId(), command.memberId())
                .isPresent();
        // 동아리 범위·역할 요건을 먼저 본다 — 위 조회는 동아리 조건도 함께 걸어서, 순서를 바꾸면
        // 타 동아리 대상까지 아래 404 로 빨려 들어가 기존 계약이 바뀐다.
        if (!target.getClub().getId().equals(command.clubId())
                || target.getRole() == ClubMemberRole.LEADER) {
            throw new ClubMemberException.TransferTargetInvalid();
        }
        if (!targetUserAlive) {
            // 역할 요건 위반이 아니라 대상이 사라진 것이다 — 나머지 세 경로와 같은 404 로 맞춰야
            // 운영진이 받는 안내가 "목록을 새로고침하라"로 읽힌다.
            throw new ClubMemberException.NotFound();
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

    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId, Long actorUserId, String reason) {
        List<ClubMember> members = clubMemberRepository.findAllByClubIdOrderedByRoleAndJoinedAt(clubId);
        for (ClubMember member : members) {
            historyRecorder.record(
                    clubId, member.getUser().getId(), actorUserId,
                    ClubMemberEventType.REMOVED, member.getRole(), null, reason);
        }
        clubMemberRepository.deleteAll(members);
    }

    @Override
    @Transactional
    public void leaveAllOnWithdrawal(Long userId) {
        List<ClubMember> memberships = clubMemberRepository.findAllByUserId(userId);
        for (ClubMember membership : memberships) {
            // withdraw 가 앞서 회장 검사를 하지만, 이 메서드 단독으로도 "회장 공석" 불변식을 지킨다.
            if (membership.getRole() == ClubMemberRole.LEADER) {
                throw new ClubMemberException.LeaderCannotLeave();
            }
            historyRecorder.record(
                    membership.getClub().getId(), userId, userId,
                    ClubMemberEventType.LEFT, membership.getRole(), null, "회원 탈퇴");
        }
        // @SQLDelete → 행은 deleted_at 으로 남아 가입 이력이 보존된다. 행 자체엔 PII 가 없어(user_id·club_id·role)
        // 잔존해도 무방하고, 물리 파기가 필요해지면 PiiRetentionJob 을 확장한다(현재 잡은 club_member 를 다루지 않는다).
        clubMemberRepository.deleteAll(memberships);
    }

    /**
     * 운영 명령(역할 변경·기수 변경·강퇴)의 대상 조회. 계정 탈퇴는 이제 멤버십도 함께 soft-delete 하지만
     * (leaveAllOnWithdrawal), 그 전환 이전 탈퇴자의 잔존 행과 탈퇴·명령이 겹치는 경합 창은 남으므로
     * findById 대신 원본 연락처 조회와 같은 경로를 써서 탈퇴 회원 행은 404 로 수렴시킨다(#753).
     */
    private ClubMember findMembershipInClub(Long memberId, Long clubId) {
        return clubMemberRepository.findByClubIdAndIdWithUser(clubId, memberId)
                .orElseThrow(ClubMemberException.NotFound::new);
    }
}
