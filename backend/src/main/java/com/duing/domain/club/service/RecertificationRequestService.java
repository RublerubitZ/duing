package com.duing.domain.club.service;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRequestService {
    Long create(CreateRecertificationCommand command);
    void process(ProcessRecertificationCommand command);
    RecertificationRequest getById(Long requestId);
    Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable);
    Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable);
}
