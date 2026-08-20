package com.duing.domain.notice.broadcast.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
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
import java.lang.reflect.Field;
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
class NoticeBroadcasterTest extends IntegrationTestBase {

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
    @DisplayName("승인 대기·운영 중단 동아리 소속 운영진은 OFFICERS_ALL 알림을 받지 않는다")
    void nonActiveClubOfficersAreExcludedFromFanout() {
        // 정책(2026-08-18): 알림 수신 자격은 조회 가시성과 같은 스코프다 — 비 ACTIVE 동아리
        // 소속자는 공지를 열람할 수 없으므로 알림도 도달하지 않아야 한다.
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Club activeClub = saveClubWithStatus(ClubStatus.ACTIVE);
        Club pendingClub = saveClubWithStatus(ClubStatus.PENDING_APPROVAL);
        Club inactiveClub = saveClubWithStatus(ClubStatus.INACTIVE);
        User activeLeader = saveUser(UserRole.STUDENT);
        User pendingLeader = saveUser(UserRole.STUDENT);
        User inactiveOfficer = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.of(activeClub, activeLeader, ClubMemberRole.LEADER));
        clubMemberRepository.save(ClubMember.of(pendingClub, pendingLeader, ClubMemberRole.LEADER));
        clubMemberRepository.save(ClubMember.of(inactiveClub, inactiveOfficer, ClubMemberRole.OFFICER));

        Notice notice = persistNotice(authorId, NoticeVisibility.OFFICERS_ALL, true);
        broadcaster.publish(notice, List.of());

        List<Long> targetedUserIds = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.NOTICE_TARGETED)
                .map(Notification::getUserId)
                .toList();
        assertThat(targetedUserIds).contains(activeLeader.getId());
        assertThat(targetedUserIds).doesNotContain(pendingLeader.getId(), inactiveOfficer.getId());
    }

    @Test
    @DisplayName("대상 동아리 지정(CLUB_SCOPED) 알림도 그 동아리가 비 ACTIVE 면 회원에게 도달하지 않는다")
    void nonActiveTargetClubMembersAreExcludedFromFanout() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Club inactiveClub = saveClubWithStatus(ClubStatus.INACTIVE);
        User memberOfInactive = saveUser(UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.of(inactiveClub, memberOfInactive, ClubMemberRole.MEMBER));

        Notice notice = noticeRepository.save(Notice.create(
                "공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.ALL_MEMBERS, false, null, true,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId));
        broadcaster.publish(notice, List.of(inactiveClub.getId()));

        List<Long> targetedUserIds = notificationRepository.findAll().stream()
                .filter(notification -> notification.getType() == NotificationType.NOTICE_TARGETED)
                .map(Notification::getUserId)
                .toList();
        assertThat(targetedUserIds).doesNotContain(memberOfInactive.getId());
    }

    @Test
    @DisplayName("수신자 수가 2000명을 초과하면 RecipientLimitExceededException 이 발생하고 트랜잭션이 롤백된다")
    void exceedRecipientLimitRollsBack() {
        Long authorId = saveUser(UserRole.ADMIN).getId();
        Club club = saveClub();
        for (int i = 0; i < 2001; i++) {
            User user = saveUser(UserRole.STUDENT);
            clubMemberRepository.save(ClubMember.of(club, user, ClubMemberRole.OFFICER));
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
                "20" + seq, "테스터" + seq,
                "hashed", role, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Club saveClub() {
        return saveClubWithStatus(ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(ClubStatus status) {
        long seq = sequence.incrementAndGet();
        Club club = Club.create("동아리" + seq, ClubCategory.ACADEMIC, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, status);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return clubRepository.save(club);
    }

    private Notice persistNotice(Long authorId, NoticeVisibility visibility, boolean notifyOnPublish) {
        return noticeRepository.save(Notice.create(
                "공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                visibility, null, false, null, notifyOnPublish,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId));
    }
}
