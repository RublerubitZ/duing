package com.duing.domain.favorite.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.exception.FavoriteException;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
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

    @PersistenceContext
    private EntityManager entityManager;

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
    @DisplayName("찜 해제 후 같은 동아리를 다시 찜하면 예외 없이 재활성화되어 목록에 다시 포함된다")
    void reFavoriteAfterRemoveReactivates() throws Exception {
        User student = saveStudent("학생E");
        Club club = saveActiveClub("재찜동아리E");

        favoriteService.add(student.getId(), club.getId());
        flushAndClear();

        favoriteService.remove(student.getId(), club.getId());
        flushAndClear();

        // 해제 직후에는 내 찜 목록에서 빠진다.
        assertThat(favoriteService.getMyFavoriteClubIds(student.getId()))
                .doesNotContain(club.getId());

        // 다시 찜 — 소프트 삭제된 행이 점유한 유니크 슬롯 때문에 실패하면 안 된다.
        favoriteService.add(student.getId(), club.getId());
        flushAndClear();

        // 다시 찜한 동아리는 목록에 정확히 한 번 포함된다.
        assertThat(favoriteService.getMyFavoriteClubIds(student.getId()))
                .containsOnlyOnce(club.getId());
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    @Test
    @DisplayName("찜하지 않은 동아리를 해제해도 예외 없이 멱등하게 끝난다")
    void idempotentRemoveDoesNotThrow() throws Exception {
        User student = saveStudent("학생B");
        Club club = saveActiveClub("축제동아리B");

        favoriteService.remove(student.getId(), club.getId());
        favoriteService.remove(student.getId(), club.getId());

        long count = favoriteRepository
                .findAllByUserIdAndClubStatusOrderByCreatedAtDesc(student.getId(), ClubStatus.ACTIVE)
                .size();
        assertThat(count).isZero();
    }

    @Test
    @DisplayName("내 찜한 동아리 페이지 조회는 진행 중 모집 수를 함께 반환한다")
    void favoriteListIncludesOpenRecruitmentCount() throws Exception {
        User student = saveStudent("학생C");
        Club clubWithOpen = saveActiveClub("모집중동아리C");
        Club clubWithClosed = saveActiveClub("마감동아리C");

        // V38 partial unique 인덱스로 동아리당 OPEN 모집은 1건만 허용된다.
        // clubWithOpen 은 진행 중 OPEN 1건, clubWithClosed 는 endDate 가 지난 OPEN 1건으로 분리해
        // openRecruitmentCount 가 OPEN+future 만 카운트하는 의미를 검증한다.
        LocalDate today = LocalDate.now();
        saveRecruitment(clubWithOpen, "진행모집", today.minusDays(1), today.plusDays(7), RecruitmentStatus.OPEN);
        saveRecruitment(clubWithClosed, "기간만료모집", today.minusDays(30), today.minusDays(1), RecruitmentStatus.OPEN);

        favoriteService.add(student.getId(), clubWithOpen.getId());
        favoriteService.add(student.getId(), clubWithClosed.getId());

        Page<FavoriteClubQuery> result = favoriteService.getMyFavorites(student.getId(), PageRequest.of(0, 10));

        assertThat(result.getTotalElements()).isEqualTo(2);
        FavoriteClubQuery openClubQuery = result.getContent().stream()
                .filter(query -> query.clubId().equals(clubWithOpen.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(openClubQuery.openRecruitmentCount()).isEqualTo(1);

        FavoriteClubQuery closedClubQuery = result.getContent().stream()
                .filter(query -> query.clubId().equals(clubWithClosed.getId()))
                .findFirst()
                .orElseThrow();
        assertThat(closedClubQuery.openRecruitmentCount()).isZero();
    }

    @ParameterizedTest(name = "{0} 상태 동아리 찜 추가는 ClubNotFoundException")
    @EnumSource(value = ClubStatus.class, names = {"PENDING_APPROVAL", "INACTIVE", "REJECTED"})
    @DisplayName("학생에게 노출되지 않는 비 ACTIVE 동아리를 찜하면 ClubNotFoundException 이 발생한다")
    void addFavoriteToNonActiveClubThrowsClubNotFound(ClubStatus nonActiveStatus) throws Exception {
        User student = saveStudent("학생F");
        Club nonActiveClub = saveClubWithStatus("비활성동아리F", nonActiveStatus);

        assertThatThrownBy(() -> favoriteService.add(student.getId(), nonActiveClub.getId()))
                .isInstanceOf(ClubException.ClubNotFoundException.class);
    }

    @Test
    @DisplayName("찜한 동아리가 비 ACTIVE 로 전환되면 찜 목록과 ID 목록에서 제외된다")
    void favoritesOfNonActiveClubAreHiddenFromListAndIds() throws Exception {
        User student = saveStudent("학생G");
        Club club = saveActiveClub("휴면전환동아리G");

        favoriteService.add(student.getId(), club.getId());
        flushAndClear();

        changeClubStatus(club.getId(), ClubStatus.INACTIVE);

        Page<FavoriteClubQuery> favoritePage =
                favoriteService.getMyFavorites(student.getId(), PageRequest.of(0, 10));
        assertThat(favoritePage.getTotalElements()).isZero();
        assertThat(favoritePage.getContent()).isEmpty();
        assertThat(favoriteService.getMyFavoriteClubIds(student.getId()))
                .doesNotContain(club.getId());
    }

    @Test
    @DisplayName("숨겨졌던 동아리가 다시 ACTIVE 로 전환되면 기존 찜이 목록에 다시 나타난다")
    void favoriteReappearsWhenClubReactivated() throws Exception {
        User student = saveStudent("학생H");
        Club club = saveActiveClub("재활성동아리H");

        favoriteService.add(student.getId(), club.getId());
        flushAndClear();

        changeClubStatus(club.getId(), ClubStatus.INACTIVE);
        assertThat(favoriteService.getMyFavoriteClubIds(student.getId()))
                .doesNotContain(club.getId());

        changeClubStatus(club.getId(), ClubStatus.ACTIVE);

        assertThat(favoriteService.getMyFavoriteClubIds(student.getId()))
                .containsExactly(club.getId());
        Page<FavoriteClubQuery> favoritePage =
                favoriteService.getMyFavorites(student.getId(), PageRequest.of(0, 10));
        assertThat(favoritePage.getTotalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("비 ACTIVE 동아리에 대한 기존 찜도 해제는 정상 동작한다")
    void removeFavoriteOfNonActiveClubStillWorks() throws Exception {
        User student = saveStudent("학생I");
        Club club = saveActiveClub("해제가능동아리I");

        favoriteService.add(student.getId(), club.getId());
        flushAndClear();

        changeClubStatus(club.getId(), ClubStatus.INACTIVE);

        favoriteService.remove(student.getId(), club.getId());
        flushAndClear();

        assertThat(favoriteRepository.findByUserIdAndClubId(student.getId(), club.getId()))
                .isEmpty();
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
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        return saveClubWithStatus(name, ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        setClubStatus(club, status);
        return clubRepository.save(club);
    }

    // 상태 전이 규칙(canTransitionTo)을 우회해 테스트 시나리오에 필요한 상태를 직접 만든다.
    private void changeClubStatus(Long clubId, ClubStatus status) throws Exception {
        Club club = clubRepository.findById(clubId).orElseThrow();
        setClubStatus(club, status);
        flushAndClear();
    }

    private void setClubStatus(Club club, ClubStatus status) throws Exception {
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
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