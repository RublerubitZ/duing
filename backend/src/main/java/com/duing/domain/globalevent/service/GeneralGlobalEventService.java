package com.duing.domain.globalevent.service;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.exception.GlobalEventException;
import com.duing.domain.globalevent.repository.GlobalEventRepository;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralGlobalEventService implements GlobalEventService {

    private static final int DEFAULT_PAST_DAYS = 30;
    private static final int DEFAULT_FUTURE_DAYS = 180;
    private static final int MAX_WINDOW_DAYS = 400;

    private final GlobalEventRepository eventRepository;

    @Override
    @Transactional
    public Long create(CreateGlobalEventCommand command) {
        GlobalEvent event = GlobalEvent.create(
                command.title(), command.description(),
                command.startAt(), command.endAt(),
                command.location(), command.linkUrl(),
                null, // TODO: Task 3 에서 command.coverImageUrl()
                command.category(), command.createdBy()
        );
        return eventRepository.save(event).getId();
    }

    @Override
    @Transactional
    public void update(UpdateGlobalEventCommand command) {
        GlobalEvent event = eventRepository.findById(command.eventId())
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
        event.update(command.title(), command.description(),
                command.startAt(), command.endAt(),
                command.location(), command.linkUrl(),
                command.category(),
                null, null); // TODO: Task 3 에서 command.coverImageUrl(), command.clearCoverImage()
    }

    @Override
    @Transactional
    public void delete(Long eventId) {
        GlobalEvent event = eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
        eventRepository.delete(event);
    }

    @Override
    public List<GlobalEvent> listPublicWindow(LocalDate from, LocalDate to, GlobalEventCategory category) {
        LocalDate today = LocalDate.now();
        LocalDate fromDate = from != null ? from : today.minusDays(DEFAULT_PAST_DAYS);
        LocalDate toDate = to != null ? to : today.plusDays(DEFAULT_FUTURE_DAYS);
        if (toDate.isBefore(fromDate)) {
            throw new GlobalEventException.InvalidWindowException();
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_WINDOW_DAYS) {
            throw new GlobalEventException.InvalidWindowException();
        }
        LocalDateTime fromTs = fromDate.atStartOfDay();
        LocalDateTime toTs = toDate.atTime(LocalTime.MAX);
        return eventRepository.findWindow(fromTs, toTs, category);
    }

    @Override
    public GlobalEvent getPublic(Long eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
    }

    @Override
    public Page<GlobalEvent> listAdmin(GlobalEventAdminSearchCondition condition, Pageable pageable) {
        return eventRepository.findAdminList(condition, pageable);
    }

    @Override
    public GlobalEvent getAdmin(Long eventId) {
        return eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
    }

    @Override
    public Map<GlobalEventCategory, Long> categoryStats() {
        return eventRepository.countByCategory();
    }
}
