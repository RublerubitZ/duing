package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    boolean existsByRecruitmentIdAndUserId(Long recruitmentId, Long userId);

    long countByRecruitmentId(Long recruitmentId);

    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.recruitment r "
            + "JOIN FETCH r.club "
            + "WHERE a.user.id = :userId "
            + "ORDER BY a.createdAt DESC")
    List<Application> findByUserIdOrderByCreatedAtDesc(@Param("userId") Long userId);

    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.recruitment r "
            + "JOIN FETCH r.club "
            + "WHERE a.user.id = :userId "
            + "  AND a.status IN :statuses "
            + "ORDER BY a.createdAt DESC")
    List<Application> findByUserIdAndStatusInOrderByCreatedAtDesc(
            @Param("userId") Long userId,
            @Param("statuses") Set<ApplicationStatus> statuses);

    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.user "
            + "WHERE a.recruitment.id = :recruitmentId "
            + "ORDER BY a.createdAt ASC")
    List<Application> findByRecruitmentIdOrderByCreatedAtAsc(@Param("recruitmentId") Long recruitmentId);

    /**
     * 지원자 상세 조회용 페치 조인.
     * recruitment → club, recruitment → form(nullable) 을 한 번에 로드해 N+1 을 방지한다.
     */
    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.recruitment r "
            + "JOIN FETCH r.club "
            + "JOIN FETCH a.user "
            + "LEFT JOIN FETCH r.form "
            + "WHERE a.id = :applicationId")
    Optional<Application> findWithRecruitmentAndClubById(@Param("applicationId") Long applicationId);

    /**
     * 면접 리마인더 잡용 조회.
     * interviewAt 이 주어진 윈도 안에 있고, 상태가 INTERVIEW_PENDING 인 지원 목록을 반환한다.
     */
    @Query("""
            select a from Application a
             where a.status = com.duing.domain.application.entity.ApplicationStatus.INTERVIEW_PENDING
               and a.interviewAt between :start and :end
               and a.deletedAt is null
            """)
    List<Application> findInterviewBetween(@Param("start") LocalDateTime start,
                                           @Param("end") LocalDateTime end);
}
