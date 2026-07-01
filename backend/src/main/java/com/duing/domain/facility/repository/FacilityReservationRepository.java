package com.duing.domain.facility.repository;

import com.duing.domain.facility.entity.FacilityReservation;
import java.time.YearMonth;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilityReservationRepository extends JpaRepository<FacilityReservation, Long> {

    /** 이용현황 조립용 — 여러 시설의 특정 월 예약을 한 번에 로드한다. */
    List<FacilityReservation> findByFacilityIdInAndYearMonth(Collection<Long> facilityIds, YearMonth yearMonth);

    /** 특정 시설의 특정 월 예약(디버깅·테스트). */
    List<FacilityReservation> findByFacilityIdAndYearMonth(Long facilityId, YearMonth yearMonth);

    /**
     * 원자적 스냅샷 교체의 delete 단계. JPQL 이므로 YearMonth 컨버터가 파라미터에 적용된다(네이티브 금지).
     * clearAutomatically 로 영속성 컨텍스트를 비워 직후 insert 와의 불일치를 방지한다.
     */
    @Modifying(clearAutomatically = true)
    @Query("""
            DELETE FROM FacilityReservation r
            WHERE r.facilityId = :facilityId
              AND r.yearMonth IN :yearMonths
            """)
    void deleteByFacilityIdAndYearMonthIn(@Param("facilityId") Long facilityId,
                                          @Param("yearMonths") Collection<YearMonth> yearMonths);
}
