package com.duing.domain.club.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.entity.ClubMetric;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.service.ClubRecommendationPolicy;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.support.RecommendedScoreTestSupport;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * 추천순(RECOMMENDED) 정렬 검증.
 * <p>bucket 이 시간마다 바뀌므로 그룹 간 절대 규칙(모집중 > 상시 > 기타)은 해시와 무관하게 단언하고,
 * 그룹 내부 순서는 {@link RecommendedScoreTestSupport} 의 Java 복제 산식으로 기대 순서를 재계산해
 * 비교한다. 정각 경계를 통과하면 재시도한다({@link #withStableBucket}).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubRecommendedSortTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubMetricRepository clubMetricRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("모집중 동아리가 상시모집보다, 상시모집이 기타(예정·만료·마감·없음)보다 항상 앞선다")
    void statusGroupsAreAbsoluteOrder() throws Exception {
        LocalDate today = LocalDate.now(clock);
        Club open = saveActiveClub("recGroupOpen");
        Club alwaysOpen = saveActiveClub("recGroupAlways");
        Club upcoming = saveActiveClub("recGroupUpcoming");
        Club expired = saveActiveClub("recGroupExpired");
        Club closedStatus = saveActiveClub("recGroupClosed");
        Club noRecruitment = saveActiveClub("recGroupNone");
        saveOpenRecruitment(open, today.minusDays(2), today.plusDays(7));
        saveOpenRecruitment(alwaysOpen, today.minusDays(2), null);
        saveOpenRecruitment(upcoming, today.plusDays(3), today.plusDays(10));
        saveOpenRecruitment(expired, today.minusDays(10), today.minusDays(2));
        saveRecruitmentWithStatus(closedStatus, today.minusDays(10), today.minusDays(2), RecruitmentStatus.CLOSED);

        List<String> names = fetchNames("recGroup");

        assertThat(names).hasSize(6);
        assertThat(names.indexOf(open.getName())).isZero();
        assertThat(names.indexOf(alwaysOpen.getName())).isEqualTo(1);
        // 기타 그룹(예정·만료·마감·없음)은 전부 상시모집 뒤 — 내부 순서는 점수가 결정한다.
        assertThat(names.subList(2, 6)).containsExactlyInAnyOrder(
                upcoming.getName(), expired.getName(), closedStatus.getName(), noRecruitment.getName());
    }

    @Test
    @DisplayName("기타 그룹 내부는 모집예정·마감·없음의 상태 우선순위 없이 추천 점수(시간 셔플+활동점수)순이다")
    void othersGroupOrdersByScoreNotByStatus() throws Exception {
        LocalDate today = LocalDate.now(clock);
        Club upcoming = saveActiveClub("recFlatUpcoming");
        Club expired = saveActiveClub("recFlatExpired");
        Club noRecruitment = saveActiveClub("recFlatNone");
        saveOpenRecruitment(upcoming, today.plusDays(3), today.plusDays(10));
        saveOpenRecruitment(expired, today.minusDays(10), today.minusDays(2));
        saveMetric(upcoming, 0.1);
        saveMetric(expired, 0.5);
        saveMetric(noRecruitment, 0.9);

        record Scored(Club club, double activityScore) {}
        List<Scored> members = List.of(
                new Scored(upcoming, 0.1), new Scored(expired, 0.5), new Scored(noRecruitment, 0.9));

        withStableBucket(bucket -> {
            List<String> expectedByScore = members.stream()
                    .sorted(Comparator
                            .comparingDouble((Scored member) -> RecommendedScoreTestSupport.finalScore(
                                    member.club().getId(), ClubCategory.ACADEMIC, bucket, member.activityScore()))
                            .reversed()
                            .thenComparing(member -> member.club().getId()))
                    .map(member -> member.club().getName())
                    .toList();
            assertThat(fetchNames("recFlat")).containsExactlyElementsOf(expectedByScore);
            return null;
        });
    }

    @Test
    @DisplayName("같은 시간 bucket 에서는 다시 조회해도 순서가 동일하다 (deterministic random)")
    void sameBucketReturnsIdenticalOrder() throws Exception {
        LocalDate today = LocalDate.now(clock);
        for (int i = 0; i < 5; i++) {
            Club club = saveActiveClub("recSame");
            if (i % 2 == 0) {
                saveOpenRecruitment(club, today.minusDays(1), today.plusDays(7));
            }
        }

        withStableBucket(bucket -> {
            assertThat(fetchNames("recSame")).containsExactlyElementsOf(fetchNames("recSame"));
            return null;
        });
    }

    @Test
    @DisplayName("같은 bucket 에서 페이지를 나눠 조회해도 중복·누락 없이 전체 조회와 같은 순서다")
    void paginationIsStableWithinBucket() throws Exception {
        LocalDate today = LocalDate.now(clock);
        for (int i = 0; i < 6; i++) {
            Club club = saveActiveClub("recPage");
            if (i < 3) {
                saveOpenRecruitment(club, today.minusDays(1), today.plusDays(7));
            }
        }

        withStableBucket(bucket -> {
            List<String> wholeList = fetchNames("recPage");
            List<String> paged = new ArrayList<>();
            for (int page = 0; page < 3; page++) {
                paged.addAll(clubRepository.findByCondition(recommendedCondition("recPage"), PageRequest.of(page, 2))
                        .getContent().stream().map(Club::getName).toList());
            }
            assertThat(paged).containsExactlyElementsOf(wholeList).doesNotHaveDuplicates();
            return null;
        });
    }

    @Test
    @DisplayName("활동점수가 최대(1.0)인 기타 그룹 동아리도 모집중 동아리를 추월하지 못한다")
    void activityScoreCannotEscapeStatusGroup() throws Exception {
        LocalDate today = LocalDate.now(clock);
        Club recruiting = saveActiveClub("recCeilOpen");
        Club idleButPopular = saveActiveClub("recCeilIdle");
        saveOpenRecruitment(recruiting, today.minusDays(1), today.plusDays(7));
        saveMetric(idleButPopular, 1.0);

        assertThat(fetchNames("recCeil"))
                .containsExactly(recruiting.getName(), idleButPopular.getName());
    }

    @Test
    @DisplayName("카테고리 필터가 걸리면 다른 카테고리 동아리는 결과에 섞이지 않는다")
    void categoryFilterExcludesOtherCategories() throws Exception {
        Club sports = saveActiveClub("recCat", ClubCategory.SPORTS);
        saveActiveClub("recCat", ClubCategory.ACADEMIC);

        ClubSearchCondition condition = new ClubSearchCondition(
                ClubCategory.SPORTS, null, "recCat", null, null, null, null, null, null,
                ClubSortOption.RECOMMENDED, null);
        List<Club> content = clubRepository.findByCondition(condition, PageRequest.of(0, 50)).getContent();

        assertThat(content).extracting(Club::getName).containsExactly(sports.getName());
    }

    @Test
    @DisplayName("SQL hourly_shuffle 과 Java 복제 산식은 같은 값을 내고, bucket 이 바뀌면 값이 달라진다")
    void sqlShuffleMatchesJavaReplicaAndVariesByBucket() {
        String sqlExpression =
                "SELECT ((('x' || substr(md5(? || ':' || ?), 1, 8))::bit(32)::int & 2147483647) / 2147483647.0)";
        for (String source : List.of("1", "42", "9999", "ACADEMIC", "SPORTS")) {
            for (String bucket : List.of("2026081109", "2026081110")) {
                Double sqlScore = jdbcTemplate.queryForObject(sqlExpression, Double.class, source, bucket);
                assertThat(sqlScore).isCloseTo(
                        RecommendedScoreTestSupport.shuffleScore(source, bucket), within(1e-12));
            }
            assertThat(RecommendedScoreTestSupport.shuffleScore(source, "2026081109"))
                    .isNotEqualTo(RecommendedScoreTestSupport.shuffleScore(source, "2026081110"));
        }
    }

    // ── helpers ──

    private ClubSearchCondition recommendedCondition(String keyword) {
        return new ClubSearchCondition(
                null, null, keyword, null, null, null, null, null, null, ClubSortOption.RECOMMENDED, null);
    }

    private List<String> fetchNames(String keyword) {
        return clubRepository.findByCondition(recommendedCondition(keyword), PageRequest.of(0, 50))
                .getContent().stream().map(Club::getName).toList();
    }

    /**
     * 정각 경계 가드 — 실행 도중 hour bucket 이 바뀌면 조회와 기대 산식의 bucket 이 어긋나므로
     * 같은 bucket 안에서 끝났을 때만 결과를 인정하고, 경계를 통과했으면 재시도한다.
     * 경계 통과로 인한 단언 실패(AssertionError)도 재시도 대상 — bucket 이 안 바뀌었는데 실패하면 진짜 실패다.
     */
    private <T> T withStableBucket(java.util.function.Function<String, T> action) {
        for (int attempt = 0; attempt < 3; attempt++) {
            String bucketBefore = currentBucket();
            try {
                T result = action.apply(bucketBefore);
                if (currentBucket().equals(bucketBefore)) {
                    return result;
                }
            } catch (AssertionError assertionError) {
                if (currentBucket().equals(bucketBefore)) {
                    throw assertionError;
                }
                // 정각 경계 통과로 기대/실제 bucket 이 어긋난 실패 — 새 bucket 으로 재시도한다.
            }
        }
        throw new IllegalStateException("hour bucket 정각 경계를 3회 연속 통과 — 재시도 초과");
    }

    private String currentBucket() {
        return ClubRecommendationPolicy.hourBucket(LocalDateTime.now(clock));
    }

    private void saveMetric(Club club, double activityScore) {
        clubMetricRepository.save(ClubMetric.of(
                club.getId(), 0, 0, null, activityScore, LocalDateTime.now(clock)));
        clubMetricRepository.flush();
    }

    private Club saveActiveClub(String name) throws Exception {
        return saveActiveClub(name, ClubCategory.ACADEMIC);
    }

    private Club saveActiveClub(String name, ClubCategory category) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, category, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private void saveOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        recruitmentRepository.save(
                Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10));
    }

    private void saveRecruitmentWithStatus(Club club, LocalDate startDate, LocalDate endDate,
                                           RecruitmentStatus status) throws Exception {
        Recruitment created =
                Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        recruitmentRepository.save(created);
    }
}
