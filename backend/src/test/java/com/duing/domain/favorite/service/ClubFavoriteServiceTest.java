package com.duing.domain.favorite.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.exception.FavoriteException;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubFavoriteServiceTest {

    @Autowired
    private ClubFavoriteService favoriteService;

    @Autowired
    private ClubFavoriteRepository favoriteRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("같은 동아리를 두 번 찜하면 AlreadyFavoritedException 이 발생한다")
    void duplicateFavoriteThrowsException() throws Exception {
        User student = saveStudent("학생A");
        Club club = saveActiveClub("축제동아리A");

        favoriteService.add(student.getId(), club.getId());

        assertThatThrownBy(() -> favoriteService.add(student.getId(), club.getId()))
                .isInstanceOf(FavoriteException.AlreadyFavoritedException.class);
    }

    @Test
    @DisplayName("찜하지 않은 동아리를 해제해도 예외 없이 멱등하게 끝난다")
    void idempotentRemoveDoesNotThrow() throws Exception {
        User student = saveStudent("학생B");
        Club club = saveActiveClub("축제동아리B");

        favoriteService.remove(student.getId(), club.getId());
        favoriteService.remove(student.getId(), club.getId());

        long count = favoriteRepository.findAllByUserIdOrderByCreatedAtDesc(student.getId()).size();
        assertThat(count).isZero();
    }

    @Test
    @DisplayName("내 찜한 동아리 페이지 조회는 진행 중 모집 수를 함께 반환한다")
    void favoriteListIncludesOpenRecruitmentCount() throws Exception {
        User student = saveStudent("학생C");
        Club clubWithOpen = saveActiveClub("모집중동아리C");
        Club clubWithClosed = saveActiveClub("마감동아리C");

        LocalDate today = LocalDate.now();
        saveRecruitment(clubWithOpen, "진행모집1", today.minusDays(1), today.plusDays(7), RecruitmentStatus.OPEN);
        saveRecruitment(clubWithOpen, "진행모집2", today, today.plusDays(14), RecruitmentStatus.OPEN);
        saveRecruitment(clubWithClosed, "마감모집", today.minusDays(30), today.minusDays(1), RecruitmentStatus.OPEN);

        favoriteService.add(student.getId(), clubWithOpen.getId());
        favoriteService.add(student.getId(), clubWithClosed.getId());

        Page<FavoriteClubQuery> result = favoriteService.getMyFavorites(student.getId(), PageRequest.of(0, 10));

        assertThat(result.getTotalElements()).isEqualTo(2);
        FavoriteClubQuery openClubQuery = result.getContent().stream()
                .filter(query -> query.clubId().equals(clubWithOpen.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(openClubQuery.openRecruitmentCount()).isEqualTo(2);

        FavoriteClubQuery closedClubQuery = result.getContent().stream()
                .filter(query -> query.clubId().equals(clubWithClosed.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(closedClubQuery.openRecruitmentCount()).isZero();
    }

    @Test
    @DisplayName("내 찜한 동아리 ID 목록은 찜한 시각 역순으로 반환된다")
    void favoriteClubIdsReturnedInDescCreatedAtOrder() throws Exception {
        User student = saveStudent("학생D");
        Club clubFirst = saveActiveClub("첫번째찜동아리D");
        Club clubSecond = saveActiveClub("두번째찜동아리D");

        favoriteService.add(student.getId(), clubFirst.getId());
        Thread.sleep(10);
        favoriteService.add(student.getId(), clubSecond.getId());

        List<Long> clubIds = favoriteService.getMyFavoriteClubIds(student.getId());

        assertThat(clubIds).containsExactly(clubSecond.getId(), clubFirst.getId());
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "user" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveRecruitment(Club club, String title, LocalDate start, LocalDate end,
            RecruitmentStatus status) throws Exception {
        Recruitment recruitment = Recruitment.create(club, title, null, start, end, 10);
        if (status != RecruitmentStatus.OPEN) {
            Field statusField = Recruitment.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(recruitment, status);
        }
        recruitmentRepository.save(recruitment);
    }
}