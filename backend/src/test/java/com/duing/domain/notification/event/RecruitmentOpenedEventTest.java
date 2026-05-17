package com.duing.domain.notification.event;

import static org.assertj.core.api.Assertions.assertThat;

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
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RecruitmentOpenedEventTest {

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
                List.of("지원 동기")
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
                "/clubs/" + club.getId() + "/recruitments/9999",
                Map.of("recruitmentId", 9999L, "clubId", club.getId()),
                dedupKey
        );
        CreateNotificationCommand secondCommand = new CreateNotificationCommand(
                favorUser.getId(),
                NotificationType.RECRUITMENT_OPENED,
                "찜한 " + club.getName() + "의 새 모집이 시작됐어요",
                "멱등 모집 · 마감 " + LocalDate.now().plusDays(7),
                "/clubs/" + club.getId() + "/recruitments/9999",
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
                List.of("자기소개")
        ));

        List<Notification> openedNotifications = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.RECRUITMENT_OPENED)
                .toList();

        assertThat(openedNotifications).isEmpty();
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "event" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
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
