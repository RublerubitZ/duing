package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;

public interface AdminLeaderAssignmentService {
    void assign(AssignLeaderByAdminCommand command);
}
