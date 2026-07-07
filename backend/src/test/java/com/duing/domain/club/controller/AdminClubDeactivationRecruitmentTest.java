package com.duing.domain.club.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubDeactivationRecruitmentTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        leaderUser = saveUser("동아리장", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
    }

    @Test
    @DisplayName("운영 중단 전환 시 OPEN 모집은 CLOSED 로 일괄 마감되고 기존 CLOSED 모집과 지원서 상태는 변하지 않는다")
    void deactivationClosesOpenRecruitmentsWithoutTouchingApplications() throws Exception {
        Club club = saveClubWithLeader("중단전환클럽", ClubStatus.ACTIVE);
        Recruitment openRecruitment = recruitmentRepository.save(Recruitment.create(
                club, "진행중모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        Recruitment closedRecruitment = saveClosedRecruitment(club, "지난모집");
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(openRecruitment, applicant, List.of()));

        patchStatus(club.getId(), ClubStatus.INACTIVE);

        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(openRecruitment.getId()).orElseThrow().getStatus());
        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(closedRecruitment.getId()).orElseThrow().getStatus());
        Assertions.assertEquals(ApplicationStatus.SUBMITTED,
                applicationRepository.findById(application.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("운영 중단 후 재활성해도 마감된 모집은 자동 복구되지 않는다")
    void reactivationDoesNotReopenRecruitments() throws Exception {
        Club club = saveClubWithLeader("재활성클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "재활성모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));

        patchStatus(club.getId(), ClubStatus.INACTIVE);
        patchStatus(club.getId(), ClubStatus.ACTIVE);

        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(recruitment.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("soft delete 된 모집은 운영 중단 벌크 마감의 대상이 아니다")
    void softDeletedRecruitmentIsNotTouchedByBulkClose() throws Exception {
        Club club = saveClubWithLeader("소프트삭제클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "삭제된모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = NOW() WHERE id = ?", recruitment.getId());

        patchStatus(club.getId(), ClubStatus.INACTIVE);

        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM recruitment WHERE id = ?", String.class, recruitment.getId());
        Assertions.assertEquals("OPEN", status);
    }

    private void patchStatus(Long clubId, ClubStatus next) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body("{\"status\":\"" + next.name() + "\"}")
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", clubId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveClubWithLeader(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }

    private Recruitment saveClosedRecruitment(Club club, String title) {
        Recruitment created = Recruitment.create(club, title, "내용",
                LocalDate.now().minusDays(30), LocalDate.now().minusDays(10), 5);
        created.close();
        return recruitmentRepository.save(created);
    }
}
