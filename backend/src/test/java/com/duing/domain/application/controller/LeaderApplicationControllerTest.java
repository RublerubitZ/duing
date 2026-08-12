package com.duing.domain.application.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
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
import org.springframework.jdbc.core.JdbcTemplate;

// @DirtiesContext 제거: 매 테스트 전 IntegrationTestBase.cleanDatabase() 가 전체 테이블을 TRUNCATE 해
// 이전 테스트 데이터가 필터 결과에 끼어드는 오염을 방지한다.
// 컨테이너는 TestcontainersConfiguration 의 static 필드로 JVM 전체에서 1회만 기동.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderApplicationControllerTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private RecruitmentRepository recruitmentRepository;

    @Autowired
    private ApplicationRepository applicationRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String memberToken;
    private User leader;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveUser("리더", UserRole.STUDENT, College.IT_ENGINEERING, "컴퓨터공학");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        User nonMember = saveUser("일반회원", UserRole.STUDENT, College.IT_ENGINEERING, "컴퓨터공학");
        memberToken = jwtTokenProvider.createToken(nonMember.getId(), nonMember.getRole().name());
    }

    @Test
    @DisplayName("지원자 목록 행은 신원·학년·답변·제출시각을 채우고 미배정 면접·미평가 항목은 null 로 내려준다")
    void applicantRowCarriesEveryResponseField() {
        Club club = saveActiveClub("행스키마동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        RecruitmentQuestion motivationQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = Recruitment.create(club, "행스키마모집-" + sequence.incrementAndGet(),
                null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10);
        recruitment.attachForm(RecruitmentForm.create(recruitment, List.of(motivationQuestion)));
        recruitment = recruitmentRepository.save(recruitment);

        User applicant = saveUserWithStudentId("행지원자", "20230777", College.EDUCATION, "교육학");
        Application application = applicationRepository.save(Application.submit(recruitment, applicant,
                List.of(new ApplicationAnswer(motivationQuestion.id(), List.of("열심히 하겠습니다.")))));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1))
                .body("data[0].applicationId", equalTo(application.getId().intValue()))
                .body("data[0].userId", equalTo(applicant.getId().intValue()))
                .body("data[0].userName", equalTo("행지원자"))
                .body("data[0].studentId", equalTo("20230777"))
                .body("data[0].college", equalTo("EDUCATION"))
                .body("data[0].major", equalTo("교육학"))
                .body("data[0].grade", equalTo("FRESHMAN"))
                // jsonb 답변이 projection 을 거쳐도 폼 질문 순서대로 그대로 복원된다
                .body("data[0].answers", contains("열심히 하겠습니다."))
                .body("data[0].status", equalTo("SUBMITTED"))
                .body("data[0].submittedAt", endsWith("Z"))
                .body("data[0].interviewStartAt", nullValue())
                .body("data[0].myScore", nullValue());
    }

    @Test
    @DisplayName("status 필터를 적용하면 해당 상태의 지원자만 반환된다")
    void statusFilterReturnsMatching() {
        Club club = saveActiveClub("상태필터동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "상태필터모집");

        User applicantSubmitted = saveUser("제출자", UserRole.STUDENT, College.EDUCATION, "교육학");
        User applicantOnHold = saveUser("보류자", UserRole.STUDENT, College.EDUCATION, "교육학");
        User applicantAccepted = saveUser("합격자", UserRole.STUDENT, College.EDUCATION, "교육학");

        saveApplicationWithStatus(recruitment, applicantSubmitted, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantOnHold, ApplicationStatus.ON_HOLD);
        saveApplicationWithStatus(recruitment, applicantAccepted, ApplicationStatus.ACCEPTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("status", "ON_HOLD")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1))
                .body("data[0].status", equalTo("ON_HOLD"));
    }

    @Test
    @DisplayName("college 필터를 적용하면 해당 단과대 지원자만 반환된다")
    void collegeFilterReturnsMatching() {
        Club club = saveActiveClub("단과대필터동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "단과대필터모집");

        User engineeringApplicant1 = saveUser("공대생1", UserRole.STUDENT, College.IT_ENGINEERING, "전자공학");
        User engineeringApplicant2 = saveUser("공대생2", UserRole.STUDENT, College.IT_ENGINEERING, "소프트웨어공학");
        User artsApplicant = saveUser("예대생", UserRole.STUDENT, College.DESIGN_ART, "디자인학");

        saveApplicationWithStatus(recruitment, engineeringApplicant1, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, engineeringApplicant2, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, artsApplicant, ApplicationStatus.SUBMITTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("college", "IT_ENGINEERING")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(2))
                .body("data.college", everyItem(equalTo("IT_ENGINEERING")));
    }

    @Test
    @DisplayName("q=홍길동 으로 검색하면 이름이 일치하는 지원자 1건만 반환된다")
    void searchByNameMatches() {
        Club club = saveActiveClub("검색필터동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "검색필터모집");

        User applicantHong = saveUserWithStudentId("홍길동", "20200001", College.IT_ENGINEERING, "컴퓨터공학");
        User applicantKim = saveUserWithStudentId("김민수", "20210042", College.IT_ENGINEERING, "ComputerScience");
        User applicantPark = saveUserWithStudentId("박지호", "20220099", College.IT_ENGINEERING, "전자공학");

        saveApplicationWithStatus(recruitment, applicantHong, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantKim, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantPark, ApplicationStatus.SUBMITTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("q", "홍길동")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("q=20210042 으로 검색하면 학번이 일치하는 지원자 1건만 반환된다")
    void searchByStudentIdMatches() {
        Club club = saveActiveClub("학번검색동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "학번검색모집");

        User applicantHong = saveUserWithStudentId("홍길동", "20200001", College.IT_ENGINEERING, "컴퓨터공학");
        User applicantKim = saveUserWithStudentId("김민수", "20210042", College.IT_ENGINEERING, "ComputerScience");
        User applicantPark = saveUserWithStudentId("박지호", "20220099", College.IT_ENGINEERING, "전자공학");

        saveApplicationWithStatus(recruitment, applicantHong, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantKim, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantPark, ApplicationStatus.SUBMITTED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("q", "20210042")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("q=computer 로 검색하면 major 가 ComputerScience 인 지원자가 대소문자 무시로 매칭된다")
    void searchByMajorIgnoresAsciiCase() {
        Club club = saveActiveClub("전공검색동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "전공검색모집");

        User applicantHong = saveUserWithStudentId("홍길동", "20200001", College.IT_ENGINEERING, "컴퓨터공학");
        User applicantKim = saveUserWithStudentId("김민수", "20210042", College.IT_ENGINEERING, "ComputerScience");
        User applicantPark = saveUserWithStudentId("박지호", "20220099", College.IT_ENGINEERING, "전자공학");

        saveApplicationWithStatus(recruitment, applicantHong, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantKim, ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, applicantPark, ApplicationStatus.SUBMITTED);

        // "computer" 는 "ComputerScience" 에 ILIKE 매칭 — ASCII 범위이므로 PostgreSQL ILIKE 가 fold 함
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("q", "computer")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("submittedTo 당일 23:59 에 제출된 지원자도 포함된다")
    void submittedToInclusiveBoundary() {
        Club club = saveActiveClub("경계테스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "경계테스트모집");

        User applicant = saveUser("경계지원자", UserRole.STUDENT, College.EDUCATION, "교육학");
        Application savedApplication = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        // @CreatedDate 가 save() 시점에 채워지므로 저장 이후 직접 UPDATE 로 원하는 시각을 주입한다.
        jdbcTemplate.update(
                "UPDATE application SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 5, 31, 23, 59, 30)),
                savedApplication.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("submittedFrom", "2026-05-31")
                .queryParam("submittedTo", "2026-05-31")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("submittedFrom 당일 00:00 에 제출된 지원자도 포함되고, 직전(전날 23:59) 제출은 제외된다")
    void submittedFromInclusiveBoundary() {
        Club club = saveActiveClub("시작경계테스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "시작경계테스트모집");

        User includedApplicant = saveUser("포함지원자", UserRole.STUDENT, College.EDUCATION, "교육학");
        User excludedApplicant = saveUser("제외지원자", UserRole.STUDENT, College.EDUCATION, "교육학");

        Application includedApplication = applicationRepository.save(
                Application.submit(recruitment, includedApplicant, List.of()));
        Application excludedApplication = applicationRepository.save(
                Application.submit(recruitment, excludedApplicant, List.of()));

        // 2026-05-15 00:00:30 제출 → submittedFrom=2026-05-15 에 포함
        jdbcTemplate.update(
                "UPDATE application SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 5, 15, 0, 0, 30)),
                includedApplication.getId());
        // 2026-05-14 23:59:30 제출 → submittedFrom=2026-05-15 에서 제외
        jdbcTemplate.update(
                "UPDATE application SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 5, 14, 23, 59, 30)),
                excludedApplication.getId());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("submittedFrom", "2026-05-15")
                .queryParam("submittedTo", "2026-05-15")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(200)
                .body("data.size()", is(1));
    }

    @Test
    @DisplayName("submittedFrom 이 submittedTo 보다 늦으면 400 을 반환한다")
    void invalidDateRange() {
        Club club = saveActiveClub("날짜오류동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "날짜오류모집");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("submittedFrom", "2026-06-10")
                .queryParam("submittedTo", "2026-06-01")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications", recruitment.getId())
                .then().statusCode(400)
                .body("message", containsString("submittedFrom"));
    }

    @Test
    @DisplayName("동일 필터에서 가운데 지원자의 prev 는 가장 최근, next 는 가장 오래된 지원자 id 다")
    void neighborsMatchListOrdering() {
        Club club = saveActiveClub("이웃정렬동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "이웃정렬모집");

        Long oldestId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 1, 9, 0));
        Long middleId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 5, 9, 0));
        Long newestId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 10, 9, 0));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors",
                        recruitment.getId(), middleId)
                .then().statusCode(200)
                .body("data.prevApplicationId", equalTo(newestId.intValue()))
                .body("data.nextApplicationId", equalTo(oldestId.intValue()));
    }

    @Test
    @DisplayName("가장 최근 지원자(UI 상 맨 위)는 prevApplicationId 가 null 이다")
    void newestApplicantHasNullPrev() {
        Club club = saveActiveClub("최신이웃동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "최신이웃모집");

        Long olderId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 1, 9, 0));
        Long newestId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 10, 9, 0));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors",
                        recruitment.getId(), newestId)
                .then().statusCode(200)
                .body("data.prevApplicationId", nullValue())
                .body("data.nextApplicationId", equalTo(olderId.intValue()));
    }

    @Test
    @DisplayName("가장 오래된 지원자(UI 상 맨 아래)는 nextApplicationId 가 null 이다")
    void oldestApplicantHasNullNext() {
        Club club = saveActiveClub("오래된이웃동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "오래된이웃모집");

        Long oldestId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 1, 9, 0));
        Long newerApplicationId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 10, 9, 0));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors",
                        recruitment.getId(), oldestId)
                .then().statusCode(200)
                .body("data.nextApplicationId", nullValue())
                .body("data.prevApplicationId", equalTo(newerApplicationId.intValue()));
    }

    @Test
    @DisplayName("필터로 1건만 남으면 prevApplicationId, nextApplicationId 모두 null 이다")
    void filteredToSingleResultReturnsBothNull() {
        Club club = saveActiveClub("단일필터이웃동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "단일필터이웃모집");

        Long submittedId = saveApplicationWithStatus(recruitment,
                saveUser("제출자", UserRole.STUDENT, College.EDUCATION, "교육학"),
                ApplicationStatus.SUBMITTED).getId();
        saveApplicationWithStatus(recruitment,
                saveUser("보류자", UserRole.STUDENT, College.EDUCATION, "교육학"),
                ApplicationStatus.ON_HOLD);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("status", "SUBMITTED")
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors",
                        recruitment.getId(), submittedId)
                .then().statusCode(200)
                .body("data.prevApplicationId", nullValue())
                .body("data.nextApplicationId", nullValue());
    }

    @Test
    @DisplayName("운영진이 아닌 사용자가 neighbor 조회 시 403 을 반환한다")
    void nonManagerCannotAccessNeighbors() {
        Club club = saveActiveClub("권한이웃동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "권한이웃모집");
        Long applicationId = saveApplicationAtTime(recruitment, LocalDateTime.of(2026, 5, 1, 9, 0));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors",
                        recruitment.getId(), applicationId)
                .then().statusCode(403);
    }

    @Test
    @DisplayName("PATCH /leader/applications/{id}/interview 엔드포인트는 더 이상 존재하지 않아 404 를 반환한다")
    void updateInterviewEndpoint_returns404() {
        Club club = saveActiveClub("폐기엔드포인트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "폐기엔드포인트모집");
        Long applicationId = saveApplicationWithStatus(recruitment,
                saveUser("지원자", UserRole.STUDENT, College.EDUCATION, "교육학"),
                ApplicationStatus.INTERVIEW_PENDING).getId();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of(
                        "interviewAt", "2026-06-20T18:00:00",
                        "interviewLocation", "3호관 201호"))
                .when().patch("/api/v1/leader/applications/{applicationId}/interview", applicationId)
                .then().statusCode(404);
    }

    @Test
    @DisplayName("다른 모집 소속의 applicationId 를 전달하면 neighbors 가 모두 null 이다")
    void mismatchedRecruitmentReturnsNullNeighbors() {
        // uk_recruitment_club_active 로 동아리당 활성 모집이 1개로 제한되므로 클럽을 분리한다
        Club clubA = saveActiveClub("모집불일치동아리A");
        clubMemberRepository.save(ClubMember.asLeader(clubA, leader));
        Club clubB = saveActiveClub("모집불일치동아리B");
        clubMemberRepository.save(ClubMember.asLeader(clubB, leader));

        Recruitment recruitmentA = saveOpenRecruitment(clubA, "모집A");
        Recruitment recruitmentB = saveOpenRecruitment(clubB, "모집B");

        // recruitmentA 에 이웃이 생길 수 있도록 2건 등록
        Long applicationInA = saveApplicationAtTime(recruitmentA, LocalDateTime.of(2026, 5, 1, 9, 0));
        saveApplicationAtTime(recruitmentA, LocalDateTime.of(2026, 5, 2, 9, 0));

        // recruitmentB 로 조회하되 applicationInA 를 넘기면 pivot 이 null → neighbors 모두 null
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/recruitments/{recruitmentId}/applications/{applicationId}/neighbors",
                        recruitmentB.getId(), applicationInA)
                .then().statusCode(200)
                .body("data.prevApplicationId", nullValue())
                .body("data.nextApplicationId", nullValue());
    }

    @Test
    @DisplayName("마감된 모집에서도 남은 지원서의 최종 결과는 확정할 수 있다")
    void closedRecruitmentAllowsFinalizingSingleStatusUpdate() {
        Club club = saveActiveClub("마감결과확정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "마감결과확정모집");
        Long applicationId = saveApplicationWithStatus(recruitment,
                saveUser("마감확정지원자", UserRole.STUDENT, College.EDUCATION, "교육학"),
                ApplicationStatus.SUBMITTED).getId();
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.save(recruitment);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "ACCEPTED"))
                .when().patch("/api/v1/leader/applications/{applicationId}/status", applicationId)
                .then().statusCode(204);
    }

    @Test
    @DisplayName("마감된 모집에서 최종 결과가 아닌 상태 변경(보류)은 마감 코드와 함께 409 로 거절된다")
    void closedRecruitmentBlocksNonFinalSingleStatusUpdate() {
        Club club = saveActiveClub("마감상태변경동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveOpenRecruitment(club, "마감상태변경모집");
        Long applicationId = saveApplicationWithStatus(recruitment,
                saveUser("마감지원자", UserRole.STUDENT, College.EDUCATION, "교육학"),
                ApplicationStatus.SUBMITTED).getId();
        recruitment.close(LocalDateTime.now());
        recruitmentRepository.save(recruitment);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("status", "ON_HOLD"))
                .when().patch("/api/v1/leader/applications/{applicationId}/status", applicationId)
                .then().statusCode(409)
                .body("code", equalTo("RECRUITMENT_CLOSED"))
                .body("message", equalTo("마감된 모집에서는 할 수 없는 작업입니다."));
    }

    private Long saveApplicationAtTime(Recruitment recruitment, LocalDateTime createdAt) {
        User applicant = saveUser("지원자", UserRole.STUDENT, College.IT_ENGINEERING, "전자공학");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));
        jdbcTemplate.update(
                "UPDATE application SET created_at = ? WHERE id = ?",
                java.sql.Timestamp.valueOf(createdAt),
                application.getId());
        return application.getId();
    }

    private User saveUser(String name, UserRole role, College college, String major) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "hashed",
                role,
                Grade.FRESHMAN,
                college,
                major,
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private User saveUserWithStudentId(String name, String studentId, College college, String major) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                studentId,
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                college,
                major,
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) {
        String uniqueName = name + "-" + sequence.incrementAndGet();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
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
        Recruitment recruitment = Recruitment.create(club, title + "-" + sequence.incrementAndGet(),
                null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Application saveApplicationWithStatus(Recruitment recruitment, User applicant,
            ApplicationStatus status) {
        Application application = Application.submit(recruitment, applicant, List.of());
        try {
            Field statusField = Application.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(application, status);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return applicationRepository.save(application);
    }

}
