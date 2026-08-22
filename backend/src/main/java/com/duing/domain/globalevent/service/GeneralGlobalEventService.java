package com.duing.domain.globalevent.service;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.exception.GlobalEventException;
import com.duing.domain.globalevent.repository.GlobalEventRepository;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminDetailQuery;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
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
    private final UserRepository userRepository;
    private final Clock clock;

    @Override
    @Transactional
    public Long create(CreateGlobalEventCommand command) {
        GlobalEvent event = GlobalEvent.create(
                command.title(), command.description(),
                command.startAt(), command.endAt(),
                command.location(), command.linkUrl(),
                command.coverImageUrl(),
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
                command.coverImageUrl(), command.clearCoverImage());
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
        LocalDate today = LocalDate.now(clock);
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
    public GlobalEventAdminDetailQuery getAdmin(Long eventId) {
        GlobalEvent event = eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
        // created_by 는 users FK 지만 User 는 soft delete 라, 작성자가 탈퇴하면 물리 행이 남아도 빈 Optional 이 온다.
        // 즉 500 은 데이터 파손 외에 "탈퇴한 운영자가 만든 행사"에서도 난다 — 이관 전 동작을 그대로 두되,
        // promotion 의 resolveUserRef(orElse(null) + 삭제 라벨) 처럼 라벨로 낮추는 정합은 후속 후보다.
        User creator = userRepository.findById(event.getCreatedBy())
                .orElseThrow(() -> new IllegalStateException("global event creator missing: " + event.getCreatedBy()));
        return GlobalEventAdminDetailQuery.of(event, creator);
    }

    @Override
    public Map<GlobalEventCategory, Long> categoryStats() {
        return eventRepository.countByCategory();
    }
}
