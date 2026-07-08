package com.duing.domain.draft.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SubmitDiscardsDraftTest extends IntegrationTestBase {

    @Autowired
    private ApplicationService applicationService;

    @Autowired
    private ApplicationRepository applicationRepository;

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
    @DisplayName("지원 제출이 성공하면 같은 모집의 draft 가 삭제된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void successfulSubmitDeletesDraft() throws Exception {
        User student = saveStudent("제출성공학생");
        Recruitment openRecruitment = saveOpenRecruitment("제출성공모집");

        draftRepository.save(ApplicationDraft.create(
                student.getId(), openRecruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("1", List.of("임시저장")))
        ));

        assertThat(draftRepository.findByUserIdAndRecruitmentId(student.getId(), openRecruitment.getId()))
                .isPresent();

        SubmitApplicationCommand submitCommand = new SubmitApplicationCommand(
                openRecruitment.getId(), student.getId(), List.of(), null
        );
        applicationService.submit(submitCommand);

        assertThat(draftRepository.findByUserIdAndRecruitmentId(student.getId(), openRecruitment.getId()))
                .isEmpty();
        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(openRecruitment.getId(), student.getId()))
                .isTrue();
    }

    @Test
    @DisplayName("지원 제출이 검증 실패로 예외를 던지면 draft 는 그대로 유지된다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void failedSubmitPreservesDraft() throws Exception {
        User student = saveStudent("제출실패학생");
        Recruitment openRecruitment = saveOpenRecruitment("제출실패모집");

        draftRepository.save(ApplicationDraft.create(
                student.getId(), openRecruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("1", List.of("임시저장")))
        ));

        // 먼저 한 번 제출해서 중복 상태를 만든다
        SubmitApplicationCommand firstSubmit = new SubmitApplicationCommand(
                openRecruitment.getId(), student.getId(), List.of(), null
        );
        applicationService.submit(firstSubmit);

        // draft 는 첫 번째 제출에서 삭제됨 — 두 번째 submit 을 위해 다시 저장
        draftRepository.save(ApplicationDraft.create(
                student.getId(), openRecruitment.getId(),
                List.of(new ApplicationDraft.DraftAnswer("1", List.of("두번째 임시저장")))
        ));

        // 중복 지원 시도 → DuplicateApplicationException 발생, discard 도달 전에 throw
        SubmitApplicationCommand duplicateSubmit = new SubmitApplicationCommand(
                openRecruitment.getId(), student.getId(), List.of(), null
        );
        assertThatThrownBy(() -> applicationService.submit(duplicateSubmit))
                .isInstanceOf(RuntimeException.class);

        // draft 는 예외로 인해 삭제되지 않고 유지된다
        assertThat(draftRepository.findByUserIdAndRecruitmentId(student.getId(), openRecruitment.getId()))
                .isPresent();
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "integration_draft" + unique + "@daegu.ac.kr",
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

    private Recruitment saveOpenRecruitment(String title) throws Exception {
        String uniqueName = "동아리-" + title + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        clubRepository.save(club);

        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(
                club, title + "-" + sequence.getAndIncrement(),
                null, today.minusDays(1), today.plusDays(7), 10
        );
        return recruitmentRepository.save(recruitment);
    }
}
