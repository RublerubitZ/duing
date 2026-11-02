package com.duing.domain.report.repository;

import com.duing.domain.report.entity.Report;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReportRepository extends JpaRepository<Report, Long>, ReportRepositoryCustom {

    Optional<Report> findByReporterIdAndTargetTypeAndTargetIdAndStatus(
            Long reporterId, ReportTargetType targetType, Long targetId, ReportStatus status);

    // 관리자 콘솔 미처리 건수 — derived query 라 @SQLRestriction(soft delete 제외) 이 자동 적용된다.
    long countByStatus(ReportStatus status);

    /** 처리 대기 추이 — 최근 접수(감사 created_at, system regime). */
    long countByCreatedAtGreaterThanEqual(LocalDateTime since);

    /** 처리 대기 추이 — 최근 처리(해결·기각 handled_at, 무클럭 now() = system regime). */
    long countByHandledAtGreaterThanEqual(LocalDateTime since);

    /** 주간 브리핑 — 기간 접수(감사 created_at, system regime). from 포함·to 미만. */
    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);

    /** 주간 브리핑 — 기간 처리(해결·기각 handled_at, 무클럭 now() = system regime). from 포함·to 미만. */
    long countByHandledAtGreaterThanEqualAndHandledAtLessThan(LocalDateTime from, LocalDateTime to);
}
