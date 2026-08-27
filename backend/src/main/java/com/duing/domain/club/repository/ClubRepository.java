package com.duing.domain.club.repository;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubRepository extends JpaRepository<Club, Long>, ClubRepositoryCustom {

    boolean existsByName(String name);

    boolean existsByIdAndStatus(Long id, ClubStatus status);

    // 관리자 콘솔 미처리 건수 — derived query 라 @SQLRestriction(soft delete 제외) 이 자동 적용된다.
    long countByStatus(ClubStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT club FROM Club club WHERE club.id = :clubId")
    Optional<Club> findByIdForUpdate(@Param("clubId") Long clubId);

    // 매칭 스케줄러가 10분마다 전 동아리를 읽는다 — 엔티티(TEXT·jsonb 포함 35컬럼) 대신
    // 필요한 컬럼만 뽑아 DB egress 를 줄인다. JPQL 도 @SQLRestriction 이 적용되어 soft delete 는 제외된다.
    @Query("SELECT club.name FROM Club club")
    List<String> findAllNames();

    @Query("SELECT club.id AS id, club.name AS name FROM Club club WHERE club.id IN :clubIds")
    List<ClubNameProjection> findNameRowsByIdIn(@Param("clubIds") Collection<Long> clubIds);

    // 권한 게이트(ClubAuthService)가 운영 요청마다 호출한다 — status 하나에 엔티티 전체(TEXT·jsonb
    // 포함 35컬럼)를 읽지 않도록 스칼라로 뽑는다. @SQLRestriction 이 적용되어 soft delete 는 empty.
    @Query("SELECT club.status FROM Club club WHERE club.id = :clubId")
    Optional<ClubStatus> findStatusById(@Param("clubId") Long clubId);

    // 시설 크롤 분류(기본 확보 시간 대상)·어드민 크롤 현황 매칭이 호출한다 — 정규화 키 충돌 판정에 전체
    // 동아리 이름이 필요해 플래그 필터 없이 뽑되, 엔티티 대신 필요한 컬럼만 프로젝션한다(findAllNames 전례).
    @Query("SELECT club.id AS id, club.name AS name, "
            + "club.facilitySecuredTimeTarget AS facilitySecuredTimeTarget FROM Club club")
    List<ClubSecuredNameProjection> findSecuredTargetNameRows();

    interface ClubNameProjection {
        Long getId();

        String getName();
    }

    interface ClubSecuredNameProjection {
        Long getId();

        String getName();

        boolean isFacilitySecuredTimeTarget();
    }
}
