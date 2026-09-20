package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.AccessDeniedException;

/**
 * 지원자 원본 번호 열람 감사(UX 감사 2차 C). 부원 번호 열람(ClubMemberPiiAccessAuditTest)과 같은 구조.
 *
 * <p>테스트 트랜잭션을 두지 않는 {@link IntegrationTestBase} 를 상속해 서비스가 스스로 트랜잭션을 연다 —
 * 클래스 레벨 readOnly 오버라이드 누락(실제 PG 에서 INSERT 거부)을 그대로 잡기 위해서다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicantPhoneAuditTest extends IntegrationTestBase {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final String APPLICANT_PHONE = "010-1234-5678";

    @Autowired ApplicationService applicationService;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired UserRepository userRepository;

    @Test
    @DisplayName("운영진이 지원자 번호를 열람하면 원본이 돌아오고 APPLICANT_PHONE_VIEWED 감사 행에 applicationId·userId 만 남는다")
    void revealLeavesAuditRowWithIdsOnly() throws Exception {
        Club club = saveActiveClub("지원자번호열람");
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        User applicant = saveApplicant();
        Application application = applicationRepository.save(
                Application.submit(saveOpenRecruitment(club), applicant, List.of()));

        String phone = applicationService.getApplicantPhone(application.getId(), leader.getId());

        assertThat(phone).isEqualTo(APPLICANT_PHONE);
        List<ClubAuditEvent> auditEvents = clubAuditEventRepository.findAll();
        assertThat(auditEvents).hasSize(1);
        ClubAuditEvent auditEvent = auditEvents.getFirst();
        assertThat(auditEvent.getEventType()).isEqualTo(ClubAuditEventType.APPLICANT_PHONE_VIEWED);
        assertThat(auditEvent.getClubId()).isEqualTo(club.getId());
        assertThat(auditEvent.getActorUserId()).isEqualTo(leader.getId());
        JsonNode detail = OBJECT_MAPPER.readTree(auditEvent.getDetail());
        assertThat(detail.get("applicationId").asLong()).isEqualTo(application.getId());
        assertThat(detail.get("userId").asLong()).isEqualTo(applicant.getId());
        assertThat(auditEvent.getDetail()).doesNotContain(APPLICANT_PHONE);
    }

    @Test
    @DisplayName("운영진이 아니면 열람이 거부되고 감사 행을 남기지 않는다")
    void nonManagerIsDeniedWithoutAuditRow() {
        Club club = saveActiveClub("지원자번호비운영진");
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        // 같은 동아리의 일반 부원으로 둔다 — 운영진 승격 없이 번호를 긁는 경로가 진짜 위험 경계다.
        // (아예 비멤버인 경우는 ClubMemberException.NotAMember 로 갈리며 컨트롤러 테스트가 403 을 덮는다.)
        User generalMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(club, generalMember));
        Application application = applicationRepository.save(
                Application.submit(saveOpenRecruitment(club), saveApplicant(), List.of()));

        assertThatThrownBy(() -> applicationService.getApplicantPhone(application.getId(), generalMember.getId()))
                .isInstanceOf(AccessDeniedException.class);

        assertThat(clubAuditEventRepository.count()).isZero();
    }

    @Test
    @DisplayName("없는 지원서는 404 로 끝나고 감사 행을 남기지 않는다")
    void missingApplicationLeavesNoAuditRow() {
        User leader = userRepository.save(UserFixture.unique());

        assertThatThrownBy(() -> applicationService.getApplicantPhone(999_999L, leader.getId()))
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);

        assertThat(clubAuditEventRepository.count()).isZero();
    }

    // 운영 행위 게이트가 ACTIVE 동아리만 허용하므로(ClubAuthService.requireManager) 승인 상태로 만들어 둔다.
    private Club saveActiveClub(String name) {
        Club club = ClubFixture.academic(name);
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, "번호열람모집", null, today.minusDays(1), today.plusDays(7), 10));
    }

    // 픽스처 기본 번호(010-0000-0000)와 구분되는 값 — 반환값이 진짜 대상 사용자의 번호인지 단언하기 위해서다.
    private User saveApplicant() {
        return userRepository.save(User.create("20269999", "지원자", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "컴퓨터공학", APPLICANT_PHONE, LocalDateTime.now()));
    }
}
