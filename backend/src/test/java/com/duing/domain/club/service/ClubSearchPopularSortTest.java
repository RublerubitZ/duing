package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSortOption;
import com.duing.domain.club.service.dto.query.RecruitmentStatusFilter;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
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
class ClubSearchPopularSortTest {

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubFavoriteRepository clubFavoriteRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("POPULAR — applicationCount 가 많은 동아리가 앞 순위로 정렬된다")
    void applicationCountIsPrimaryOrder() throws Exception {
        Club few = saveActiveClub("popAppFew");
        Club many = saveActiveClub("popAppMany");
        Recruitment fewRec = saveOpenRecruitment(few, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        Recruitment manyRec = saveOpenRecruitment(many, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(fewRec, 1);
        saveApplications(manyRec, 5);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popApp"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(many.getName(), few.getName());
    }

    @Test
    @DisplayName("POPULAR — applicationCount 동률 시 favoriteCount 가 더 많은 동아리가 앞에 온다")
    void favoriteCountIsSecondaryTiebreak() throws Exception {
        Club lessFav = saveActiveClub("popFavLess");
        Club moreFav = saveActiveClub("popFavMore");
        Recruitment lessFavRec = saveOpenRecruitment(lessFav, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        Recruitment moreFavRec = saveOpenRecruitment(moreFav, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(lessFavRec, 2);
        saveApplications(moreFavRec, 2);
        saveFavorites(lessFav, 1);
        saveFavorites(moreFav, 3);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popFav"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(moreFav.getName(), lessFav.getName());
    }

    @Test
    @DisplayName("POPULAR — application/favorite 동률 시 활성 모집 시작일이 늦은 동아리가 앞에 온다")
    void recruitmentStartDateIsTertiaryTiebreak() throws Exception {
        Club earlier = saveActiveClub("popStartEarlier");
        Club later = saveActiveClub("popStartLater");
        saveOpenRecruitment(earlier, LocalDate.now().minusDays(10), LocalDate.now().plusDays(7));
        saveOpenRecruitment(later, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popStart"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(later.getName(), earlier.getName());
    }

    @Test
    @DisplayName("POPULAR — 활성 모집 없는 동아리는 favoriteCount 가 많아도 활성 모집 있는 동아리 뒤로 밀린다")
    void clubsWithoutActiveRecruitmentFallBack() throws Exception {
        Club withRec = saveActiveClub("popWithRec");
        Club withoutRec = saveActiveClub("popWithoutRec");
        Recruitment withRecRec = saveOpenRecruitment(withRec, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(withRecRec, 1);
        saveFavorites(withoutRec, 99);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popWith"),
                PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName).containsSubsequence(withRec.getName(), withoutRec.getName());
    }

    @Test
    @DisplayName("POPULAR + recruitmentStatus=AVAILABLE — 활성 모집 없는 동아리는 결과에서 완전히 빠진다")
    void availableFilterRemovesClubsWithoutActiveRecruitment() throws Exception {
        Club withRec = saveActiveClub("popAvailWith");
        Club withoutRec = saveActiveClub("popAvailWithout");
        Recruitment rec = saveOpenRecruitment(withRec, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(rec, 1);
        saveFavorites(withoutRec, 10);

        ClubSearchCondition condition = new ClubSearchCondition(
                null, null, "popAvail", null, null,
                RecruitmentStatusFilter.AVAILABLE, null, null, null, ClubSortOption.POPULAR);

        List<Club> page = clubRepository.findByCondition(condition, PageRequest.of(0, 50)).getContent();

        assertThat(page).extracting(Club::getName)
                .contains(withRec.getName())
                .doesNotContain(withoutRec.getName());
    }

    @Test
    @DisplayName("POPULAR — 이전 모집(CLOSED)의 application 은 applicationCount 에 포함되지 않고 현재 OPEN 모집만 집계된다")
    void onlyOpenRecruitmentApplicationsCountedForPopular() throws Exception {
        // 스키마 제약(uk_recruitment_club_active): 동아리당 OPEN 모집은 1건만 허용.
        // 이전 모집은 CLOSED 상태이므로 POPULAR 집계 대상에서 제외된다.
        Club manyOld = saveActiveClub("popOnlyOpen-A");
        Club fewNew = saveActiveClub("popOnlyOpen-B");

        // manyOld: CLOSED 모집에 application 10개, OPEN 모집에 1개
        Recruitment closedRec = saveRecruitmentWithStatus(manyOld, LocalDate.now().minusDays(30),
                LocalDate.now().minusDays(1), RecruitmentStatus.CLOSED);
        Recruitment manyOldOpenRec = saveOpenRecruitment(manyOld, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));
        saveApplications(closedRec, 10);
        saveApplications(manyOldOpenRec, 1);

        // fewNew: OPEN 모집에 application 3개
        Recruitment fewNewOpenRec = saveOpenRecruitment(fewNew, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7));
        saveApplications(fewNewOpenRec, 3);

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popOnlyOpen"),
                PageRequest.of(0, 50)).getContent();

        // fewNew(OPEN 3) > manyOld(OPEN 1) — CLOSED 의 10개는 제외
        assertThat(page).extracting(Club::getName).containsSubsequence(fewNew.getName(), manyOld.getName());
    }

    @Test
    @DisplayName("POPULAR — soft-delete 된 application 은 applicationCount 에서 제외된다 (@SQLRestriction 자동 적용 검증)")
    void softDeletedApplicationsAreExcludedFromCount() throws Exception {
        Club alive = saveActiveClub("popSoftAlive");
        Club deleted = saveActiveClub("popSoftDeleted");
        Recruitment aliveRec = saveOpenRecruitment(alive, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        Recruitment deletedRec = saveOpenRecruitment(deleted, LocalDate.now().minusDays(2), LocalDate.now().plusDays(7));
        saveApplications(aliveRec, 2);
        List<Application> toDelete = saveApplications(deletedRec, 5);
        // 5개 중 4개 soft-delete → 살아있는 application 1개만 카운트
        for (int i = 0; i < 4; i++) {
            applicationRepository.delete(toDelete.get(i));
        }
        applicationRepository.flush();

        List<Club> page = clubRepository.findByCondition(
                conditionPopular("popSoft"),
                PageRequest.of(0, 50)).getContent();

        // alive(2) > deleted(1 살아남음)
        assertThat(page).extracting(Club::getName).containsSubsequence(alive.getName(), deleted.getName());
    }

    private ClubSearchCondition conditionPopular(String keyword) {
        return new ClubSearchCondition(
                null, null, keyword, null, null, null, null, null, null, ClubSortOption.POPULAR);
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private Recruitment saveOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        return recruitmentRepository.save(created);
    }

    private Recruitment saveRecruitmentWithStatus(Club club, LocalDate startDate, LocalDate endDate,
            RecruitmentStatus status) throws Exception {
        Recruitment created = Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null, startDate, endDate, 10);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        return recruitmentRepository.save(created);
    }

    private List<Application> saveApplications(Recruitment recruitment, int count) {
        List<Application> saved = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            User user = saveUser("popAppUser");
            Application application = Application.submit(recruitment, user, List.of("answer"));
            saved.add(applicationRepository.save(application));
        }
        return saved;
    }

    private void saveFavorites(Club club, int count) {
        for (int i = 0; i < count; i++) {
            User user = saveUser("popFavUser");
            clubFavoriteRepository.save(ClubFavorite.create(user, club));
        }
    }

    private User saveUser(String prefix) {
        long seq = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                prefix + seq,
                "u" + seq + "@duing.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }
}
