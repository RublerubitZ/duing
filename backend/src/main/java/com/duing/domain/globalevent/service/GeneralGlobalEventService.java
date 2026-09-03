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
import com.duing.global.file.UploadedObjectService;
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
    private final UploadedObjectService uploadedObjectService;

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
        Long eventId = eventRepository.save(event).getId();
        uploadedObjectService.activate(command.coverImageUrl());
        return eventId;
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
        uploadedObjectService.activate(command.coverImageUrl());
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

    /**
     * 어드민 상세 — 행사에 작성자를 합쳐 내려준다.
     *
     * <p>created_by 는 users FK 지만 User 는 soft delete 라, 작성자가 탈퇴하면 물리 행이 남아도 빈 Optional 이 온다.
     * 예전에는 여기서 {@code IllegalStateException} 을 던져 "탈퇴한 운영자가 만든 행사"의 상세·수정 화면이 통째로
     * 500 이 됐다. promotion 의 {@code resolveUserRef} 와 같은 의미론으로 낮춰, 이름 자리만 삭제 라벨로 채운다.
     *
     * <p>빈 Optional 이 탈퇴인지 데이터 파손인지 구분할 수단은 이 조회에 애초에 없다(둘 다 "행이 안 잡힌다"로만
     * 관측된다). 그래서 파손 케이스도 같은 라벨로 수렴시킨다 — 구분되지 않는 두 상태를 다르게 다루는 척하는 대신,
     * 조회는 열어 두고 나머지 필드를 그대로 보여주는 쪽을 택했다.
     */
    @Override
    public GlobalEventAdminDetailQuery getAdmin(Long eventId) {
        GlobalEvent event = eventRepository.findById(eventId)
                .orElseThrow(GlobalEventException.GlobalEventNotFoundException::new);
        User creator = userRepository.findById(event.getCreatedBy()).orElse(null);
        return GlobalEventAdminDetailQuery.of(event, creator);
    }

    @Override
    public Map<GlobalEventCategory, Long> categoryStats() {
        return eventRepository.countByCategory();
    }
}
