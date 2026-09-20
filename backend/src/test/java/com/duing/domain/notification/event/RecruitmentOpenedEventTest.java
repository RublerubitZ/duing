package com.duing.domain.notification.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.listener.RecruitmentOpenedListener;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.support.RecruitmentOpenedNotification;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RecruitmentOpenedEventTest extends IntegrationTestBase {

    @Autowired
    private RecruitmentService recruitmentService;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private ClubFavoriteRepository favoriteRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private RecruitmentOpenedListener recruitmentOpenedListener;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @AfterEach
    void cleanup() {
        notificationRepository.deleteAll();
        favoriteRepository.deleteAll();
        clubMemberRepository.deleteAll();
        clubRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    @DisplayName("시작일이 오늘인 OPEN 모집을 생성하면 해당 동아리를 찜한 모든 유저에게 RECRUITMENT_OPENED 알림이 1건씩 생성된다")
    void recruitmentOpenedEventNotifiesFavoritingUsersOnly() throws Exception {
        User leader = saveUser("리더");
        User favorUser1 = saveUser("찜유저1");
        User favorUser2 = saveUser("찜유저2");
        User nonFavorUser = saveUser("비찜유저");
        Club club = saveActiveClub("이벤트동아리");

        saveMembership(club, leader, ClubMemberRole.LEADER);
        saveFavorite(favorUser1, club);
        saveFavorite(favorUser2, club);

        recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "2026 봄 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(14),
                20,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("지원 동기")),
                null,
                null,
                false
        ));

        List<Notification> openedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.RECRUITMENT_OPENED)
                .toList();

        assertThat(openedNotifications).hasSize(2);

        List<Long> notifiedUserIds = openedNotifications.stream()
                .map(Notification::getUserId)
                .toList();
        assertThat(notifiedUserIds).containsExactlyInAnyOrder(favorUser1.getId(), favorUser2.getId());
        assertThat(notifiedUserIds).doesNotContain(nonFavorUser.getId());

        Notification sampleNotification = openedNotifications.get(0);
        assertThat(sampleNotification.getLinkUrl()).isEqualTo("/clubs/" + club.getId());
        assertThat(sampleNotification.getLinkUrl()).doesNotContain("/recruitments/");
        assertThat(sampleNotification.getBody()).contains("마감 ");
    }

    @Test
    @DisplayName("마감일이 없는 상시모집이 오늘 시작하면 알림은 동아리 상세로 링크되고 body 에 '상시 모집' 으로 표기된다")
    void alwaysOpenRecruitmentNotificationLinksToClubAndShowsAlwaysLabel() throws Exception {
        User leader = saveUser("상시리더");
        User favorUser = saveUser("상시찜유저");
        Club club = saveActiveClub("상시모집동아리");

        saveMembership(club, leader, ClubMemberRole.LEADER);
        saveFavorite(favorUser, club);

        recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "상시 신입 모집",
                "내용",
                LocalDate.now(),
                null,
                20,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("지원 동기")),
                null,
                null,
                false
        ));

        List<Notification> openedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.RECRUITMENT_OPENED)
                .toList();

        assertThat(openedNotifications).hasSize(1);

        Notification openedNotification = openedNotifications.get(0);
        assertThat(openedNotification.getLinkUrl()).isEqualTo("/clubs/" + club.getId());
        assertThat(openedNotification.getBody()).contains("상시 모집");
        assertThat(openedNotification.getBody()).doesNotContain("null");
    }

    @Test
    @DisplayName("같은 모집에 대해 같은 dedup_key 로 알림 생성을 두 번 시도해도 알림은 1개만 유지된다")
    void duplicateRecruitmentOpenedNotificationIsIdempotent() throws Exception {
        User favorUser = saveUser("찜유저멱등");
        Club club = saveActiveClub("멱등테스트동아리");

        saveFavorite(favorUser, club);

        String dedupKey = "RECRUITMENT_OPENED:r=9999";
        CreateNotificationCommand firstCommand = new CreateNotificationCommand(
                favorUser.getId(),
                NotificationType.RECRUITMENT_OPENED,
                "찜한 " + club.getName() + "의 새 모집이 시작됐어요",
                "멱등 모집 · 마감 " + LocalDate.now().plusDays(7),
                "/clubs/" + club.getId(),
                Map.of("recruitmentId", 9999L, "clubId", club.getId()),
                dedupKey
        );
        CreateNotificationCommand secondCommand = new CreateNotificationCommand(
                favorUser.getId(),
                NotificationType.RECRUITMENT_OPENED,
                "찜한 " + club.getName() + "의 새 모집이 시작됐어요",
                "멱등 모집 · 마감 " + LocalDate.now().plusDays(7),
                "/clubs/" + club.getId(),
                Map.of("recruitmentId", 9999L, "clubId", club.getId()),
                dedupKey
        );

        boolean firstResult = notificationService.createIfAbsent(firstCommand);
        boolean secondResult = notificationService.createIfAbsent(secondCommand);

        assertThat(firstResult).isTrue();
        assertThat(secondResult).isFalse();

        long count = notificationRepository.findAll().stream()
                .filter(n -> n.getType() == NotificationType.RECRUITMENT_OPENED
                        && n.getUserId().equals(favorUser.getId())
                        && n.getDedupKey().equals(dedupKey))
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("시작일이 미래인 모집은 RecruitmentOpenedEvent 가 발행되지 않는다")
    void futureStartDateRecruitmentDoesNotPublishEvent() throws Exception {
        User leader = saveUser("미래리더");
        User favorUser = saveUser("미래찜유저");
        Club club = saveActiveClub("미래동아리");

        saveMembership(club, leader, ClubMemberRole.LEADER);
        saveFavorite(favorUser, club);

        recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "미래 모집",
                "내용",
                LocalDate.now().plusDays(3),
                LocalDate.now().plusDays(14),
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                null,
                null,
                false
        ));

        List<Notification> openedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.RECRUITMENT_OPENED)
                .toList();

        assertThat(openedNotifications).isEmpty();
    }

    @Test
    @DisplayName("비 ACTIVE 동아리의 모집 오픈 이벤트는 알림을 만들지 않는다")
    void inactiveClubOpenedEventDoesNotNotify() throws Exception {
        User favorUser = saveUser("중단찜유저");
        Club club = saveActiveClub("중단전환동아리");
        saveFavorite(favorUser, club);

        // AFTER_COMMIT 리스너는 생성 트랜잭션 커밋 뒤에 실행되므로, 커밋과 fanout 사이에
        // 동아리가 운영 중단될 수 있다. 그 상태를 직접 SQL 로 만든 뒤 리스너를 직접 호출해
        // fanout 직전의 club ACTIVE 재검증이 알림을 막는지 검증한다.
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        recruitmentOpenedListener.handle(new RecruitmentOpenedEvent(
                9999L, club.getId(), club.getName(), "중단후모집", LocalDate.now().plusDays(7)));

        List<Notification> openedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.RECRUITMENT_OPENED)
                .toList();
        assertThat(openedNotifications).isEmpty();
    }

    @Test
    @DisplayName("찜한 여러 유저에게 나가는 모집 오픈 알림은 단건 조립 지점 산출과 제목·본문·링크·dedupKey·payload 가 모두 같다")
    void fanOutMatchesSingleAssemblyPointForEveryFavoritingUser() throws Exception {
        User favorUser1 = saveUser("정합찜1");
        User favorUser2 = saveUser("정합찜2");
        User favorUser3 = saveUser("정합찜3");
        User nonFavorUser = saveUser("정합비찜");
        User controlUser = saveUser("정합대조");
        Club club = saveActiveClub("정합동아리");
        saveFavorite(favorUser1, club);
        saveFavorite(favorUser2, club);
        saveFavorite(favorUser3, club);

        RecruitmentOpenedEvent event = openedEventFor(club, 9101L);
        // 대조군: 기존 단건 경로(createIfAbsent)로 먼저 1건을 만들어 두고, fan-out 산출물과 DB 값을 직접 비교한다.
        // 찜하지 않은 유저라 fan-out 대상이 아니고, dedupKey 가 같아도 user_id 가 달라 충돌하지 않는다.
        notificationService.createIfAbsent(RecruitmentOpenedNotification.commandFor(controlUser.getId(), event));
        String controlPayload = jdbcTemplate.queryForObject(
                "SELECT payload::text FROM notification WHERE user_id = ?", String.class, controlUser.getId());

        recruitmentOpenedListener.handle(event);

        for (User favoringUser : List.of(favorUser1, favorUser2, favorUser3)) {
            CreateNotificationCommand expected =
                    RecruitmentOpenedNotification.commandFor(favoringUser.getId(), event);
            Map<String, Object> stored = jdbcTemplate.queryForMap(
                    "SELECT type, title, body, link_url, dedup_key, payload::text AS payload_text,"
                            + " jsonb_typeof(payload -> 'recruitmentId') AS recruitment_id_type,"
                            + " jsonb_typeof(payload -> 'clubId') AS club_id_type"
                            + " FROM notification WHERE user_id = ?", favoringUser.getId());
            assertThat(stored.get("type")).isEqualTo(expected.type().name());
            assertThat(stored.get("title")).isEqualTo(expected.title());
            assertThat(stored.get("body")).isEqualTo(expected.body());
            assertThat(stored.get("link_url")).isEqualTo(expected.linkUrl());
            assertThat(stored.get("dedup_key")).isEqualTo(expected.dedupKey());
            // payload 는 DB 재조회로 비교한다 — 숫자 키가 JSON 문자열로 굳으면 여기서 걸린다.
            assertThat(stored.get("payload_text")).isEqualTo(controlPayload);
            assertThat(stored.get("recruitment_id_type")).isEqualTo("number");
            assertThat(stored.get("club_id_type")).isEqualTo("number");
        }
        assertThat(countNotificationsOf(nonFavorUser)).isZero();
    }

    @Test
    @DisplayName("같은 모집 오픈 이벤트가 다시 발화해도 찜한 유저의 알림은 1건씩만 유지된다")
    void refiredOpenedEventDoesNotDuplicateNotifications() throws Exception {
        User favorUser1 = saveUser("재발화찜1");
        User favorUser2 = saveUser("재발화찜2");
        Club club = saveActiveClub("재발화동아리");
        saveFavorite(favorUser1, club);
        saveFavorite(favorUser2, club);

        RecruitmentOpenedEvent event = openedEventFor(club, 9102L);
        recruitmentOpenedListener.handle(event);
        recruitmentOpenedListener.handle(event);

        assertThat(countNotificationsWithDedupKey(event)).isEqualTo(2L);
        assertThat(countNotificationsOf(favorUser1)).isEqualTo(1L);
        assertThat(countNotificationsOf(favorUser2)).isEqualTo(1L);
    }

    @Test
    @DisplayName("찜을 해제한 유저는 모집 오픈 알림 대상에서 제외된다")
    void unfavoritedUserIsExcludedFromFanOut() throws Exception {
        User keepingUser = saveUser("찜유지");
        User unfavoritedUser = saveUser("찜해제");
        Club club = saveActiveClub("찜해제동아리");
        saveFavorite(keepingUser, club);
        saveFavorite(unfavoritedUser, club);

        // soft delete(@SQLDelete) — 행은 남고 deleted_at 만 채워진다. 네이티브 fan-out 이 이 행을 걸러야 한다.
        ClubFavorite removed = favoriteRepository
                .findByUserIdAndClubId(unfavoritedUser.getId(), club.getId()).orElseThrow();
        favoriteRepository.delete(removed);

        recruitmentOpenedListener.handle(openedEventFor(club, 9103L));

        assertThat(countNotificationsOf(keepingUser)).isEqualTo(1L);
        assertThat(countNotificationsOf(unfavoritedUser)).isZero();
    }

    @Test
    @DisplayName("일부 찜 유저에게 같은 알림이 이미 있으면 그 알림은 그대로 두고 나머지 유저에게만 새로 생성된다")
    void existingNotificationsAreKeptAndOnlyMissingRecipientsAreInserted() throws Exception {
        User alreadyNotifiedUser = saveUser("선재찜");
        User pendingUser1 = saveUser("미발송찜1");
        User pendingUser2 = saveUser("미발송찜2");
        Club club = saveActiveClub("부분선재동아리");
        saveFavorite(alreadyNotifiedUser, club);
        saveFavorite(pendingUser1, club);
        saveFavorite(pendingUser2, club);

        RecruitmentOpenedEvent event = openedEventFor(club, 9104L);
        notificationService.createIfAbsent(
                RecruitmentOpenedNotification.commandFor(alreadyNotifiedUser.getId(), event));
        Long existingId = jdbcTemplate.queryForObject(
                "SELECT id FROM notification WHERE user_id = ?", Long.class, alreadyNotifiedUser.getId());

        recruitmentOpenedListener.handle(event);

        assertThat(countNotificationsWithDedupKey(event)).isEqualTo(3L);
        assertThat(countNotificationsOf(alreadyNotifiedUser)).isEqualTo(1L);
        // 선재 행은 건드리지 않고 스킵된다(행 단위 ON CONFLICT) — 나머지 두 명은 정상 삽입.
        assertThat(jdbcTemplate.queryForObject(
                "SELECT id FROM notification WHERE user_id = ?", Long.class, alreadyNotifiedUser.getId()))
                .isEqualTo(existingId);
        assertThat(countNotificationsOf(pendingUser1)).isEqualTo(1L);
        assertThat(countNotificationsOf(pendingUser2)).isEqualTo(1L);
    }

    @Test
    @DisplayName("모집 오픈 알림 fan-out 의 SQL 문 수는 찜한 유저 수와 무관하게 상수다")
    void fanOutQueryCountIsConstantRegardlessOfFavoriteCount() throws Exception {
        Club warmUpClub = saveActiveClub("쿼리수예열");
        saveFavorite(saveUser("예열찜"), warmUpClub);
        Club smallClub = saveActiveClub("쿼리수소");
        for (int index = 0; index < 3; index++) {
            saveFavorite(saveUser("소찜" + index), smallClub);
        }
        Club bigClub = saveActiveClub("쿼리수대");
        for (int index = 0; index < 20; index++) {
            saveFavorite(saveUser("대찜" + index), bigClub);
        }

        // SessionFactory 전역 통계라 리스너의 REQUIRES_NEW 트랜잭션에서 나간 문장도 함께 잡힌다.
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        // 예열: 최초 실행의 1회성 준비 비용을 계측에서 배제한다.
        recruitmentOpenedListener.handle(openedEventFor(warmUpClub, 9105L));

        RecruitmentOpenedEvent smallEvent = openedEventFor(smallClub, 9106L);
        long beforeSmall = statistics.getPrepareStatementCount();
        recruitmentOpenedListener.handle(smallEvent);
        long smallQueries = statistics.getPrepareStatementCount() - beforeSmall;

        RecruitmentOpenedEvent bigEvent = openedEventFor(bigClub, 9107L);
        long beforeBig = statistics.getPrepareStatementCount();
        recruitmentOpenedListener.handle(bigEvent);
        long bigQueries = statistics.getPrepareStatementCount() - beforeBig;

        assertThat(countNotificationsWithDedupKey(smallEvent)).isEqualTo(3L);
        assertThat(countNotificationsWithDedupKey(bigEvent)).isEqualTo(20L);
        // 찜 3명과 20명의 문장 수가 같다 = 수신자당 왕복 없음.
        assertThat(bigQueries).isEqualTo(smallQueries);
        // ACTIVE 재검증 1 + 벌크 INSERT 1.
        assertThat(smallQueries).isLessThanOrEqualTo(2);
    }

    @Test
    @DisplayName("벌크 INSERT 가 DB 오류로 실패해도 리스너는 예외를 밖으로 내지 않는다 — 알림 실패가 모집 등록 요청을 깨지 않는 계약")
    void bulkInsertFailureDoesNotEscapeListener() throws Exception {
        Club club = saveActiveClub("실패격리동아리");
        saveFavorite(saveUser("찜유저"), club);
        // title VARCHAR(120) 을 넘기는 동아리명 — 수신자가 있어 INSERT 가 실제 행을 만들다 DB 오류로 실패한다.
        RecruitmentOpenedEvent event = new RecruitmentOpenedEvent(
                9108L, club.getId(), "긴".repeat(130), "벌크 fan-out 모집", LocalDate.now().plusDays(10));

        // AFTER_COMMIT 리스너의 예외는 원 요청까지 전파된다(원 트랜잭션은 이미 커밋된 뒤) — 여기서 새면 POST 가 500.
        assertThatCode(() -> recruitmentOpenedListener.handle(event)).doesNotThrowAnyException();
        assertThat(countNotificationsWithDedupKey(event)).isZero();
    }

    private RecruitmentOpenedEvent openedEventFor(Club club, long recruitmentId) {
        return new RecruitmentOpenedEvent(
                recruitmentId, club.getId(), club.getName(), "벌크 fan-out 모집", LocalDate.now().plusDays(10));
    }

    private long countNotificationsOf(User user) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE user_id = ?", Long.class, user.getId());
        return count == null ? 0L : count;
    }

    private long countNotificationsWithDedupKey(RecruitmentOpenedEvent event) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE dedup_key = ?",
                Long.class, "RECRUITMENT_OPENED:r=" + event.recruitmentId());
        return count == null ? 0L : count;
    }

    private User saveUser(String name) {
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
        Club club = Club.create(name + "-" + sequence.getAndIncrement(), ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        clubMemberRepository.save(ClubMember.of(club, user, role));
    }

    private void saveFavorite(User user, Club club) {
        favoriteRepository.save(ClubFavorite.create(user, club));
    }
}
