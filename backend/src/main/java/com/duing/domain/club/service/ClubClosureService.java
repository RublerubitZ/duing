package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.command.CloseClubCommand;

public interface ClubClosureService {
    void close(CloseClubCommand command);
}
