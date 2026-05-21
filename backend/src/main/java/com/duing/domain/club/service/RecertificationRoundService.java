package com.duing.domain.club.service;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRoundService {
    Long open(OpenRoundCommand command);
    void close(CloseRoundCommand command);
    RecertificationRound getById(Long roundId);
    Page<RecertificationRound> searchForAdmin(RoundAdminSearchCondition condition, Pageable pageable);
}
