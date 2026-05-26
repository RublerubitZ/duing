package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import java.util.List;
<<<<<<< HEAD
import java.util.Map;
=======
>>>>>>> origin/main
import java.util.Optional;

public interface RecruitmentRepositoryCustom {

    List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd);

    List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId);

    /**
     * 활성 모집(status=OPEN && deleted_at IS NULL && (end_date IS NULL OR end_date >= today)) 존재 여부.
     */
    boolean existsActiveByClubId(Long clubId);

    /**
     * 활성 모집 1건 조회. 비정상 케이스로 여러 건이면 startDate ASC, id ASC tie-break.
     */
    Optional<Recruitment> findActiveByClubId(Long clubId);
<<<<<<< HEAD

    /**
     * 동아리 id 묶음에 대해 대표 모집을 1건씩 조회한다.
     *
     * <p>대표 선택 규칙:
     * <ol>
     *   <li>status=OPEN ∧ (endDate IS NULL ∨ endDate ≥ today) 인 모집이 있으면 그 중 createdAt 최신</li>
     *   <li>그렇지 않으면 endDate 가 가장 최근인 마감 모집</li>
     * </ol>
     *
     * @return key=clubId, value=대표 모집 row. 모집이 한 건도 없는 club id 는 키가 없다.
     */
    Map<Long, ClubActiveRecruitmentRow> findRepresentativeByClubIds(List<Long> clubIds, LocalDate today);
=======
>>>>>>> origin/main
}
