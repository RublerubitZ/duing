package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface LeaderSuccessionService {
    Long create(CreateSuccessionCommand command);
    void process(ProcessSuccessionCommand command);
    LeaderSuccessionRequest getById(Long requestId);
    Page<LeaderSuccessionRequest> searchForAdmin(SuccessionAdminSearchCondition condition, Pageable pageable);
}
