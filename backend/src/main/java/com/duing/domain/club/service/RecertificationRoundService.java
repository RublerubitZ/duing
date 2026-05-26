package com.duing.domain.club.service;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.service.dto.command.CloseRoundCommand;
import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import com.duing.domain.club.service.dto.query.RecertificationRoundAdminListQuery;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRoundService {
    Long open(OpenRoundCommand command);
    void close(CloseRoundCommand command);
    RecertificationRound getById(Long roundId);

    /** 어드민 목록 조회 — 개설자·마감자 User 해석(삭제됨 fallback 포함) 후 Query DTO 를 반환한다. */
    Page<RecertificationRoundAdminListQuery> listForAdmin(RoundAdminSearchCondition condition, Pageable pageable);
}
