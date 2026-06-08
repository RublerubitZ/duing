package com.duing.domain.notice.broadcast.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepositoryCustom.BroadcastSlice;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class NoticeBroadcastRepositoryImplTest {

    @Autowired NoticeBroadcastRepository broadcastRepository;
    @Autowired NoticeBroadcastReadRepository broadcastReadRepository;
    @Autowired NoticeRepository noticeRepository;
    @Autowired UserRepository userRepository;

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
        List<BroadcastSlice> slices = broadcastRepository.findSliceForUser(unusedUserId, 10);

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

        List<BroadcastSlice> slices = broadcastRepository.findSliceForUser(userId, 10);

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

    // ---- fixture helpers ----

    private Notice persistNotice(Long authorId) {
        return noticeRepository.save(Notice.create(
                "공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, false, null, true, authorId));
    }

    private Long saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now())).getId();
    }
}
