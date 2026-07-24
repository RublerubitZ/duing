package com.duing.domain.club.photo.repository;

import com.duing.domain.club.photo.entity.ClubPhoto;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubPhotoRepository extends JpaRepository<ClubPhoto, Long> {

    List<ClubPhoto> findByClubIdOrderByDisplayOrderAsc(Long clubId);

    List<ClubPhoto> findByClubId(Long clubId);

    // 집계 프로젝션 JPQL 은 @SQLRestriction 을 자동 적용하지 않아 soft-delete 된 행이 포함될 수 있으므로
    // deletedAt IS NULL 조건을 명시한다.
    @Query("SELECT COALESCE(MAX(p.displayOrder), -1) FROM ClubPhoto p "
            + "WHERE p.club.id = :clubId AND p.deletedAt IS NULL")
    int findMaxDisplayOrderByClubId(@Param("clubId") Long clubId);

    // 대표 활동 참조 경합 잠금(PESSIMISTIC_WRITE) — FederationFaqCategoryRepository.findByIdForUpdate 전례.
    // 사진 삭제 가드(GeneralClubPhotoService.delete)와 대표 활동 등록·사진 교체
    // (GeneralClubHeroActivityService.create/update)가 같은 사진 행을 첫 잠금으로 획득해
    // "삭제 가드 통과 → 등록 커밋 → soft-delete 된 사진을 참조하는 대표 활동" TOCTOU 를 직렬화한다.
    // 단일 사진 행만 잠그므로 잠금 순서 사이클이 없어 교착이 불가능하다.
    // @SQLRestriction(deleted_at IS NULL)이 엔티티 조회 SELECT JPQL 에 자동 적용되므로, 삭제가 선행하면
    // FOR UPDATE 대기 후 재평가에서 빈 결과가 되어 등록이 PhotoNotFound 로 실패한다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT photo FROM ClubPhoto photo WHERE photo.id = :photoId")
    Optional<ClubPhoto> findByIdForUpdate(@Param("photoId") Long photoId);
}
