package com.duing.domain.joincode.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
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
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.JoinCodeRateLimiter;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class JoinCodeControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JoinCodeRateLimiter joinCodeRateLimiter;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private Recruitment recruitment;
    private User student;
    private User existingMember;
    private String studentToken;
    private String existingMemberToken;

    @BeforeEach
    void setUp() throws Exception {
        RestAssured.port = port;
        // @SpringBootTest 컨텍스트 공유로 IP 창이 누적되면 뒤 테스트가 429 로 밀린다.
        joinCodeRateLimiter.reset();

        club = saveClub("가입코드동아리", ClubStatus.ACTIVE);
        recruitment = saveOpenExternalRecruitment(club);

        student = saveUser();
        existingMember = saveUser();
        clubMemberRepository.save(ClubMember.asMember(club, existingMember));

        studentToken = tokenOf(student);
        existingMemberToken = tokenOf(existingMember);
    }

    @Test
    @DisplayName("비로그인 상태에서도 코드를 확인해 동아리명과 기수를 볼 수 있고 내 상태 필드는 비어 있다")
    void anonymousCheckReturnsClubInfoWithoutPersonalState() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));

        checkCode(null, "AB12CD").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.clubId", equalTo(club.getId().intValue()))
                .body("data.clubName", equalTo(club.getName()))
                .body("data.generation", equalTo(12))
                .body("data.usable", equalTo(true))
                .body("data.alreadyMember", nullValue())
                .body("data.myRequestStatus", nullValue());
    }

    @Test
    @DisplayName("소문자로 입력한 코드도 대문자로 정규화되어 같은 코드로 조회된다")
    void lowercaseCodeIsNormalized() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));

        checkCode(null, "ab12cd").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.clubId", equalTo(club.getId().intValue()))
                .body("data.usable", equalTo(true));
    }

    @Test
    @DisplayName("존재하지 않는 코드를 확인하면 404 를 반환한다")
    void unknownCodeReturns404() {
        checkCode(null, "ZZZZZZ").then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("만료·폐기·소진된 코드는 확인은 되지만 사용 불가로 표시되고 요청 생성은 거절된다")
    void expiredRevokedExhaustedCodeIsUnusable() {
        ClubJoinCode expired = saveJoinCode("EXPIRE", 12, 30, LocalDateTime.now().minusMinutes(1));
        assertUnusableAndRequestRejected("EXPIRE");
        // 동아리당 활성 코드는 1개(uk_club_join_code_active_per_club) — 다음 코드 전에 폐기한다.
        revoke(expired);

        ClubJoinCode revoked = saveJoinCode("REVOKE", 12, 30, LocalDateTime.now().plusDays(30));
        revoke(revoked);
        assertUnusableAndRequestRejected("REVOKE");

        ClubJoinCode exhausted = saveJoinCode("USEDUP", 12, 1, LocalDateTime.now().plusDays(30));
        exhausted.tryConsume();
        clubJoinCodeRepository.save(exhausted);
        assertUnusableAndRequestRejected("USEDUP");
    }

    @Test
    @DisplayName("로그인 상태로 코드를 확인하면 내 가입 요청 상태와 회원 여부가 함께 내려온다")
    void authenticatedCheckIncludesMyRequestStatus() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));

        checkCode(studentToken, "AB12CD").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.alreadyMember", equalTo(false))
                .body("data.myRequestStatus", nullValue());

        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());

        checkCode(studentToken, "AB12CD").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.alreadyMember", equalTo(false))
                .body("data.myRequestStatus", equalTo("PENDING"));
    }

    @Test
    @DisplayName("가입 요청은 한 번만 접수되고 대기 중에 다시 요청하면 409 를 반환한다")
    void duplicatePendingRequestReturns409() {
        ClubJoinCode joinCode = saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));

        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());
        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CONFLICT.value());

        ClubJoinRequest stored = clubJoinRequestRepository
                .findTopByClubIdAndUserIdOrderByIdDesc(club.getId(), student.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(JoinRequestStatus.PENDING);
        assertThat(stored.getGeneration()).as("코드의 기수가 스냅샷된다").isEqualTo(12);
        assertThat(clubJoinRequestRepository.count()).as("중복 요청은 행을 만들지 않는다").isEqualTo(1);
        assertThat(clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getUsedCount())
                .as("요청 생성만으로는 사용 인원이 차감되지 않는다").isZero();
    }

    @Test
    @DisplayName("이미 활성 회원인 사용자는 확인에서 가입 상태가 표시되고 요청 생성은 409 로 막힌다")
    void activeMemberCannotCreateRequest() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));

        checkCode(existingMemberToken, "AB12CD").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.alreadyMember", equalTo(true));
        createRequest(existingMemberToken, "AB12CD").then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("거절된 뒤에는 같은 코드로 다시 가입 요청을 만들 수 있다")
    void rejectedRequesterCanRequestAgain() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));
        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());

        ClubJoinRequest pending = clubJoinRequestRepository
                .findTopByClubIdAndUserIdOrderByIdDesc(club.getId(), student.getId()).orElseThrow();
        pending.reject(existingMember, LocalDateTime.now());
        clubJoinRequestRepository.save(pending);

        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());
        assertThat(clubJoinRequestRepository.count()).as("거절 이력 + 신규 요청").isEqualTo(2);
    }

    @Test
    @DisplayName("비 ACTIVE 동아리의 코드는 사용 불가로 표시되고 요청 생성도 거절된다")
    void inactiveClubCodeIsUnusable() throws Exception {
        Club inactiveClub = saveClub("휴면동아리", ClubStatus.INACTIVE);
        Recruitment inactiveClubRecruitment = saveOpenExternalRecruitment(inactiveClub);
        clubJoinCodeRepository.save(ClubJoinCode.issue(inactiveClub, inactiveClubRecruitment,
                "INACTV", 12, 30, LocalDateTime.now().plusDays(30)));

        assertUnusableAndRequestRejected("INACTV");
    }

    @Test
    @DisplayName("귀속 모집이 마감되면 코드는 사용 불가가 되고 신규 가입 요청도 거절된다")
    void closedRecruitmentMakesCodeUnusable() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));
        checkCode(null, "AB12CD").then().body("data.usable", equalTo(true));

        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        stored.close();
        recruitmentRepository.save(stored);

        assertUnusableAndRequestRejected("AB12CD");
    }

    @Test
    @DisplayName("비로그인 상태에서는 가입 요청을 생성할 수 없다")
    void anonymousRequestCreationReturns401() {
        saveJoinCode("AB12CD", 12, 30, LocalDateTime.now().plusDays(30));

        createRequest(null, "AB12CD").then().statusCode(HttpStatus.UNAUTHORIZED.value());
        assertThat(clubJoinRequestRepository.count()).isZero();
    }

    private void assertUnusableAndRequestRejected(String code) {
        checkCode(null, code).then()
                .statusCode(HttpStatus.OK.value())
                .body("data.usable", equalTo(false));
        createRequest(studentToken, code).then().statusCode(HttpStatus.CONFLICT.value());
    }

    private Response checkCode(String token, String code) {
        return authorized(token).when().get("/api/v1/join-codes/{code}", code);
    }

    private Response createRequest(String token, String code) {
        return authorized(token).when().post("/api/v1/join-codes/{code}/requests", code);
    }

    private RequestSpecification authorized(String token) {
        RequestSpecification specification = RestAssured.given();
        return token == null ? specification : specification.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }

    private void revoke(ClubJoinCode joinCode) {
        joinCode.revoke(LocalDateTime.now());
        clubJoinCodeRepository.save(joinCode);
    }

    private ClubJoinCode saveJoinCode(String code, Integer generation, int maxUses, LocalDateTime expiresAt) {
        return clubJoinCodeRepository.save(
                ClubJoinCode.issue(club, recruitment, code, generation, maxUses, expiresAt));
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private Club saveClub(String name, ClubStatus status) throws Exception {
        Club created = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
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
