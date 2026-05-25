package com.duing.domain.recruitment.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RecruitmentRepositoryActiveLookupTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("활성 모집(OPEN 이며 endDate null 또는 미래)이 있으면 그 모집이 우선 반환된다")
    void activeRecruitmentTakesPrecedenceOverClosedHistory() throws Exception {
        Club clubA = saveActiveClub("lookupA");
        Recruitment closed = saveRecruitment(clubA, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));
        closed.close();
        recruitmentRepository.save(closed);
        Recruitment active = saveRecruitment(clubA, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubA.getId()), LocalDate.now());

        assertThat(result.get(clubA.getId()).recruitmentId()).isEqualTo(active.getId());
    }

    @Test
    @DisplayName("활성 모집이 없으면 가장 최근에 마감된 모집이 반환된다")
    void mostRecentlyClosedRecruitmentReturnedWhenNoActive() throws Exception {
        Club clubB = saveActiveClub("lookupB");
        Recruitment older = saveRecruitment(clubB, LocalDate.now().minusDays(60), LocalDate.now().minusDays(40));
        older.close();
        recruitmentRepository.save(older);
        Recruitment newer = saveRecruitment(clubB, LocalDate.now().minusDays(30), LocalDate.now().minusDays(5));
        newer.close();
        recruitmentRepository.save(newer);

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubB.getId()), LocalDate.now());

        assertThat(result.get(clubB.getId()).recruitmentId()).isEqualTo(newer.getId());
    }

    @Test
    @DisplayName("모집 이력이 없는 동아리는 결과 맵에 키가 없다")
    void clubWithoutRecruitmentIsAbsent() throws Exception {
        Club clubC = saveActiveClub("lookupC");

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubC.getId()), LocalDate.now());

        assertThat(result).doesNotContainKey(clubC.getId());
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }
}