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

    /** 차등 반영의 비교 기준 — 한 시설의 대상 월 저장 행 전체를 영속 상태로 로드한다. */
    List<FacilityReservation> findByFacilityIdAndYearMonthIn(Long facilityId, Collection<YearMonth> yearMonths);

    /**
     * 차등 반영의 delete 단계 — 학교에서 사라진 행만 id 로 지운다. 삭제 대상이 없으면 호출하지 않으므로
     * 변경 없는 크롤에서는 이 문장이 아예 실행되지 않는다.
     * 영속성 컨텍스트는 비우지 않는다(clearAutomatically 미사용) — 같은 트랜잭션에서 diff 로 이미
     * 로드·수정한 행들이 detach 되어 UPDATE 가 유실되는 것을 막는다. 삭제 대상과 갱신 대상은 서로소다.
     */
    @Modifying
    @Query("DELETE FROM FacilityReservation r WHERE r.id IN :ids")
    void deleteByIdIn(@Param("ids") Collection<Long> ids);
}
