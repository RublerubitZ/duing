package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubService {

    Long create(CreateClubCommand createClubCommand);

    Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable);

    ClubDetailQuery getById(Long clubId);

    void update(UpdateClubCommand updateClubCommand);

    void updateStatus(UpdateClubStatusCommand updateClubStatusCommand);
}
