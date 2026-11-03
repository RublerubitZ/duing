package com.duing.domain.interview.repository;

import com.duing.domain.interview.entity.InterviewAvailability;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InterviewAvailabilityRepository
        extends JpaRepository<InterviewAvailability, Long>, InterviewAvailabilityRepositoryCustom {

    long countByApplicationId(Long applicationId);

    long countBySlotId(Long slotId);

    List<InterviewAvailability> findByApplicationId(Long applicationId);

    List<InterviewAvailability> findByRoundIdAndApplicationId(Long roundId, Long applicationId);

    List<InterviewAvailability> findByRoundId(Long roundId);

    /** 응답 upsert — 라운드 한정 전체 교체의 삭제 단계 (V46 partial unique 패턴으로 재삽입 허용). */
    @Modifying(clearAutomatically = true)
    @Query("UPDATE InterviewAvailability a SET a.deletedAt = CURRENT_TIMESTAMP "
            + "WHERE a.roundId = :roundId AND a.applicationId = :applicationId AND a.deletedAt IS NULL")
    void softDeleteByRoundIdAndApplicationId(@Param("roundId") Long roundId,
                                             @Param("applicationId") Long applicationId);

    /**
     * 회원 탈퇴 정리용(#1637) — 위와 같은 삭제지만 영속성 컨텍스트를 비우지 않는다. 탈퇴 트랜잭션에는 아직 flush 되지
     * 않은 변경(동아리 멤버십 정리, 이 정리가 바꾼 멤버 상태)이 있어 비우면 사라진다. 이 트랜잭션은 availability 를
     * 로드하지 않아 비울 필요도 없다.
     */
    @Modifying
    @Query("UPDATE InterviewAvailability a SET a.deletedAt = CURRENT_TIMESTAMP "
            + "WHERE a.roundId = :roundId AND a.applicationId = :applicationId AND a.deletedAt IS NULL")
    void softDeleteByRoundIdAndApplicationIdKeepingContext(@Param("roundId") Long roundId,
                                                           @Param("applicationId") Long applicationId);
}
