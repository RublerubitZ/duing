package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewConfig;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewConfigRepository extends JpaRepository<InterviewConfig, Long> {

    Optional<InterviewConfig> findByRecruitmentId(Long recruitmentId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM InterviewConfig c WHERE c.recruitmentId = :recruitmentId")
    Optional<InterviewConfig> findByRecruitmentIdForUpdate(@Param("recruitmentId") Long recruitmentId);

    boolean existsByRecruitmentId(Long recruitmentId);
}
