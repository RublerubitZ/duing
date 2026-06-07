package com.duing.domain.applicationEvaluation.repository;

import com.duing.domain.applicationEvaluation.entity.ApplicationEvaluation;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationEvaluationRepository extends JpaRepository<ApplicationEvaluation, Long> {

    Optional<ApplicationEvaluation> findByApplicationIdAndEvaluatorId(Long applicationId, Long evaluatorId);

    @Query("SELECT e FROM ApplicationEvaluation e "
            + "JOIN FETCH e.evaluator "
            + "WHERE e.application.id = :applicationId "
            + "ORDER BY e.createdAt DESC")
    List<ApplicationEvaluation> findByApplicationIdWithEvaluator(@Param("applicationId") Long applicationId);
}
