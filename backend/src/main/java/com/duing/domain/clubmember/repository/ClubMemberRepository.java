package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
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

    Optional<ClubMember> findFirstByClubIdAndRole(Long clubId, ClubMemberRole role);

    boolean existsByClubIdAndUserId(Long clubId, Long userId);

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
     * 회장 인계 등 동시성이 중요한 변경에서 행 잠금 후 조회한다 (PESSIMISTIC_WRITE).
     * @SQLRestriction(deleted_at IS NULL) 가 JPQL 에 자동 적용된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT cm FROM ClubMember cm WHERE cm.id = :id")
    Optional<ClubMember> findByIdForUpdate(@Param("id") Long id);

    boolean existsByClubIdAndRole(Long clubId, ClubMemberRole role);

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

    @Query("SELECT cm.club.id FROM ClubMember cm WHERE cm.user.id = :userId")
    List<Long> findClubIdsByUserId(@Param("userId") Long userId);

    @Query("""
            SELECT cm.club.id FROM ClubMember cm
            WHERE cm.user.id = :userId AND cm.role IN ('LEADER','OFFICER')
            """)
    List<Long> findOfficerClubIdsByUserId(@Param("userId") Long userId);

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
}
