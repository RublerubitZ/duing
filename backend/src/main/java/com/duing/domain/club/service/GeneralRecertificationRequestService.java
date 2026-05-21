package com.duing.domain.club.service;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RecertificationStatus;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.repository.RecertificationRequestRepository;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecertificationRequestService implements RecertificationRequestService {

    private final RecertificationRequestRepository requestRepository;
    private final RecertificationRoundRepository roundRepository;
    private final ClubRepository clubRepository;

    @Override
    @Transactional
    public Long create(CreateRecertificationCommand command) {
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        if (!club.isCentralClub()) {
            throw new ClubException.NotCentralClubException();
        }
        RecertificationRound openRound = roundRepository.findByStatus(RoundStatus.OPEN)
                .orElseThrow(ClubException.NoOpenRoundException::new);

        requestRepository.findByRoundIdAndClubIdAndStatus(
                        openRound.getId(), club.getId(), RecertificationStatus.PENDING)
                .ifPresent(existing -> {
                    throw new ClubException.DuplicatePendingRecertificationException();
                });

        try {
            return requestRepository.save(RecertificationRequest.create(
                    openRound.getId(), club.getId(), command.requesterUserId(),
                    command.contactEmail(), command.contactPhone(),
                    command.operatingYear(), command.notes()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubException.DuplicatePendingRecertificationException();
        }
    }

    @Override
    @Transactional
    public void process(ProcessRecertificationCommand command) {
        RecertificationRequest request = requestRepository.findByIdForUpdate(command.requestId())
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);

        request.process(command.handlerAdminId(), command.status(), command.actionNote());

        if (command.status() == RecertificationStatus.APPROVED) {
            RecertificationRound round = roundRepository.findById(request.getRoundId())
                    .orElseThrow(ClubException.RoundNotFoundException::new);
            Club club = clubRepository.findById(request.getClubId())
                    .orElseThrow(ClubException.ClubNotFoundException::new);
            club.updateLastVerifiedYear(round.getYear());
        }
    }

    @Override
    public RecertificationRequest getById(Long requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(ClubException.RecertificationRequestNotFoundException::new);
    }

    @Override
    public Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable
    ) {
        return requestRepository.searchForAdmin(condition, pageable);
    }

    @Override
    public Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable
    ) {
        return requestRepository.findCentralClubStatuses(query, pageable);
    }
}
