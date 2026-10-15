package com.duing.domain.club.repository;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

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

    /**
     * 로고 썸네일 조건부 반영(스펙 §4.3 3) — 생성에 쓴 원본(logoUrl)이 그대로이고 아직 썸네일이 없을 때만 쓴다. 그사이 로고가
     * 바뀌었거나(교체·비우기) 다른 생성(백필과 변경 이벤트가 겹침)이 먼저 반영됐거나 폐쇄(soft-delete)됐으면 0 을 돌려주고,
     * 호출자가 만든 객체를 해제한다. 파생 데이터라 updated_at 은 건드리지 않는다(롤백 런북이 수정 시각으로 대상을 고른다).
     * 메서드에 트랜잭션을 두어 트랜잭션 밖(테스트)에서도 쓰기 tx 로 돌고, 호출자 tx 가 있으면 합류한다.
     */
    @Transactional
    @Modifying
    @Query(value = "UPDATE club SET logo_thumbnail_url = :thumbnailUrl "
            + "WHERE id = :clubId AND logo_url = :logoUrl AND logo_thumbnail_url IS NULL AND deleted_at IS NULL",
            nativeQuery = true)
    int setLogoThumbnailUrlIfLogoUnchanged(@Param("clubId") Long clubId, @Param("logoUrl") String logoUrl,
                                           @Param("thumbnailUrl") String thumbnailUrl);

    /** 로고가 바뀐 쓰기 경로가 같은 tx 에서 부른다(스펙 §4.3 1) — 엔티티 저장은 이 컬럼을 쓰지 않으므로(updatable=false) SQL 로 비운다. */
    @Transactional
    @Modifying
    @Query(value = "UPDATE club SET logo_thumbnail_url = NULL WHERE id = :clubId", nativeQuery = true)
    void clearLogoThumbnailUrl(@Param("clubId") Long clubId);

    /** 현재 썸네일 URL — 1차 캐시를 거치지 않는 native 스칼라 조회. 로고 변경 경로가 비우기 직전에 그사이 반영된 썸네일까지 해제하는 데 쓴다. */
    @Query(value = "SELECT logo_thumbnail_url FROM club WHERE id = :clubId", nativeQuery = true)
    String findLogoThumbnailUrlById(@Param("clubId") Long clubId);

    /** 백필 대상(스펙 §4.5) — 로고는 있는데 썸네일이 없는 동아리. JPQL 이라 @SQLRestriction 으로 폐쇄(soft-delete)는 빠진다. */
    @Query("SELECT club.id AS id, club.logoUrl AS logoUrl, club.status AS status FROM Club club "
            + "WHERE club.logoUrl IS NOT NULL AND club.logoThumbnailUrl IS NULL ORDER BY club.id ASC")
    List<ClubLogoThumbnailBackfillRow> findLogoThumbnailBackfillRows();

    interface ClubNameProjection {
        Long getId();

        String getName();
    }

    interface ClubSecuredNameProjection {
        Long getId();

        String getName();

        boolean isFacilitySecuredTimeTarget();
    }

    interface ClubLogoThumbnailBackfillRow {
        Long getId();

        String getLogoUrl();

        ClubStatus getStatus();
    }
}
