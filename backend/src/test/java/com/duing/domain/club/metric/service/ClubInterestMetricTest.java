package com.duing.domain.club.metric.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.entity.ClubMetric;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubInterestPolicy;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * 홈 관심도 집계 검증 — 매시 배치가 조회 이벤트를 어떤 두 값으로 접는지 확인한다.
 * <p>표시값(weekly_visitor_count)과 정렬값(interest_score)은 일부러 다른 의미다: 앞은 감쇠 없는
 * "몇 명" 이고 뒤는 최근성 감쇠 합과 그 사람 수를 합성한 순위 점수다. 두 값이 함께 움직인다고
 * 가정하면 안 되므로, "사람 수는 같은데 점수만 다른" 경우를 명시적으로 단언한다.
 * <p>점수 절대값은 감쇠 산식에 종속되므로 크기 비교만 하고, 표시값만 정확한 수치로 단언한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubInterestMetricTest {

    @Autowired ClubMetricService clubMetricService;
    @Autowired ClubMetricRepository clubMetricRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("한 사람이 여러 날 본 것은 한 명으로, 서로 다른 사람은 각각 세어 주간 순방문자 수가 집계된다")
    void weeklyVisitorCountCountsPeopleNotVisits() throws Exception {
        Club club = saveActiveClub("관심도순방문자");
        LocalDate today = LocalDate.now(clock);
        // 같은 사람의 3일치 방문 — 사람 수로는 1명이다.
        insertViewEvent(club.getId(), "visitor-loyal", today);
        insertViewEvent(club.getId(), "visitor-loyal", today.minusDays(1));
        insertViewEvent(club.getId(), "visitor-loyal", today.minusDays(2));
        insertViewEvent(club.getId(), "visitor-other", today);

        clubMetricService.refreshAll();

        ClubMetric metric = findMetric(club);
        assertThat(metric.getWeeklyVisitorCount()).isEqualTo(2);
        assertThat(metric.getInterestScore()).isPositive();
    }

    @Test
    @DisplayName("주간 순방문자 수가 같아도 최근에 본 동아리의 관심도 점수가 더 높다")
    void recentViewsScoreHigherThanOldViewsWithSameVisitorCount() throws Exception {
        Club recentlyViewed = saveActiveClub("관심도최근");
        Club viewedLongAgo = saveActiveClub("관심도과거");
        LocalDate today = LocalDate.now(clock);
        insertViewEvent(recentlyViewed.getId(), "visitor-recent", today);
        // 창 안이지만 가장 오래된 날 — 반감기 3일이라 오늘의 1/4 무게다.
        insertViewEvent(viewedLongAgo.getId(), "visitor-old", today.minusDays(6));

        clubMetricService.refreshAll();

        ClubMetric recentMetric = findMetric(recentlyViewed);
        ClubMetric oldMetric = findMetric(viewedLongAgo);
        // 표시값은 둘 다 "1명" 으로 같다 — 화면에 순위 근거가 그대로 드러나지 않는다는 뜻이기도 하다.
        assertThat(recentMetric.getWeeklyVisitorCount()).isEqualTo(1);
        assertThat(oldMetric.getWeeklyVisitorCount()).isEqualTo(1);
        assertThat(recentMetric.getInterestScore()).isGreaterThan(oldMetric.getInterestScore());
    }

    @Test
    @DisplayName("최근성 감쇠 합이 같아도 실제로 본 사람이 더 많은 동아리의 관심도 점수가 더 높다")
    void moreVisitorsWinWhenDecayedScoresTie() throws Exception {
        Club fewToday = saveActiveClub("관심도소수최근");
        Club manySixDaysAgo = saveActiveClub("관심도다수과거");
        LocalDate today = LocalDate.now(clock);
        // 오늘 1명(가중치 1.0) vs 6일 전 4명(각 0.25) — 감쇠 축만 보면 둘 다 1.0 으로 정확히 동점이다.
        insertViewEvent(fewToday.getId(), "visitor-today", today);
        for (int visitorIndex = 0; visitorIndex < 4; visitorIndex++) {
            insertViewEvent(manySixDaysAgo.getId(), "visitor-old-" + visitorIndex, today.minusDays(6));
        }

        clubMetricService.refreshAll();

        ClubMetric fewMetric = findMetric(fewToday);
        ClubMetric manyMetric = findMetric(manySixDaysAgo);
        assertThat(fewMetric.getWeeklyVisitorCount()).isEqualTo(1);
        assertThat(manyMetric.getWeeklyVisitorCount()).isEqualTo(4);
        // 감쇠 축이 동점이므로 순서를 가르는 것은 합성에 섞인 순방문자 수뿐이다 —
        // 감쇠만으로 정렬하던 때는 이 둘이 같은 점수라 사실상 임의 순서였다.
        assertThat(manyMetric.getInterestScore()).isGreaterThan(fewMetric.getInterestScore());
    }

    @Test
    @DisplayName("한 사람이 일주일 내내 본 동아리보다 오늘 서로 다른 여러 명이 본 동아리의 관심도 점수가 더 높다")
    void distinctVisitorsOutweighOnePersonRepeating() throws Exception {
        Club oneLoyalVisitor = saveActiveClub("관심도충성한명");
        Club distinctToday = saveActiveClub("관심도오늘여러명");
        LocalDate today = LocalDate.now(clock);
        // 같은 사람이 창 전체를 매일 조회 — 감쇠 합은 3.89(창 7일 기준)까지 쌓이지만 사람은 1명뿐이다.
        double loyalDecayedScore = 0.0;
        for (int dayOffset = 0; dayOffset < ClubInterestPolicy.WINDOW_DAYS; dayOffset++) {
            insertViewEvent(oneLoyalVisitor.getId(), "visitor-loyal-week", today.minusDays(dayOffset));
            loyalDecayedScore += Math.pow(0.5, (double) dayOffset / ClubInterestPolicy.HALF_LIFE_DAYS);
        }
        // 오늘 n 명이면 두 축 모두 n 이라 점수도 n 이다 — 반복 조회를 이기는 최소 인원을 창 길이에서
        // 끌어낸다. 3 을 박아 두면 WINDOW_DAYS 를 늘릴 때 산식이 아니라 픽스처 때문에 깨진다.
        int distinctVisitorCount = (int) Math.floor(ClubInterestPolicy.interestScore(loyalDecayedScore, 1)) + 1;
        for (int visitorIndex = 0; visitorIndex < distinctVisitorCount; visitorIndex++) {
            insertViewEvent(distinctToday.getId(), "visitor-today-" + visitorIndex, today);
        }

        clubMetricService.refreshAll();

        ClubMetric loyalMetric = findMetric(oneLoyalVisitor);
        ClubMetric distinctMetric = findMetric(distinctToday);
        assertThat(loyalMetric.getWeeklyVisitorCount()).isEqualTo(1);
        assertThat(distinctMetric.getWeeklyVisitorCount()).isEqualTo(distinctVisitorCount);
        // 감쇠 축(방문자·일)만으로는 한 명의 반복 조회가 이긴다 — 순방문자 비중이 그 뒤집는 유일한 힘이라,
        // VISITOR_WEIGHT 를 경계(0.307) 아래로 내리면 이 단언이 깨진다.
        assertThat(distinctMetric.getInterestScore()).isGreaterThan(loyalMetric.getInterestScore());
    }

    @Test
    @DisplayName("집계 창(7일) 밖의 조회는 주간 순방문자 수에도 관심도 점수에도 반영되지 않는다")
    void viewsOutsideWindowAreExcluded() throws Exception {
        Club club = saveActiveClub("관심도창밖");
        LocalDate today = LocalDate.now(clock);
        // 7일 전 = 창(오늘 포함 7일 → today-6 까지) 바로 바깥. 보존 기간(8일) 안이라 행은 남아 있다.
        insertViewEvent(club.getId(), "visitor-stale", today.minusDays(7));

        clubMetricService.refreshAll();

        ClubMetric metric = findMetric(club);
        assertThat(metric.getWeeklyVisitorCount()).isZero();
        assertThat(metric.getInterestScore()).isZero();
        // 창 밖이지만 보존 기간 안이므로 원천 행은 아직 지워지지 않는다.
        assertThat(countEvents(club.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("보존 기간(8일)이 지난 조회 이벤트는 재집계 때 물리 삭제된다")
    void viewsOlderThanRetentionAreDeleted() throws Exception {
        Club club = saveActiveClub("관심도보존");
        LocalDate today = LocalDate.now(clock);
        insertViewEvent(club.getId(), "visitor-expired", today.minusDays(ClubInterestPolicy.RETENTION_DAYS));
        // 보존 경계의 마지막 날 — 지워지면 안 된다(오늘 포함 8일치를 남기는 규약).
        insertViewEvent(club.getId(), "visitor-boundary", today.minusDays(ClubInterestPolicy.RETENTION_DAYS - 1L));
        insertViewEvent(club.getId(), "visitor-fresh", today);

        clubMetricService.refreshAll();

        // 보존 기간이 곧 개인정보 약속이므로 soft delete 가 아니라 행 자체가 사라져야 한다.
        assertThat(countEvents(club.getId())).isEqualTo(2);
        // 경계일 행은 남아 있지만 집계 창(7일) 밖이라 주간 순방문자에는 오늘 1명만 잡힌다.
        assertThat(findMetric(club).getWeeklyVisitorCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("이번 주 조회가 없는 동아리의 관심도는 지난 점수가 남지 않고 0 으로 초기화된다")
    void clubWithoutRecentViewsIsResetToZero() throws Exception {
        Club club = saveActiveClub("관심도소멸");
        LocalDate today = LocalDate.now(clock);
        insertViewEvent(club.getId(), "visitor-past", today);
        clubMetricService.refreshAll();
        assertThat(findMetric(club).getWeeklyVisitorCount()).isEqualTo(1);

        // 조회 이력이 통째로 사라진 상태(창 이탈과 같은 결과)에서 다시 집계한다.
        jdbcTemplate.update("DELETE FROM club_view_event WHERE club_id = ?", club.getId());
        clubMetricService.refreshAll();

        ClubMetric metric = findMetric(club);
        assertThat(metric.getWeeklyVisitorCount()).isZero();
        assertThat(metric.getInterestScore()).isZero();
    }

    private ClubMetric findMetric(Club club) {
        return clubMetricRepository.findById(club.getId()).orElseThrow();
    }

    private void insertViewEvent(Long clubId, String visitorKey, LocalDate eventDate) {
        jdbcTemplate.update(
                "INSERT INTO club_view_event (club_id, visitor_hash, event_date) VALUES (?, ?, ?)",
                clubId, ClubInterestPolicy.visitorHash(visitorKey), eventDate);
    }

    private int countEvents(Long clubId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM club_view_event WHERE club_id = ?", Integer.class, clubId);
        return count == null ? 0 : count;
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
