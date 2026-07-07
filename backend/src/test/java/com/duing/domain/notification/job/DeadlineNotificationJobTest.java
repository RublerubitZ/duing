package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
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
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.notification.jobs.enabled=true")
class DeadlineNotificationJobTest extends IntegrationTestBase {

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

    @Autowired
    private Clock clock;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("D-3/D-1/D-0 모집을 찜한 유저들에게 RECRUITMENT_DEADLINE 알림이 멱등 생성된다")
    void deadlineFanoutIsIdempotent() throws Exception {
        // 잡과 동일한 Clock(Asia/Seoul) 사용 — CI TZ 와 무관하게 D-0/D-1/D-3 계산 일치.
        LocalDate today = LocalDate.now(clock);

        User favoringUserA = saveStudent("찜유저A");
        User favoringUserB = saveStudent("찜유저B");
        User nonFavoringUser = saveStudent("비찜유저C");

        // V38 partial unique 인덱스로 동아리당 OPEN 모집은 1건만 허용된다.
        // 각 deadline 케이스를 동아리별로 분리하고 두 찜 유저가 모든 동아리를 찜하도록 구성한다.
        Club d3Club = saveActiveClub("D3동아리");
        Club d1Club = saveActiveClub("D1동아리");
        Club d0Club = saveActiveClub("D0동아리");
        Club unrelatedClub = saveActiveClub("무관동아리");
        Club closedClub = saveActiveClub("마감동아리");

        for (Club club : List.of(d3Club, d1Club, d0Club, unrelatedClub, closedClub)) {
            saveFavorite(favoringUserA, club);
            saveFavorite(favoringUserB, club);
        }

        saveOpenRecruitment(d3Club, "D3모집", today.minusDays(5), today.plusDays(3));
        saveOpenRecruitment(d1Club, "D1모집", today.minusDays(5), today.plusDays(1));
        saveOpenRecruitment(d0Club, "D0모집", today.minusDays(5), today);
        // 관련 없음 (D-7)
        saveOpenRecruitment(unrelatedClub, "무관모집", today.minusDays(1), today.plusDays(7));
        // CLOSED 모집 (마감일이 today+3 이지만 상태가 CLOSED)
        saveClosedRecruitment(closedClub, "CLOSED모집", today.minusDays(5), today.plusDays(3));

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
        // 잡과 동일한 Clock(Asia/Seoul) 사용 — CI TZ 와 무관하게 D-0/D-1/D-3 계산 일치.
        LocalDate today = LocalDate.now(clock);

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

    @Test
    @DisplayName("마감일이 없는 상시모집이 오늘 시작하면 RECRUITMENT_OPENED 알림 body 에 '상시 모집' 으로 표기되고 동아리 상세로 링크된다")
    void openedKindWithoutEndDateShowsAlwaysLabel() throws Exception {
        LocalDate today = LocalDate.now(clock);

        User favoringUser = saveStudent("찜유저상시");
        Club club = saveActiveClub("상시모집동아리");
        saveFavorite(favoringUser, club);

        // 오늘 시작하는 상시모집 (마감일 없음)
        saveOpenRecruitment(club, "상시 신입모집", today, null);

        long beforeCount = notificationRepository.count();
        job.run();
        assertThat(notificationRepository.count() - beforeCount).isEqualTo(1);

        Notification openedNotification = notificationRepository.findAll().stream()
                .filter(notification -> notification.getUserId().equals(favoringUser.getId()))
                .filter(notification -> notification.getType() == NotificationType.RECRUITMENT_OPENED)
                .findFirst()
                .orElseThrow();
        assertThat(openedNotification.getBody()).contains("상시 모집");
        assertThat(openedNotification.getBody()).doesNotContain("null");
        assertThat(openedNotification.getLinkUrl()).isEqualTo("/clubs/" + club.getId());
    }

    @Test
    @DisplayName("soft-delete 된 동아리의 OPEN 모집은 마감 알림 후보에서 제외된다")
    void softDeletedClubRecruitmentIsExcluded() throws Exception {
        LocalDate today = LocalDate.now(clock);

        User favoringUser = saveStudent("찜유저E");
        Club club = saveActiveClub("삭제예정동아리");
        saveFavorite(favoringUser, club);
        saveOpenRecruitment(club, "삭제동아리모집", today.minusDays(5), today.plusDays(3)); // D-3 후보

        // 클로저 cascade 를 거치지 않고 동아리만 soft-delete 한다(@SQLDelete 로 deleted_at 설정).
        // 모집 행은 OPEN·미삭제로 남으므로, 클럽 soft-delete 만으로 후보에서 빠지는지를 검증한다.
        clubRepository.delete(club);

        long beforeCount = notificationRepository.count();
        job.run();
        long createdCount = notificationRepository.count() - beforeCount;

        // native query 가 c.deleted_at IS NULL 로 걸러 알림이 생성되지 않아야 한다.
        assertThat(createdCount).isZero();
    }

    @Test
    @DisplayName("운영 중단 동아리의 마감 임박 모집은 알림 후보에서 제외된다")
    void inactiveClubRecruitmentIsExcluded() throws Exception {
        LocalDate today = LocalDate.now(clock);

        User favoringUser = saveStudent("찜유저F");
        Club club = saveActiveClub("운영중단동아리");
        saveFavorite(favoringUser, club);
        saveOpenRecruitment(club, "중단동아리모집", today.minusDays(5), today.plusDays(3)); // D-3 후보

        // 벌크 마감(운영 중단 전환 시 OPEN 일괄 CLOSED)을 우회해 club 만 INACTIVE 로 바꿔
        // "OPEN 모집 + 비 ACTIVE 동아리" 정합 깨진 상태를 만든다.
        // native query 의 c.status = 'ACTIVE' 조건이 독립적으로 걸러내는지 검증한다 (이중 방어).
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        long beforeCount = notificationRepository.count();
        job.run();
        long createdCount = notificationRepository.count() - beforeCount;

        assertThat(createdCount).isZero();
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