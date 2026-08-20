package com.duing.domain.clubevent.service;

import com.duing.domain.clubevent.controller.dto.response.AdminClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventCardResponse;
import com.duing.domain.clubevent.controller.dto.response.ClubEventDetailResponse;
import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.clubevent.exception.ClubEventException;
import com.duing.domain.clubevent.repository.ClubEventRepository;
import com.duing.domain.clubevent.service.dto.command.CreateClubEventCommand;
import com.duing.domain.clubevent.service.dto.command.UpdateClubEventCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubEventService implements ClubEventService {

    private static final int DEFAULT_PAST_DAYS = 30;
    private static final int DEFAULT_FUTURE_DAYS = 180;
    private static final int MAX_WINDOW_DAYS = 400;

    private final ClubEventRepository eventRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    @Override
    @Transactional
    public Long create(CreateClubEventCommand command) {
        ClubEvent event = ClubEvent.create(
                command.clubId(), command.title(), command.description(),
                command.startAt(), command.endAt(), command.location(),
                command.createdBy()
        );
        return eventRepository.save(event).getId();
    }

    @Override
    @Transactional
    public void update(UpdateClubEventCommand command) {
        ClubEvent event = eventRepository.findById(command.eventId())
                .orElseThrow(ClubEventException.ClubEventNotFoundException::new);
        if (!event.getClubId().equals(command.clubId())) {
            throw new ClubEventException.CrossClubAccessException();
        }
        event.update(command.title(), command.description(),
                command.startAt(), command.endAt(), command.location());
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long eventId) {
        ClubEvent event = eventRepository.findById(eventId)
                .orElseThrow(ClubEventException.ClubEventNotFoundException::new);
        if (!event.getClubId().equals(clubId)) {
            throw new ClubEventException.CrossClubAccessException();
        }
        eventRepository.delete(event);
    }

    @Override
    public List<ClubEventCardResponse> listWindow(Long clubId, LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock);
        LocalDate fromDate = from != null ? from : today.minusDays(DEFAULT_PAST_DAYS);
        LocalDate toDate   = to   != null ? to   : today.plusDays(DEFAULT_FUTURE_DAYS);
        if (toDate.isBefore(fromDate)) {
            throw new ClubEventException.InvalidWindowException();
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
            throw new ClubEventException.InvalidWindowException();
        }
        LocalDateTime fromTs = fromDate.atStartOfDay();
        LocalDateTime toTs   = toDate.atTime(LocalTime.MAX);
        return eventRepository.findWindow(clubId, fromTs, toTs).stream()
                .map(ClubEventCardResponse::from)
                .toList();
    }

    @Override
    public List<AdminClubEventCardResponse> listWindowForAdmin(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock);
        LocalDate fromDate = from != null ? from : today.minusDays(DEFAULT_PAST_DAYS);
        LocalDate toDate   = to   != null ? to   : today.plusDays(DEFAULT_FUTURE_DAYS);
        if (toDate.isBefore(fromDate)) {
            throw new ClubEventException.InvalidWindowException();
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
            throw new ClubEventException.InvalidWindowException();
        }
        LocalDateTime fromTs = fromDate.atStartOfDay();
        LocalDateTime toTs   = toDate.atTime(LocalTime.MAX);
        return eventRepository.findWindowAllClubs(fromTs, toTs).stream()
                .map(AdminClubEventCardResponse::from)
                .toList();
    }

    @Override
    @Transactional
    public void removeAllOnClubClosure(Long clubId) {
        eventRepository.deleteAll(eventRepository.findAllByClubId(clubId));
    }

    @Override
    public ClubEventDetailResponse getDetail(Long clubId, Long eventId) {
        ClubEvent event = eventRepository.findById(eventId)
                .orElseThrow(ClubEventException.ClubEventNotFoundException::new);
        if (!event.getClubId().equals(clubId)) {
            throw new ClubEventException.CrossClubAccessException();
        }
        User creator = userRepository.findById(event.getCreatedBy())
                .orElseThrow(() -> new IllegalStateException("event creator missing: " + event.getCreatedBy()));
        return ClubEventDetailResponse.from(event, creator);
    }
}
