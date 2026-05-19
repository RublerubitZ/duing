package com.duing.domain.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastReadRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class NotificationServiceTest {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("동일 dedup_key 로 createIfAbsent 를 두 번 호출해도 row 는 1개만 생성된다")
    void createIfAbsentWithSameDedupKeyCreatesOnlyOneRow() {
        User user = saveUser("알림유저A");

        CreateNotificationCommand command = new CreateNotificationCommand(
                user.getId(),
                NotificationType.RECRUITMENT_OPENED,
                "새 모집 시작",
                "동아리 A 의 모집이 시작됐어요",
                "/clubs/1/recruitments/1",
                Map.of("recruitmentId", 1L),
                "RECRUITMENT_OPENED:r=1"
        );

        boolean firstResult = notificationService.createIfAbsent(command);
        boolean secondResult = notificationService.createIfAbsent(command);

        assertThat(firstResult).isTrue();
        assertThat(secondResult).isFalse();

        List<Notification> notifications = notificationRepository.findAll();
        long userNotificationCount = notifications.stream()
                .filter(n -> n.getUserId().equals(user.getId()))
                .count();
        assertThat(userNotificationCount).isEqualTo(1);
    }

    @Test
    @DisplayName("unreadCount 는 readAt 이 null 인 행만 센다")
    void unreadCountOnlyCountsUnreadRows() {
        User user = saveUser("알림유저B");

        notificationService.createIfAbsent(buildCommand(user.getId(), "RECRUITMENT_OPENED:r=2", "읽지않은알림1"));
        notificationService.createIfAbsent(buildCommand(user.getId(), "RECRUITMENT_OPENED:r=3", "읽지않은알림2"));

        CreateNotificationCommand readableCommand = buildCommand(user.getId(), "RECRUITMENT_OPENED:r=4", "읽을알림");
        notificationService.createIfAbsent(readableCommand);

        Page<NotificationResponse> page = notificationService.listMine(user.getId(), false, PageRequest.of(0, 10));
        NotificationResponse readableResponse = page.getContent().stream()
                .filter(response -> response.title().equals("읽을알림"))
                .findFirst()
                .orElseThrow();
        notificationService.markRead(user.getId(), readableResponse.id());

        long unreadCount = notificationService.unreadCount(user.getId());

        assertThat(unreadCount).isEqualTo(2);
    }

    @Test
    @DisplayName("markAllRead 는 본인 알림만 일괄 읽음으로 표시한다")
    void markAllReadOnlyAffectsCurrentUserRows() {
        User userAlpha = saveUser("알림유저C");
        User userBeta = saveUser("알림유저D");

        notificationService.createIfAbsent(buildCommand(userAlpha.getId(), "RECRUITMENT_OPENED:r=10", "알파알림1"));
        notificationService.createIfAbsent(buildCommand(userAlpha.getId(), "RECRUITMENT_OPENED:r=11", "알파알림2"));
        notificationService.createIfAbsent(buildCommand(userBeta.getId(), "RECRUITMENT_OPENED:r=20", "베타알림1"));

        notificationService.markAllRead(userAlpha.getId());

        long alphaUnread = notificationService.unreadCount(userAlpha.getId());
        long betaUnread = notificationService.unreadCount(userBeta.getId());

        assertThat(alphaUnread).isZero();
        assertThat(betaUnread).isEqualTo(1);
    }

    @Test
    @DisplayName("다른 유저의 notificationId 로 markRead 를 호출해도 본인 row 가 아닌 이상 변화가 없다")
    void markReadWithOtherUserNotificationIdHasNoEffect() {
        User owner = saveUser("알림유저E");
        User other = saveUser("알림유저F");

        notificationService.createIfAbsent(buildCommand(owner.getId(), "RECRUITMENT_OPENED:r=30", "소유자알림"));

        Page<NotificationResponse> ownerPage = notificationService.listMine(owner.getId(), false, PageRequest.of(0, 10));
        Long ownerNotificationId = ownerPage.getContent().get(0).id();

        notificationService.markRead(other.getId(), ownerNotificationId);

        long ownerUnread = notificationService.unreadCount(owner.getId());
        assertThat(ownerUnread).isEqualTo(1);
    }

    @Test
    @DisplayName("createIfAbsent 는 pre-check 통과 후 동시 저장이 발생해 DataIntegrityViolationException 이 나도 false 를 반환한다")
    void createIfAbsentReturnsFalseOnConcurrentSaveCollision() {
        NotificationRepository mockedNotificationRepository = mock(NotificationRepository.class);
        when(mockedNotificationRepository.existsByUserIdAndDedupKey(any(), any())).thenReturn(false);
        when(mockedNotificationRepository.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("unique constraint violation"));

        NoticeBroadcastRepository mockedBroadcastRepository = mock(NoticeBroadcastRepository.class);
        NoticeBroadcastReadRepository mockedBroadcastReadRepository = mock(NoticeBroadcastReadRepository.class);

        GeneralNotificationService serviceWithMockedRepository = new GeneralNotificationService(
                mockedNotificationRepository,
                mockedBroadcastRepository,
                mockedBroadcastReadRepository
        );

        CreateNotificationCommand command = new CreateNotificationCommand(
                1L,
                NotificationType.RECRUITMENT_OPENED,
                "충돌 알림",
                "동시 저장 충돌 시나리오",
                "/clubs/1",
                Map.of(),
                "COLLISION:r=99"
        );

        boolean result = serviceWithMockedRepository.createIfAbsent(command);

        assertThat(result).isFalse();
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "notif" + unique + "@daegu.ac.kr",
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

    private CreateNotificationCommand buildCommand(Long userId, String dedupKey, String title) {
        return new CreateNotificationCommand(
                userId,
                NotificationType.RECRUITMENT_OPENED,
                title,
                "알림 본문",
                "/clubs/1",
                Map.of(),
                dedupKey
        );
    }
}