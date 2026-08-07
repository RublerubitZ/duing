package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.UserClubMembershipQuery;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubMemberRepository extends JpaRepository<ClubMember, Long>, ClubMemberRepositoryCustom {

    Optional<ClubMember> findByClubIdAndUserId(Long clubId, Long userId);

    /**
     * User 를 JOIN FETCH 해 LEADER 의 user 정보를 트랜잭션 밖에서도 안전하게 사용할 수 있게 한다.
     * V31 unique partial index 로 LEADER 행은 0-1건이 보장되지만, JPQL 에 LIMIT 1 을 명시해
     * 제약이 흔들리거나 비-LEADER 역할로 호출돼도 NonUniqueResultException 이 나지 않도록 방어한다.
     */
    @Query("""
            SELECT cm FROM ClubMember cm
            JOIN FETCH cm.user
            WHERE cm.club.id = :clubId AND cm.role = :role
            ORDER BY cm.createdAt ASC
            LIMIT 1
            """)
    Optional<ClubMember> findFirstByClubIdAndRole(@Param("clubId") Long clubId, @Param("role") ClubMemberRole role);

    boolean existsByClubIdAndUserId(Long clubId, Long userId);

    /** 사용자가 (활성) 동아리 회장인지 — 탈퇴 차단 등에 사용. @SQLRestriction 으로 soft-delete 행은 제외된다. */
    boolean existsByUserIdAndRole(Long userId, ClubMemberRole role);

    /**
     * 동아리 멤버 전체 조회. LEADER → OFFICER → MEMBER 순, 그룹 내 createdAt(joinedAt) 오름차순.
     * User 를 JOIN FETCH 해 N+1 을 회피한다.
     */
    @Query("""
            SELECT cm FROM ClubMember cm
            JOIN FETCH cm.user u
            WHERE cm.club.id = :clubId
            ORDER BY
                CASE cm.role WHEN 'LEADER' THEN 0 WHEN 'OFFICER' THEN 1 ELSE 2 END ASC,
                cm.createdAt ASC
            """)
    List<ClubMember> findAllByClubIdOrderedByRoleAndJoinedAt(@Param("clubId") Long clubId);

    /**
     * 원본 연락처 조회와 운영 명령(역할 변경·기수 변경·강퇴·인계 대상 검증)의 공용 조회 —
     * clubId 스코프 검증과 User 로딩을 한 쿼리로 끝낸다. 소비자가 둘이므로 연락처 기준으로만
     * 손대면(필요 컬럼 프로젝션·JOIN FETCH 제거) 탈퇴 회원 조작 차단이 조용히 풀린다.
     * JOIN FETCH(INNER)라 탈퇴(User soft-delete)로 남은 비-LEADER 잔존 행은 결과에서 빠져 404 로 수렴한다.
     * findById 로 읽으면 user 프록시 초기화가 실패해 500 이 되므로 이 경로를 반드시 쓴다.
     * 타 동아리 memberId 도 조건 불일치로 빈 Optional 이 돼 미존재와 구분되지 않는다.
     *
     * <p>탈퇴 회원 제외가 조인 ON 절의 @SQLRestriction 에 기대고 있어 Hibernate 동작이 바뀌면 뚫린다.
     * 조건을 중복으로 적는 대신 테스트로 고정했다 — ClubMemberCommandServiceTest 의 탈퇴 회원 케이스와
     * ClubMemberPhoneControllerTest 가 깨지므로 조용히 회귀하지 않는다.
     */
    @Query("""
            SELECT cm FROM ClubMember cm
            JOIN FETCH cm.user
            WHERE cm.club.id = :clubId AND cm.id = :memberId
            """)
    Optional<ClubMember> findByClubIdAndIdWithUser(@Param("clubId") Long clubId,
                                                   @Param("memberId") Long memberId);

    /**
     * 회장 인계 등 동시성이 중요한 변경에서 행 잠금 후 조회한다 (PESSIMISTIC_WRITE).
     * @SQLRestriction(deleted_at IS NULL) 가 JPQL 에 자동 적용된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cm FROM ClubMember cm WHERE cm.id = :id")
    Optional<ClubMember> findByIdForUpdate(@Param("id") Long id);

    /**
     * 특정 동아리·역할의 멤버를 행 잠금 후 조회한다. 회장 인계 시 LEADER 행을 잠그는 용도.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cm FROM ClubMember cm WHERE cm.club.id = :clubId AND cm.role = :role")
    Optional<ClubMember> findByClubIdAndRoleForUpdate(@Param("clubId") Long clubId,
                                                      @Param("role") ClubMemberRole role);

    /**
     * 특정 동아리·사용자의 멤버를 행 잠금 후 조회한다. 후임자 OFFICER → LEADER 승격 시 사용.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cm FROM ClubMember cm WHERE cm.club.id = :clubId AND cm.user.id = :userId")
    Optional<ClubMember> findByClubIdAndUserIdForUpdate(@Param("clubId") Long clubId,
                                                        @Param("userId") Long userId);

    /** 공지 뷰어 스코프 전용 — 비 ACTIVE 동아리는 내부 공지 가시성에서 제외한다 (스펙 Part B). */
    @Query("""
            SELECT cm.club.id FROM ClubMember cm
            WHERE cm.user.id = :userId
              AND cm.club.status = com.duing.domain.club.entity.ClubStatus.ACTIVE
            """)
    List<Long> findClubIdsByUserId(@Param("userId") Long userId);

    /** 공지 뷰어 스코프 전용 — 비 ACTIVE 동아리는 내부 공지 가시성에서 제외한다 (스펙 Part B). */
    @Query("""
            SELECT cm.club.id FROM ClubMember cm
            WHERE cm.user.id = :userId AND cm.role IN ('LEADER','OFFICER')
              AND cm.club.status = com.duing.domain.club.entity.ClubStatus.ACTIVE
            """)
    List<Long> findOfficerClubIdsByUserId(@Param("userId") Long userId);

    /**
     * 회원이 가입한 동아리 목록(총동연 회원 상세용). 기존 findClubIdsByUserId 는 id 만 반환해 재사용할 수 없다.
     * 가입일은 멤버십 행의 생성 시각이다.
     * 같은 시각에 만들어진 멤버십의 순서가 흔들리지 않도록 id 를 타이브레이커로 둔다.
     */
    @Query("""
            SELECT new com.duing.domain.clubmember.service.dto.query.UserClubMembershipQuery(
                       cm.club.id, cm.club.name, cm.role, cm.createdAt)
            FROM ClubMember cm
            WHERE cm.user.id = :userId
            ORDER BY cm.createdAt DESC, cm.id DESC
            """)
    List<UserClubMembershipQuery> findClubMembershipsByUserId(@Param("userId") Long userId);

    @Query("SELECT DISTINCT cm.user.id FROM ClubMember cm WHERE cm.club.id IN :clubIds")
    List<Long> findUserIdsByClubIdIn(@Param("clubIds") Collection<Long> clubIds);

    @Query("""
            SELECT DISTINCT cm.user.id FROM ClubMember cm
            WHERE cm.club.id IN :clubIds AND cm.role IN ('LEADER','OFFICER')
            """)
    List<Long> findOfficerUserIdsByClubIdIn(@Param("clubIds") Collection<Long> clubIds);

    @Query("""
            SELECT DISTINCT cm.user.id FROM ClubMember cm
            WHERE cm.role IN ('LEADER','OFFICER')
            """)
    List<Long> findAllOfficerUserIds();

    /** 활성 회원 수. @SQLRestriction("deleted_at IS NULL") 가 자동 적용돼 회비 발행의 skipped 계산에 쓰는 카운트만 센다. */
    @Query("SELECT COUNT(cm) FROM ClubMember cm WHERE cm.club.id = :clubId")
    long countActiveByClubId(@Param("clubId") Long clubId);

    /**
     * 청구 대상 검증용: soft-delete(탈퇴) 포함, 이 동아리의 멤버였던 user_id 집합을 반환한다.
     * @SQLRestriction 을 우회하는 네이티브 쿼리라 탈퇴 회원도 포함된다 — 요청 memberIds 중 이 집합에
     * 없는 id 는 타 동아리/미존재(IDOR)로 400 처리하고, 탈퇴 회원은 발행 단계(활성 join)에서 자연 제외한다.
     */
    @Query(value = """
            SELECT DISTINCT cm.user_id FROM club_member cm
            WHERE cm.club_id = :clubId AND cm.user_id IN (:userIds)
            """, nativeQuery = true)
    List<Long> findClubMemberUserIdsIncludingDeleted(@Param("clubId") Long clubId,
                                                     @Param("userIds") Collection<Long> userIds);
}
