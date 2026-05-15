package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    boolean existsByRecruitmentIdAndUserId(Long recruitmentId, Long userId);

    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.recruitment r "
            + "JOIN FETCH r.club "
            + "WHERE a.user.id = :userId "
            + "ORDER BY a.createdAt DESC")
    List<Application> findByUserIdOrderByCreatedAtDesc(@Param("userId") Long userId);

    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.user "
            + "WHERE a.recruitment.id = :recruitmentId "
            + "ORDER BY a.createdAt ASC")
    List<Application> findByRecruitmentIdOrderByCreatedAtAsc(@Param("recruitmentId") Long recruitmentId);
}