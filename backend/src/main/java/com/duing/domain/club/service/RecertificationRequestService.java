package com.duing.domain.club.service;

import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.service.dto.command.CreateRecertificationCommand;
import com.duing.domain.club.service.dto.command.ProcessRecertificationCommand;
import com.duing.domain.club.service.dto.query.CentralClubRecertificationStatusQuery;
import com.duing.domain.club.service.dto.query.RecertificationAdminSearchCondition;
import com.duing.domain.club.service.dto.query.RecertificationRequestAdminDetailQuery;
import com.duing.domain.club.service.dto.query.RecertificationRequestAdminSummaryQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface RecertificationRequestService {
    Long create(CreateRecertificationCommand command);
    void process(ProcessRecertificationCommand command);
    RecertificationRequest getById(Long requestId);
    Page<CentralClubRecertificationStatusResponse> findCentralClubStatuses(
            CentralClubRecertificationStatusQuery query, Pageable pageable);

    /** 어드민 목록 조회 — 연관 엔티티 해석(삭제됨 fallback 포함) 후 Query DTO 를 반환한다. */
    Page<RecertificationRequestAdminSummaryQuery> listForAdmin(
            RecertificationAdminSearchCondition condition, Pageable pageable);

    /** 어드민 상세 조회 — 멤버·이력 조회 및 연관 엔티티 해석 후 Query DTO 를 반환한다. */
    RecertificationRequestAdminDetailQuery getDetailForAdmin(Long requestId);

    /** LEADER 모달용 컨텍스트 — 중앙동아리 여부·OPEN 라운드·PENDING 신청 1건을 한 번에 반환. */
    RecertificationContextResponse getLeaderContext(Long clubId);

    void rejectPendingOnClubClosure(Long clubId, Long actorAdminId, String reason);
}
