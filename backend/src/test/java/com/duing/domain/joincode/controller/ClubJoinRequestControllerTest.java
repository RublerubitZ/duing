package com.duing.domain.joincode.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import java.lang.reflect.Field;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
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
class ClubJoinRequestControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private Club otherClub;
    private User leaderUser;
    private String leaderToken;
    private String memberToken;
    private String otherClubLeaderToken;
    private ClubJoinCode joinCode;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;

        leaderUser = saveUser();
        User memberUser = saveUser();
        User otherClubLeaderUser = saveUser();

        club = saveActiveClub("가입요청동아리");
        otherClub = saveActiveClub("타동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderUser));
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherClubLeaderUser));

        leaderToken = tokenOf(leaderUser);
        memberToken = tokenOf(memberUser);
        otherClubLeaderToken = tokenOf(otherClubLeaderUser);

        joinCode = saveJoinCode(club, 30);
    }

    @Test
    @DisplayName("운영진 목록 조회는 기본으로 대기 중 요청만 최신순으로 반환하고 상태 필터로 처리 이력도 볼 수 있다")
    void listReturnsPendingByDefaultAndFiltersByStatus() {
        ClubJoinRequest firstPending = savePendingRequest(saveUser());
        ClubJoinRequest secondPending = savePendingRequest(saveUser());
        ClubJoinRequest rejected = saveRejectedRequest(saveUser());

        Response pendingList = listRequests(leaderToken, null);
        pendingList.then()
                .statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data[0].joinRequestId", equalTo(secondPending.getId().intValue()))
                .body("data[1].joinRequestId", equalTo(firstPending.getId().intValue()))
                .body("data[0].status", equalTo("PENDING"))
                .body("data[0].code", equalTo(joinCode.getCode()))
                .body("data[0].generation", equalTo(joinCode.getGeneration()));

        assertThat(pendingList.jsonPath().getList("data.joinRequestId", Long.class))
                .as("대기 목록에 처리된 요청은 섞이지 않는다")
                .doesNotContain(rejected.getId());

        listRequests(leaderToken, "REJECTED").then()
                .statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].joinRequestId", equalTo(rejected.getId().intValue()))
                .body("data[0].status", equalTo("REJECTED"));
    }

    @Test
    @DisplayName("목록 항목은 명단 대조에 필요한 학생 정보를 담되 전화번호는 노출하지 않는다")
    void listExposesRosterFieldsWithoutPhone() {
        User student = saveUser();
        ClubJoinRequest pending = savePendingRequest(student);
        Instant beforeAssertion = Instant.now();

        Response pendingList = listRequests(leaderToken, null);
        Map<String, Object> firstItem = pendingList.jsonPath().getMap("data[0]");

        assertThat(firstItem).as("전화번호는 목록에서 절대 내려가지 않는다").doesNotContainKey("phone");
        assertThat(firstItem)
                .containsEntry("joinRequestId", pending.getId().intValue())
                .containsEntry("userName", student.getName())
                .containsEntry("studentId", student.getStudentId())
                .containsEntry("major", student.getMajor());

        String requestedAt = pendingList.jsonPath().getString("data[0].requestedAt");
        assertThat(requestedAt).as("요청 시각은 오프셋 있는 절대시각(…Z)").endsWith("Z");
        assertThat(Duration.between(Instant.parse(requestedAt), beforeAssertion))
                .as("요청 시각은 방금 생성된 시점 — 존 오변환(±9h)이면 벗어난다")
                .isBetween(Duration.ofMinutes(-5), Duration.ofMinutes(5));
    }

    @Test
    @DisplayName("상세 조회에서만 전화번호를 확인할 수 있고 미처리 요청은 처리 정보가 비어 있다")
    void detailExposesPhoneAndEmptyReviewFieldsWhilePending() {
        User student = saveUser();
        ClubJoinRequest pending = savePendingRequest(student);

        getRequestDetail(leaderToken, club.getId(), pending.getId()).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.joinRequestId", equalTo(pending.getId().intValue()))
                .body("data.userName", equalTo(student.getName()))
                .body("data.studentId", equalTo(student.getStudentId()))
                .body("data.major", equalTo(student.getMajor()))
                .body("data.phone", equalTo(student.getPhone()))
                .body("data.code", equalTo(joinCode.getCode()))
                .body("data.status", equalTo("PENDING"))
                .body("data.rejectReason", nullValue())
                .body("data.reviewedAt", nullValue());
    }

    @Test
    @DisplayName("비로그인 상태에서는 가입 요청 목록·상세가 401 로 막힌다")
    void anonymousAccessReturns401() {
        ClubJoinRequest pending = savePendingRequest(saveUser());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/join-requests", club.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .when().get("/api/v1/clubs/{clubId}/join-requests/{joinRequestId}",
                        club.getId(), pending.getId())
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("일반 회원과 타 동아리 운영진은 가입 요청을 조회할 수 없다")
    void nonManagerAccessReturns403() {
        ClubJoinRequest pending = savePendingRequest(saveUser());

        listRequests(memberToken, null).then().statusCode(HttpStatus.FORBIDDEN.value());
        listRequests(otherClubLeaderToken, null).then().statusCode(HttpStatus.FORBIDDEN.value());
        getRequestDetail(memberToken, club.getId(), pending.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리의 가입 요청을 자기 동아리 경로로 조회하면 존재를 알리지 않고 404 를 반환한다")
    void otherClubRequestDetailReturns404() {
        ClubJoinCode otherClubJoinCode = saveJoinCode(otherClub, 30);
        ClubJoinRequest otherClubRequest = clubJoinRequestRepository.save(
                ClubJoinRequest.pending(otherClub, saveUser(), otherClubJoinCode));

        getRequestDetail(leaderToken, club.getId(), otherClubRequest.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private Response listRequests(String token, String status) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (status != null) {
            request = request.queryParam("status", status);
        }
        return request.when().get("/api/v1/clubs/{clubId}/join-requests", club.getId());
    }

    private Response getRequestDetail(String token, Long targetClubId, Long joinRequestId) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when()
                .get("/api/v1/clubs/{clubId}/join-requests/{joinRequestId}", targetClubId, joinRequestId);
    }

    private ClubJoinRequest savePendingRequest(User student) {
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(club, student, joinCode));
    }

    private ClubJoinRequest saveRejectedRequest(User student) {
        ClubJoinRequest pending = savePendingRequest(student);
        pending.reject(leaderUser, LocalDateTime.now());
        return clubJoinRequestRepository.save(pending);
    }

    private ClubJoinCode saveJoinCode(Club targetClub, int maxUses) {
        return clubJoinCodeRepository.save(ClubJoinCode.issue(
                targetClub, saveOpenExternalRecruitment(targetClub), randomCode(), 12, maxUses,
                LocalDateTime.now().plusDays(30)));
    }

    /** 코드 문자열은 전역 unique 이므로 테스트마다 겹치지 않게 시퀀스로 만든다. */
    private String randomCode() {
        String candidate = Long.toString(Math.abs(sequence.getAndIncrement()), 32).toUpperCase();
        return candidate.substring(candidate.length() - 6).replace('0', 'A').replace('1', 'B');
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private Club saveActiveClub(String name) throws Exception {
        Club created = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    /** 모집 기간은 하드코딩 절대일자 없이 오늘 기준 상대일로 만든다(시한폭탄 테스트 방지). */
    private Recruitment saveOpenExternalRecruitment(Club targetClub) {
        return recruitmentRepository.save(Recruitment.createWithOptions(targetClub,
                "모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
