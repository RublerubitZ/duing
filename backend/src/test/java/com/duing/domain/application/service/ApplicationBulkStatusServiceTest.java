package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
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
import com.duing.domain.clubmember.entity.ClubMemberRole;
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

// @DirtiesContext 제거: IntegrationTestBase.cleanDatabase() 가 매 테스트 전 전체 테이블을 TRUNCATE 해
// 이전 테스트의 application / club_member 데이터가 다음 테스트 assertion 에 영향을 주지 않는다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationBulkStatusServiceTest extends IntegrationTestBase {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("면접을 쓰지 않는 모집에서는 SUBMITTED 3건을 중간 단계 없이 ACCEPTED 로 일괄 변경할 수 있다")
    void bulkAcceptThreeSubmittedApplications() throws Exception {
        User leader = saveUser("일괄리더", UserRole.STUDENT);
        Club club = saveActiveClub("일괄벌크동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "일괄모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        Application firstApplication = saveApplicationWithStatus(recruitment, ApplicationStatus.SUBMITTED, "지원자1");
        Application secondApplication = saveApplicationWithStatus(recruitment, ApplicationStatus.SUBMITTED, "지원자2");
        Application thirdApplication = saveApplicationWithStatus(recruitment, ApplicationStatus.SUBMITTED, "지원자3");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(firstApplication.getId(), secondApplication.getId(), thirdApplication.getId()),
                        leader.getId(),
                        ApplicationStatus.ACCEPTED));

        assertThat(result.updated()).isEqualTo(3);
        assertThat(result.failures()).isEmpty();
        assertThat(applicationRepository.findById(firstApplication.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.ACCEPTED);
        assertThat(applicationRepository.findById(thirdApplication.getId()).orElseThrow().getStatus())
                .isEqualTo(ApplicationStatus.ACCEPTED);
    }

    @Test
    @DisplayName("보류(ON_HOLD) 지원자도 일괄 불합격 처리할 수 있다")
    void bulkRejectOnHoldApplications() throws Exception {
        User leader = saveUser("보류리더", UserRole.STUDENT);
        Club club = saveActiveClub("보류벌크동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "보류모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        Application firstApplication = saveApplicationWithStatus(recruitment, ApplicationStatus.ON_HOLD, "보류자1");
        Application secondApplication = saveApplicationWithStatus(recruitment, ApplicationStatus.ON_HOLD, "보류자2");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(firstApplication.getId(), secondApplication.getId()),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isEqualTo(2);
        assertThat(result.failures()).isEmpty();
        assertThat(applicationRepository.findById(firstApplication.getId()).orElseThrow().getStatus())
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

        // SUBMITTED: REJECTED 로 직행 가능
        Application transitionableApplication =
                saveApplicationWithStatus(recruitment, ApplicationStatus.SUBMITTED, "정상지원자");
        // ACCEPTED / REJECTED: terminal — 어떤 전이도 불가
        Application accepted = saveApplicationWithStatus(recruitment, ApplicationStatus.ACCEPTED, "이미합격자");
        Application rejected = saveApplicationWithStatus(recruitment, ApplicationStatus.REJECTED, "이미불합격자");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(transitionableApplication.getId(), accepted.getId(), rejected.getId()),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.failures()).hasSize(2);
        assertThat(result.failures())
                .extracting(BulkUpdateApplicationStatusResult.Failure::applicationId)
                .containsExactlyInAnyOrder(accepted.getId(), rejected.getId());
    }

    @Test
    @DisplayName("존재하지 않는 applicationId 가 섞이면 failures 에 해당 id 가 일반 사유와 함께 담긴다")
    void unknownApplicationIdGoesToFailures() throws Exception {
        User leader = saveUser("미존재리더", UserRole.STUDENT);
        Club club = saveActiveClub("미존재동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "미존재모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));

        Application transitionableApplication =
                saveApplicationWithStatus(recruitment, ApplicationStatus.SUBMITTED, "정상지원자");
        long missingId = -42L;

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(transitionableApplication.getId(), missingId),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.failures()).hasSize(1);
        assertThat(result.failures().get(0).applicationId()).isEqualTo(missingId);
    }

    @Test
    @DisplayName("일괄 변경 실패 사유는 미존재와 타 클럽 권한없음을 동일 일반 메시지로 합쳐 존재·소속을 숨긴다")
    void bulkFailureReasonDoesNotLeakExistenceOrMembership() throws Exception {
        User leader = saveUser("열거방지리더", UserRole.STUDENT);
        Club myClub = saveActiveClub("내동아리");
        clubMemberRepository.save(ClubMember.asLeader(myClub, leader));

        // 타 클럽의 지원서 — 호출자는 이 클럽의 운영진이 아니다.
        User otherLeader = saveUser("타클럽리더", UserRole.STUDENT);
        Club otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        Recruitment otherRecruitment = recruitmentRepository.save(
                Recruitment.create(otherClub, "타클럽모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        Application otherClubApp =
                saveApplicationWithStatus(otherRecruitment, ApplicationStatus.ON_HOLD, "타클럽지원자");

        long missingId = -77L;

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(otherClubApp.getId(), missingId),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.updated()).isZero();
        assertThat(result.failures()).hasSize(2);
        // 미존재와 타 클럽 권한없음의 사유가 동일해야 존재/소속을 구분할 수 없다.
        List<String> distinctReasons = result.failures().stream()
                .map(BulkUpdateApplicationStatusResult.Failure::reason)
                .distinct()
                .toList();
        assertThat(distinctReasons).hasSize(1);
        // 미존재·타 클럽 모두 정확히 동일한 일반 메시지여야 한다.
        assertThat(distinctReasons.get(0))
                .isEqualTo("해당 지원서를 처리할 권한이 없거나 존재하지 않습니다.");
    }

    @Test
    @DisplayName("잘못된 상태 전이 실패 사유는 일반화하지 않고 구체 메시지를 유지한다")
    void bulkInvalidTransitionKeepsSpecificReason() throws Exception {
        User leader = saveUser("전이리더", UserRole.STUDENT);
        Club club = saveActiveClub("전이동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "전이모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        // ACCEPTED -> REJECTED 는 terminal 에서 나가는 전이라 InvalidStatusTransition 으로 실패한다.
        Application accepted =
                saveApplicationWithStatus(recruitment, ApplicationStatus.ACCEPTED, "이미합격자");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(accepted.getId()),
                        leader.getId(),
                        ApplicationStatus.REJECTED));

        assertThat(result.failures()).hasSize(1);
        // 권한이 확인된 운영진에게는 정당한 정보 — 일반 메시지로 가리지 않는다.
        assertThat(result.failures().get(0).reason())
                .isNotEqualTo("해당 지원서를 처리할 권한이 없거나 존재하지 않습니다.");
    }

    @Test
    @DisplayName("운영진이 아닌 멤버의 일괄 변경 시도는 시스템 오류가 아닌 일반 권한 메시지로 실패한다")
    void bulkByNonManagerMemberReturnsGenericReason() throws Exception {
        User leader = saveUser("권한리더", UserRole.STUDENT);
        Club club = saveActiveClub("권한동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        User member = saveUser("일반멤버", UserRole.STUDENT);
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "권한모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        Application application = saveApplicationWithStatus(recruitment, ApplicationStatus.ON_HOLD, "지원자");

        BulkUpdateApplicationStatusResult result = applicationService.bulkUpdateStatus(
                new BulkUpdateApplicationStatusCommand(
                        List.of(application.getId()), member.getId(), ApplicationStatus.REJECTED));

        assertThat(result.updated()).isZero();
        assertThat(result.failures()).hasSize(1);
        // 역할 부족(AccessDeniedException)도 미존재·비멤버와 동일한 일반 메시지로 응답한다.
        assertThat(result.failures().get(0).reason())
                .isEqualTo("해당 지원서를 처리할 권한이 없거나 존재하지 않습니다.");
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
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
