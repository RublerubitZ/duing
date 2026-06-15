package com.duing.domain.application.repository;

import com.duing.domain.application.entity.ApplicationStatusHistory;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationStatusHistoryRepository
        extends JpaRepository<ApplicationStatusHistory, Long> {

    /** newest-first. changedBy fetch join 으로 N+1 방지. */
    @Query("SELECT h FROM ApplicationStatusHistory h "
            + "JOIN FETCH h.changedBy "
            + "WHERE h.application.id = :applicationId "
            + "ORDER BY h.createdAt DESC")
    List<ApplicationStatusHistory> findByApplicationIdOrderByCreatedAtDesc(
            @Param("applicationId") Long applicationId);
}
