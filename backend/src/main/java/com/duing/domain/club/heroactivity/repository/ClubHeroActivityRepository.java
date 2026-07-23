package com.duing.domain.club.heroactivity.repository;

import com.duing.domain.club.heroactivity.entity.ClubHeroActivity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubHeroActivityRepository extends JpaRepository<ClubHeroActivity, Long> {

    // clubPhoto 를 JOIN FETCH 해 N+1(최대 6+1 쿼리)을 없애고 LAZY 초기화를 트랜잭션 안에서 끝낸다.
    // 죽은 참조 방어선: clubPhoto 의 @SQLRestriction(deleted_at IS NULL)이 fetch inner join 에 자동 적용돼,
    // 만에 하나 soft-delete 된 사진을 참조하는 대표 활동이 있어도 500 대신 목록에서 조용히 제외된다.
    // (근본 봉합은 ClubPhotoRepository.findByIdForUpdate 의 사진 행 잠금 — 이 조인은 이중 방어선이다.)
    @Query("SELECT heroActivity FROM ClubHeroActivity heroActivity "
            + "JOIN FETCH heroActivity.clubPhoto "
            + "WHERE heroActivity.club.id = :clubId "
            + "ORDER BY heroActivity.displayOrder ASC")
    List<ClubHeroActivity> findByClubIdOrderByDisplayOrderAsc(@Param("clubId") Long clubId);

    // reorder 검증·갱신용 — 위와 동일한 죽은 참조 방어선을 공유한다(사진 필드 미소비여도 의도적 동형 유지).
    @Query("SELECT heroActivity FROM ClubHeroActivity heroActivity "
            + "JOIN FETCH heroActivity.clubPhoto "
            + "WHERE heroActivity.club.id = :clubId")
    List<ClubHeroActivity> findByClubId(@Param("clubId") Long clubId);

    boolean existsByClubIdAndClubPhotoId(Long clubId, Long clubPhotoId);

    boolean existsByClubIdAndDisplayOrder(Long clubId, int displayOrder);

    boolean existsByClubPhotoId(Long clubPhotoId);
}
