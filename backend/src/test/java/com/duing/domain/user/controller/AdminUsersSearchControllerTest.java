package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminUsersSearchControllerTest extends IntegrationTestBase {

    /** setUp 이 매번 만드는 계정 수(관리자 1 + 학생 1). 전체 건수를 단언하는 테스트들의 기준선이다. */
    private static final int SETUP_USER_COUNT = 2;

    /** 페이징 안정성 테스트가 추가로 만드는, 가입 시각이 서로 같은 회원 수. */
    private static final int TIED_USER_COUNT = 5;

    /** 페이징 안정성 테스트가 다루는 전체 회원 수. */
    private static final int PAGING_TOTAL_USER_COUNT = SETUP_USER_COUNT + TIED_USER_COUNT;

    /**
     * 페이징 안정성 테스트의 페이지 크기. 전체 회원 수와의 관계가 두 조건을 동시에 만족해야 한다.
     * <ul>
     *   <li>전체 회원 수보다 작다 → 페이지 경계가 생겨 tie-breaker 를 검증할 수 있다.</li>
     *   <li>전체 회원 수의 절반 이상이다 → 두 페이지 요청으로 전원이 커버된다.</li>
     * </ul>
     * 첫 페이지가 정확히 가득 차는 것도 이 관계에서 나오며, 그것이 count 쿼리 실행 조건이다
     * (자세한 이유는 해당 테스트의 주석 참조).
     */
    private static final int PAGING_PAGE_SIZE = 4;

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String adminToken;
    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("2026010001", "총동연관리자", UserRole.ADMIN);
        User studentUser = saveUser("2026010002", "학생사용자", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
        studentToken = jwtTokenProvider.createToken(studentUser.getId(), studentUser.getRole().name());
    }

    @Test
    @DisplayName("학번 prefix 로 검색하면 해당 학번 사용자가 반환된다")
    void searchByStudentIdPrefix() {
        User target = saveUser("2024030001", "김학번", UserRole.STUDENT);
        saveUser("2025040002", "박다름", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=202403")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("ok", equalTo(true))
                    .body("data.content.studentId", hasItem(target.getStudentId()))
                    .body("data.content.studentId", not(hasItem("2025040002")));
    }

    @Test
    @DisplayName("이름 부분일치(대소문자 무시) 로 검색된다")
    void searchByNameContains() {
        User target = saveUser("2024030010", "이름검색대상", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=검색대상")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.id", hasItem(target.getId().intValue()));
    }

    @Test
    @DisplayName("응답에 passwordHash 등 민감 필드는 노출되지 않는다")
    void responseDoesNotLeakSensitiveFields() {
        saveUser("2024030030", "필드검사", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=2024030030")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].studentId", equalTo("2024030030"))
                    // 검사 대상은 JSON 객체이므로 Iterable 용 hasItem 이 아니라 hasKey 여야 한다 —
                    // hasItem 은 타입이 맞지 않아 not(...) 이 입력과 무관하게 늘 통과한다.
                    .body("data.content[0]", not(hasKey("passwordHash")))
                    .body("data.content[0]", not(hasKey("phone")))
                    .body("data.content[0]", not(hasKey("email")));
    }

    @Test
    @DisplayName("검색 결과에 동명이인 식별용 학년·단과대·전공이 원값으로 포함된다")
    void responseIncludesIdentityFields() {
        saveUser("2024030040", "식별대상", UserRole.STUDENT, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학");

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=2024030040")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].grade", equalTo("JUNIOR"))
                    .body("data.content[0].college", equalTo("IT_ENGINEERING"))
                    .body("data.content[0].major", equalTo("컴퓨터공학"));
    }

    @Test
    @DisplayName("STUDENT 가 호출하면 403 을 반환한다")
    void studentGetsForbidden() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when()
                    .get("/api/v1/admin/users?q=anyone")
                .then()
                    .statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("검색어를 빈 문자열로 보내면 검색 조건 없이 전체 목록을 반환한다")
    void blankQueryReturnsFullList() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?q=")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(SETUP_USER_COUNT));
    }

    @Test
    @DisplayName("검색어 없이 조회하면 전체 회원이 반환된다")
    void searchWithoutQueryReturnsAllUsers() {
        saveUser("2024030050", "가나다", UserRole.STUDENT);
        saveUser("2024030051", "라마바", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(SETUP_USER_COUNT + 2));
    }

    @Test
    @DisplayName("status=SUSPENDED 로 조회하면 정지된 회원만 반환된다")
    void searchFiltersBySuspendedStatus() {
        saveUser("2024030060", "정상회원", UserRole.STUDENT);
        User suspendedUser = saveUser("2024030061", "정지회원", UserRole.STUDENT);
        suspendedUser.suspend();
        userRepository.saveAndFlush(suspendedUser);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("status", "SUSPENDED")
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(1))
                    .body("data.content[0].name", equalTo("정지회원"))
                    .body("data.content[0].status", equalTo("SUSPENDED"));
    }

    @Test
    @DisplayName("검색어와 상태를 함께 주면 두 조건을 모두 만족하는 회원만 반환된다")
    void searchAppliesQueryAndStatusTogether() {
        // 검색어에는 걸리지만 상태가 다른 회원 — 두 조건이 AND 로 묶였는지 확인하는 핵심 픽스처다.
        // 리포지토리 JPQL 에서 검색어 OR 세 갈래를 감싼 괄호가 풀리면 상태 필터가 마지막 갈래에만 붙어
        // 학번 prefix 로 매치된 이 회원이 정지 회원 목록에 섞여 들어온다.
        saveUser("2024080001", "복합조건정상", UserRole.STUDENT);
        User suspendedUser = saveUser("2024080002", "복합조건정지", UserRole.STUDENT);
        suspendedUser.suspend();
        userRepository.saveAndFlush(suspendedUser);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("q", "202408")
                    .queryParam("status", "SUSPENDED")
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content.size()", equalTo(1))
                    .body("data.content[0].studentId", equalTo(suspendedUser.getStudentId()));
    }

    @Test
    @DisplayName("검색 결과 행에 계정 상태가 포함된다")
    void searchResultIncludesStatus() {
        User target = saveUser("2024030070", "상태확인", UserRole.STUDENT);

        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("q", target.getStudentId())
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.content[0].status", equalTo("ACTIVE"));
    }

    @Test
    @DisplayName("가입 시각이 같은 회원들도 페이지 사이에서 겹치거나 누락되지 않는다")
    void pagingIsStableWhenCreatedAtTies() {
        for (int index = 0; index < TIED_USER_COUNT; index++) {
            saveUser("202405000" + index, "동시가입" + index, UserRole.STUDENT);
        }
        // 가입 시각을 강제로 동일하게 맞춘다 — createdAt 만으로 정렬하면 동률 행의 순서가 쿼리마다 달라져
        // 페이지 경계에서 행이 중복되거나 누락된다. id 를 덧붙인 tie-breaker 가 이를 막는지 확인한다.
        jdbcTemplate.update("UPDATE users SET created_at = ?", Timestamp.valueOf(LocalDateTime.now()));

        JsonPath firstPage = requestPage(0);
        List<Integer> firstPageIds = firstPage.getList("data.content.id", Integer.class);

        // ── 아래 두 단언은 count 쿼리를 지키는 그물이다. 군더더기처럼 보여도 지우지 말 것 ──
        // Spring Data 는 "첫 페이지이고 결과 수 < 페이지 크기" 면 count 쿼리를 아예 실행하지 않는다.
        // 첫 페이지가 정확히 가득 찼음을 고정해야 count 쿼리가 실제로 도는 상태가 유지되고,
        // 그때만 전체 인원 수가 totalElements 로 돌아온다(생략되면 첫 페이지 건수가 그대로 실린다).
        // 이 그물이 없으면 리포지토리 JPQL 의 CAST(:q AS String) 를 벗겨도 테스트가 통과하고,
        // 회원이 한 페이지를 넘는 순간 목록 조회 전체가 500 으로 죽는 변경이 그대로 배포된다.
        assertThat(firstPageIds).hasSize(PAGING_PAGE_SIZE);
        assertThat(firstPage.getLong("data.totalElements")).isEqualTo(PAGING_TOTAL_USER_COUNT);

        List<Integer> pagedIds = new ArrayList<>(firstPageIds);
        pagedIds.addAll(requestPage(1).getList("data.content.id", Integer.class));

        // 전체 회원이 중복 없이 한 번씩만 나와야 한다.
        assertThat(pagedIds).hasSize(PAGING_TOTAL_USER_COUNT).doesNotHaveDuplicates();
        assertThat(pagedIds).isSortedAccordingTo(Comparator.reverseOrder());
    }

    @Test
    @DisplayName("허용 목록에 없는 정렬 속성을 요청하면 400 을 반환한다")
    void unknownSortPropertyReturns400() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when()
                    .get("/api/v1/admin/users?sort=passwordHash,desc")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    private JsonPath requestPage(int page) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .queryParam("page", page)
                    .queryParam("size", PAGING_PAGE_SIZE)
                .when()
                    .get("/api/v1/admin/users")
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .extract().jsonPath();
    }

    private User saveUser(String studentId, String name, UserRole role) {
        return saveUser(studentId, name, role, Grade.FRESHMAN, College.IT_ENGINEERING, "미설정");
    }

    private User saveUser(String studentId, String name, UserRole role,
                          Grade grade, College college, String major) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                studentId,
                name,
                "hashed",
                role,
                grade,
                college,
                major,
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()
        ));
    }
}
