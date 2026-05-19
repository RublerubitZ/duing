package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import jakarta.persistence.LockModeType;
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

    @Query("SELECT cm.club.id FROM ClubMember cm WHERE cm.user.id = :userId")
    List<Long> findClubIdsByUserId(@Param("userId") Long userId);

    @Query("""
            SELECT cm.club.id FROM ClubMember cm
            WHERE cm.user.id = :userId AND cm.role IN ('LEADER','OFFICER')
            """)
    List<Long> findOfficerClubIdsByUserId(@Param("userId") Long userId);
}
