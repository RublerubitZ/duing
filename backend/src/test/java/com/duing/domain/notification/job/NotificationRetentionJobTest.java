package com.duing.domain.notification.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "duing.notification.jobs.retention.enabled=true")
class NotificationRetentionJobTest extends IntegrationTestBase {

    @Autowired NotificationRetentionJob job;
    @Autowired NotificationRepository notificationRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("생성 후 30일이 지난 개인 알림은 파기되고, 30일 이내 알림은 유지된다")
    void deletesNotificationsOlderThanRetentionWindow() {
        User user = saveUser();
        Long expiredId = saveNotificationCreatedDaysAgo(user.getId(), "오래된 알림", 31);
        Long freshId = saveNotificationCreatedDaysAgo(user.getId(), "최근 알림", 29);

        job.run();

        assertThat(countById(expiredId)).isEqualTo(0);
        assertThat(countById(freshId)).isEqualTo(1);
    }

    private int countById(Long id) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE id = ?", Integer.class, id);
        return count == null ? 0 : count;
    }

    private Long saveNotificationCreatedDaysAgo(Long userId, String title, int daysAgo) {
        Notification notification = Notification.create(userId, NotificationType.RECRUITMENT_OPENED,
                title, "본문", "/clubs/1", Map.of(), "retention-dedup-" + sequence.incrementAndGet());
        Notification saved = notificationRepository.saveAndFlush(notification);
        jdbcTemplate.update("UPDATE notification SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(LocalDateTime.now().minusDays(daysAgo)), saved.getId());
        return saved.getId();
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "보존정책유저",
                "retention" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
        return userRepository.save(user);
    }
}
