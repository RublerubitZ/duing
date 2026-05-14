package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    boolean existsByRecruitmentIdAndUserId(Long recruitmentId, Long userId);

    List<Application> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<Application> findByRecruitmentIdOrderByCreatedAtAsc(Long recruitmentId);
}