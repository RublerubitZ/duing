package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
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
     * 인가 확인용 경량 조회 — 지원자(User) 등 상세 데이터를 로드하지 않고 소속 동아리 ID 만 가져온다.
     * 비인가 요청에서 전화번호 등 민감 데이터를 메모리에 올리지 않도록, 상세 페치보다 먼저 호출한다.
     * recruitment·club 을 명시적으로 inner join 해 {@link #findWithRecruitmentAndClubById} 와 동일하게
     * soft-delete(@SQLRestriction) 된 모집/동아리를 걸러 두 조회의 가시성을 일치시킨다.
     */
    @Query("SELECT c.id FROM Application a JOIN a.recruitment r JOIN r.club c WHERE a.id = :applicationId")
    Optional<Long> findClubIdByApplicationId(@Param("applicationId") Long applicationId);

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

    /**
     * 보관기간을 넘긴 soft-delete 지원서의 자유서술 답변(jsonb)을 비운다(이미 빈 답변은 제외 — 멱등).
     * 대상이 soft-delete 행이라 @SQLRestriction 을 우회하려 nativeQuery 를 쓴다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "UPDATE application SET answers = '[]'::jsonb WHERE deleted_at < :cutoff AND answers <> '[]'::jsonb",
            nativeQuery = true)
    int scrubExpiredApplicationAnswers(@Param("cutoff") LocalDateTime cutoff);

    /**
     * 마감 6개월(closedCutoffDate) 또는 탈퇴 45일(withdrawnCutoff)이 지난 지원서의 자유서술(TEXT) 답변을 placeholder 로
     * 치환한다(스펙 §3.2). 답변 원소에는 유형이 없어 recruitment_form.questions 와 questionId 로 조인한다 — 매칭되지
     * 않거나 questionId 가 null 인 답변은 자유서술 가능성이 있어 TEXT 로 간주한다. 선택형(choiceId)·무응답([] / [""])은
     * 유지한다. 이미 파기된 행(answers_purged_at IS NOT NULL)과 soft-delete 행(기존 45일 규칙이 전체를 비움)은 제외한다.
     * 마감 앵커 LEAST(closed_at::date, end_date) 는 NULL 을 무시하고 둘 다 NULL 이면 NULL 이라 비교가 false(스킵)다.
     * version+1 은 @DynamicUpdate 가 없는 Application 의 전 컬럼 UPDATE(동시 최종 확정·지원 취소)가 파기 전 answers 를
     * 되살리지 못하게 한다 — 상대는 OptimisticLock(409)으로 실패한다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE application a
               SET answers = (
                     SELECT COALESCE(jsonb_agg(
                                CASE WHEN COALESCE(question.qtype, 'TEXT') = 'TEXT'
                                      AND jsonb_array_length(answer.elem -> 'values') > 0
                                      AND (answer.elem -> 'values' ->> 0) <> ''
                                     THEN jsonb_set(answer.elem, ARRAY['values'], jsonb_build_array(CAST(:placeholder AS text)))
                                     ELSE answer.elem END
                                ORDER BY answer.ord), '[]'::jsonb)
                       FROM jsonb_array_elements(a.answers) WITH ORDINALITY AS answer(elem, ord)
                       LEFT JOIN LATERAL (
                            SELECT question_element ->> 'type' AS qtype
                              FROM recruitment_form form, jsonb_array_elements(form.questions) question_element
                             WHERE form.recruitment_id = a.recruitment_id
                               AND question_element ->> 'id' = answer.elem ->> 'questionId'
                             LIMIT 1) question ON TRUE),
                   answers_purged_at = NOW(),
                   version = version + 1
              FROM recruitment r, users u
             WHERE r.id = a.recruitment_id AND u.id = a.user_id
               AND a.answers_purged_at IS NULL
               AND a.deleted_at IS NULL
               AND (LEAST(r.closed_at::date, r.end_date) < :closedCutoffDate
                    OR u.deleted_at < :withdrawnCutoff)
            """, nativeQuery = true)
    int purgeExpiredTextAnswers(@Param("closedCutoffDate") LocalDate closedCutoffDate,
                                @Param("withdrawnCutoff") LocalDateTime withdrawnCutoff,
                                @Param("placeholder") String placeholder);
}
