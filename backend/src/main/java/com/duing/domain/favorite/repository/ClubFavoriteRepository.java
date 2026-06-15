package com.duing.domain.favorite.repository;

import com.duing.domain.favorite.entity.ClubFavorite;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubFavoriteRepository
        extends JpaRepository<ClubFavorite, Long>, ClubFavoriteRepositoryCustom {

    boolean existsByUserIdAndClubId(Long userId, Long clubId);

    Optional<ClubFavorite> findByUserIdAndClubId(Long userId, Long clubId);

    // 소프트 삭제(@SQLDelete)된 찜은 @SQLRestriction 으로 일반 쿼리에서 보이지 않지만, (user_id, club_id)
    // 유니크 제약 슬롯은 그대로 점유한다. 같은 동아리를 다시 찜할 때 새 행 INSERT 가 유니크 제약에 막히므로,
    // deleted_at 만 되돌려 기존 행을 되살린다(최초 찜 시각 created_at 은 보존). @SQLRestriction 을
    // 우회해야 하므로 native 쿼리로 작성하고, 되살린 직후 재조회가 DB 를 읽도록 영속성 컨텍스트를 비운다.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE club_favorite SET deleted_at = NULL "
            + "WHERE user_id = :userId AND club_id = :clubId AND deleted_at IS NOT NULL",
            nativeQuery = true)
    int reactivateSoftDeleted(@Param("userId") Long userId, @Param("clubId") Long clubId);

    List<ClubFavorite> findAllByUserIdOrderByCreatedAtDesc(Long userId);

    List<ClubFavorite> findAllByClubId(Long clubId);

    @Query("select cf.user.id from ClubFavorite cf where cf.club.id = :clubId")
    List<Long> findUserIdsByClubId(@Param("clubId") Long clubId);
}