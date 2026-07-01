package com.duing.domain.facility.repository;

import com.duing.domain.facility.entity.FacilityMonthSnapshot;
import java.time.YearMonth;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FacilityMonthSnapshotRepository extends JpaRepository<FacilityMonthSnapshot, Long> {

    Optional<FacilityMonthSnapshot> findByYearMonth(YearMonth yearMonth);
}
