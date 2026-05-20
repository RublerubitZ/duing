package com.duing.domain.clubmember.service;

import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralLeaderSuccessionService implements LeaderSuccessionService {

    private final LeaderSuccessionRequestRepository requestRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubRepository clubRepository;
    private final ClubMemberHistoryRecorder historyRecorder;
    private final EntityManager entityManager;

    @Override
    @Transactional
    public Long create(CreateSuccessionCommand command) {
        if (clubRepository.findById(command.clubId()).isEmpty()) {
            throw new ClubMemberException.NotFound();
        }
        ClubMember requester = clubMemberRepository
                .findByClubIdAndUserId(command.clubId(), command.requesterUserId())
                .orElseThrow(ClubMemberException.SuccessionRequiresOfficer::new);
        if (requester.getRole() != ClubMemberRole.OFFICER) {
            throw new ClubMemberException.SuccessionRequiresOfficer();
        }
        requestRepository.findByClubIdAndStatus(command.clubId(), SuccessionStatus.PENDING)
                .ifPresent(existing -> { throw new ClubMemberException.DuplicatePendingSuccession(); });

        try {
            return requestRepository.save(LeaderSuccessionRequest.create(
                    command.clubId(), command.requesterUserId(), command.reason()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubMemberException.DuplicatePendingSuccession();
        }
    }

    @Override
    @Transactional
    public void process(ProcessSuccessionCommand command) {
        LeaderSuccessionRequest preview = requestRepository.findById(command.requestId())
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);

        if (command.status() == SuccessionStatus.REJECTED) {
            preview.process(command.handlerAdminId(), SuccessionStatus.REJECTED, command.actionNote());
            return;
        }

        // findByIdForUpdate 가 최신 DB 상태를 가져오도록 1차 캐시 비우기 (transferLeader 패턴 동일).
        Long requestId = preview.getId();
        Long clubId = preview.getClubId();
        Long requesterUserId = preview.getRequesterUserId();
        entityManager.clear();

        LeaderSuccessionRequest request = requestRepository.findByIdForUpdate(requestId)
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);

        ClubMember currentLeader = clubMemberRepository
                .findByClubIdAndRoleForUpdate(clubId, ClubMemberRole.LEADER)
                .orElseThrow(ClubMemberException.SuccessionLeaderAbsent::new);
        ClubMember requesterMember = clubMemberRepository
                .findByClubIdAndUserIdForUpdate(clubId, requesterUserId)
                .orElseThrow(ClubMemberException.SuccessionRequesterNoLongerOfficer::new);

        if (requesterMember.getRole() != ClubMemberRole.OFFICER) {
            throw new ClubMemberException.SuccessionRequesterNoLongerOfficer();
        }

        currentLeader.changeRole(ClubMemberRole.MEMBER);
        requesterMember.changeRole(ClubMemberRole.LEADER);

        historyRecorder.record(
                clubId, currentLeader.getUser().getId(), command.handlerAdminId(),
                ClubMemberEventType.SUCCESSION_APPROVED,
                ClubMemberRole.LEADER, ClubMemberRole.MEMBER, command.actionNote());
        historyRecorder.record(
                clubId, requesterMember.getUser().getId(), command.handlerAdminId(),
                ClubMemberEventType.SUCCESSION_APPROVED,
                ClubMemberRole.OFFICER, ClubMemberRole.LEADER, command.actionNote());

        request.process(command.handlerAdminId(), SuccessionStatus.APPROVED, command.actionNote());
    }

    @Override
    public LeaderSuccessionRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(ClubMemberException.SuccessionRequestNotFound::new);
    }

    @Override
    public Page<LeaderSuccessionRequest> searchForAdmin(
            SuccessionAdminSearchCondition condition, Pageable pageable
    ) {
        return requestRepository.searchForAdmin(condition, pageable);
    }
}
