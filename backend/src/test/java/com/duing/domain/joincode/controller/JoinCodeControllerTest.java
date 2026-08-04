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
import com.duing.domain.joincode.service.JoinRequestService;
import com.duing.domain.joincode.service.dto.command.DecideJoinRequestCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.lang.reflect.Field;
import java.time.Clock;
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

    private static final int DEFAULT_WINDOW_DAYS = 7;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired JoinCodeRateLimiter joinCodeRateLimiter;
    @Autowired JoinRequestService joinRequestService;
    @Autowired JwtTokenProvider jwtTokenProvider;
    /** closed_at·revoked_at 은 프로덕션과 같은 seoulClock 으로 만든다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 −9h 가 된다. */
    @Autowired Clock clock;

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
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

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
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

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
    @DisplayName("폐기·소진된 코드는 확인은 되지만 사용 불가로 표시되고 요청 생성은 거절된다")
    void revokedOrExhaustedCodeIsUnusable() {
        ClubJoinCode revoked = saveJoinCode("REVOKE", 12, 30, DEFAULT_WINDOW_DAYS);
        revoke(revoked);
        assertUnusableAndRequestRejected("REVOKE");

        // 모집당 활성 코드는 1개(uk_club_join_code_active_per_recruitment) — 앞 코드를 폐기해야 다음이 들어간다.
        ClubJoinCode exhausted = saveJoinCode("USEDUP", 12, 1, DEFAULT_WINDOW_DAYS);
        exhausted.tryConsume();
        clubJoinCodeRepository.save(exhausted);
        assertUnusableAndRequestRejected("USEDUP");

        assertThat(clubJoinRequestRepository.count())
                .as("사용 불가 코드로는 요청 행이 만들어지지 않는다").isZero();
    }

    @Test
    @DisplayName("로그인 상태로 코드를 확인하면 내 가입 요청 상태와 회원 여부가 함께 내려온다")
    void authenticatedCheckIncludesMyRequestStatus() {
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

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
        ClubJoinCode joinCode = saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());
        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CONFLICT.value());

        ClubJoinRequest stored = clubJoinRequestRepository
                .findTopByClubIdAndUserIdOrderByIdDesc(club.getId(), student.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(JoinRequestStatus.PENDING);
        assertThat(stored.getGeneration()).as("코드의 기수가 스냅샷된다").isEqualTo(12);
        assertThat(clubJoinRequestRepository.count()).as("중복 요청은 행을 만들지 않는다").isEqualTo(1);
        assertThat(usedCountOf(joinCode))
                .as("자리는 신청 시점에 한 번만 확보된다 — 거절된 중복 요청은 차감하지 않는다").isEqualTo(1);
    }

    @Test
    @DisplayName("잔여 인원이 소진되면 다음 학생의 가입 요청은 거절되고 요청 행도 남지 않는다")
    void requestOnExhaustedCodeIsRejected() {
        ClubJoinCode joinCode = saveJoinCode("AB12CD", 12, 1, DEFAULT_WINDOW_DAYS);
        User laterStudent = saveUser();

        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());
        createRequest(tokenOf(laterStudent), "AB12CD").then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(clubJoinRequestRepository.count()).as("소진된 코드로는 요청 행이 생기지 않는다").isEqualTo(1);
        assertThat(usedCountOf(joinCode)).as("최대 인원을 넘겨 차감되지 않는다").isEqualTo(1);
        checkCode(null, "AB12CD").then().body("data.usable", equalTo(false));
    }

    @Test
    @DisplayName("이미 활성 회원인 사용자는 확인에서 가입 상태가 표시되고 요청 생성은 409 로 막힌다")
    void activeMemberCannotCreateRequest() {
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

        checkCode(existingMemberToken, "AB12CD").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.alreadyMember", equalTo(true));
        createRequest(existingMemberToken, "AB12CD").then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("거절로 자리가 환급되면 잔여 1명짜리 코드로도 같은 학생이 다시 요청할 수 있다")
    void rejectedRequesterCanRequestAgain() {
        ClubJoinCode joinCode = saveJoinCode("AB12CD", 12, 1, DEFAULT_WINDOW_DAYS);
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());

        ClubJoinRequest pending = clubJoinRequestRepository
                .findTopByClubIdAndUserIdOrderByIdDesc(club.getId(), student.getId()).orElseThrow();
        joinRequestService.decide(new DecideJoinRequestCommand(
                club.getId(), pending.getId(), leader.getId(), JoinRequestStatus.REJECTED));
        assertThat(usedCountOf(joinCode)).as("거절이 확보했던 자리를 환급한다").isZero();

        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());
        assertThat(clubJoinRequestRepository.count()).as("거절 이력 + 신규 요청").isEqualTo(2);
        assertThat(usedCountOf(joinCode)).as("재요청이 환급된 자리를 다시 확보한다").isEqualTo(1);
    }

    @Test
    @DisplayName("비 ACTIVE 동아리의 코드는 사용 불가로 표시되고 요청 생성도 거절된다")
    void inactiveClubCodeIsUnusable() throws Exception {
        Club inactiveClub = saveClub("휴면동아리", ClubStatus.INACTIVE);
        Recruitment inactiveClubRecruitment = saveOpenExternalRecruitment(inactiveClub);
        clubJoinCodeRepository.save(ClubJoinCode.issue(inactiveClub, inactiveClubRecruitment,
                "INACTV", 12, 30, DEFAULT_WINDOW_DAYS, null));

        assertUnusableAndRequestRejected("INACTV");
    }

    @Test
    @DisplayName("모집이 종료돼도 가입 가능 기간 안이면 코드로 요청을 계속 접수할 수 있다")
    void codeStaysUsableWithinJoinWindowAfterClose() {
        ClubJoinCode joinCode = saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

        // 6일 전 종료 + 프리셋 7일 → 아직 창 안. 합격자 등록은 종료 직후에 이어지는 절차다.
        closeRecruitment(LocalDateTime.now(clock).minusDays(6));

        checkCode(null, "AB12CD").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.usable", equalTo(true));
        createRequest(studentToken, "AB12CD").then().statusCode(HttpStatus.CREATED.value());
        assertThat(usedCountOf(joinCode)).as("종료 후 접수된 요청도 자리를 확보한다").isEqualTo(1);
    }

    @Test
    @DisplayName("가입 가능 기간이 지나면 코드는 사용 불가로 표시되고 요청 생성도 거절된다")
    void codeBecomesUnusableAfterJoinWindow() {
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

        // 8일 전 종료 + 프리셋 7일 → 창 밖. 마감 경로마다 폐기 훅을 심지 않고 판정으로 파생시킨다.
        closeRecruitment(LocalDateTime.now(clock).minusDays(8));

        assertUnusableAndRequestRejected("AB12CD");
        assertThat(clubJoinRequestRepository.count())
                .as("기간이 지난 코드로는 요청 행이 만들어지지 않는다").isZero();
    }

    @Test
    @DisplayName("가입 가능 기간을 모집 종료일까지로 잡은 코드는 종료 즉시 사용할 수 없다")
    void zeroJoinWindowCodeEndsAtClose() {
        saveJoinCode("AB12CD", 12, 30, 0);

        closeRecruitment(LocalDateTime.now(clock).minusMinutes(1));

        assertUnusableAndRequestRejected("AB12CD");
    }

    @Test
    @DisplayName("종료 시각이 기록되지 않은 마감 모집의 코드는 사용할 수 없다")
    void closedRecruitmentWithoutStampIsUnusable() throws Exception {
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

        // 스탬프 도입 전 마감된 레거시 행 — 기간 계산 기준이 없으면 무기한 사용 대신 막는다(fail-closed).
        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(stored, RecruitmentStatus.CLOSED);
        recruitmentRepository.save(stored);

        assertUnusableAndRequestRejected("AB12CD");
    }

    @Test
    @DisplayName("마감일이 없는 상시모집은 진행 중인 동안 코드를 계속 쓸 수 있다")
    void alwaysOpenRecruitmentKeepsCodeUsable() throws Exception {
        Club alwaysOpenClub = saveClub("상시모집동아리", ClubStatus.ACTIVE);
        Recruitment alwaysOpenRecruitment = recruitmentRepository.save(Recruitment.createWithOptions(
                alwaysOpenClub, "상시모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(30), null, 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
        clubJoinCodeRepository.save(ClubJoinCode.issue(alwaysOpenClub, alwaysOpenRecruitment,
                "ALWAYS", 12, 30, DEFAULT_WINDOW_DAYS, null));

        checkCode(null, "ALWAYS").then()
                .statusCode(HttpStatus.OK.value())
                .body("data.usable", equalTo(true));
        createRequest(studentToken, "ALWAYS").then().statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("비로그인 상태에서는 가입 요청을 생성할 수 없다")
    void anonymousRequestCreationReturns401() {
        saveJoinCode("AB12CD", 12, 30, DEFAULT_WINDOW_DAYS);

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
        joinCode.revoke(LocalDateTime.now(clock), null);
        clubJoinCodeRepository.save(joinCode);
    }

    /** 실제 종료 시각을 지정해 마감한다 — 가입 가능 기간의 기준점이다. */
    private void closeRecruitment(LocalDateTime closedAt) {
        Recruitment stored = recruitmentRepository.findById(recruitment.getId()).orElseThrow();
        stored.close(closedAt);
        recruitmentRepository.save(stored);
    }

    private int usedCountOf(ClubJoinCode joinCode) {
        return clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getUsedCount();
    }

    private ClubJoinCode saveJoinCode(String code, Integer generation, int maxUses, int joinWindowDays) {
        return clubJoinCodeRepository.save(
                ClubJoinCode.issue(club, recruitment, code, generation, maxUses, joinWindowDays, null));
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
