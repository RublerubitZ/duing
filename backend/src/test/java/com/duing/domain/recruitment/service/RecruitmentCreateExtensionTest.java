package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
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
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class RecruitmentCreateExtensionTest {

    @Autowired
    private RecruitmentService recruitmentService;
    @Autowired
    private RecruitmentRepository recruitmentRepository;
    @Autowired
    private ClubRepository clubRepository;
    @Autowired
    private ClubMemberRepository clubMemberRepository;
    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("자체 폼 모집은 질문 목록과 함께 생성되며 RecruitmentForm 도 함께 저장된다")
    void selfFormRecruitmentIsCreatedWithForm() throws Exception {
        User leader = saveUser("자체폼리더");
        Club club = saveActiveClub("자체폼동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "자체 폼 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("지원 동기"), RecruitmentQuestion.createText("활동 가능 시간")),
                null,
                null,
                false
        ));

        Recruitment saved = recruitmentRepository.findById(recruitmentId).orElseThrow();
        assertThat(saved.getApplicationMode()).isEqualTo(ApplicationMode.SELF);
        assertThat(saved.getExternalFormUrl()).isNull();
        assertThat(saved.getForm()).isNotNull();
        assertThat(saved.getForm().getQuestions()).hasSize(2);
    }

    @Test
    @DisplayName("외부 폼 모집은 externalFormUrl 로 생성되며 RecruitmentForm 행은 만들지 않는다")
    void externalFormRecruitmentSkipsForm() throws Exception {
        User leader = saveUser("외부폼리더");
        Club club = saveActiveClub("외부폼동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "외부 폼 모집",
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                30,
                ApplicationMode.EXTERNAL,
                "https://forms.gle/aBcD1234",
                false,
                TargetRole.MEMBER,
                null,
                null,
                null,
                false
        ));

        Recruitment saved = recruitmentRepository.findById(recruitmentId).orElseThrow();
        assertThat(saved.getApplicationMode()).isEqualTo(ApplicationMode.EXTERNAL);
        assertThat(saved.getExternalFormUrl()).isEqualTo("https://forms.gle/aBcD1234");
        assertThat(saved.getForm()).isNull();
    }

    @Test
    @DisplayName("외부 폼 모집인데 externalFormUrl 이 비어 있으면 InvalidApplicationModeException 이 발생한다")
    void externalFormWithoutUrlFails() {
        assertThatThrownBy(() -> new CreateRecruitmentCommand(
                1L, 1L, "외부 폼", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.EXTERNAL, null, false, TargetRole.MEMBER, null,
                null,
                null,
                false
        )).isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }

    @Test
    @DisplayName("자체 폼 모집인데 질문이 비어 있으면 InvalidApplicationModeException 이 발생한다")
    void selfFormWithoutQuestionsFails() {
        assertThatThrownBy(() -> new CreateRecruitmentCommand(
                1L, 1L, "자체 폼", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.SELF, null, false, TargetRole.MEMBER, List.of(),
                null,
                null,
                false
        )).isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }

    @Test
    @DisplayName("외부 폼 모집인데 questions 가 함께 전달되면 InvalidApplicationModeException 이 발생한다")
    void externalFormWithQuestionsFails() {
        assertThatThrownBy(() -> new CreateRecruitmentCommand(
                1L, 1L, "외부 폼", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.EXTERNAL, "https://forms.gle/aBcD1234", false,
                TargetRole.MEMBER, List.of(RecruitmentQuestion.createText("질문1")),
                null,
                null,
                false
        )).isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }

    @Test
    @DisplayName("외부 폼 모집인데 면접 진행을 켜면 InvalidApplicationModeException 이 발생한다")
    void externalFormWithInterviewFails() {
        assertThatThrownBy(() -> externalCommand(null, true, false, "https://forms.gle/aBcD1234"))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("면접");
    }

    @Test
    @DisplayName("외부 폼 모집인데 지원자 수 공개를 켜면 InvalidApplicationModeException 이 발생한다")
    void externalFormWithApplicantCountFails() {
        assertThatThrownBy(() -> externalCommand(null, false, true, "https://forms.gle/aBcD1234"))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("지원자 수");
    }

    @Test
    @DisplayName("외부 폼 모집에 안내문(content)을 채워 보내면 InvalidApplicationModeException 이 발생한다")
    void externalFormWithContentFails() {
        assertThatThrownBy(() -> externalCommand("지원 전 꼭 읽어주세요", false, false, "https://forms.gle/aBcD1234"))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("안내문");
    }

    @Test
    @DisplayName("외부 폼 모집의 안내문은 null·빈 문자열·공백이면 통과한다 — 미작성은 정상 입력이다")
    void externalFormWithBlankContentPasses() {
        assertThatCode(() -> externalCommand(null, false, false, "https://forms.gle/aBcD1234"))
                .doesNotThrowAnyException();
        assertThatCode(() -> externalCommand("", false, false, "https://forms.gle/aBcD1234"))
                .doesNotThrowAnyException();
        assertThatCode(() -> externalCommand("   ", false, false, "https://forms.gle/aBcD1234"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("외부 폼 모집의 URL 이 허용 플랫폼(구글 폼·네이버 폼)이 아니면 InvalidApplicationModeException 이 발생한다")
    void externalFormWithUnlistedUrlFails() {
        assertThatThrownBy(() -> externalCommand(null, false, false, "https://example.com/form"))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
        assertThatThrownBy(() -> externalCommand(null, false, false, "http://forms.gle/aBcD1234"))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }

    @Test
    @DisplayName("자체 폼 모집은 안내문·면접·지원자 수 공개를 그대로 사용할 수 있다 — EXTERNAL 제약은 SELF 에 적용되지 않는다")
    void selfFormKeepsNoticeInterviewAndApplicantCount() {
        assertThatCode(() -> new CreateRecruitmentCommand(
                1L, 1L, "자체 폼", "안내문 본문",
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.SELF, null, true, TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("질문1")),
                LocalDate.now().plusDays(8),
                LocalDate.now().plusDays(9),
                true
        )).doesNotThrowAnyException();
    }

    private static CreateRecruitmentCommand externalCommand(
            String content, boolean useInterview, boolean showApplicantCount, String externalFormUrl) {
        return new CreateRecruitmentCommand(
                1L, 1L, "외부 폼", content,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.EXTERNAL, externalFormUrl, useInterview, TargetRole.MEMBER, null,
                null,
                null,
                showApplicantCount
        );
    }

    @Test
    @DisplayName("OFFICER 도 본인이 운영진인 동아리에서 모집 공고를 생성할 수 있다")
    void officerCanCreateRecruitment() throws Exception {
        User officer = saveUser("운영진");
        Club club = saveActiveClub("운영진허용동아리");
        saveMembership(club, officer, ClubMemberRole.OFFICER);

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                officer.getId(),
                "운영진작성모집",
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(5),
                5,
                ApplicationMode.SELF,
                null,
                true,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                null,
                null,
                false
        ));

        assertThat(recruitmentRepository.findById(recruitmentId)).isPresent();
    }

    @Test
    @DisplayName("MEMBER 가 모집 공고를 생성하려 하면 NotClubManagerException 이 발생한다")
    void memberCannotCreateRecruitment() throws Exception {
        User member = saveUser("일반회원");
        Club club = saveActiveClub("회원동아리");
        saveMembership(club, member, ClubMemberRole.MEMBER);

        CreateRecruitmentCommand command = new CreateRecruitmentCommand(
                club.getId(), member.getId(), "회원작성시도", null,
                LocalDate.now(), LocalDate.now().plusDays(5), 5,
                ApplicationMode.SELF, null, false, TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("질문")),
                null,
                null,
                false
        );

        assertThatThrownBy(() -> recruitmentService.create(command))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
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
        Club club = Club.create(name + "-" + sequence.getAndIncrement(), ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        clubMemberRepository.save(ClubMember.of(club, user, role));
    }
}
