package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class RecruitmentInterviewMetadataTest {

    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired InterviewRoundRepository interviewRoundRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("면접 시작일이 종료일보다 늦으면 InvalidInterviewPeriodException 이 발생한다")
    void invalidInterviewPeriodIsRejected() throws Exception {
        User leader = saveUser("면접리더");
        Club club = saveActiveClub("면접일정테스트");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        CreateRecruitmentCommand invalidCommand = new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "면접일정테스트공고",
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.SELF,
                null,
                true,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                LocalDate.now().plusDays(10),
                LocalDate.now().plusDays(8),
                false
        );

        assertThatThrownBy(() -> recruitmentService.create(invalidCommand))
                .isInstanceOf(RecruitmentException.InvalidInterviewPeriodException.class);
    }

    @Test
    @DisplayName("showApplicantCount=false 면 RecruitmentDetail.applicantCount 가 null 로 응답된다")
    void applicantCountHiddenWhenToggleOff() throws Exception {
        User leader = saveUser("비공개리더");
        Club club = saveActiveClub("비공개동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long recruitmentId = createRecruitment(club, leader, false);

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.showApplicantCount()).isFalse();
        assertThat(detail.applicantCount()).isNull();
    }

    @Test
    @DisplayName("showApplicantCount=true 면 applicantCount 가 실제 지원자 수로 응답된다")
    void applicantCountVisibleWhenToggleOn() throws Exception {
        User leader = saveUser("공개리더");
        Club club = saveActiveClub("공개동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long recruitmentId = createRecruitment(club, leader, true);

        Recruitment recruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        User applicant = saveUser("지원자");
        applicationRepository.save(Application.submit(recruitment, applicant,
                List.of(new ApplicationAnswer("q1", List.of("안녕")))));

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.showApplicantCount()).isTrue();
        assertThat(detail.applicantCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("라운드 모델 전환 후 마감 수집 중인 라운드가 있어도 모집 상세의 interviewAvailabilityDeadline 은 항상 null 이다")
    void interviewAvailabilityDeadlineIsAlwaysNullAfterRoundModel() throws Exception {
        User leader = saveUser("면접리더A");
        Club club = saveActiveClub("면접노출A");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long recruitmentId = createInterviewRecruitment(club, leader);

        // 마감 시각은 라운드 단위(지원자별 visible 라운드)로만 노출된다 — 모집 상세의 호환 필드 회귀 방지.
        interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitmentId, LocalDateTime.now().plusDays(3), "공학관 2201호", RoundStatus.COLLECTING));

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.useInterview()).isTrue();
        assertThat(detail.interviewAvailabilityDeadline()).isNull();
    }

    @Test
    @DisplayName("useInterview=true 라도 라운드가 아직 없으면 interviewAvailabilityDeadline 은 null")
    void interviewAvailabilityDeadlineNullWhenRoundAbsent() throws Exception {
        User leader = saveUser("면접리더B");
        Club club = saveActiveClub("면접노출B");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long recruitmentId = createInterviewRecruitment(club, leader);

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.useInterview()).isTrue();
        assertThat(detail.interviewAvailabilityDeadline()).isNull();
    }

    @Test
    @DisplayName("useInterview=false 면 라운드가 있어도 interviewAvailabilityDeadline 은 null")
    void interviewAvailabilityDeadlineNullWhenUseInterviewFalse() throws Exception {
        User leader = saveUser("면접리더C");
        Club club = saveActiveClub("면접노출C");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Long recruitmentId = createRecruitment(club, leader, true);

        // 비정상 케이스: useInterview=false 인 모집에 어쩌다 라운드 row 가 있어도 노출 차단
        interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitmentId, LocalDateTime.now().plusDays(3), null, RoundStatus.COLLECTING));

        RecruitmentDetailQuery detail = recruitmentService.getById(recruitmentId);
        assertThat(detail.useInterview()).isFalse();
        assertThat(detail.interviewAvailabilityDeadline()).isNull();
    }

    /* ---- helpers ---- */

    private Long createInterviewRecruitment(Club club, User leader) {
        return recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "면접공고-" + sequence.incrementAndGet(),
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.SELF,
                null,
                true,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                LocalDate.now().plusDays(8),
                LocalDate.now().plusDays(10),
                true
        ));
    }

    private Long createRecruitment(Club club, User leader, boolean showApplicantCount) {
        return recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "공고-" + sequence.incrementAndGet(),
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                null,
                null,
                showApplicantCount
        ));
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
