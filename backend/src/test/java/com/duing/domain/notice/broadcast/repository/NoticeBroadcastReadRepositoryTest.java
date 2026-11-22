package com.duing.domain.notice.broadcast.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notification.NotificationRetention;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * '모두 읽음' 일괄 삽입(#1765)의 네이티브 조건이 읽는 쪽(NoticeBroadcastRepositoryImpl)과 같은지 SQL 조건마다 묶는다.
 * {@code @Transactional} 이라 TRUNCATE 하지 않는다 — 다른 클래스가 커밋한 전체 알림이 남을 수 있어, 수는 픽스처 뒤에 잰 값과 비교한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class NoticeBroadcastReadRepositoryTest {

    @Autowired NoticeBroadcastReadRepository broadcastReadRepository;
    @Autowired NoticeBroadcastRepository broadcastRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("모두 읽음 일괄 삽입은 지금 보이는 안 읽은 전체 알림에만 읽음 행을 만들고, 그 뒤 안 읽음 수는 0 이다")
    void insertsReadRowsOnlyForVisibleBroadcasts() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        // 저장 존 벽시계 기준 — LocalDateTime.now(clock) 은 KST 라 UTC JVM 에서 9시간 어긋난다.
        LocalDateTime systemNow = TimeMapper.systemNow(clock);

        Long visibleNow = saveBroadcast(persistNotice(authorId));
        Long visibleNearFloor = saveBroadcast(persistNotice(authorId));
        setBroadcastCreatedAt(visibleNearFloor, systemNow.minusDays(30).plusHours(1));
        Long beyondFloor = saveBroadcast(persistNotice(authorId));
        setBroadcastCreatedAt(beyondFloor, systemNow.minusDays(30).minusHours(1));
        Notice deletedNotice = persistNotice(authorId);
        Long ofDeletedNotice = saveBroadcast(deletedNotice);
        noticeRepository.delete(deletedNotice);
        Notice narrowedNotice = persistNotice(authorId);
        Long ofNarrowedNotice = saveBroadcast(narrowedNotice);
        updateVisibilityAndNotify(narrowedNotice, NoticeVisibility.OFFICERS_ALL, null);
        Notice notifyOffNotice = persistNotice(authorId);
        Long ofNotifyOffNotice = saveBroadcast(notifyOffNotice);
        updateVisibilityAndNotify(notifyOffNotice, null, false);
        Long softDeletedBroadcast = saveBroadcast(persistNotice(authorId));
        jdbcTemplate.update("UPDATE notice_broadcast SET deleted_at = ? WHERE id = ?",
                Timestamp.valueOf(systemNow), softDeletedBroadcast);
        noticeRepository.flush();
        long unreadBefore = broadcastRepository.countUnreadForUser(userId);

        int inserted = broadcastReadRepository.bulkInsertVisibleBroadcastReads(
                userId, NotificationRetention.visibilityFloor(clock));

        assertThat((long) inserted).isEqualTo(unreadBefore);
        assertThat(List.of(visibleNow, visibleNearFloor))
                .allMatch(broadcastId -> isRead(broadcastId, userId));
        assertThat(List.of(beyondFloor, ofDeletedNotice, ofNarrowedNotice, ofNotifyOffNotice, softDeletedBroadcast))
                .noneMatch(broadcastId -> isRead(broadcastId, userId));
        assertThat(broadcastRepository.countUnreadForUser(userId)).isZero();
    }

    @Test
    @DisplayName("이미 읽은 전체 알림은 오류 없이 건너뛰고, 다른 사용자의 읽음 상태는 바뀌지 않는다")
    void skipsAlreadyReadBroadcastsAndLeavesOtherUsersUntouched() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        Long otherUserId = saveUser(UserRole.STUDENT);
        Long alreadyRead = saveBroadcast(persistNotice(authorId));
        Long unread = saveBroadcast(persistNotice(authorId));
        broadcastReadRepository.saveAndFlush(new NoticeBroadcastRead(alreadyRead, userId));
        long unreadBefore = broadcastRepository.countUnreadForUser(userId);
        long otherUnreadBefore = broadcastRepository.countUnreadForUser(otherUserId);

        int inserted = broadcastReadRepository.bulkInsertVisibleBroadcastReads(
                userId, NotificationRetention.visibilityFloor(clock));

        assertThat((long) inserted).isEqualTo(unreadBefore);
        assertThat(isRead(unread, userId)).isTrue();
        assertThat(broadcastRepository.countUnreadForUser(userId)).isZero();
        assertThat(broadcastRepository.countUnreadForUser(otherUserId)).isEqualTo(otherUnreadBefore);
        assertThat(isRead(alreadyRead, otherUserId)).isFalse();
    }

    private boolean isRead(Long broadcastId, Long userId) {
        return broadcastReadRepository.existsByIdBroadcastIdAndIdUserId(broadcastId, userId);
    }

    private void setBroadcastCreatedAt(Long broadcastId, LocalDateTime createdAt) {
        jdbcTemplate.update("UPDATE notice_broadcast SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(createdAt), broadcastId);
    }

    // 관리자 수정과 같은 도메인 경로로 범위·알림 발송만 바꾼다(null 은 '그대로').
    private void updateVisibilityAndNotify(Notice notice, NoticeVisibility visibility, Boolean notifyOnPublish) {
        notice.update(new Notice.UpdatePayload(
                null, null, null, null, null, null,
                null, null,
                visibility, null,
                null, null, null,
                notifyOnPublish,
                null, null, null, null, null, null,
                null));
        noticeRepository.flush();
    }

    private Long saveBroadcast(Notice notice) {
        return broadcastRepository.saveAndFlush(NoticeBroadcast.snapshot(
                notice.getId(), "전체 알림", "내용", "/notices/" + notice.getId())).getId();
    }

    private Notice persistNotice(Long authorId) {
        return noticeRepository.save(Notice.create(
                "공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, false, null, true,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId));
    }

    private Long saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq,
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now())).getId();
    }
}
