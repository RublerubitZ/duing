package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /**
     * 라운드 생성 시 대상 지원서 행을 잠가 동시 생성 race 를 직렬화한다 (스펙 §7).
     * ORDER BY id 고정으로 잠금 획득 순서를 일관시켜 교착을 방지한다.
     * <p>
     * FORCE_INCREMENT 인 이유: 전이 없이 멤버십만 생기는 후보(INTERVIEW_PENDING 재수용)는
     * 더티 체킹이 없어 version 이 오르지 않는데, 그 사이 잠금 없이 @Version 만 쓰는
     * updateStatus 가 끼어들면 "합격 처리된 지원자가 활성 멤버십 보유" 불일치가 생긴다.
     * version 강제 증가로 동시 상태 전이가 커밋 시 낙관적 충돌(409)로 떨어지게 한다 (스펙 §16-7).
     */
    @Lock(LockModeType.PESSIMISTIC_FORCE_INCREMENT)
    @Query("SELECT a FROM Application a WHERE a.id IN :ids ORDER BY a.id ASC")
    List<Application> findAllByIdInForUpdate(@Param("ids") Collection<Long> ids);

    @Query("SELECT a FROM Application a JOIN FETCH a.recruitment r "
            + "WHERE r.id IN :recruitmentIds AND a.status IN :statuses")
    List<Application> findByRecruitmentIdInAndStatusIn(
            @Param("recruitmentIds") Collection<Long> recruitmentIds,
            @Param("statuses") Collection<ApplicationStatus> statuses);
}
