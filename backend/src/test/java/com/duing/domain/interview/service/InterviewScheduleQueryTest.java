package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewScheduleQueryTest extends IntegrationTestBase {

    @Autowired private InterviewScheduleService interviewScheduleService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewScheduleRepository scheduleRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 ──────────────────────────────────────────────────────────────────────

    private User saveUser(String nameSuffix) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                nameSuffix + seq,
                "sched" + seq + "@duing.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, "모집-" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
    }

    private InterviewSlot saveSlot(Long recruitmentId) {
        return slotRepository.save(InterviewSlot.create(
                recruitmentId,
                LocalDateTime.now().plusDays(10),
                LocalDateTime.now().plusDays(10).plusHours(1),
                5));
    }

    // ── 테스트 ────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("본인 application 에 schedule 이 있으면 assigned=true 와 함께 200 응답한다")
    void 본인_application에_schedule이_있으면_assigned_true로_조회된다() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);

        User applicant = saveUser("지원자");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        InterviewSlot slot = saveSlot(recruitment.getId());
        scheduleRepository.save(
                InterviewSchedule.create(application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now()));

        MyInterviewScheduleResponse response =
                interviewScheduleService.findMySchedule(application.getId(), applicant.getId());

        assertThat(response.assigned()).isTrue();
        assertThat(response.schedule()).isNotNull();
        assertThat(response.schedule().slotId()).isEqualTo(slot.getId());
        assertThat(response.schedule().status()).isEqualTo(InterviewScheduleStatus.ASSIGNED);
    }

    @Test
    @DisplayName("본인 application 에 schedule 이 없으면 assigned=false, schedule=null 로 200 응답한다")
    void 본인_application에_schedule이_없으면_assigned_false로_조회된다() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);

        User applicant = saveUser("지원자");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        MyInterviewScheduleResponse response =
                interviewScheduleService.findMySchedule(application.getId(), applicant.getId());

        assertThat(response.assigned()).isFalse();
        assertThat(response.schedule()).isNull();
    }

    @Test
    @DisplayName("다른 사용자의 application 조회는 403 NotApplicationOwner 가 반환된다")
    void 타인의_application_조회시_403_예외가_발생한다() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);

        User applicant = saveUser("지원자");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        User anotherUser = saveUser("타인");

        assertThatThrownBy(() ->
                interviewScheduleService.findMySchedule(application.getId(), anotherUser.getId()))
                .isInstanceOf(InterviewException.NotApplicationOwner.class);
    }

    @Test
    @DisplayName("application 자체가 없으면 404 ApplicationNotFoundException 가 반환된다")
    void 존재하지_않는_application_조회시_404_예외가_발생한다() {
        Long nonExistentApplicationId = 999_999L;
        User anyUser = saveUser("임의사용자");

        assertThatThrownBy(() ->
                interviewScheduleService.findMySchedule(nonExistentApplicationId, anyUser.getId()))
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);
    }

    @Test
    @DisplayName("schedule 이 CANCELLED 상태여도 assigned=true, status=CANCELLED 로 노출된다")
    void CANCELLED_schedule도_assigned_true로_조회된다() {
        Club club = saveActiveClub("동아리");
        User leader = saveUser("리더");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club);

        User applicant = saveUser("지원자");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        InterviewSlot slot = saveSlot(recruitment.getId());
        InterviewSchedule schedule = InterviewSchedule.create(
                application.getId(), slot.getId(), recruitment.getId(), LocalDateTime.now());
        schedule.cancel();
        scheduleRepository.save(schedule);

        MyInterviewScheduleResponse response =
                interviewScheduleService.findMySchedule(application.getId(), applicant.getId());

        assertThat(response.assigned()).isTrue();
        assertThat(response.schedule()).isNotNull();
        assertThat(response.schedule().status()).isEqualTo(InterviewScheduleStatus.CANCELLED);
    }
}
