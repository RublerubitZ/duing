package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.service.dto.command.CreateInterviewConfigCommand;
import com.duing.domain.interview.service.dto.command.UpdateInterviewConfigCommand;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
class InterviewConfigServiceTest {

    @Autowired private InterviewConfigService interviewConfigService;
    @Autowired private InterviewConfigRepository configRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("운영진은 면접 설정을 생성할 수 있다")
    void createsConfigWhenManager() {
        Club club = saveActiveClub("동아리A");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now(), LocalDate.now().plusDays(30));

        Long configId = interviewConfigService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), leader.getId(),
                LocalDateTime.now().plusDays(7)));

        assertThat(configRepository.findById(configId)).isPresent();
    }

    @Test
    @DisplayName("운영진이 아닌 사용자가 면접 설정을 생성하면 403 이 반환된다")
    void throwsWhenNotManager() {
        Club club = saveActiveClub("동아리B");
        User outsider = saveUser();
        Recruitment recruitment = saveRecruitment(club, LocalDate.now(), LocalDate.now().plusDays(30));

        assertThatThrownBy(() -> interviewConfigService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), outsider.getId(),
                LocalDateTime.now().plusDays(7))))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("이미 면접 설정이 존재하는 모집은 두 번째 생성 시도가 409 ConfigAlreadyExists 를 반환한다")
    void throwsConfigAlreadyExistsOnDuplicate() {
        Club club = saveActiveClub("동아리C");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now(), LocalDate.now().plusDays(30));

        interviewConfigService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), leader.getId(),
                LocalDateTime.now().plusDays(7)));

        assertThatThrownBy(() -> interviewConfigService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), leader.getId(),
                LocalDateTime.now().plusDays(8))))
                .isInstanceOf(InterviewException.ConfigAlreadyExists.class);
    }

    @Test
    @DisplayName("모집 시작 이후 면접 설정 생성은 409 RecruitmentAlreadyStarted 를 반환한다")
    void throwsRecruitmentAlreadyStartedWhenPastStart() {
        Club club = saveActiveClub("동아리D");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        // startDate 가 어제 → 모집 이미 시작됨
        Recruitment recruitment = saveRecruitment(club, LocalDate.now().minusDays(1), LocalDate.now().plusDays(30));

        assertThatThrownBy(() -> interviewConfigService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), leader.getId(),
                LocalDateTime.now().plusDays(3))))
                .isInstanceOf(InterviewException.RecruitmentAlreadyStarted.class);
    }

    @Test
    @DisplayName("recruitment 범위 밖 deadline 은 400 InvalidDeadline 을 반환한다")
    void throwsInvalidDeadlineWhenOutOfRecruitmentPeriod() {
        Club club = saveActiveClub("동아리E");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now(), LocalDate.now().plusDays(5));

        // endDate 이후인 deadline
        assertThatThrownBy(() -> interviewConfigService.create(new CreateInterviewConfigCommand(
                recruitment.getId(), leader.getId(),
                LocalDateTime.now().plusDays(10))))
                .isInstanceOf(InterviewException.InvalidDeadline.class);
    }

    @Test
    @DisplayName("update 시 assignmentCompletedAt 이 채워진 모집은 409 AssignmentAlreadyCompleted 를 반환한다")
    void throwsAssignmentAlreadyCompletedOnUpdate() throws Exception {
        Club club = saveActiveClub("동아리F");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now(), LocalDate.now().plusDays(30));

        InterviewConfig config = configRepository.save(
                InterviewConfig.create(recruitment.getId(), LocalDateTime.now().plusDays(7)));
        // assignmentCompletedAt 을 강제 설정
        config.markAssignmentCompleted(LocalDateTime.now());

        assertThatThrownBy(() -> interviewConfigService.update(new UpdateInterviewConfigCommand(
                recruitment.getId(), leader.getId(),
                LocalDateTime.now().plusDays(10))))
                .isInstanceOf(InterviewException.AssignmentAlreadyCompleted.class);
    }

    @Test
    @DisplayName("update 시 deadline 이 null 이면 변경되지 않는다")
    void doesNotUpdateDeadlineWhenNull() {
        Club club = saveActiveClub("동아리G");
        User leader = saveUser();
        saveLeaderMembership(club, leader);
        Recruitment recruitment = saveRecruitment(club, LocalDate.now(), LocalDate.now().plusDays(30));

        LocalDateTime originalDeadline = LocalDateTime.now().plusDays(7);
        InterviewConfig config = configRepository.save(
                InterviewConfig.create(recruitment.getId(), originalDeadline));

        interviewConfigService.update(new UpdateInterviewConfigCommand(
                recruitment.getId(), leader.getId(), null));

        InterviewConfig found = configRepository.findById(config.getId()).orElseThrow();
        assertThat(found.getAvailabilityDeadline()).isEqualToIgnoringNanos(originalDeadline);
    }

    // ── 헬퍼 ────────────────────────────────────────────────────────────────────

    private Club saveActiveClub(String name) {
        return clubRepository.save(Club.create(name, ClubCategory.ACADEMIC, null, "설명", null));
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + seq, "유저" + seq, "u" + seq + "@duing.ac.kr",
                "hash", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000",
                LocalDateTime.now()));
    }

    private void saveLeaderMembership(Club club, User user) {
        clubMemberRepository.save(ClubMember.asLeader(club, user));
    }

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(
                Recruitment.create(club, "테스트 모집", "내용", startDate, endDate, 10));
    }
}
