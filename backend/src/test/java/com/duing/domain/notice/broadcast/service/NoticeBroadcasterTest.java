package com.duing.domain.notice.broadcast.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class NoticeBroadcasterTest {

    @Autowired NoticeBroadcaster broadcaster;
    @Autowired NoticeRepository noticeRepository;
    @Autowired NoticeBroadcastRepository broadcastRepository;
    @Autowired NotificationRepository notificationRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("PUBLIC + notifyOnPublish=true 발행 시 notice_broadcast 1건이 생성된다")
    void publicNotifyOnCreatesBroadcast() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Notice notice = persistNotice(authorId, NoticeVisibility.PUBLIC, true);

        broadcaster.publish(notice, List.of());

        assertThat(broadcastRepository.findAll())
                .extracting(NoticeBroadcast::getNoticeId)
                .contains(notice.getId());
        assertThat(notificationRepository.findAll())
                .extracting(Notification::getType)
                .doesNotContain(NotificationType.NOTICE_TARGETED);
    }

    @Test
    @DisplayName("PUBLIC + notifyOnPublish=false 발행 시 broadcast 도 notification 도 생성되지 않는다")
    void publicNotifyOffSilent() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Notice notice = persistNotice(authorId, NoticeVisibility.PUBLIC, false);

        broadcaster.publish(notice, List.of());

        assertThat(broadcastRepository.findAll())
                .extracting(NoticeBroadcast::getNoticeId)
                .doesNotContain(notice.getId());
    }

    @Test
    @DisplayName("OFFICERS_ALL 발행 시 모든 LEADER/OFFICER 사용자에게 notification 이 fan-out 된다")
    void officersAllFansOut() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Club club = saveClub();
        User leader = saveUser(UserRole.STUDENT);
        User officer = saveUser(UserRole.STUDENT);
        User regularMember = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.of(club, leader, ClubMemberRole.LEADER));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, regularMember, ClubMemberRole.MEMBER));

        Notice notice = persistNotice(authorId, NoticeVisibility.OFFICERS_ALL, true);
        broadcaster.publish(notice, List.of());

        List<Long> targetedUserIds = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.NOTICE_TARGETED)
                .map(Notification::getUserId)
                .toList();
        assertThat(targetedUserIds).contains(leader.getId(), officer.getId());
        assertThat(targetedUserIds).doesNotContain(regularMember.getId());
    }

    @Test
    @DisplayName("수신자 수가 2000명을 초과하면 RecipientLimitExceededException 이 발생하고 트랜잭션이 롤백된다")
    void exceedRecipientLimitRollsBack() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Club club = saveClub();
        for (int i = 0; i < 2001; i++) {
            User user = saveUser(UserRole.STUDENT);
            clubMemberRepository.save(ClubMember.of(club, user, ClubMemberRole.LEADER));
        }
        Notice notice = persistNotice(authorId, NoticeVisibility.OFFICERS_ALL, true);

        long beforeCount = notificationRepository.count();

        assertThatThrownBy(() -> broadcaster.publish(notice, List.of()))
                .isInstanceOf(NoticeException.RecipientLimitExceededException.class);

        long afterCount = notificationRepository.count();
        assertThat(afterCount).isEqualTo(beforeCount);
    }

    // ---- fixture helpers ----

    private User saveUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "테스터" + seq, "test" + seq + "@duing.ac.kr",
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveClub() {
        long seq = sequence.incrementAndGet();
        return clubRepository.save(Club.create("동아리" + seq, ClubCategory.ACADEMIC, "분과", "설명", null));
    }

    private Notice persistNotice(Long authorId, NoticeVisibility visibility, boolean notifyOnPublish) {
        return noticeRepository.save(Notice.create(
                "공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                visibility, null, false, null, notifyOnPublish, authorId));
    }
}
