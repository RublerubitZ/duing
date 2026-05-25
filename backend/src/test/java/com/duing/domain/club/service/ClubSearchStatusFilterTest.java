package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import java.lang.reflect.Field;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubSearchStatusFilterTest {

    @Autowired ClubRepository clubRepository;

    @Test
    @DisplayName("학생 측 동아리 목록 조회는 ACTIVE 상태 동아리만 반환한다")
    void onlyActiveClubsAreReturnedFromPublicSearch() throws Exception {
        saveClubWithStatus("승인대기동아리테스트", ClubStatus.PENDING_APPROVAL);
        saveClubWithStatus("중단동아리테스트", ClubStatus.INACTIVE);
        saveClubWithStatus("활성동아리테스트", ClubStatus.ACTIVE);

        var page = clubRepository.findByCondition(
                new ClubSearchCondition(null, null, "동아리테스트", null, null, null, null, null, null),
                PageRequest.of(0, 10));

        assertThat(page.getContent())
                .extracting(Club::getName)
                .contains("활성동아리테스트")
                .doesNotContain("승인대기동아리테스트")
                .doesNotContain("중단동아리테스트");
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        Club club = Club.create(name, ClubCategory.SPORTS, "체육", "desc", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        Field tagsField = Club.class.getDeclaredField("tags");
        tagsField.setAccessible(true);
        tagsField.set(club, new String[0]);
        return clubRepository.save(club);
    }

}