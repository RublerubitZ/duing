package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.BulkUpdateApplicationStatusCommand;
import com.duing.domain.application.service.dto.query.BulkUpdateApplicationStatusResult;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
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
import org.springframework.test.annotation.DirtiesContext;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ApplicationBulkStatusServiceTest {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("UNDER_REVIEW 3건을 REJECTED 로 일괄 변경하면 updated=3, failures=[] 로 처리된다")
    void bulkRejectThreeUnderReviewApplications() throws Exception {
        User leader = saveUser("일괄리더", UserRole.STUDENT);
        Club club = saveActiveClub("일괄벌크동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "일괄모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        Application a1 = saveApplicationWithStatus(recruitment, ApplicationStatus.UNDER_REVIEW, "지원자1");
        Application a2 = saveApplicationWithStatus(recruitment, ApplicationStatus.UNDER_REVIEW, "지원자2");
        Application a3 = saveApplicationWithStatus(recruitment, ApplicationStatus.UNDER_REVIEW, "지원자3");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(a1.getId(), a2.getId(), a3.getId()),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isEqualTo(3);
        assertThat(result.failures()).isEmpty();
        assertThat(applicationRepository.findById(a1.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.REJECTED);
        assertThat(applicationRepository.findById(a3.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.REJECTED);
    }

    @Test
    @DisplayName("from-state 가 섞이면 전이 가능한 행만 updated 에 카운트되고 나머지는 failures 에 사유와 함께 담긴다")
    void mixedFromStatesReturnPartialFailures() throws Exception {
        User leader = saveUser("부분실패리더", UserRole.STUDENT);
        Club club = saveActiveClub("부분실패동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "부분모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        // UNDER_REVIEW: REJECTED 로 전이 가능 (useInterview=false 라서)
        Application ok = saveApplicationWithStatus(recruitment, ApplicationStatus.UNDER_REVIEW, "정상지원자");
        // SUBMITTED: REJECTED 로 직접 못 감 — UNDER_REVIEW 부터 거쳐야 함
        Application notReady = saveApplicationWithStatus(recruitment, ApplicationStatus.SUBMITTED, "검토전지원자");
        // ACCEPTED: terminal — 어떤 전이도 불가
        Application terminal = saveApplicationWithStatus(recruitment, ApplicationStatus.ACCEPTED, "이미합격자");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(ok.getId(), notReady.getId(), terminal.getId()),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.failures()).hasSize(2);
        assertThat(result.failures())
                .extracting(BulkUpdateApplicationStatusResult.Failure::applicationId)
                .containsExactlyInAnyOrder(notReady.getId(), terminal.getId());
    }

    @Test
    @DisplayName("존재하지 않는 applicationId 가 섞이면 failures 에 해당 id 와 not-found 메시지가 담긴다")
    void unknownApplicationIdGoesToFailures() throws Exception {
        User leader = saveUser("미존재리더", UserRole.STUDENT);
        Club club = saveActiveClub("미존재동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "미존재모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        Application ok = saveApplicationWithStatus(recruitment, ApplicationStatus.UNDER_REVIEW, "정상지원자");
        long missingId = -42L;

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(ok.getId(), missingId),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.failures()).hasSize(1);
        assertThat(result.failures().get(0).applicationId()).isEqualTo(missingId);
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "bulk" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Application saveApplicationWithStatus(Recruitment recruitment, ApplicationStatus status,
                                                   String applicantName) throws Exception {
        User applicant = saveUser(applicantName, UserRole.STUDENT);
        Application application = Application.submit(recruitment, applicant, List.of());
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, status);
        return applicationRepository.save(application);
    }
}
