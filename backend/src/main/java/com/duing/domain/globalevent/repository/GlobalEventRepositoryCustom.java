package com.duing.domain.globalevent.repository;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminSearchCondition;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface GlobalEventRepositoryCustom {

    Page<GlobalEvent> findAdminList(GlobalEventAdminSearchCondition condition, Pageable pageable);

    Map<GlobalEventCategory, Long> countByCategory();
}
