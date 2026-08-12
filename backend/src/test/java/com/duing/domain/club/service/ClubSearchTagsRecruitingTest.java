package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubSearchTagsRecruitingTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    @Test
    @DisplayName("tags 필터는 입력 태그를 하나라도 포함하는 동아리만 반환한다")
    void filtersByTagsContainment() throws Exception {
        // V12 시드("두잉 축구부": 축구·스포츠 태그)가 동일 태그를 가지고 있어
        // exact match 가 아닌 contains 로 검증한다. 본 테스트의 시드("축구부테스트") 만
        // 격리해서 본 동아리가 결과에 포함되고, 러닝클럽테스트 는 포함되지 않음을 확인.
        saveClubWithTags("축구부테스트", List.of("축구", "친목"));
        saveClubWithTags("러닝클럽테스트", List.of("러닝"));

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, null, List.of("축구"), null, null, null, null, null, null, null),
                PageRequest.of(0, 10));

        assertThat(page.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("축구부테스트")
                .doesNotContain("러닝클럽테스트");
    }

    @Test
    @DisplayName("recruiting=true 는 오늘 기준 OPEN 이며 종료일이 지나지 않은 모집을 가진 동아리만 반환한다")
    void filtersByActiveRecruitment() throws Exception {
        // V12 시드 및 운영 데이터의 기존 모집(예: 두잉 코딩 동아리) 가 함께 반환될 수 있어
        // exact match 대신 contains 로 검증한다. 본 테스트의 OPEN/CLOSED 두 동아리만 격리해서
        // OPEN 은 포함되고 CLOSED 는 제외됨을 확인.
        Club withOpen = saveClubWithTags("A동아리테스트", List.of());
        Club withClosed = saveClubWithTags("B동아리테스트", List.of());
        saveOpenRecruitment(withOpen, LocalDate.now().minusDays(3), LocalDate.now().plusDays(7));
        saveClosedRecruitment(withClosed, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, null, null, true, null, null, null, null, null, null),
                PageRequest.of(0, 10));

        assertThat(page.getContent())
                .extracting(ClubSummaryQuery::name)
                .contains("A동아리테스트")
                .doesNotContain("B동아리테스트");
    }

    private Club saveClubWithTags(String name, List<String> tags) throws Exception {
        Club club = Club.create(name, ClubCategory.SPORTS, "체육", "desc", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        Field tagsField = Club.class.getDeclaredField("tags");
        tagsField.setAccessible(true);
        tagsField.set(club, tags.toArray(new String[0]));
        return clubRepository.save(club);
    }

    private void saveOpenRecruitment(Club club, LocalDate start, LocalDate end) {
        Recruitment recruitment = Recruitment.create(club, "모집중", null, start, end, 5);
        recruitmentRepository.save(recruitment);
    }

    private void saveClosedRecruitment(Club club, LocalDate start, LocalDate end) throws Exception {
        Recruitment recruitment = Recruitment.create(club, "마감됨", null, start, end, 5);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(recruitment, RecruitmentStatus.CLOSED);
        recruitmentRepository.save(recruitment);
    }
}
