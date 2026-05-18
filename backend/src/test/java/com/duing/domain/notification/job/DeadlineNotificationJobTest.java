package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class DeadlineNotificationJobTest {

    @Autowired
    private DeadlineNotificationJob job;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubFavoriteRepository favoriteRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("D-3/D-1/D-0 모집을 찜한 유저들에게 RECRUITMENT_DEADLINE 알림이 멱등 생성된다")
    void deadlineFanoutIsIdempotent() throws Exception {
        LocalDate today = LocalDate.now();

        User favoringUserA = saveStudent("찜유저A");
        User favoringUserB = saveStudent("찜유저B");
        User nonFavoringUser = saveStudent("비찜유저C");

        Club targetClub = saveActiveClub("대상동아리");

        saveFavorite(favoringUserA, targetClub);
        saveFavorite(favoringUserB, targetClub);

        // D-3 모집
        saveOpenRecruitment(targetClub, "D3모집", today.minusDays(5), today.plusDays(3));
        // D-1 모집
        saveOpenRecruitment(targetClub, "D1모집", today.minusDays(5), today.plusDays(1));
        // D-0 모집
        saveOpenRecruitment(targetClub, "D0모집", today.minusDays(5), today);
        // 관련 없음 (D-7)
        saveOpenRecruitment(targetClub, "무관모집", today.minusDays(1), today.plusDays(7));
        // CLOSED 모집 (마감일이 today+3 이지만 상태가 CLOSED)
        saveClosedRecruitment(targetClub, "CLOSED모집", today.minusDays(5), today.plusDays(3));

        long beforeCount = notificationRepository.count();
        job.run();
        long afterFirstRun = notificationRepository.count();

        // D-3/D-1/D-0 각 1개 × 찜한 유저 2명 = 6개 알림
        assertThat(afterFirstRun - beforeCount).isEqualTo(6);

        // 비찜 유저에게는 알림이 없어야 한다
        long nonFavoringUserCount = notificationRepository.findAll().stream()
                .filter(n -> n.getUserId().equals(nonFavoringUser.getId()))
                .count();
        assertThat(nonFavoringUserCount).isZero();

        // 두 번 실행해도 row 수 동일 (멱등)
        job.run();
        long afterSecondRun = notificationRepository.count();
        assertThat(afterSecondRun).isEqualTo(afterFirstRun);
    }

    @Test
    @DisplayName("오늘 시작하는 OPEN 모집은 RECRUITMENT_OPENED 로 분류되어 찜한 유저에게 알림이 생성된다")
    void openedKindFanout() throws Exception {
        LocalDate today = LocalDate.now();

        User favoringUser = saveStudent("찜유저D");
        Club club = saveActiveClub("오픈동아리");
        saveFavorite(favoringUser, club);

        // 오늘 시작하는 모집
        saveOpenRecruitment(club, "오늘시작모집", today, today.plusDays(14));

        long beforeCount = notificationRepository.count();
        job.run();
        long createdCount = notificationRepository.count() - beforeCount;

        assertThat(createdCount).isEqualTo(1);

        // RECRUITMENT_OPENED dedup_key 형식 검증
        boolean hasOpenedKey = notificationRepository.findAll().stream()
                .filter(n -> n.getUserId().equals(favoringUser.getId()))
                .anyMatch(n -> n.getDedupKey().startsWith("RECRUITMENT_OPENED:r="));
        assertThat(hasOpenedKey).isTrue();
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "jobtest" + unique + "@daegu.ac.kr",
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
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveFavorite(User user, Club club) {
        ClubFavorite favorite = ClubFavorite.create(user, club);
        favoriteRepository.save(favorite);
    }

    private void saveOpenRecruitment(Club club, String title, LocalDate start, LocalDate end) {
        Recruitment recruitment = Recruitment.create(club, title, null, start, end, 10);
        recruitmentRepository.save(recruitment);
    }

    private void saveClosedRecruitment(Club club, String title, LocalDate start, LocalDate end)
            throws Exception {
        Recruitment recruitment = Recruitment.create(club, title, null, start, end, 10);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(recruitment, RecruitmentStatus.CLOSED);
        recruitmentRepository.save(recruitment);
    }
}