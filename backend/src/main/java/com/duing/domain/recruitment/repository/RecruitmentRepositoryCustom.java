package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import java.util.List;

public interface RecruitmentRepositoryCustom {

    List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd);

    List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId);
}
