package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import java.lang.reflect.Field;
import java.time.DayOfWeek;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubSearchActiveDaysTest {

    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("activeDays 단일 요일 — 해당 요일이 포함된 동아리만 반환된다")
    void singleDayMatchesContainingClubs() throws Exception {
        saveActiveClub("월수금테스트", "MONDAY,WEDNESDAY,FRIDAY");
        saveActiveClub("화목테스트", "TUESDAY,THURSDAY");

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "테스트", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY), null, null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("월수금테스트")
                .doesNotContain("화목테스트");
    }

    @Test
    @DisplayName("activeDays 다중 요일 — OR 매칭. 둘 다 포함 동아리도 1번만 반환된다")
    void multipleDaysApplyOrSemantic() throws Exception {
        saveActiveClub("월수금ORTEST", "MONDAY,WEDNESDAY,FRIDAY");
        saveActiveClub("월ORTEST", "MONDAY");
        saveActiveClub("수ORTEST", "WEDNESDAY");
        saveActiveClub("화목ORTEST", "TUESDAY,THURSDAY");

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "ORTEST", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY), null, null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("월수금ORTEST", "월ORTEST", "수ORTEST")
                .doesNotContain("화목ORTEST");
        assertThat(page.getContent().stream()
                .map(ClubSummaryQuery::name)
                .filter("월수금ORTEST"::equals)
                .count()).isEqualTo(1);
    }

    @Test
    @DisplayName("active_days 가 NULL 인 동아리는 활동요일 필터 적용 시 결과에서 제외된다")
    void nullActiveDaysExcludedWhenFiltered() throws Exception {
        saveActiveClub("월요일NULLTEST", "MONDAY");
        saveActiveClub("미설정NULLTEST", null);

        var filtered = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "NULLTEST", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY), null, null),
                PageRequest.of(0, 50));

        assertThat(filtered.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("월요일NULLTEST")
                .doesNotContain("미설정NULLTEST");

        var unfiltered = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "NULLTEST", null, null, null, null, null,
                        null, null, null),
                PageRequest.of(0, 50));

        assertThat(unfiltered.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("월요일NULLTEST", "미설정NULLTEST");
    }

    @Test
    @DisplayName("active_days 가 빈 문자열인 레거시 동아리는 활동요일 필터 적용 시 제외된다")
    void emptyStringActiveDaysExcludedWhenFiltered() throws Exception {
        saveActiveClub("월요일EMPTYTEST", "MONDAY");
        saveActiveClub("빈문자열EMPTYTEST", "");

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "EMPTYTEST", null, null, null, null, null,
                        Set.of(DayOfWeek.MONDAY), null, null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("월요일EMPTYTEST")
                .doesNotContain("빈문자열EMPTYTEST");
    }

    @Test
    @DisplayName("activeDays 가 7개 전체이면 effectiveActiveDays 가 null 로 정규화되어 미적용과 동일하다")
    void sevenDaysNormalizedToNoFilter() throws Exception {
        saveActiveClub("월요일SEVENTEST", "MONDAY");
        saveActiveClub("미설정SEVENTEST", null);

        Set<DayOfWeek> allSeven = Set.of(
                DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
                DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "SEVENTEST", null, null, null, null, null,
                        allSeven, null, null),
                PageRequest.of(0, 50));

        assertThat(page.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("월요일SEVENTEST", "미설정SEVENTEST");
    }

    /** keyword 필터로 본 테스트 데이터만 격리 — V12 시드 / 운영 데이터 영향 회피. */
    private Club saveActiveClub(String name, String activeDaysCsv) throws Exception {
        Club created = Club.create(name, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);

        Field activeDaysField = Club.class.getDeclaredField("activeDays");
        activeDaysField.setAccessible(true);
        activeDaysField.set(created, activeDaysCsv);

        return clubRepository.save(created);
    }
}
