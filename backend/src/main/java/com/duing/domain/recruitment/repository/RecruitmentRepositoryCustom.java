package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface RecruitmentRepositoryCustom {

    List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd);

    List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId);

    /**
     * 활성 모집(status=OPEN && deleted_at IS NULL && (end_date IS NULL OR end_date >= today)) 존재 여부.
     */
    boolean existsActiveByClubId(Long clubId);

    /**
     * 활성 모집 1건 조회. 비정상 케이스로 여러 건이면 startDate ASC, id ASC tie-break.
     */
    Optional<Recruitment> findActiveByClubId(Long clubId);
}
