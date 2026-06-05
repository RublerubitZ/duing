package com.duing.domain.globalevent.repository;

import com.duing.domain.globalevent.entity.GlobalEvent;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GlobalEventRepository extends JpaRepository<GlobalEvent, Long>, GlobalEventRepositoryCustom {

    @Query("""
        SELECT event FROM GlobalEvent event
        WHERE event.startAt <= :to
          AND event.endAt   >= :from
        ORDER BY event.startAt ASC
    """)
    List<GlobalEvent> findWindow(@Param("from") LocalDateTime from,
                                 @Param("to") LocalDateTime to);
}
