package com.duing.domain.globalevent.service;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.command.CreateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.command.UpdateGlobalEventCommand;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminDetailQuery;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface GlobalEventService {

    Long create(CreateGlobalEventCommand command);

    void update(UpdateGlobalEventCommand command);

    void delete(Long eventId);

    List<GlobalEvent> listPublicWindow(LocalDate from, LocalDate to, GlobalEventCategory category);

    GlobalEvent getPublic(Long eventId);

    Page<GlobalEvent> listAdmin(GlobalEventAdminSearchCondition condition, Pageable pageable);

    /** 어드민 상세 — 작성자까지 합쳐서 내려준다. */
    GlobalEventAdminDetailQuery getAdmin(Long eventId);

    Map<GlobalEventCategory, Long> categoryStats();
}
