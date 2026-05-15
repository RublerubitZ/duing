package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubSearchTagsRecruitingTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    @Test
    @DisplayName("tags 필터는 입력 태그를 하나라도 포함하는 동아리만 반환한다")
    void filtersByTagsContainment() throws Exception {
        saveClubWithTags("축구부", List.of("축구", "친목"));
        saveClubWithTags("러닝클럽", List.of("러닝"));

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, null, List.of("축구"), null),
                PageRequest.of(0, 10));

        assertThat(page.getContent()).extracting(Club::getName).containsExactly("축구부");
    }

    @Test
    @DisplayName("recruiting=true 는 오늘 기준 OPEN 이며 종료일이 지나지 않은 모집을 가진 동아리만 반환한다")
    void filtersByActiveRecruitment() throws Exception {
        Club withOpen = saveClubWithTags("A동아리", List.of());
        Club withClosed = saveClubWithTags("B동아리", List.of());
        saveOpenRecruitment(withOpen, LocalDate.now().minusDays(3), LocalDate.now().plusDays(7));
        saveClosedRecruitment(withClosed, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, null, null, true),
                PageRequest.of(0, 10));

        assertThat(page.getContent()).extracting(Club::getName).containsExactly("A동아리");
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
