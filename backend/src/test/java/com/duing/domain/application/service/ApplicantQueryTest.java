package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.common.fixture.InterviewScheduleFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

// ApplicantQuery 가 Application.interviewAt 스칼라 필드 대신
// ASSIGNED InterviewSchedule + InterviewSlot.startTime 으로부터
// interviewStartAt 을 채우는지 검증한다 (Legacy Interview Field Removal Task 3).
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicantQueryTest extends IntegrationTestBase {

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewRoundRepository interviewRoundRepository;
    @Autowired private InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;
    @Autowired private ApplicationService applicationService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("ASSIGNED InterviewSchedule 이 있으면 interviewStartAt 이 slot.startTime 으로 채워진다")
    void applicantQuery_assignedInterview_populatesInterviewStartAt() {
        User leader = saveUser("리더");
        Club club = saveActiveClub("배정확인동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "배정확인모집");

        User applicantUser = saveUser("배정지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicantUser);

        InterviewRound round = saveCollectingRound(recruitment);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        LocalDateTime expectedStart = LocalDateTime.of(2026, 6, 20, 18, 0);
        InterviewSlot slot = interviewSlotRepository.save(
                InterviewSlotFixture.create(round.getId(), expectedStart, 3));
        interviewScheduleRepository.save(
                InterviewScheduleFixture.assigned(application.getId(), slot.getId(), round.getId()));

        ApplicantSearchCondition noFilter = new ApplicantSearchCondition(null, null, null, null, null);
        List<ApplicantQuery> results = applicationService.getApplicants(
                recruitment.getId(), leader.getId(), noFilter);

        ApplicantQuery target = results.stream()
                .filter(row -> row.applicationId().equals(application.getId()))
                .findFirst().orElseThrow();
        assertThat(target.interviewStartAt()).isEqualTo(expectedStart);
    }

    @Test
    @DisplayName("ASSIGNED schedule 이 없으면 interviewStartAt 은 null 이다")
    void applicantQuery_noAssignedInterview_returnsNull() {
        User leader = saveUser("리더없음");
        Club club = saveActiveClub("미배정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "미배정모집");

        User applicantUser = saveUser("미배정지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicantUser);

        ApplicantSearchCondition noFilter = new ApplicantSearchCondition(null, null, null, null, null);
        List<ApplicantQuery> results = applicationService.getApplicants(
                recruitment.getId(), leader.getId(), noFilter);

        ApplicantQuery target = results.stream()
                .filter(row -> row.applicationId().equals(application.getId()))
                .findFirst().orElseThrow();
        assertThat(target.interviewStartAt()).isNull();
    }

    @Test
    @DisplayName("CANCELLED InterviewSchedule 만 있으면 interviewStartAt 은 null 로 응답된다")
    void applicantQuery_cancelledScheduleOnly_returnsNull() {
        User leader = saveUser("취소리더");
        Club club = saveActiveClub("취소동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "취소모집");

        User applicantUser = saveUser("취소지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicantUser);

        InterviewRound round = saveCollectingRound(recruitment);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        InterviewSlot slot = interviewSlotRepository.save(
                InterviewSlotFixture.create(round.getId(), LocalDateTime.of(2026, 6, 21, 14, 0), 3));
        InterviewSchedule schedule = interviewScheduleRepository.save(
                InterviewScheduleFixture.assigned(application.getId(), slot.getId(), round.getId()));
        // 취소 전이 메서드는 라운드 API PR(BE#3~)에서 TDD 로 도입된다 — saveActiveClub 의 리플렉션 전례.
        ReflectionTestUtils.setField(schedule, "status", InterviewScheduleStatus.CANCELLED);
        interviewScheduleRepository.save(schedule);

        ApplicantSearchCondition noFilter = new ApplicantSearchCondition(null, null, null, null, null);
        List<ApplicantQuery> results = applicationService.getApplicants(
                recruitment.getId(), leader.getId(), noFilter);

        ApplicantQuery target = results.stream()
                .filter(row -> row.applicationId().equals(application.getId()))
                .findFirst().orElseThrow();
        assertThat(target.interviewStartAt()).isNull();
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "applicantQuery" + unique + "@daegu.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false);
        return recruitmentRepository.save(recruitment);
    }

    private InterviewRound saveCollectingRound(Recruitment recruitment) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(7), null, RoundStatus.COLLECTING));
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }
}
