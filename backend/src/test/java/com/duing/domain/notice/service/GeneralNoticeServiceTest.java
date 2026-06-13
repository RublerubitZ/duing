package com.duing.domain.notice.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.notice.service.dto.command.CreateNoticeCommand;
import com.duing.domain.notice.service.dto.command.UpdateNoticeCommand;
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
class GeneralNoticeServiceTest {

    @Autowired NoticeService noticeService;
    @Autowired NoticeRepository noticeRepository;
    @Autowired NoticeTargetClubRepository targetClubRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("PUBLIC 공지는 club_scope_role 없이 생성되며 target_clubs 가 비어 있다")
    void createsPublicNotice() {
        Long authorId = saveAuthor();
        CreateNoticeCommand createCommand = new CreateNoticeCommand(
                "전체 공지 제목", "요약", "본문 내용", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, List.of(),
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId
        );

        Long savedId = noticeService.create(createCommand);

        assertThat(noticeRepository.findById(savedId)).isPresent();
        assertThat(targetClubRepository.findAllByIdNoticeId(savedId)).isEmpty();
    }

    @Test
    @DisplayName("CLUB_SCOPED 공지인데 targetClubIds 가 비어 있으면 InvalidNoticeScopeException 이 발생한다")
    void clubScopedRequiresTargets() {
        Long authorId = saveAuthor();
        CreateNoticeCommand createCommand = new CreateNoticeCommand(
                "동아리 공지 제목", "요약", "본문 내용", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.OFFICERS_ONLY, List.of(),
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId
        );

        assertThatThrownBy(() -> noticeService.create(createCommand))
                .isInstanceOf(NoticeException.InvalidNoticeScopeException.class);
    }

    @Test
    @DisplayName("CLUB_SCOPED → PUBLIC 으로 visibility 변경 시 기존 target_clubs 가 정리된다")
    void clearTargetsWhenVisibilityChangesToPublic() {
        Long authorId = saveAuthor();
        Long clubId = saveClubId();
        CreateNoticeCommand createCommand = new CreateNoticeCommand(
                "동아리 공지 제목", "요약", "본문 내용", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.CLUB_SCOPED, NoticeClubScopeRole.ALL_MEMBERS, List.of(clubId),
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId
        );
        Long savedId = noticeService.create(createCommand);
        assertThat(targetClubRepository.findAllByIdNoticeId(savedId)).isNotEmpty();

        UpdateNoticeCommand updateCommand = new UpdateNoticeCommand(
                savedId,
                null, null, null, null, null, null, null,
                NoticeVisibility.PUBLIC, null, null,
                null, null, null, null,
                null, null, null, null, null, null, null
        );
        noticeService.update(updateCommand);

        assertThat(targetClubRepository.findAllByIdNoticeId(savedId)).isEmpty();
        assertThat(noticeRepository.findById(savedId).orElseThrow().getVisibility())
                .isEqualTo(NoticeVisibility.PUBLIC);
    }

    @Test
    @DisplayName("delete 호출 후에는 일반 조회에서 공지가 더 이상 보이지 않는다")
    void softDeleteRemovesFromFindAll() {
        Long authorId = saveAuthor();
        CreateNoticeCommand createCommand = new CreateNoticeCommand(
                "삭제될 공지", "요약", "본문 내용", "https://example.com/cover.png", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null, List.of(),
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId
        );
        Long savedId = noticeService.create(createCommand);
        assertThat(noticeRepository.findById(savedId)).isPresent();

        noticeService.delete(savedId);

        assertThat(noticeRepository.findById(savedId)).isEmpty();
    }

    // ---- fixture helpers ----

    private Long saveAuthor() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq,
                "테스터" + seq,
                "test" + seq + "@duing.ac.kr",
                "hashed",
                UserRole.ADMIN,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        )).getId();
    }

    private Long saveClubId() {
        long seq = sequence.incrementAndGet();
        Club club = Club.create("테스트 동아리 " + seq, ClubCategory.ACADEMIC, "분과", "설명", null);
        return clubRepository.save(club).getId();
    }
}
