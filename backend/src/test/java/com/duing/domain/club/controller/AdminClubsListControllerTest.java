package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubsListControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User adminUser;
    private User studentUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        studentUser = saveUser("학생사용자", UserRole.STUDENT);
        leaderUser = saveUser("동아리장후보", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("ADMIN 이 status 미지정으로 호출하면 모든 상태의 동아리가 반환된다")
    void adminWithoutStatusReturnsAllStatuses() throws Exception {
        Club pending = saveClubWithLeader("승인대기클럽테스트", ClubStatus.PENDING_APPROVAL);
        Club active = saveClubWithLeader("활성클럽테스트", ClubStatus.ACTIVE);
        Club inactive = saveClubWithLeader("중단클럽테스트", ClubStatus.INACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=클럽테스트")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.content.name", hasItem(pending.getName()))
                    .body("data.content.name", hasItem(active.getName()))
                    .body("data.content.name", hasItem(inactive.getName()));
    }

    @Test
    @DisplayName("ADMIN 이 status=PENDING_APPROVAL 로 호출하면 해당 상태 동아리만 반환된다")
    void adminWithPendingStatusFiltersResults() throws Exception {
        Club pending = saveClubWithLeader("승인대기클럽필터", ClubStatus.PENDING_APPROVAL);
        Club active = saveClubWithLeader("활성클럽필터", ClubStatus.ACTIVE);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=클럽필터&status=PENDING_APPROVAL")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.name", hasItem(pending.getName()))
                    .body("data.content.name", not(hasItem(active.getName())));
    }

    @Test
    @DisplayName("응답 행에 leader 정보 (id/name/studentId) 가 포함된다")
    void responseContainsLeaderInfo() throws Exception {
        Club pending = saveClubWithLeader("리더정보클럽테스트", ClubStatus.PENDING_APPROVAL);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs?size=100&keyword=리더정보클럽테스트")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].name", equalTo(pending.getName()))
                    .body("data.content[0].leaderId", equalTo(leaderUser.getId().intValue()))
                    .body("data.content[0].leaderName", equalTo(leaderUser.getName()))
                    .body("data.content[0].leaderStudentId", equalTo(leaderUser.getStudentId()));
    }

    @Test
    @DisplayName("STUDENT 가 호출하면 403 을 반환한다")
    void studentGetsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/clubs")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
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
}
