package com.duing.domain.notice.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class NoticeRepositoryImplTest {

    @Autowired NoticeRepository noticeRepository;
    @Autowired NoticeTargetClubRepository targetClubRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("비로그인 사용자는 PUBLIC 공지만 피드에서 볼 수 있다")
    void anonymousSeesOnlyPublic() {
        Long authorId = saveAuthor();
        Notice publicNotice = noticeRepository.save(Notice.create(
                "전체 공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, false, null, false, authorId));
        Notice officersNotice = noticeRepository.save(Notice.create(
                "운영진 공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.OFFICERS_ALL, null, false, null, true, authorId));

        Page<Notice> result = noticeRepository.findFeed(
                new NoticeSearchCondition(null, null, null),
                ViewerScope.anonymous(),
                PageRequest.of(0, 10));

        assertThat(result.getContent()).extracting(Notice::getId).contains(publicNotice.getId());
        assertThat(result.getContent()).extracting(Notice::getId).doesNotContain(officersNotice.getId());
    }

    @Test
    @DisplayName("OFFICERS_ALL 공지는 운영진(LEADER/OFFICER) 사용자에게만 노출된다")
    void officerSeesOfficersAllNotices() {
        Long authorId = saveAuthor();
        Notice officersNotice = noticeRepository.save(Notice.create(
                "운영진 공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.OFFICERS_ALL, null, false, null, true, authorId));

        ViewerScope student = new ViewerScope(UserRole.STUDENT, 2L, Set.of(10L), Set.of());
        ViewerScope officer = new ViewerScope(UserRole.STUDENT, 3L, Set.of(10L), Set.of(10L));

        Page<Notice> studentFeed = noticeRepository.findFeed(
                new NoticeSearchCondition(null, null, null), student, PageRequest.of(0, 10));
        Page<Notice> officerFeed = noticeRepository.findFeed(
                new NoticeSearchCondition(null, null, null), officer, PageRequest.of(0, 10));

        assertThat(studentFeed.getContent()).extracting(Notice::getId).doesNotContain(officersNotice.getId());
        assertThat(officerFeed.getContent()).extracting(Notice::getId).contains(officersNotice.getId());
    }

    @Test
    @DisplayName("CLUB_SCOPED + ALL_MEMBERS 공지는 대상 클럽 멤버에게 노출된다")
    void memberSeesClubScopedAllMembersNotices() {
        Long authorId = saveAuthor();
        Club targetClub = saveClub();

        Notice scopedNotice = noticeRepository.save(Notice.create(
                "클럽 멤버 공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.ALL_MEMBERS,
                false, null, true, authorId));
        targetClubRepository.save(new NoticeTargetClub(scopedNotice.getId(), targetClub.getId()));

        ViewerScope memberOfTarget = new ViewerScope(UserRole.STUDENT, 7L, Set.of(targetClub.getId()), Set.of());
        ViewerScope memberOfOther  = new ViewerScope(UserRole.STUDENT, 8L, Set.of(999_999L), Set.of());

        Page<Notice> targetFeed = noticeRepository.findFeed(
                new NoticeSearchCondition(null, null, null), memberOfTarget, PageRequest.of(0, 10));
        Page<Notice> otherFeed = noticeRepository.findFeed(
                new NoticeSearchCondition(null, null, null), memberOfOther, PageRequest.of(0, 10));

        assertThat(targetFeed.getContent()).extracting(Notice::getId).contains(scopedNotice.getId());
        assertThat(otherFeed.getContent()).extracting(Notice::getId).doesNotContain(scopedNotice.getId());
    }

    @Test
    @DisplayName("만료된 공지는 피드에서 제외되지만 admin 으로 직접 조회는 가능하다")
    void expiredNoticeIsHiddenFromFeed() {
        Long authorId = saveAuthor();
        Notice expiredNotice = noticeRepository.save(Notice.create(
                "만료 공지", "요약", "본문", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, false,
                LocalDateTime.now().minusDays(1), false, authorId));

        Page<Notice> anonFeed = noticeRepository.findFeed(
                new NoticeSearchCondition(null, null, null), ViewerScope.anonymous(), PageRequest.of(0, 10));
        assertThat(anonFeed.getContent()).extracting(Notice::getId).doesNotContain(expiredNotice.getId());

        ViewerScope adminScope = new ViewerScope(UserRole.ADMIN, 99L, Set.of(), Set.of());
        assertThat(noticeRepository.findVisibleById(expiredNotice.getId(), adminScope)).isPresent();
    }

    // ---- fixture helpers ----

    private Long saveAuthor() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(buildUser(seq, UserRole.ADMIN)).getId();
    }

    private User buildUser(long seq, UserRole role) {
        return User.create(
                "20" + seq,
                "테스터" + seq,
                "test" + seq + "@duing.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
    }

    private Club saveClub() {
        long seq = sequence.incrementAndGet();
        Club club = Club.create(
                "테스트 동아리 " + seq,
                ClubCategory.ACADEMIC,
                "분과",
                "설명",
                null
        );
        return clubRepository.save(club);
    }
}
