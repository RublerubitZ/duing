package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.clubmember.service.dto.query.ClubMemberHistoryAdminQuery;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestAdminDetailQuery;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestAdminSummaryQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface LeaderSuccessionService {
    Long create(CreateSuccessionCommand command);
    void process(ProcessSuccessionCommand command);
    LeaderSuccessionRequest getById(Long requestId);
    Page<LeaderSuccessionRequest> searchForAdmin(SuccessionAdminSearchCondition condition, Pageable pageable);

    Page<SuccessionRequestAdminSummaryQuery> listForAdmin(SuccessionAdminSearchCondition condition, Pageable pageable);
    SuccessionRequestAdminDetailQuery getDetailForAdmin(Long requestId);
    Page<ClubMemberHistoryAdminQuery> listMemberHistoryForAdmin(Long clubId, Pageable pageable);
}
