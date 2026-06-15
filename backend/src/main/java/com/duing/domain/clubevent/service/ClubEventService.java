package com.duing.domain.clubevent.service;

import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.domain.clubevent.service.dto.command.CreateClubEventCommand;
import com.duing.domain.clubevent.service.dto.command.UpdateClubEventCommand;
import java.time.LocalDate;
import java.util.List;

public interface ClubEventService {
    Long create(CreateClubEventCommand command);
    void update(UpdateClubEventCommand command);
    void delete(Long clubId, Long eventId);
    List<ClubEventCardResponse> listWindow(Long clubId, LocalDate from, LocalDate to);
    ClubEventDetailResponse getDetail(Long clubId, Long eventId);

    void removeAllOnClubClosure(Long clubId);
}
