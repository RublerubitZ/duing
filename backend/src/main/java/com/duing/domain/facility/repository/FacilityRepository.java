package com.duing.domain.facility.repository;

import com.duing.domain.facility.entity.Facility;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilityRepository extends JpaRepository<Facility, Long> {

    /** 활성(미아카이브) 시설을 노출 순서대로 조회한다(공개 API·수집 대상). */
    List<Facility> findByArchivedAtIsNullOrderBySortOrderAsc();

    /** reconcile 시 room_seq 로 기존 시설(아카이브 포함)을 찾는다. */
    Optional<Facility> findByRoomSeq(Integer roomSeq);

    /** 승인·확정 전이의 시설 단위 직렬화(설계 §5.2·§7.3) — BankTransactionRepository 전례. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT f FROM Facility f WHERE f.id = :facilityId")
    Optional<Facility> findByIdForUpdate(@Param("facilityId") Long facilityId);
}
