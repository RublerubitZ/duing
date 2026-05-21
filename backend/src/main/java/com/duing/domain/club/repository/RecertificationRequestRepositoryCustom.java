package com.duing.domain.club.repository;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRequestRepositoryCustom {
    Page<RecertificationRequest> searchForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable);

    Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable);
}
