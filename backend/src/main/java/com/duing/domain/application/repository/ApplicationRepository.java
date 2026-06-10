package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ApplicationRepository extends JpaRepository<Application, Long>, ApplicationRepositoryCustom {

    boolean existsByRecruitmentIdAndUserId(Long recruitmentId, Long userId);

    long countByRecruitmentId(Long recruitmentId);

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
     * 배치 잡 등에서 다건 페치 조인 조회용. {@link #findWithRecruitmentAndClubById} 의 plural 버전으로,
     * recruitment → club, user, recruitment → form(nullable) 을 한 번에 로드해 N+1 을 방지한다.
     */
    @Query("SELECT a FROM Application a "
            + "JOIN FETCH a.recruitment r "
            + "JOIN FETCH r.club "
            + "JOIN FETCH a.user "
            + "LEFT JOIN FETCH r.form "
            + "WHERE a.id IN :applicationIds")
    List<Application> findAllWithRecruitmentAndClubByIdIn(@Param("applicationIds") Collection<Long> applicationIds);

    /**
     * 자동배정용 — 특정 모집의 특정 상태 지원자 전체 조회. user fetch join 으로 N+1 방지.
     */
    @Query("SELECT a FROM Application a JOIN FETCH a.user WHERE a.recruitment.id = :recruitmentId AND a.status = :status")
    List<Application> findByRecruitmentIdAndStatus(
            @Param("recruitmentId") Long recruitmentId,
            @Param("status") ApplicationStatus status);
}
