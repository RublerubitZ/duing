package com.duing.domain.fee;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
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
class LeaderFeeBillQueryControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long clubId;
    private Long policyId;
    private User memberUser;
    private String leaderToken;
    private String memberToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("동아리A", ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();

        User leader = saveUser();
        memberUser = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, memberUser, ClubMemberRole.MEMBER));

        FeePolicy policy = feePolicyRepository.save(FeePolicy.create(clubId, "회비", 10000L, BillingType.MONTHLY));
        policyId = policy.getId();

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(memberUser.getId(), memberUser.getRole().name());
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Long saveUserId() {
        return saveUser().getId();
    }

    private void saveBill(Long clubIdValue, Long userId, String period, FeeStatus status) {
        // billingStartDate 를 "YYYY-MM" 회차에서 파생해 (fee_policy_id, user_id, billing_start_date) 유니크
        // 인덱스가 회차별로 달라지게 한다(같은 회원의 여러 회차 저장 시 충돌 방지).
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill bill = FeeBill.issue(clubIdValue, userId, policyId, 10000L, period, start, end, end);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        }
        feeBillRepository.save(bill);
    }

    @Test
    @DisplayName("운영진은 동아리 청구 현황을 페이지로 조회한다")
    void managerListsBills() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(2))
                .body("data.totalElements", equalTo(2));
    }

    @Test
    @DisplayName("청구 현황은 status 필터로 좁혀진다")
    void filterByStatus() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.CANCELLED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("status", "PENDING")
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("청구 현황은 billingPeriod 필터로 좁혀진다")
    void filterByBillingPeriod() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-08", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("billingPeriod", "2026-07")
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].billingPeriod", equalTo("2026-07"));
    }

    @Test
    @DisplayName("청구 현황은 userId 필터로 특정 회원만 조회한다")
    void filterByUserId() {
        saveBill(clubId, memberUser.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("userId", memberUser.getId())
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content.userId", everyItem(equalTo(memberUser.getId().intValue())));
    }

    @Test
    @DisplayName("청구 현황은 page/size 로 페이지네이션된다")
    void paginates() {
        for (int index = 0; index < 25; index++) {
            saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);
        }

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("page", 0)
                .queryParam("size", 10)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(10))
                .body("data.totalElements", equalTo(25))
                .body("data.totalPages", equalTo(3))
                .body("data.page", equalTo(0))
                .body("data.size", equalTo(10))
                .body("data.hasNext", equalTo(true));
    }

    @Test
    @DisplayName("일반 멤버가 청구 현황을 조회하면 403 을 반환한다")
    void memberForbidden() {
        saveBill(clubId, saveUserId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("인증 없이 청구 현황을 조회하면 401 을 반환한다")
    void unauthenticatedRejected() {
        RestAssured.given()
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}
