package com.duing.domain.facilitysubmission.repository;

import com.duing.domain.facilitysubmission.entity.FacilitySubmissionSequence;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FacilitySubmissionSequenceRepository extends JpaRepository<FacilitySubmissionSequence, LocalDate> {

    /** 채번 행 선삽입(§3) — 이미 있으면 무시. 이후 행잠금 SELECT 가 반드시 행을 찾게 보장한다. */
    @Modifying
    @Query(value = "INSERT INTO facility_submission_seq (seq_date, next_value) VALUES (:seqDate, 1) "
            + "ON CONFLICT (seq_date) DO NOTHING", nativeQuery = true)
    void insertIfAbsent(@Param("seqDate") LocalDate seqDate);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT sequence FROM FacilitySubmissionSequence sequence WHERE sequence.seqDate = :seqDate")
    Optional<FacilitySubmissionSequence> findBySeqDateForUpdate(@Param("seqDate") LocalDate seqDate);
}
