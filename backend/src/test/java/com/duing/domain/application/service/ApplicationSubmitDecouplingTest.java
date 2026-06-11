package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationSubmitDecouplingTest extends IntegrationTestBase {

    @Autowired private ApplicationService applicationService;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewAvailabilityRepository availabilityRepository;
    @Autowired private InterviewRoundRepository roundRepository;
    @Autowired private InterviewSlotRepository slotRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    // ── 헬퍼 (구 InterviewAvailabilitySubmissionTest 패턴 유지) ──────────────────

    private User saveStudent(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "decouple" + unique + "@daegu.ac.kr",
                "hashed",
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

    private Recruitment saveOpenRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                        null, today.minusDays(1), today.plusDays(7), 10));
    }

    private Recruitment setupInterviewRecruitment(String label) {
        User leader = saveStudent("리더-" + label);
        Club club = saveActiveClub("면접동아리-" + label);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return saveOpenRecruitment(club, "면접모집-" + label);
    }

    private InterviewRound saveCollectingRound(Long recruitmentId, LocalDateTime availabilityDeadline) {
        return roundRepository.save(InterviewRoundFixture.withStatus(
                recruitmentId, availabilityDeadline, null, RoundStatus.COLLECTING));
    }

    private void saveSlot(Long roundId) {
        slotRepository.save(
                InterviewSlot.create(roundId,
                        LocalDateTime.now().plusDays(10),
                        LocalDateTime.now().plusDays(10).plusHours(1),
                        5));
    }

    private SubmitApplicationCommand submitCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, List.of());
    }

    // ── 테스트 ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("면접 모집이어도 지원 제출은 슬롯 선택 없이 성공하고 availability 는 생성되지 않는다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void interviewRecruitmentSubmitSucceedsWithoutSlotSelection() {
        Recruitment recruitment = setupInterviewRecruitment("디커플링");
        // 지원 시점엔 라운드 멤버가 아닌 것이 정상 — 라운드는 운영진이 발송할 때 멤버를 초대한다 (디커플링 그 자체).
        InterviewRound collectingRound =
                saveCollectingRound(recruitment.getId(), LocalDateTime.now().plusDays(7));
        saveSlot(collectingRound.getId());

        User applicant = saveStudent("지원자");
        Long applicationId = applicationService.submit(
                submitCommand(recruitment.getId(), applicant.getId()));

        assertThat(applicationId).isNotNull();
        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isTrue();
        assertThat(availabilityRepository.findByApplicationId(applicationId)).isEmpty();
    }

    @Test
    @DisplayName("availabilityDeadline 이 지난 면접 모집에도 지원 제출은 성공한다")
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void submitSucceedsAfterAvailabilityDeadline() {
        Recruitment recruitment = setupInterviewRecruitment("마감후디커플링");
        InterviewRound closedRound =
                saveCollectingRound(recruitment.getId(), LocalDateTime.now().minusSeconds(1));
        saveSlot(closedRound.getId());

        User applicant = saveStudent("지원자");
        Long applicationId = applicationService.submit(
                submitCommand(recruitment.getId(), applicant.getId()));

        assertThat(applicationId).isNotNull();
        assertThat(applicationRepository.existsByRecruitmentIdAndUserId(
                recruitment.getId(), applicant.getId())).isTrue();
    }
}
