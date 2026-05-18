package com.duing.domain.draft.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.entity.ApplicationDraft.DraftAnswer;
import com.duing.domain.draft.exception.DraftException;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.draft.service.dto.command.UpsertDraftCommand;
import com.duing.domain.draft.service.dto.query.ApplicationDraftQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ApplicationDraftServiceTest {

    @Autowired
    private ApplicationDraftService draftService;

    @Autowired
    private ApplicationDraftRepository draftRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("같은 (user, recruitment) 에 대해 upsert 를 두 번 호출하면 row 가 1개이고 두 번째 answers 가 반영된다")
    void upsertIsIdempotentAndLastAnswersWins() throws Exception {
        User student = saveStudent("학생A");
        Recruitment openRecruitment = saveOpenRecruitment("모집A");

        List<DraftAnswer> firstAnswers = List.of(new DraftAnswer(1L, "첫번째 답변"));
        draftService.upsert(new UpsertDraftCommand(student.getId(), openRecruitment.getId(), firstAnswers));

        List<DraftAnswer> secondAnswers = List.of(new DraftAnswer(1L, "두번째 답변"));
        draftService.upsert(new UpsertDraftCommand(student.getId(), openRecruitment.getId(), secondAnswers));

        List<ApplicationDraft> all = draftRepository.findAll().stream()
                .filter(draft -> draft.getUserId().equals(student.getId())
                        && draft.getRecruitmentId().equals(openRecruitment.getId()))
                .toList();
        assertThat(all).hasSize(1);
        assertThat(all.get(0).getAnswers().get(0).value()).isEqualTo("두번째 답변");
    }

    @Test
    @DisplayName("마감된 모집에 upsert 를 호출하면 RecruitmentClosedException 이 발생한다")
    void upsertOnClosedRecruitmentThrowsException() throws Exception {
        User student = saveStudent("학생B");
        Recruitment closedRecruitment = saveClosedRecruitment("마감모집B");

        List<DraftAnswer> answers = List.of(new DraftAnswer(1L, "답변"));
        UpsertDraftCommand command = new UpsertDraftCommand(student.getId(), closedRecruitment.getId(), answers);

        assertThatThrownBy(() -> draftService.upsert(command))
                .isInstanceOf(DraftException.RecruitmentClosedException.class);
    }

    @Test
    @DisplayName("discard 는 draft 가 없어도 예외 없이 멱등하게 끝난다")
    void discardIsIdempotentWhenNoDraftExists() throws Exception {
        User student = saveStudent("학생C");
        Recruitment openRecruitment = saveOpenRecruitment("모집C");

        draftService.discard(student.getId(), openRecruitment.getId());
        draftService.discard(student.getId(), openRecruitment.getId());

        Optional<ApplicationDraftQuery> result = draftService.find(student.getId(), openRecruitment.getId());
        assertThat(result).isEmpty();
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "draft" + unique + "@daegu.ac.kr",
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

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(String title) throws Exception {
        Club club = saveActiveClub("동아리-" + title);
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, title, null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Recruitment saveClosedRecruitment(String title) throws Exception {
        Club club = saveActiveClub("마감동아리-" + title);
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club, title, null, today.minusDays(10), today.minusDays(1), 10);
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(recruitment, RecruitmentStatus.CLOSED);
        return recruitmentRepository.save(recruitment);
    }
}
