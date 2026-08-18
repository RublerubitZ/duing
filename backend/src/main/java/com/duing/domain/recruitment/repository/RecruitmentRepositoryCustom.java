package com.duing.domain.recruitment.repository;

import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentRow;
import com.duing.domain.recruitment.service.dto.query.AdminRecruitmentSearchCondition;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface RecruitmentRepositoryCustom {

    List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd);

    List<Recruitment> findByClubIdOrderByStatusOpenFirstAndStartDateDesc(Long clubId);

    /**
     * 활성 모집({@link RecruitmentPredicates#effectivelyOpen}) 1건 조회.
     * 비정상 케이스로 여러 건이면 startDate ASC, id ASC tie-break.
     */
    Optional<Recruitment> findActiveByClubId(Long clubId);

    /**
     * status=OPEN 인 모집 1건 조회. endDate 필터를 적용하지 않으므로 endDate 가 지난 OPEN 행도 반환된다.
     * uk_recruitment_club_active 인덱스는 endDate 와 무관하게 status='OPEN' 만 보므로,
     * 새 모집을 만들기 전 만료된 OPEN 행을 자동 마감 처리하기 위해 사용한다.
     */
    Optional<Recruitment> findOpenByClubId(Long clubId);

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

    /**
     * 동아리 1곳의 대표 모집. 선택 규칙은 {@link #findRepresentativeByClubIds} 와 동일하며 실제로
     * 같은 우선순위 식·정렬을 공유한다 — 목록 카드와 상세 화면이 같은 모집을 가리켜야 하기 때문이다.
     * 규칙이 갈리면 목록엔 "모집마감", 상세엔 "현재 모집 없음"이 동시에 뜬다(#895).
     *
     * <p>{@link #findActiveByClubId} 와 달리 마감 모집도 반환한다. 진행 중인 모집만 필요한 쓰기
     * 경로(모집 교체 등)는 그쪽을 계속 쓴다.
     */
    Optional<Recruitment> findRepresentativeByClubId(Long clubId, LocalDate today);

    /**
     * 총동연(ADMIN) 모집 콘솔의 전 동아리 모집 검색. 페이지네이션은 두지 않는다(스펙 2.1).
     *
     * <p>지원자 수는 외부 폼 모집까지 포함해 한 번에 집계하고(실제 값은 0), 화면에 비울지 여부는
     * 응답 매핑이 결정한다. 삭제된 모집은 {@code @SQLRestriction} 으로 자동 제외된다.
     */
    List<AdminRecruitmentRow> searchForAdmin(AdminRecruitmentSearchCondition searchCondition);
}
