package com.duing.domain.clubmember.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
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
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubMemberControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("총동연관리자", UserRole.ADMIN, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정");
        User outsiderStudent = saveUser("비소속학생", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정");
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(outsiderStudent.getId(), outsiderStudent.getRole().name());
        club = saveActiveClub("두잉관리자명단");
    }

    @Test
    @DisplayName("ADMIN 이 동아리원 명단을 이름·학번·전공·단과대와 함께 받는다")
    void adminGetsRosterWithIdentityFields() {
        User member = saveUser("홍길동", UserRole.STUDENT, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학");
        clubMemberRepository.save(ClubMember.asLeader(club, member));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs/" + club.getId() + "/members")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data", hasSize(1))
                    .body("data[0].name", equalTo("홍길동"))
                    .body("data[0].studentId", equalTo(member.getStudentId()))
                    .body("data[0].major", equalTo("컴퓨터공학"))
                    .body("data[0].college", equalTo("IT_ENGINEERING"))
                    .body("data[0].grade", equalTo("JUNIOR"))
                    .body("data[0].role", equalTo("LEADER"));
    }

    @Test
    @DisplayName("명단은 LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순으로 정렬된다")
    void rosterIsOrderedByRoleThenJoinedAt() {
        User leader = saveUser("리더", UserRole.STUDENT, Grade.SENIOR, College.DESIGN_ART, "시각디자인");
        User officer = saveUser("운영진", UserRole.STUDENT, Grade.JUNIOR, College.NURSING, "간호학");
        User memberEarly = saveUser("회원먼저", UserRole.STUDENT, Grade.SOPHOMORE, College.IT_ENGINEERING, "전자공학");
        User memberLate = saveUser("회원나중", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "기계공학");

        // 역할과 무관하게 저장 순서를 섞어도 응답은 역할·가입일 순으로 정렬돼야 한다.
        clubMemberRepository.save(ClubMember.asMember(club, memberEarly));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberLate));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs/" + club.getId() + "/members")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.name", contains("리더", "운영진", "회원먼저", "회원나중"));
    }

    @Test
    @DisplayName("동아리에 소속되지 않은 ADMIN 도 명단을 조회할 수 있다(리더용과 달리 403 아님)")
    void nonMemberAdminCanQuery() {
        User member = saveUser("소속회원", UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정");
        clubMemberRepository.save(ClubMember.asLeader(club, member));

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs/" + club.getId() + "/members")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data", hasSize(1));
    }

    @Test
    @DisplayName("존재하지 않는 clubId 로 호출하면 404 를 반환한다(빈 배열로 뭉개지 않는다)")
    void nonexistentClubReturns404() {
        long missingClubId = club.getId() + 999_999L;

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/clubs/" + missingClubId + "/members")
                .then()
                    .statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("STUDENT 는 동아리원 명단을 조회할 수 없다")
    void studentIsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/clubs/" + club.getId() + "/members")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    private User saveUser(String name, UserRole role, Grade grade, College college, String major) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                role,
                grade,
                college,
                major,
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) {
        try {
            String uniqueName = name + "-" + sequence.getAndIncrement();
            Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(created, ClubStatus.ACTIVE);
            return clubRepository.save(created);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
