package com.duing.domain.recruitment.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.service.dto.query.RepresentativeRecruitmentRow;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RecruitmentRepositoryActiveLookupTest extends IntegrationTestBase {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("활성 모집(OPEN 이며 endDate null 또는 미래)이 있으면 그 모집이 우선 반환된다")
    void activeRecruitmentTakesPrecedenceOverClosedHistory() throws Exception {
        Club clubA = saveActiveClub("lookupA");
        Recruitment closed = saveRecruitment(clubA, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));
        closed.close(LocalDateTime.now());
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
        older.close(LocalDateTime.now());
        recruitmentRepository.save(older);
        Recruitment newer = saveRecruitment(clubB, LocalDate.now().minusDays(30), LocalDate.now().minusDays(5));
        newer.close(LocalDateTime.now());
        recruitmentRepository.save(newer);

        Map<Long, ClubActiveRecruitmentRow> result = recruitmentRepository.findRepresentativeByClubIds(
                List.of(clubB.getId()), LocalDate.now());

        assertThat(result.get(clubB.getId()).recruitmentId()).isEqualTo(newer.getId());
    }

    @Test
    @DisplayName("마감된 상시모집은 대표 자리를 가로채지 않고 가장 최근에 끝난 모집이 반환된다")
    void closedAlwaysOpenRecruitmentDoesNotWinRepresentative() throws Exception {
        Club club = saveActiveClub("lookupAlwaysOpen");
        // 종료일이 없는 상시모집은 정렬에서 놓을 자리가 없다 — 가장 늦은 날짜로 취급하면 이 행이
        // 영구히 대표가 되어, 이후 기간제 모집을 몇 번을 더 돌려도 옛날 상시모집이 화면에 남는다.
        saveClosedRecruitment(club, LocalDate.now().minusDays(200), null);
        Recruitment latestClosed = saveClosedRecruitment(
                club, LocalDate.now().minusDays(30), LocalDate.now().minusDays(3));

        Map<Long, ClubActiveRecruitmentRow> batchResult = recruitmentRepository
                .findRepresentativeByClubIds(List.of(club.getId()), LocalDate.now());

        assertThat(batchResult.get(club.getId()).recruitmentId()).isEqualTo(latestClosed.getId());
        assertThat(recruitmentRepository.findRepresentativeByClubId(club.getId(), LocalDate.now()))
                .as("단건 조회(projection)도 배치와 같은 규칙으로 같은 행을 고른다")
                .get()
                .extracting(RepresentativeRecruitmentRow::id)
                .isEqualTo(latestClosed.getId());
    }

    @Test
    @DisplayName("단건 대표 모집 조회는 진행 중인 모집을 마감 이력보다 먼저 고른다")
    void singleRepresentativeLookupPrefersActive() throws Exception {
        Club club = saveActiveClub("lookupSingle");
        saveClosedRecruitment(club, LocalDate.now().minusDays(30), LocalDate.now().minusDays(10));
        Recruitment active = saveRecruitment(club, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));

        assertThat(recruitmentRepository.findRepresentativeByClubId(club.getId(), LocalDate.now()))
                .get()
                .extracting(RepresentativeRecruitmentRow::id)
                .isEqualTo(active.getId());
    }

    @Test
    @DisplayName("모집 이력이 없는 동아리는 단건 대표 조회도 비어 있다")
    void singleRepresentativeLookupIsEmptyWithoutRecruitment() throws Exception {
        Club club = saveActiveClub("lookupSingleEmpty");

        assertThat(recruitmentRepository.findRepresentativeByClubId(club.getId(), LocalDate.now()))
                .isEmpty();
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

    /** 마감 UPDATE 를 먼저 내보내야 다음 INSERT 가 uk_recruitment_club_active 에 걸리지 않는다. */
    private Recruitment saveClosedRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = saveRecruitment(club, startDate, endDate);
        created.close(LocalDateTime.now());
        recruitmentRepository.saveAndFlush(created);
        return created;
    }

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }
}