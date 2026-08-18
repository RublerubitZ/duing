package com.duing.domain.recruitment.repository;

import static com.duing.domain.recruitment.entity.QRecruitment.recruitment;
import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

/**
 * 동치 계약 테스트 — SQL 술어(RecruitmentPredicates)와 Java 정본(Recruitment.isEffectivelyOpen)이
 * 같은 행 집합을 판정하는지 엔티티 평가와 실제 쿼리 결과를 직접 대조한다.
 * 어느 한쪽의 규칙만 바뀌면(#993 류 접수 방식 변경 등) 이 테스트가 깨져 드리프트를 막는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class RecruitmentPredicatesTest extends IntegrationTestBase {

    @Autowired JPAQueryFactory queryFactory;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("effectivelyOpen 은 전 상태 조합에서 Recruitment.isEffectivelyOpen 과 같은 집합을 판정한다")
    void effectivelyOpenMatchesEntityRule() throws Exception {
        LocalDate today = LocalDate.now(clock);
        List<Recruitment> persisted = persistAllVariants(today);

        Set<Long> entityJudgedOpen = persisted.stream()
                .filter(candidate -> candidate.isEffectivelyOpen(today))
                .map(Recruitment::getId)
                .collect(Collectors.toSet());
        Set<Long> sqlJudgedOpen = Set.copyOf(queryFactory
                .select(recruitment.id)
                .from(recruitment)
                .where(
                        recruitment.id.in(idsOf(persisted)),
                        RecruitmentPredicates.effectivelyOpen(today)
                )
                .fetch());

        // 진행중·상시모집만 포함, 만료-OPEN·모집예정 취급까지 정본과 동일해야 한다(모집예정은 진행 그룹 축에 포함).
        assertThat(sqlJudgedOpen).isEqualTo(entityJudgedOpen).isNotEmpty();
    }

    @Test
    @DisplayName("availableToday 는 effectivelyOpen 에서 시작일이 오지 않은 모집예정만 추가로 제외한다")
    void availableTodayExcludesOnlyUpcoming() throws Exception {
        LocalDate today = LocalDate.now(clock);
        List<Recruitment> persisted = persistAllVariants(today);

        Set<Long> entityJudgedAvailable = persisted.stream()
                .filter(candidate -> candidate.isEffectivelyOpen(today)
                        && !candidate.getStartDate().isAfter(today))
                .map(Recruitment::getId)
                .collect(Collectors.toSet());
        Set<Long> sqlJudgedAvailable = Set.copyOf(queryFactory
                .select(recruitment.id)
                .from(recruitment)
                .where(
                        recruitment.id.in(idsOf(persisted)),
                        RecruitmentPredicates.availableToday(today)
                )
                .fetch());

        assertThat(sqlJudgedAvailable).isEqualTo(entityJudgedAvailable).isNotEmpty();
    }

    /**
     * 판정이 갈릴 수 있는 전 변형을 저장한다. uk_recruitment_club_active(동아리당 OPEN 1건)를
     * 지키기 위해 변형마다 동아리를 분리한다.
     */
    private List<Recruitment> persistAllVariants(LocalDate today) throws Exception {
        return List.of(
                saveRecruitment(today.minusDays(5), today.plusDays(5), RecruitmentStatus.OPEN),   // 진행중
                saveRecruitment(today.minusDays(5), today, RecruitmentStatus.OPEN),               // 마감 당일
                saveRecruitment(today.minusDays(5), null, RecruitmentStatus.OPEN),                // 상시모집
                saveRecruitment(today.minusDays(20), today.minusDays(1), RecruitmentStatus.OPEN), // 만료-OPEN
                saveRecruitment(today.plusDays(2), today.plusDays(9), RecruitmentStatus.OPEN),    // 모집예정
                saveRecruitment(today.minusDays(5), today.plusDays(5), RecruitmentStatus.CLOSED)  // 수동 마감
        );
    }

    private Recruitment saveRecruitment(LocalDate startDate, LocalDate endDate, RecruitmentStatus status)
            throws Exception {
        Club club = clubRepository.save(
                Club.create("동치검증동아리-" + sequence.getAndIncrement(), ClubCategory.OTHER, "분과", "설명", null));
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null,
                startDate, endDate, 10);
        if (status != RecruitmentStatus.OPEN) {
            Field statusField = Recruitment.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(created, status);
        }
        return recruitmentRepository.save(created);
    }

    private List<Long> idsOf(List<Recruitment> recruitments) {
        return recruitments.stream().map(Recruitment::getId).toList();
    }
}
