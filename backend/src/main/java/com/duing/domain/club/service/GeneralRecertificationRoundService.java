package com.duing.domain.club.service;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.RecertificationRoundRepository;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralRecertificationRoundService implements RecertificationRoundService {

    private final RecertificationRoundRepository roundRepository;

    @Override
    @Transactional
    public Long open(OpenRoundCommand command) {
        roundRepository.findByYearAndStatus(command.year(), RoundStatus.OPEN)
                .ifPresent(existing -> { throw new ClubException.DuplicateOpenRoundException(); });
        try {
            return roundRepository.save(RecertificationRound.open(
                    command.year(), command.label(), command.openedBy()
            )).getId();
        } catch (DataIntegrityViolationException race) {
            throw new ClubException.DuplicateOpenRoundException();
        }
    }

    @Override
    @Transactional
    public void close(CloseRoundCommand command) {
        RecertificationRound round = roundRepository.findByIdForUpdate(command.roundId())
                .orElseThrow(ClubException.RoundNotFoundException::new);
        round.close(command.closedByUserId());
    }

    @Override
    public RecertificationRound getById(Long roundId) {
        return roundRepository.findById(roundId)
                .orElseThrow(ClubException.RoundNotFoundException::new);
    }

    @Override
    public Page<RecertificationRound> searchForAdmin(RoundAdminSearchCondition condition, Pageable pageable) {
        return roundRepository.searchForAdmin(condition, pageable);
    }
}
