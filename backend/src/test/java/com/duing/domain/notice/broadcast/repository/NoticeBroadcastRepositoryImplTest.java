package com.duing.domain.notice.broadcast.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepositoryCustom.BroadcastSlice;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class NoticeBroadcastRepositoryImplTest {

    @Autowired NoticeBroadcastRepository broadcastRepository;
    @Autowired NoticeBroadcastReadRepository broadcastReadRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired UserRepository userRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("findSliceForUser 는 created_at DESC 정렬로 broadcast 를 반환한다")
    void findSliceForUserReturnsBroadcastsInCreatedAtDescOrder() {
        Long authorId = saveUser(UserRole.ADMIN);

        Notice firstNotice = persistNotice(authorId);
        Notice secondNotice = persistNotice(authorId);
        Notice thirdNotice = persistNotice(authorId);

        NoticeBroadcast firstBroadcast = broadcastRepository.save(
                NoticeBroadcast.snapshot(firstNotice.getId(), "첫 번째 공지", "내용1", "/notices/1"));
        NoticeBroadcast secondBroadcast = broadcastRepository.save(
                NoticeBroadcast.snapshot(secondNotice.getId(), "두 번째 공지", "내용2", "/notices/2"));
        NoticeBroadcast thirdBroadcast = broadcastRepository.save(
                NoticeBroadcast.snapshot(thirdNotice.getId(), "세 번째 공지", "내용3", "/notices/3"));

        long unusedUserId = Long.MAX_VALUE;
        List<BroadcastSlice> slices = broadcastRepository.findSliceForUser(unusedUserId, false, 10);

        List<Long> broadcastIds = slices.stream()
                .map(slice -> slice.broadcast().getId())
                .toList();
        assertThat(broadcastIds).containsAll(
                List.of(firstBroadcast.getId(), secondBroadcast.getId(), thirdBroadcast.getId()));

        List<LocalDateTime> timestamps = slices.stream()
                .filter(slice -> broadcastIds.contains(slice.broadcast().getId()))
                .map(slice -> slice.broadcast().getCreatedAt())
                .toList();
        for (int i = 0; i < timestamps.size() - 1; i++) {
            assertThat(timestamps.get(i)).isAfterOrEqualTo(timestamps.get(i + 1));
        }

        slices.stream()
                .filter(slice -> List.of(firstBroadcast.getId(), secondBroadcast.getId(), thirdBroadcast.getId())
                        .contains(slice.broadcast().getId()))
                .forEach(slice -> assertThat(slice.isRead()).isFalse());
    }

    @Test
    @DisplayName("broadcast_read 가 있는 항목은 isRead=true 로 표시된다")
    void findSliceForUserMarksReadBroadcastAsRead() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);

        Notice notice = persistNotice(authorId);
        NoticeBroadcast broadcast = broadcastRepository.save(
                NoticeBroadcast.snapshot(notice.getId(), "읽음 처리 테스트", "내용", "/notices/read-test"));

        broadcastReadRepository.save(new NoticeBroadcastRead(broadcast.getId(), userId));

        List<BroadcastSlice> slices = broadcastRepository.findSliceForUser(userId, false, 10);

        BroadcastSlice targetSlice = slices.stream()
                .filter(slice -> slice.broadcast().getId().equals(broadcast.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("저장된 broadcast 가 슬라이스에 포함되어야 합니다"));

        assertThat(targetSlice.isRead()).isTrue();
    }

    @Test
    @DisplayName("countUnreadForUser 는 broadcast_read 가 없는 항목 수를 정확히 반환한다")
    void countUnreadForUserCountsOnlyUnreadBroadcasts() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);

        long beforeCount = broadcastRepository.countUnreadForUser(userId);

        Notice firstNotice = persistNotice(authorId);
        Notice secondNotice = persistNotice(authorId);

        NoticeBroadcast firstBroadcast = broadcastRepository.save(
                NoticeBroadcast.snapshot(firstNotice.getId(), "첫 번째 미읽 공지", "내용1", "/notices/unread-1"));
        broadcastRepository.save(
                NoticeBroadcast.snapshot(secondNotice.getId(), "두 번째 미읽 공지", "내용2", "/notices/unread-2"));

        broadcastReadRepository.save(new NoticeBroadcastRead(firstBroadcast.getId(), userId));

        long afterCount = broadcastRepository.countUnreadForUser(userId);

        assertThat(afterCount - beforeCount).isEqualTo(1L);
    }

    @Test
    @DisplayName("생성 후 30일이 지난 공지는 노출 슬라이스와 보존기간 카운트에서 제외된다")
    void excludesBroadcastsOlderThanRetentionWindow() {
        Long authorId = saveUser(UserRole.ADMIN);
        long unusedUserId = Long.MAX_VALUE;

        long beforeCount = broadcastRepository.countWithinRetention();

        Notice recentNotice = persistNotice(authorId);
        Notice oldNotice = persistNotice(authorId);
        NoticeBroadcast recent = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(recentNotice.getId(), "최근 공지", "내용", "/notices/recent"));
        NoticeBroadcast old = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(oldNotice.getId(), "오래된 공지", "내용", "/notices/old"));
        backdateBroadcastCreatedAt(old.getId(), 40);

        long afterCount = broadcastRepository.countWithinRetention();
        List<Long> sliceIds = broadcastRepository.findSliceForUser(unusedUserId, false, 50).stream()
                .map(slice -> slice.broadcast().getId())
                .toList();

        assertThat(afterCount - beforeCount).isEqualTo(1L);
        assertThat(sliceIds).contains(recent.getId()).doesNotContain(old.getId());
    }

    @Test
    @DisplayName("삭제된 공지의 전체 알림은 알림 목록·안 읽음 수·보존기간 수에서 모두 빠진다")
    void excludesBroadcastOfDeletedNotice() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        long unreadBefore = broadcastRepository.countUnreadForUser(userId);
        long retentionBefore = broadcastRepository.countWithinRetention();

        Notice notice = persistNotice(authorId);
        NoticeBroadcast broadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(notice.getId(), "지울 공지", "내용", "/notices/" + notice.getId()));
        assertBroadcastVisible(userId, broadcast.getId(), unreadBefore, retentionBefore);

        noticeRepository.delete(notice);
        noticeRepository.flush();

        assertBroadcastHidden(userId, broadcast.getId(), unreadBefore, retentionBefore);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({"OFFICERS_ALL,", "CLUB_SCOPED,ALL_MEMBERS"})
    @DisplayName("공개 범위를 임원 전체·특정 동아리로 좁힌 공지의 전체 알림은 알림 발송이 켜져 있어도 빠진다")
    void excludesBroadcastOfNarrowedNotice(NoticeVisibility narrowedVisibility, NoticeClubScopeRole clubScopeRole) {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        long unreadBefore = broadcastRepository.countUnreadForUser(userId);
        long retentionBefore = broadcastRepository.countWithinRetention();

        Notice notice = persistNotice(authorId);
        NoticeBroadcast broadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(notice.getId(), "좁힐 공지", "내용", "/notices/" + notice.getId()));
        assertBroadcastVisible(userId, broadcast.getId(), unreadBefore, retentionBefore);

        updateVisibilityAndNotify(notice, narrowedVisibility, clubScopeRole, null);

        // 알림 발송은 켜진 채다(Notice.update 가 PUBLIC 밖으로 바꾸면 true 로 둔다) — visibility 조건만으로 빠져야 한다.
        assertThat(notice.isNotifyOnPublish()).isTrue();
        assertBroadcastHidden(userId, broadcast.getId(), unreadBefore, retentionBefore);
    }

    @Test
    @DisplayName("알림 발송을 끈 전체 공개 공지의 전체 알림은 빠진다")
    void excludesBroadcastOfNotifyOffNotice() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        long unreadBefore = broadcastRepository.countUnreadForUser(userId);
        long retentionBefore = broadcastRepository.countWithinRetention();

        Notice notice = persistNotice(authorId);
        NoticeBroadcast broadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(notice.getId(), "알림 끌 공지", "내용", "/notices/" + notice.getId()));
        assertBroadcastVisible(userId, broadcast.getId(), unreadBefore, retentionBefore);

        updateVisibilityAndNotify(notice, null, null, false);

        assertThat(notice.getVisibility()).isEqualTo(NoticeVisibility.PUBLIC);
        assertBroadcastHidden(userId, broadcast.getId(), unreadBefore, retentionBefore);
    }

    // 읽는 쪽 판정만 고정한다(스펙 10절 Q1) — 수정 API 로 되돌리는 경로는 NotificationUnionAcceptanceTest 가 본다.
    @Test
    @DisplayName("범위를 좁혔다가 전체 공개·알림 발송으로 되돌리면 같은 전체 알림이 다시 보이고 읽음 표시도 그대로다")
    void showsSameBroadcastWithReadStateAfterScopeIsRestored() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        long unreadBefore = broadcastRepository.countUnreadForUser(userId);
        long retentionBefore = broadcastRepository.countWithinRetention();

        Notice notice = persistNotice(authorId);
        NoticeBroadcast broadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(notice.getId(), "되돌릴 공지", "내용", "/notices/" + notice.getId()));
        broadcastReadRepository.save(new NoticeBroadcastRead(broadcast.getId(), userId));

        updateVisibilityAndNotify(notice, NoticeVisibility.OFFICERS_ALL, null, null);
        updateVisibilityAndNotify(notice, NoticeVisibility.PUBLIC, null, true);

        BroadcastSlice restoredSlice = broadcastRepository.findSliceForUser(userId, false, 50).stream()
                .filter(slice -> slice.broadcast().getId().equals(broadcast.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("되돌린 공지의 전체 알림이 다시 보여야 합니다"));
        assertThat(restoredSlice.isRead()).isTrue();
        assertThat(broadcastRepository.countUnreadForUser(userId)).isEqualTo(unreadBefore);
        assertThat(broadcastRepository.countWithinRetention()).isEqualTo(retentionBefore + 1);
    }

    @Test
    @DisplayName("숨겨진 전체 알림이 더 최신이어도 개수 제한은 보이는 알림에만 적용된다")
    void appliesLimitOnlyToVisibleBroadcasts() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);

        Notice visibleNotice = persistNotice(authorId);
        NoticeBroadcast visibleBroadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(visibleNotice.getId(), "보이는 공지", "내용", "/notices/" + visibleNotice.getId()));
        Notice deletedNotice = persistNotice(authorId);
        NoticeBroadcast hiddenBroadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(deletedNotice.getId(), "지운 공지", "내용", "/notices/" + deletedNotice.getId()));
        // 다른 테스트가 남긴 행보다 두 행이 모두 최신이 되게 — 보이는 행은 방금 만든 지금, 숨길 행은 그보다 1분 뒤.
        setBroadcastCreatedAt(hiddenBroadcast.getId(), LocalDateTime.now().plusMinutes(1));
        noticeRepository.delete(deletedNotice);
        noticeRepository.flush();

        List<Long> firstSliceIds = broadcastRepository.findSliceForUser(userId, false, 1).stream()
                .map(slice -> slice.broadcast().getId())
                .toList();

        assertThat(firstSliceIds).containsExactly(visibleBroadcast.getId());
    }

    @Test
    @DisplayName("안 읽음만 고르면 더 최신인 읽은·숨겨진 전체 알림을 건너뛰고 개수 제한을 안 읽은 것에만 건다")
    void appliesLimitOnlyToUnreadVisibleBroadcastsWhenUnreadOnly() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        Long otherUserId = saveUser(UserRole.STUDENT);

        Notice unreadNotice = persistNotice(authorId);
        NoticeBroadcast unreadBroadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(unreadNotice.getId(), "안 읽은 공지", "내용", "/notices/" + unreadNotice.getId()));
        Notice readNotice = persistNotice(authorId);
        NoticeBroadcast readBroadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(readNotice.getId(), "읽은 공지", "내용", "/notices/" + readNotice.getId()));
        Notice deletedNotice = persistNotice(authorId);
        NoticeBroadcast hiddenBroadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(deletedNotice.getId(), "지운 공지", "내용", "/notices/" + deletedNotice.getId()));
        // 다른 테스트가 남긴 행보다 셋 다 최신이 되게 — 숨김 > 읽음 > 안 읽음 순으로 1분씩.
        setBroadcastCreatedAt(unreadBroadcast.getId(), LocalDateTime.now().plusMinutes(1));
        setBroadcastCreatedAt(readBroadcast.getId(), LocalDateTime.now().plusMinutes(2));
        setBroadcastCreatedAt(hiddenBroadcast.getId(), LocalDateTime.now().plusMinutes(3));
        noticeRepository.delete(deletedNotice);
        noticeRepository.flush();
        broadcastReadRepository.save(new NoticeBroadcastRead(readBroadcast.getId(), userId));
        // 다른 사용자의 읽음은 이 사용자의 안 읽음 판정에 끼지 않아야 한다.
        broadcastReadRepository.save(new NoticeBroadcastRead(unreadBroadcast.getId(), otherUserId));

        List<BroadcastSlice> unreadSlices = broadcastRepository.findSliceForUser(userId, true, 1);
        List<BroadcastSlice> allSlices = broadcastRepository.findSliceForUser(userId, false, 1);

        assertThat(unreadSlices.stream().map(slice -> slice.broadcast().getId()).toList())
                .containsExactly(unreadBroadcast.getId());
        assertThat(unreadSlices.get(0).isRead()).isFalse();
        assertThat(allSlices.stream().map(slice -> slice.broadcast().getId()).toList())
                .containsExactly(readBroadcast.getId());
        assertThat(allSlices.get(0).isRead()).isTrue();
    }

    @Test
    @DisplayName("30일이 지난 안 읽은 전체 알림은 안 읽음 조회에도 나오지 않는다")
    void excludesUnreadBroadcastOlderThanRetentionWhenUnreadOnly() {
        Long authorId = saveUser(UserRole.ADMIN);
        Long userId = saveUser(UserRole.STUDENT);
        Notice oldNotice = persistNotice(authorId);
        NoticeBroadcast oldBroadcast = broadcastRepository.saveAndFlush(
                NoticeBroadcast.snapshot(oldNotice.getId(), "오래된 안 읽은 공지", "내용", "/notices/" + oldNotice.getId()));
        backdateBroadcastCreatedAt(oldBroadcast.getId(), 40);

        // 공유 DB 의 다른 행에 밀려 우연히 안 보이는 일이 없게 개수 제한을 열어 둔다.
        List<Long> unreadSliceIds = broadcastRepository.findSliceForUser(userId, true, Integer.MAX_VALUE).stream()
                .map(slice -> slice.broadcast().getId())
                .toList();

        assertThat(unreadSliceIds).doesNotContain(oldBroadcast.getId());
    }

    private void backdateBroadcastCreatedAt(Long broadcastId, int daysAgo) {
        jdbcTemplate.update("UPDATE notice_broadcast SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(LocalDateTime.now().minusDays(daysAgo)), broadcastId);
    }

    private void setBroadcastCreatedAt(Long broadcastId, LocalDateTime createdAt) {
        jdbcTemplate.update("UPDATE notice_broadcast SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(createdAt), broadcastId);
    }

    // 관리자 수정과 같은 도메인 경로로 범위·알림 발송만 바꾼다(null 은 '그대로').
    private void updateVisibilityAndNotify(Notice notice, NoticeVisibility visibility, NoticeClubScopeRole clubScopeRole,
                                           Boolean notifyOnPublish) {
        notice.update(new Notice.UpdatePayload(
                null, null, null, null, null, null,
                null, null,
                visibility, clubScopeRole,
                null, null, null,
                notifyOnPublish,
                null, null, null, null, null, null,
                null));
        noticeRepository.flush();
    }

    private void assertBroadcastVisible(Long userId, Long broadcastId, long unreadBefore, long retentionBefore) {
        assertThat(sliceIdsFor(userId)).contains(broadcastId);
        assertThat(broadcastRepository.countUnreadForUser(userId)).isEqualTo(unreadBefore + 1);
        assertThat(broadcastRepository.countWithinRetention()).isEqualTo(retentionBefore + 1);
    }

    private void assertBroadcastHidden(Long userId, Long broadcastId, long unreadBefore, long retentionBefore) {
        assertThat(sliceIdsFor(userId)).doesNotContain(broadcastId);
        assertThat(broadcastRepository.countUnreadForUser(userId)).isEqualTo(unreadBefore);
        assertThat(broadcastRepository.countWithinRetention()).isEqualTo(retentionBefore);
    }

    private List<Long> sliceIdsFor(Long userId) {
        return broadcastRepository.findSliceForUser(userId, false, 50).stream()
                .map(slice -> slice.broadcast().getId())
                .toList();
    }

    // ---- fixture helpers ----

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
